import type { CheckType, Env } from './env';

export type CheckRow = {
	id: string;
	type: CheckType;
	target: string;
	model: string | null;
	enabled: number;
	created_at: number;
};

export type ResultRow = {
	id: number;
	check_id: string;
	ts: number;
	success: number;
	status_code: number | null;
	latency_ms: number | null;
	error: string | null;
};

export async function upsertCheck(env: Env, row: { id: string; type: CheckType; target: string; model?: string | null }) {
	const now = Date.now();
	await env.DB.prepare(
		`INSERT INTO checks (id, type, target, model, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type,
       target=excluded.target,
       model=excluded.model`,
	)
		.bind(row.id, row.type, row.target, row.model ?? null, now)
		.run();
}

export async function listChecks(env: Env): Promise<CheckRow[]> {
	const res = await env.DB.prepare(
		`SELECT id, type, target, model, enabled, created_at
     FROM checks
     ORDER BY type ASC, model ASC`,
	).all<CheckRow>();
	return res.results ?? [];
}

export async function insertResult(
	env: Env,
	row: {
		check_id: string;
		ts: number;
		success: 0 | 1;
		status_code?: number | null;
		latency_ms?: number | null;
		error?: string | null;
	},
) {
	await env.DB.prepare(
		`INSERT INTO results (check_id, ts, success, status_code, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(row.check_id, row.ts, row.success, row.status_code ?? null, row.latency_ms ?? null, row.error ?? null)
		.run();
}

export async function getLastResultForCheck(env: Env, checkId: string): Promise<Pick<ResultRow, 'ts' | 'success'> | null> {
	const res = await env.DB.prepare(`SELECT ts, success FROM results WHERE check_id=? ORDER BY ts DESC LIMIT 1`)
		.bind(checkId)
		.first<{ ts: number; success: number }>();
	return res ?? null;
}

export async function acquireIntervalLock(env: Env, nowMs: number, intervalMs: number): Promise<boolean> {
	const threshold = nowMs - intervalMs;
	const res = await env.DB.prepare(
		`INSERT INTO meta(key, value) VALUES ('last_run_at', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value
     WHERE CAST(meta.value AS INTEGER) <= ?`,
	)
		.bind(String(nowMs), String(threshold))
		.run();

	return (res.meta?.changes ?? 0) > 0;
}

export async function forceSetLastRunAt(env: Env, nowMs: number) {
	await env.DB.prepare(
		`INSERT INTO meta(key, value) VALUES ('last_run_at', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
	)
		.bind(String(nowMs))
		.run();
}

