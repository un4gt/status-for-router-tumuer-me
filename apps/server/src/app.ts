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
import { getSummary, type WindowKey } from './summary';
import { getBucketMs, getTimeseries } from './timeseries';
import { getOverview, getSources } from './overview';

const SESSION_COOKIE = 'router_status_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MODEL_TYPES = ['model', 'rerank', 'systemone', 'decisions'] as const;
const WINDOWS = ['5h', '24h', '7d', '30d'] as const;

function isModelType(value: unknown): value is (typeof MODEL_TYPES)[number] {
	return typeof value === 'string' && (MODEL_TYPES as readonly string[]).includes(value);
}

function resolveCheckId(services: Services, c: any): { id?: string; error?: string } {
	const explicit = c.req.query('check_id')?.trim();
	if (explicit) {
		const check = getCheckById(services, explicit);
		return check ? { id: check.id } : { error: 'Unknown check_id' };
	}
	const type = c.req.query('type');
	const model = c.req.query('model')?.trim();
	if (type === 'head') return { id: 'net:root' };
	if (!isModelType(type)) return { error: 'Invalid type' };
	if (!model) return { error: 'Missing model' };
	return { id: `${type}:${model}` };
}

function resolveRegion(services: Services, c: any): { regionId?: string; error?: string } {
	const raw = c.req.query('region');
	if (!raw || raw === 'all') return {};
	const region = services.config.regions.find((item) => item.id === raw);
	return region ? { regionId: region.id } : { error: 'Invalid region' };
}

function mockModelCandidates(services: Services) {
	const candidates = new Map<
		string,
		{ id: string; detected_type: 'model' | 'rerank' | 'systemone' | 'decisions' | null; suggested_type: 'model' | 'rerank' | 'systemone' | 'decisions' | null; unsupported: boolean }
	>();
	for (const check of listChecks(services)) {
		if (check.model && isModelType(check.type)) {
			candidates.set(check.model, { id: check.model, detected_type: check.type, suggested_type: null, unsupported: false });
		}
	}
	candidates.set('custom-embedding', { id: 'custom-embedding', detected_type: null, suggested_type: 'model', unsupported: false });
	candidates.set('custom-decision', { id: 'custom-decision', detected_type: null, suggested_type: 'decisions', unsupported: false });
	candidates.set('chat-model', { id: 'chat-model', detected_type: null, suggested_type: null, unsupported: true });
	return [...candidates.values()].sort((a, b) => a.id.localeCompare(b.id));
}

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
	app.get('/api/public/overview', (c) => {
		const window = (c.req.query('window') || '24h') as WindowKey;
		if (!(WINDOWS as readonly string[]).includes(window)) return c.json({ error: 'Invalid window' }, 400);
		return c.json(getOverview(services, window));
	});
	app.get('/api/public/timeseries', (c) => {
		const window = (c.req.query('window') || '24h') as WindowKey;
		if (!(WINDOWS as readonly string[]).includes(window)) return c.json({ error: 'Invalid window' }, 400);
		const resolved = resolveCheckId(services, c);
		if (resolved.error) return c.json({ error: resolved.error }, 400);
		const region = resolveRegion(services, c);
		if (region.error) return c.json({ error: region.error }, 400);
		const check = resolved.id ? getCheckById(services, resolved.id) : null;
		const minSeconds = check?.type === 'head' ? config.globalping.intervalSeconds : config.cloudProbe.intervalSeconds;
		const bucketMs = getBucketMs(window, { minBucketMs: minSeconds * 1000 });
		return c.json({
			check_id: resolved.id,
			region: region.regionId ?? 'all',
			...getTimeseries(services, resolved.id!, window, Date.now(), { bucketMs, regionId: region.regionId }),
		});
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
	app.post('/api/admin/sources/sync', async (c) => {
		try {
			return c.json(await scheduler.run('manual'));
		} catch (error) {
			if (error instanceof RunBusyError) return c.json({ error: error.message }, 409);
			throw error;
		}
	});
	app.get('/api/admin/sources', (c) => {
		return c.json({
			mode: config.monitoringMode,
			regions: config.regions,
			sources: getSources(services),
		});
	});
	app.get('/api/admin/results', (c) => {
		const resolved = resolveCheckId(services, c);
		if (resolved.error) return c.json({ error: resolved.error }, 400);
		const region = resolveRegion(services, c);
		if (region.error) return c.json({ error: region.error }, 400);
		const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
		const conditions = ['check_id=?'];
		const params: Array<string | number> = [resolved.id!];
		if (region.regionId !== undefined) {
			conditions.push('region_id=?');
			params.push(region.regionId);
		}
		params.push(limit);
		const results = db
			.query<ResultRow, (string | number)[]>(
				`SELECT * FROM results WHERE ${conditions.join(' AND ')} ORDER BY ts DESC LIMIT ?`,
			)
			.all(...params);
		return c.json({ check_id: resolved.id, region: region.regionId ?? 'all', results });
	});
	app.get('/api/admin/checks', (c) =>
		c.json({
			checks: listChecks(services).map(({ external_id: _externalId, ...row }) => ({ ...row, enabled: row.enabled === 1 })),
		}),
	);
	app.post('/api/admin/checks', async (c) => {
		const body = await c.req.json().catch(() => null);
		if (!body || !isModelType(body.type)) return c.json({ error: 'Only model checks can be created' }, 400);
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
		if (!id) return c.json({ error: 'Missing id' }, 400);
		const check = getCheckById(services, id);
		if (!check) return c.json({ error: 'Not found' }, 404);
		if (!isModelType(check.type)) return c.json({ error: 'Only model checks can be modified' }, 400);

		const hasEnabled = typeof body?.enabled === 'boolean';
		if (!hasEnabled) return c.json({ error: 'Missing enabled' }, 400);
		setCheckEnabled(services, id, body.enabled);
		return c.json({ ok: true });
	});
	app.delete('/api/admin/checks', async (c) => {
		const body = await c.req.json().catch(() => null);
		const id = typeof body?.id === 'string' ? body.id.trim() : '';
		if (!id) return c.json({ error: 'Missing id' }, 400);
		const check = getCheckById(services, id);
		if (!check) return c.json({ error: 'Not found' }, 404);
		if (!isModelType(check.type)) return c.json({ error: 'Only model checks can be deleted' }, 400);
		deleteCheck(services, id);
		return c.json({ ok: true });
	});
	app.get('/api/admin/models', async (c) => {
		if (config.monitoringMode === 'mock') return c.json({ models: mockModelCandidates(services) });
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
				!isModelType(row.type) ||
				typeof row.model !== 'string' ||
				!row.model.trim() ||
				row.model.trim().length > 200
			) {
				return c.json({ error: 'Each model needs a valid name and an explicit probe type' }, 400);
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
