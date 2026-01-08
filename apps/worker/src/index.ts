import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from './env';
import { getConfig } from './env';
import { acquireIntervalLock, createCheck, deleteCheck, forceSetLastRunAt, getCheckById, listChecks, setCheckEnabled } from './db';
import { runAllChecks, ensureDefaultChecks } from './checkRunner';
import { isRateLimited } from './rateLimit';
import { signJwt, verifyJwt } from './jwt';
import { getSummary } from './summary';
import { getTimeseries, type TimeseriesWindow } from './timeseries';

const SESSION_COOKIE = 'router_status_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function getClientIp(req: Request): string {
	return (
		req.headers.get('CF-Connecting-IP') ||
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		'unknown'
	);
}

function isSecureRequest(req: Request): boolean {
	try {
		const url = new URL(req.url);
		return url.protocol === 'https:';
	} catch {
		return false;
	}
}

async function requireAdmin(c: any, next: any) {
	const env = c.env as Env;
	const secret = env.SESSION_SECRET?.trim();
	if (!secret) return c.json({ error: 'SESSION_SECRET not configured' }, 500);

	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return c.json({ error: 'Unauthorized' }, 401);

	const payload = await verifyJwt(token, secret);
	if (!payload || payload.sub !== 'admin') return c.json({ error: 'Unauthorized' }, 401);
	return next();
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('OK'));

// Public API
app.get('/api/public/summary', async (c) => {
	await ensureDefaultChecks(c.env);
	return c.json(await getSummary(c.env));
});

app.get('/api/public/timeseries', async (c) => {
	const type = c.req.query('type');
	const model = c.req.query('model');
	const window = (c.req.query('window') || '24h') as TimeseriesWindow;

	if (window !== '5h' && window !== '24h' && window !== '7d' && window !== '30d') {
		return c.json({ error: 'Invalid window' }, 400);
	}

	let checkId: string;
	if (type === 'head') {
		checkId = 'head:router';
	} else if (type === 'model') {
		if (!model) return c.json({ error: 'Missing model' }, 400);
		checkId = `model:${model}`;
	} else {
		return c.json({ error: 'Invalid type' }, 400);
	}

	await ensureDefaultChecks(c.env);
	return c.json({ check_id: checkId, ...(await getTimeseries(c.env, checkId, window)) });
});

// Admin API
app.post('/api/admin/login', async (c) => {
	const env = c.env;
	const ip = getClientIp(c.req.raw);
	if (isRateLimited(ip, { windowMs: 60_000, max: 10 })) return c.json({ error: 'Too many attempts' }, 429);

	const body = await c.req.json().catch(() => null);
	const username = body?.username;
	const password = body?.password;
	if (username !== 'admin' || typeof password !== 'string') return c.json({ error: 'Invalid credentials' }, 401);

	if (!env.ADMIN_PASSWORD?.trim()) return c.json({ error: 'ADMIN_PASSWORD not configured' }, 500);
	if (!env.SESSION_SECRET?.trim()) return c.json({ error: 'SESSION_SECRET not configured' }, 500);

	if (password !== env.ADMIN_PASSWORD) return c.json({ error: 'Invalid credentials' }, 401);

	const nowSeconds = Math.floor(Date.now() / 1000);
	const token = await signJwt(
		{ sub: 'admin', iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS },
		env.SESSION_SECRET,
	);

	setCookie(c, SESSION_COOKIE, token, {
		httpOnly: true,
		secure: isSecureRequest(c.req.raw),
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});

	return c.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, async (c) => {
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
	return c.json({ ok: true });
});

app.post('/api/admin/run', requireAdmin, async (c) => {
	const now = Date.now();
	await forceSetLastRunAt(c.env, now);
	const res = await runAllChecks(c.env, { triggeredBy: 'manual' });
	return c.json(res);
});

app.get('/api/admin/results', requireAdmin, async (c) => {
	const type = c.req.query('type');
	const model = c.req.query('model');
	const limitRaw = c.req.query('limit');
	const limit = Math.min(Math.max(Number.parseInt(limitRaw || '100', 10) || 100, 1), 500);

	let checkId: string;
	if (type === 'head') {
		checkId = 'head:router';
	} else if (type === 'model') {
		if (!model) return c.json({ error: 'Missing model' }, 400);
		checkId = `model:${model}`;
	} else {
		return c.json({ error: 'Invalid type' }, 400);
	}

	const res = await c.env.DB.prepare(
		`SELECT id, check_id, ts, success, status_code, latency_ms, error
     FROM results
     WHERE check_id=?
     ORDER BY ts DESC
     LIMIT ?`,
	)
		.bind(checkId, limit)
		.all();

	return c.json({ check_id: checkId, results: res.results ?? [] });
});

app.get('/api/admin/checks', requireAdmin, async (c) => {
	await ensureDefaultChecks(c.env);
	const checks = await listChecks(c.env);
	return c.json({
		checks: checks.map((row) => ({
			id: row.id,
			type: row.type,
			target: row.target,
			model: row.model,
			enabled: row.enabled === 1,
			created_at: row.created_at,
		})),
	});
});

app.post('/api/admin/checks', requireAdmin, async (c) => {
	const env = c.env;
	const body = await c.req.json().catch(() => null);
	if (!body || body.type !== 'model') return c.json({ error: 'Only model checks can be created' }, 400);

	const model = typeof body.model === 'string' ? body.model.trim() : '';
	if (!model) return c.json({ error: 'Missing model' }, 400);
	if (model.length > 200) return c.json({ error: 'Model too long' }, 400);

	const { routerBaseUrl } = getConfig(env);
	const id = `model:${model}`;

	const exists = await getCheckById(env, id);
	if (exists) return c.json({ error: 'Already exists' }, 409);

	const enabled = body.enabled === false ? 0 : 1;
	await createCheck(env, { id, type: 'model', target: routerBaseUrl, model, enabled });
	return c.json({ ok: true, id });
});

app.patch('/api/admin/checks', requireAdmin, async (c) => {
	const env = c.env;
	const body = await c.req.json().catch(() => null);
	const id = typeof body?.id === 'string' ? body.id.trim() : '';
	const enabled = body?.enabled;

	if (!id) return c.json({ error: 'Missing id' }, 400);
	if (typeof enabled !== 'boolean') return c.json({ error: 'Missing enabled' }, 400);

	const check = await getCheckById(env, id);
	if (!check) return c.json({ error: 'Not found' }, 404);
	if (check.type !== 'model') return c.json({ error: 'Only model checks can be modified' }, 400);

	await setCheckEnabled(env, id, enabled);
	return c.json({ ok: true });
});

app.delete('/api/admin/checks', requireAdmin, async (c) => {
	const env = c.env;
	const body = await c.req.json().catch(() => null);
	const id = typeof body?.id === 'string' ? body.id.trim() : '';
	if (!id) return c.json({ error: 'Missing id' }, 400);

	const check = await getCheckById(env, id);
	if (!check) return c.json({ error: 'Not found' }, 404);
	if (check.type !== 'model') return c.json({ error: 'Only model checks can be deleted' }, 400);

	await deleteCheck(env, id);
	return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default {
	fetch: app.fetch,
	async scheduled(event, env, ctx) {
		const { checkIntervalSeconds } = getConfig(env);
		const now = Date.now();
		const shouldRun = await acquireIntervalLock(env, now, checkIntervalSeconds * 1000);
		if (!shouldRun) return;
		ctx.waitUntil(runAllChecks(env, { triggeredBy: 'scheduled' }));
	},
} satisfies ExportedHandler<Env>;
