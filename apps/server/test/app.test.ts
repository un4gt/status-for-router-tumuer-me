import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app';
import { listChecks, saveSelection } from '../src/db';
import { signJwt } from '../src/jwt';
import { ModelSyncError } from '../src/models';
import { createRateLimiter } from '../src/rateLimit';
import { createScheduler } from '../src/scheduler';
import { fixture, temporaryDirectory } from './helpers';

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fakeRun = async (_: unknown, options?: { triggeredBy: 'manual' | 'scheduled' }) => ({
	ok: true,
	ts: Date.now(),
	triggeredBy: options?.triggeredBy || 'manual',
});
async function login(app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) {
	const request = json({ username: 'operator', password: 'test-password' });
	const response = await app.request('/api/admin/login', { ...request, headers: { ...request.headers, ...headers } });
	expect(response.status).toBe(200);
	return response.headers.get('set-cookie')!;
}

describe('HTTP API', () => {
	test('authenticates configured username/password and preserves cookie login/logout', async () => {
		const services = fixture({ trustProxy: true });
		const app = createApp(services, createScheduler(services, fakeRun));
		expect((await app.request('/api/admin/checks')).status).toBe(401);
		expect((await app.request('/api/admin/login', json({ username: 'admin', password: 'test-password' }))).status).toBe(401);
		const cookie = await login(app, { 'x-forwarded-proto': 'https', 'x-real-ip': '192.0.2.1' });
		for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=604800']) expect(cookie).toContain(flag);
		const headers = { cookie: cookie.split(';')[0] };
		expect((await app.request('/api/admin/checks', { headers })).status).toBe(200);
		const logout = await app.request('/api/admin/logout', { method: 'POST', headers });
		expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
		const now = Math.floor(Date.now() / 1000);
		const expired = await signJwt({ sub: 'operator', iat: now - 100, exp: now - 1 }, services.config.sessionSecret);
		expect((await app.request('/api/admin/checks', { headers: { cookie: `router_status_session=${expired}` } })).status).toBe(401);
	});
	test('trusts proxy headers only when configured and rate limits each client', async () => {
		const direct = fixture();
		const app = createApp(direct, createScheduler(direct, fakeRun), { clientIp: () => '127.0.0.1' });
		expect(await login(app, { 'x-forwarded-proto': 'https' })).not.toContain('Secure');
		for (let i = 0; i < 9; i++) await app.request('/api/admin/login', { ...json({}), headers: { 'x-real-ip': `192.0.2.${i}` } });
		expect((await app.request('/api/admin/login', json({}))).status).toBe(429);
		const proxy = fixture({ trustProxy: true });
		const proxyApp = createApp(proxy, createScheduler(proxy, fakeRun));
		for (let i = 0; i < 10; i++) await proxyApp.request('/api/admin/login', { ...json({}), headers: { 'x-real-ip': '192.0.2.1' } });
		expect((await proxyApp.request('/api/admin/login', { ...json({}), headers: { 'x-real-ip': '192.0.2.1' } })).status).toBe(429);
		expect((await proxyApp.request('/api/admin/login', { ...json({}), headers: { 'x-real-ip': '192.0.2.2' } })).status).toBe(401);
		const limit = createRateLimiter(60_000, 1);
		expect(limit('ip', 0)).toBe(false);
		expect(limit('ip', 1)).toBe(true);
		expect(limit('ip', 60_000)).toBe(false);
	});
	test('public reads perform no database writes and preserve response structure', async () => {
		const services = fixture();
		const app = createApp(services, createScheduler(services, fakeRun));
		services.db.exec('PRAGMA query_only=ON');
		const response = await app.request('/api/public/summary');
		expect(response.status).toBe(200);
		expect((await response.json()).checks[0]).toMatchObject({ id: 'head:router', enabled: true, last_status: null });
		for (const window of ['5h', '24h', '7d', '30d']) {
			const series = await app.request(`/api/public/timeseries?type=head&window=${window}`);
			expect(series.status).toBe(200);
			expect(await series.json()).toMatchObject({ check_id: 'head:router', window, series: [] });
		}
		expect((await app.request('/api/public/timeseries?type=head&window=invalid')).status).toBe(400);
	});
	test('validates the complete selection before changing checks and handles upstream failures separately from login', async () => {
		const services = fixture();
		saveSelection(services, [{ model: 'existing', type: 'model' }]);
		const app = createApp(services, createScheduler(services, fakeRun), {
			discover: async () => {
				throw new ModelSyncError('Upstream HTTP 401', 502);
			},
		});
		const cookie = (await login(app)).split(';')[0];
		const headers = { cookie, 'content-type': 'application/json' };
		const previous = listChecks(services);
		expect((await app.request('/api/admin/models', { headers })).status).toBe(502);
		expect(listChecks(services)).toEqual(previous);
		expect(
			(
				await app.request('/api/admin/checks/selection', {
					method: 'PUT',
					headers,
					body: JSON.stringify({
						checks: [
							{ model: 'ok', type: 'rerank' },
							{ model: 'unconfirmed', type: null },
						],
					}),
				})
			).status,
		).toBe(400);
		expect(listChecks(services)).toEqual(previous);
		const payload = {
			checks: [
				{ model: 'selected', type: 'rerank' },
				{ model: 'selected', type: 'rerank' },
			],
		};
		expect((await app.request('/api/admin/checks/selection', { method: 'PUT', headers, body: JSON.stringify(payload) })).status).toBe(200);
		expect(
			listChecks(services)
				.filter((row) => row.enabled)
				.map((row) => row.id),
		).toEqual(['head:router', 'rerank:selected']);
		expect((await app.request('/api/admin/checks', { headers })).status).toBe(200);
	});
	test('serves the frontend and /admin refresh while preserving API and missing-asset 404s', async () => {
		const webRoot = temporaryDirectory();
		writeFileSync(join(webRoot, 'index.html'), '<html>status-page-fixture</html>');
		mkdirSync(join(webRoot, 'assets'));
		writeFileSync(join(webRoot, 'assets/app.js'), 'console.log("fixture")');
		const services = fixture();
		const app = createApp(services, createScheduler(services, fakeRun), { webRoot });
		for (const path of ['/', '/admin', '/admin/']) {
			const response = await app.request(path);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('status-page-fixture');
		}
		expect((await app.request('/assets/app.js')).status).toBe(200);
		for (const path of ['/assets/missing.js', '/api/missing', '/.env', '/src/index.ts']) expect((await app.request(path)).status).toBe(404);
		expect(await (await app.request('/healthz')).json()).toEqual({ ok: true });
	});
	test('returns 409 for overlapping manual runs', async () => {
		const services = fixture();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const scheduler = createScheduler(services, async (_, options) => {
			await gate;
			return fakeRun(_, options);
		});
		const app = createApp(services, scheduler);
		const cookie = (await login(app)).split(';')[0];
		const running = scheduler.run('scheduled');
		try {
			expect((await app.request('/api/admin/run', { method: 'POST', headers: { cookie } })).status).toBe(409);
		} finally {
			release();
			await running;
		}
	});
});
