import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROJECT_ROOT, type CheckType, type Config, type ModelType } from './config';

export type Services = { db: Database; config: Config };
export type CheckRow = { id: string; type: CheckType; target: string; model: string | null; enabled: number; created_at: number };
export type ResultRow = {
	id: number;
	check_id: string;
	ts: number;
	success: number;
	status_code: number | null;
	latency_ms: number | null;
	error: string | null;
};
export type ModelSelection = { model: string; type: ModelType };

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

export function initializeChecks({ db, config }: Services) {
	db.query(
		`INSERT INTO checks (id, type, target, model, created_at) VALUES ('head:router', 'head', ?, NULL, ?)
		ON CONFLICT(id) DO UPDATE SET target=excluded.target`,
	).run(config.headCheckUrl, Date.now());
	db.query("UPDATE checks SET target=? WHERE type IN ('model', 'rerank') AND target<>?").run(config.routerBaseUrl, config.routerBaseUrl);
}

export function listChecks({ db }: Services): CheckRow[] {
	return db.query<CheckRow, []>('SELECT * FROM checks ORDER BY type ASC, model ASC').all();
}

export function getCheckById({ db }: Services, id: string): CheckRow | null {
	return db.query<CheckRow, [string]>('SELECT * FROM checks WHERE id=?').get(id);
}

export function createCheck(
	{ db }: Services,
	row: { id: string; type: CheckType; target: string; model?: string | null; enabled?: 0 | 1 },
) {
	db.query('INSERT INTO checks (id, type, target, model, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
		row.id,
		row.type,
		row.target,
		row.model ?? null,
		row.enabled ?? 1,
		Date.now(),
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
	db.transaction(() => {
		db.query("UPDATE checks SET enabled=0 WHERE type IN ('model', 'rerank')").run();
		const upsert = db.query(`INSERT INTO checks (id, type, target, model, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)
			ON CONFLICT(id) DO UPDATE SET enabled=1, target=excluded.target`);
		for (const check of checks) upsert.run(`${check.type}:${check.model}`, check.type, config.routerBaseUrl, check.model, Date.now());
	})();
}

export function insertResult(
	{ db }: Services,
	row: Omit<ResultRow, 'id' | 'status_code' | 'latency_ms' | 'error'> & Partial<Pick<ResultRow, 'status_code' | 'latency_ms' | 'error'>>,
) {
	// A check can be deleted while its network request is in flight.
	db.query(
		`INSERT INTO results (check_id, ts, success, status_code, latency_ms, error)
		SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM checks WHERE id=?)`,
	).run(row.check_id, row.ts, row.success, row.status_code ?? null, row.latency_ms ?? null, row.error ?? null, row.check_id);
}

export function getLastResultForCheck({ db }: Services, id: string) {
	return db
		.query<Pick<ResultRow, 'ts' | 'success'>, [string]>('SELECT ts, success FROM results WHERE check_id=? ORDER BY ts DESC LIMIT 1')
		.get(id);
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
