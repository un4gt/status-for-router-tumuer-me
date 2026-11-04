import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_ROOT, type CheckType, type Config, type ModelType, type MonitoringMode } from './config';

export type Services = { db: Database; config: Config };
export type CheckRow = {
	id: string;
	type: CheckType;
	target: string;
	model: string | null;
	enabled: number;
	created_at: number;
	provider: string;
	external_id: string | null;
};
export type ResultRow = {
	id: number;
	check_id: string;
	ts: number;
	success: number;
	status_code: number | null;
	latency_ms: number | null;
	error: string | null;
	region_id: string;
	source: string;
};
export type ModelSelection = { model: string; type: ModelType };

export function sourceForMode(mode: MonitoringMode): string {
	return mode === 'live' ? 'cloudprobe' : mode;
}

export function openDatabase(path: string): Database {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path, { create: true, strict: true });
	try {
		db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
		const migrationsDir = join(PROJECT_ROOT, 'db/migrations');
		const migrations = readdirSync(migrationsDir)
			.filter((name) => /^\d+_.+\.sql$/.test(name))
			.sort();
		const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
		const latest = Number(migrations.at(-1)?.split('_')[0] || 0);
		if (current > latest) throw new Error('Database schema is newer than this application');
		for (const name of migrations) {
			const version = Number(name.split('_')[0]);
			if (version <= current) continue;
			db.transaction(() => {
				db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
				db.exec(`PRAGMA user_version=${version}`);
			})();
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

function networkTarget(base: string, path: string): string {
	const url = new URL(base);
	url.pathname = path;
	url.search = '';
	url.hash = '';
	return url.toString();
}

export function initializeChecks({ db, config }: Services) {
	const provider = config.monitoringMode === 'live' ? 'globalping' : config.monitoringMode;
	const networkChecks: Array<{ id: string; target: string }> = [
		{ id: 'net:root', target: config.headCheckUrl },
		{ id: 'net:health', target: networkTarget(config.globalping.targetUrl, config.globalping.healthPath) },
		{ id: 'net:models', target: networkTarget(config.globalping.targetUrl, config.globalping.modelsPath) },
	];
	db.transaction(() => {
		const upsert = db.query(
			`INSERT INTO checks (id, type, target, model, enabled, created_at, provider, external_id)
			 VALUES (?, 'head', ?, NULL, 1, ?, ?, NULL)
			 ON CONFLICT(id) DO UPDATE SET target=excluded.target, provider=excluded.provider`,
		);
		for (const check of networkChecks) upsert.run(check.id, check.target, Date.now(), provider);
		// Legacy single HEAD probe from the local-only era; keep its history but stop collecting into it.
		db.query("UPDATE checks SET enabled=0 WHERE id='head:router'").run();
		db.query("UPDATE checks SET provider=? WHERE type IN ('model','rerank','systemone','decisions')").run(
			sourceForMode(config.monitoringMode),
		);
	})();
}

export function listChecks({ db }: Services): CheckRow[] {
	return db.query<CheckRow, []>('SELECT * FROM checks ORDER BY type ASC, id ASC').all();
}

export function getCheckById({ db }: Services, id: string): CheckRow | null {
	return db.query<CheckRow, [string]>('SELECT * FROM checks WHERE id=?').get(id);
}

export function createCheck(
	{ db, config }: Services,
	row: { id: string; type: CheckType; target: string; model?: string | null; enabled?: 0 | 1; provider?: string; external_id?: string | null },
) {
	db.query(
		'INSERT INTO checks (id, type, target, model, enabled, created_at, provider, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
	).run(
		row.id,
		row.type,
		row.target,
		row.model ?? null,
		row.enabled ?? 1,
		Date.now(),
		row.provider ?? (row.type === 'head' ? 'globalping' : sourceForMode(config.monitoringMode)),
		row.external_id ?? null,
	);
}

export function setCheckEnabled({ db }: Services, id: string, enabled: boolean) {
	db.query('UPDATE checks SET enabled=? WHERE id=?').run(Number(enabled), id);
}

export function deleteCheck({ db }: Services, id: string) {
	db.transaction(() => {
		db.query('DELETE FROM results WHERE check_id=?').run(id);
		db.query('DELETE FROM checks WHERE id=?').run(id);
	})();
}

export function saveSelection({ db, config }: Services, checks: ModelSelection[]) {
	const provider = sourceForMode(config.monitoringMode);
	db.transaction(() => {
		db.query("UPDATE checks SET enabled=0 WHERE type IN ('model','rerank','systemone','decisions')").run();
		const upsert = db.query(`INSERT INTO checks (id, type, target, model, enabled, created_at, provider, external_id) VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
			ON CONFLICT(id) DO UPDATE SET enabled=1, target=excluded.target, provider=excluded.provider`);
		for (const check of checks) {
			upsert.run(`${check.type}:${check.model}`, check.type, config.routerBaseUrl, check.model, Date.now(), provider);
		}
	})();
}

export function insertResult(
	{ db }: Services,
	row: Omit<ResultRow, 'id' | 'status_code' | 'latency_ms' | 'error' | 'region_id' | 'source'> &
		Partial<Pick<ResultRow, 'status_code' | 'latency_ms' | 'error' | 'region_id' | 'source'>>,
) {
	const regionId = row.region_id ?? '';
	const source = row.source ?? 'direct';
	// A check can be deleted while its network request is in flight. Duplicate source polls
	// (same check/region/source/timestamp) are ignored so availability is not double counted.
	db.query(
		`INSERT INTO results (check_id, ts, success, status_code, latency_ms, error, region_id, source)
		 SELECT ?, ?, ?, ?, ?, ?, ?, ?
		 WHERE EXISTS (SELECT 1 FROM checks WHERE id=?)
		   AND NOT EXISTS (
		     SELECT 1 FROM results WHERE check_id=? AND region_id=? AND source=? AND ts=?
		   )`,
	).run(
		row.check_id,
		row.ts,
		row.success,
		row.status_code ?? null,
		row.latency_ms ?? null,
		row.error ?? null,
		regionId,
		source,
		row.check_id,
		row.check_id,
		regionId,
		source,
		row.ts,
	);
}

export function getLastResultForCheck(
	{ db }: Services,
	id: string,
	opts?: { regionId?: string; source?: string },
) {
	if (opts?.regionId !== undefined || opts?.source !== undefined) {
		const conditions = ['check_id=?'];
		const params: Array<string> = [id];
		if (opts.regionId !== undefined) {
			conditions.push('region_id=?');
			params.push(opts.regionId);
		}
		if (opts.source !== undefined) {
			conditions.push('source=?');
			params.push(opts.source);
		}
		return db
			.query<Pick<ResultRow, 'ts' | 'success' | 'region_id' | 'source'>, string[]>(
				`SELECT ts, success, region_id, source FROM results WHERE ${conditions.join(' AND ')} ORDER BY ts DESC LIMIT 1`,
			)
			.get(...params);
	}
	return db
		.query<Pick<ResultRow, 'ts' | 'success'>, [string]>('SELECT ts, success FROM results WHERE check_id=? ORDER BY ts DESC LIMIT 1')
		.get(id);
}

export function getMeta({ db }: Services, key: string): string | null {
	const row = db.query<{ value: string }, [string]>('SELECT value FROM meta WHERE key=?').get(key);
	return row?.value ?? null;
}

export function setMeta({ db }: Services, key: string, value: string) {
	db.query('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

export function acquireScheduledSlot({ db }: Services, now: number, interval: number) {
	const slotStart = Math.floor(now / interval) * interval;
	return (
		db
			.query(
				`INSERT INTO meta (key, value) VALUES ('last_run_at', ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(meta.value AS INTEGER)<?`,
			)
			.run(String(now), slotStart).changes > 0
	);
}

export function forceSetLastRunAt({ db }: Services, now: number) {
	db.query(
		`INSERT INTO meta (key, value) VALUES ('last_run_at', ?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
	).run(String(now));
}
