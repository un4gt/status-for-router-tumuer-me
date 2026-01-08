import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
import worker from '../src';

describe('Router Status worker', () => {
	beforeAll(async () => {
		await env.DB.exec(
			'CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, type TEXT NOT NULL, target TEXT NOT NULL, model TEXT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);',
		);
		await env.DB.exec(
			'CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, check_id TEXT NOT NULL, ts INTEGER NOT NULL, success INTEGER NOT NULL, status_code INTEGER NULL, latency_ms INTEGER NULL, error TEXT NULL, FOREIGN KEY (check_id) REFERENCES checks (id));',
		);
		await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_results_check_ts ON results (check_id, ts);');
		await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_results_ts ON results (ts);');
		await env.DB.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
	});

	it('GET /api/public/summary returns JSON', async () => {
		const request = new Request<unknown, IncomingRequestCfProperties>('http://example.com/api/public/summary');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json).toHaveProperty('checks');
		expect(Array.isArray(json.checks)).toBe(true);
	});

	it('GET / responds with OK (integration style)', async () => {
		const response = await SELF.fetch('http://example.com/');
		expect(await response.text()).toBe('OK');
	});
});
