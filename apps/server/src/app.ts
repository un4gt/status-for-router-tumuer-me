import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { join } from 'node:path';
import { PROJECT_ROOT } from './config';
import {
	createCheck,
	deleteCheck,
	getCheckById,
	listChecks,
	saveSelection,
	setCheckEnabled,
	type ModelSelection,
	type ResultRow,
	type Services,
} from './db';
import { discoverModels, ModelSyncError } from './models';
import { createRateLimiter } from './rateLimit';
import { RunBusyError, type Scheduler } from './scheduler';
import { signJwt, verifyJwt } from './jwt';
import { getSummary } from './summary';
import { getBucketMs, getTimeseries, type TimeseriesWindow } from './timeseries';

const SESSION_COOKIE = 'router_status_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createApp(
	services: Services,
	scheduler: Scheduler,
	options: {
		clientIp?: (request: Request) => string;
		webRoot?: string;
		discover?: typeof discoverModels;
	} = {},
) {
	const { config, db } = services;
	const app = new Hono();
	const isRateLimited = createRateLimiter();
	const discover = options.discover ?? discoverModels;

	app.onError(() => {
		console.error('API request failed');
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { 'content-type': 'application/json' },
		});
	});
	app.get('/healthz', (c) => {
		db.query('SELECT 1').get();
		return c.json({ ok: true });
	});
	app.use('/api/*', async (c, next) => {
		c.header('Cache-Control', 'no-store');
		await next();
	});
	app.use('/api/admin/*', async (c, next) => {
		if (c.req.path === '/api/admin/login') return next();
		const token = getCookie(c, SESSION_COOKIE);
		const payload = token ? await verifyJwt(token, config.sessionSecret) : null;
		if (!payload || payload.sub !== config.adminUsername) return c.json({ error: 'Unauthorized' }, 401);
		return next();
	});

	app.get('/api/public/summary', (c) => c.json(getSummary(services)));
	app.get('/api/public/timeseries', (c) => {
		const type = c.req.query('type');
		const model = c.req.query('model');
		const window = (c.req.query('window') || '24h') as TimeseriesWindow;
		if (!['5h', '24h', '7d', '30d'].includes(window)) return c.json({ error: 'Invalid window' }, 400);
		if (!['head', 'model', 'rerank'].includes(type || '')) return c.json({ error: 'Invalid type' }, 400);
		if (type !== 'head' && !model) return c.json({ error: 'Missing model' }, 400);
		const checkId = type === 'head' ? 'head:router' : `${type}:${model}`;
		const bucketMs = getBucketMs(window, { minBucketMs: config.checkIntervalSeconds * 1000 });
		return c.json({ check_id: checkId, ...getTimeseries(services, checkId, window, Date.now(), { bucketMs }) });
	});

	app.post('/api/admin/login', async (c) => {
		const forwardedIp = config.trustProxy ? c.req.header('X-Real-IP') : undefined;
		const ip = forwardedIp || options.clientIp?.(c.req.raw) || 'unknown';
		if (isRateLimited(ip)) return c.json({ error: 'Too many attempts' }, 429);
		const body = await c.req.json().catch(() => null);
		if (body?.username !== config.adminUsername || body?.password !== config.adminPassword)
			return c.json({ error: 'Invalid credentials' }, 401);
		const now = Math.floor(Date.now() / 1000);
		const token = await signJwt({ sub: config.adminUsername, iat: now, exp: now + SESSION_TTL_SECONDS }, config.sessionSecret);
		const secure = config.trustProxy ? c.req.header('X-Forwarded-Proto') === 'https' : new URL(c.req.url).protocol === 'https:';
		setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_SECONDS });
		return c.json({ ok: true });
	});
	app.post('/api/admin/logout', (c) => {
		deleteCookie(c, SESSION_COOKIE, { path: '/' });
		return c.json({ ok: true });
	});
	app.post('/api/admin/run', async (c) => {
		try {
			return c.json(await scheduler.run('manual'));
		} catch (error) {
			if (error instanceof RunBusyError) return c.json({ error: error.message }, 409);
			throw error;
		}
	});
	app.get('/api/admin/results', (c) => {
		const type = c.req.query('type');
		const model = c.req.query('model');
		if (!['head', 'model', 'rerank'].includes(type || '')) return c.json({ error: 'Invalid type' }, 400);
		if (type !== 'head' && !model) return c.json({ error: 'Missing model' }, 400);
		const checkId = type === 'head' ? 'head:router' : `${type}:${model}`;
		const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
		const results = db
			.query<ResultRow, [string, number]>('SELECT * FROM results WHERE check_id=? ORDER BY ts DESC LIMIT ?')
			.all(checkId, limit);
		return c.json({ check_id: checkId, results });
	});
	app.get('/api/admin/checks', (c) => c.json({ checks: listChecks(services).map((row) => ({ ...row, enabled: row.enabled === 1 })) }));
	app.post('/api/admin/checks', async (c) => {
		const body = await c.req.json().catch(() => null);
		if (!body || !['model', 'rerank'].includes(body.type)) return c.json({ error: 'Only model/rerank checks can be created' }, 400);
		const model = typeof body.model === 'string' ? body.model.trim() : '';
		if (!model || model.length > 200) return c.json({ error: 'Model must contain 1–200 characters' }, 400);
		const id = `${body.type}:${model}`;
		if (getCheckById(services, id)) return c.json({ error: 'Already exists' }, 409);
		createCheck(services, { id, type: body.type, model, target: config.routerBaseUrl, enabled: body.enabled === false ? 0 : 1 });
		return c.json({ ok: true, id });
	});
	app.patch('/api/admin/checks', async (c) => {
		const body = await c.req.json().catch(() => null);
		const id = typeof body?.id === 'string' ? body.id.trim() : '';
		if (!id || typeof body?.enabled !== 'boolean') return c.json({ error: 'Missing id or enabled' }, 400);
		const check = getCheckById(services, id);
		if (!check) return c.json({ error: 'Not found' }, 404);
		if (check.type === 'head') return c.json({ error: 'Only model/rerank checks can be modified' }, 400);
		setCheckEnabled(services, id, body.enabled);
		return c.json({ ok: true });
	});
	app.delete('/api/admin/checks', async (c) => {
		const body = await c.req.json().catch(() => null);
		const id = typeof body?.id === 'string' ? body.id.trim() : '';
		if (!id) return c.json({ error: 'Missing id' }, 400);
		const check = getCheckById(services, id);
		if (!check) return c.json({ error: 'Not found' }, 404);
		if (check.type === 'head') return c.json({ error: 'Only model/rerank checks can be deleted' }, 400);
		deleteCheck(services, id);
		return c.json({ ok: true });
	});
	app.get('/api/admin/models', async (c) => {
		try {
			return c.json({ models: await discover(config) });
		} catch (error) {
			if (error instanceof ModelSyncError) return c.json({ error: error.message }, error.status);
			throw error;
		}
	});
	app.put('/api/admin/checks/selection', async (c) => {
		const body = await c.req.json().catch(() => null);
		if (!Array.isArray(body?.checks)) return c.json({ error: 'Missing checks array' }, 400);
		const checks = new Map<string, ModelSelection>();
		for (const row of body.checks) {
			if (
				!row ||
				!['model', 'rerank'].includes(row.type) ||
				typeof row.model !== 'string' ||
				!row.model.trim() ||
				row.model.trim().length > 200
			) {
				return c.json({ error: 'Each model needs a valid name and an explicit model/rerank type' }, 400);
			}
			const model = row.model.trim();
			checks.set(`${row.type}:${model}`, { model, type: row.type });
		}
		saveSelection(services, [...checks.values()]);
		return c.json({ ok: true });
	});

	app.all('/api/*', (c) => c.json({ error: 'Not Found' }, 404));
	const webRoot = options.webRoot || join(PROJECT_ROOT, 'apps/web/dist');
	app.get('*', serveStatic({ root: webRoot }));
	app.get('/admin', serveStatic({ root: webRoot, path: 'index.html' }));
	app.get('/admin/', serveStatic({ root: webRoot, path: 'index.html' }));
	app.notFound((c) => c.json({ error: 'Not Found' }, 404));
	return app;
}
