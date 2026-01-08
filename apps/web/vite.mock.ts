import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type WindowKey = '5h' | '24h' | '7d' | '30d';

type CheckType = 'head' | 'model';

type CheckDef = {
	id: string;
	type: CheckType;
	target: string;
	model: string | null;
	enabled: boolean;
	successRate: number; // 0..1
};

const WINDOW_MS: Record<WindowKey, number> = {
	'5h': 5 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
};

const BUCKET_MS: Record<WindowKey, number> = {
	'5h': 5 * 60 * 1000,
	'24h': 30 * 60 * 1000,
	'7d': 2 * 60 * 60 * 1000,
	'30d': 6 * 60 * 60 * 1000,
};

const SESSION_COOKIE = 'router_status_session';
const MOCK_SESSION_VALUE = 'mock';
const MOCK_ADMIN_PASSWORD = 'admin';

const DEFAULT_CHECKS: CheckDef[] = [
	{
		id: 'head:router',
		type: 'head',
		target: 'https://router.tumuer.me/',
		model: null,
		enabled: true,
		successRate: 0.99,
	},
	{
		id: 'model:BAAI/bge-m3',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'BAAI/bge-m3',
		enabled: true,
		successRate: 0.98,
	},
	{
		id: 'model:Qwen/Qwen3-Embedding-0.6B',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'Qwen/Qwen3-Embedding-0.6B',
		enabled: true,
		successRate: 0.975,
	},
	{
		id: 'model:text-embedding-004',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'text-embedding-004',
		enabled: true,
		successRate: 0.985,
	},
	{
		id: 'model:Qwen/Qwen3-Embedding-4B',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'Qwen/Qwen3-Embedding-4B',
		enabled: true,
		successRate: 0.97,
	},
	{
		id: 'model:embedding-001',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'embedding-001',
		enabled: true,
		successRate: 0.98,
	},
	{
		id: 'model:Pro/BAAI/bge-m3',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'Pro/BAAI/bge-m3',
		enabled: true,
		successRate: 0.975,
	},
	{
		id: 'model:Qwen/Qwen3-Embedding-8B',
		type: 'model',
		target: 'https://router.tumuer.me/v1',
		model: 'Qwen/Qwen3-Embedding-8B',
		enabled: true,
		successRate: 0.965,
	},
];

let checksState: CheckDef[] = [...DEFAULT_CHECKS];

function sendJson(res: ServerResponse, body: unknown, status = 200, extraHeaders?: Record<string, string>) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	if (extraHeaders) {
		for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
	}
	res.end(JSON.stringify(body));
}

function hashString(str: string): number {
	// FNV-1a
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function clamp(val: number, min: number, max: number) {
	return Math.min(Math.max(val, min), max);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!cookieHeader) return out;
	for (const part of cookieHeader.split(';')) {
		const [k, ...rest] = part.trim().split('=');
		if (!k) continue;
		out[k] = rest.join('=');
	}
	return out;
}

function isAuthed(req: IncomingMessage) {
	const cookies = parseCookies(req.headers.cookie);
	return cookies[SESSION_COOKIE] === MOCK_SESSION_VALUE;
}

async function readJson(req: IncomingMessage): Promise<any> {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (chunk) => {
			data += String(chunk);
		});
		req.on('end', () => {
			if (!data) return resolve(null);
			try {
				resolve(JSON.parse(data));
			} catch {
				resolve(null);
			}
		});
	});
}

function getWindowKey(raw: string | null): WindowKey | null {
	if (raw === '5h' || raw === '24h' || raw === '7d' || raw === '30d') return raw;
	return null;
}

function alignedRange(from: number, to: number, step: number) {
	const start = Math.floor(from / step) * step;
	const end = Math.floor(to / step) * step;
	const out: number[] = [];
	for (let ts = start; ts <= end; ts += step) out.push(ts);
	return out;
}

function generateTimeseries(check: CheckDef, window: WindowKey, nowMs: number) {
	const bucketMs = BUCKET_MS[window];
	const from = nowMs - WINDOW_MS[window];
	const to = nowMs;
	const buckets = alignedRange(from, to, bucketMs);

	const series = [];
	for (const ts of buckets) {
		const rng = mulberry32(hashString(`${check.id}|${ts}`));
		const noData = rng() < 0.03;
		if (noData) continue;

		const success = rng() < check.successRate ? 1 : 0;
		const baseLatency = check.type === 'head' ? 60 : 120;
		const jitter = check.type === 'head' ? 80 : 180;
		const penalty = success ? 0 : (check.type === 'head' ? 120 : 240);
		const avgLatency = Math.round(baseLatency + rng() * jitter + rng() * penalty);

		series.push({
			ts,
			total_count: 1,
			success_count: success,
			availability: success,
			avg_latency_ms: avgLatency,
		});
	}

	return { check_id: check.id, from, to, window, bucket_ms: bucketMs, series };
}

function summarizeWindow(check: CheckDef, window: WindowKey, nowMs: number) {
	const ts = generateTimeseries(check, window, nowMs);
	const total = ts.series.reduce((acc, p) => acc + (p.total_count ?? 0), 0);
	const success = ts.series.reduce((acc, p) => acc + (p.success_count ?? 0), 0);
	return {
		success_count: success,
		total_count: total,
		availability: total > 0 ? success / total : null,
	};
}

function checkTitle(check: CheckDef) {
	if (check.type === 'head') {
		try {
			return new URL(check.target).hostname;
		} catch {
			return 'HEAD';
		}
	}
	return check.model || check.id;
}

function generateAdminResults(check: CheckDef, nowMs: number, limit: number) {
	const intervalMs = 5 * 60 * 1000;
	const out = [];
	for (let i = 0; i < limit; i++) {
		const ts = nowMs - i * intervalMs;
		const rng = mulberry32(hashString(`${check.id}|result|${ts}`));
		const success = rng() < check.successRate ? 1 : 0;
		const latency = Math.round((check.type === 'head' ? 60 : 120) + rng() * (check.type === 'head' ? 120 : 260));

		out.push({
			id: i + 1,
			check_id: check.id,
			ts,
			success,
			status_code: check.type === 'head' ? (success ? 200 : 503) : success ? 200 : 500,
			latency_ms: success ? latency : latency + Math.round(rng() * 400),
			error: success
				? null
				: check.type === 'head'
					? 'HTTP 503 (mock)'
					: 'Upstream error / timeout (mock)',
			title: checkTitle(check),
		});
	}
	return out;
}

export function mockApiPlugin(): Plugin {
	return {
		name: 'router-status-mock-api',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (!req.url) return next();
				const url = new URL(req.url, 'http://localhost');
				if (!url.pathname.startsWith('/api/')) return next();

				const nowMs = Date.now();

				// Public
				if (req.method === 'GET' && url.pathname === '/api/public/summary') {
					const checks = checksState.map((c) => {
						const lastTs = generateTimeseries(c, '5h', nowMs).series.at(-1) ?? null;
						const lastCheckedAt = lastTs?.ts ?? null;
						const lastStatus = lastTs ? (lastTs.success_count === 1 ? 'success' : 'failure') : null;
						return {
							id: c.id,
							type: c.type,
							target: c.target,
							model: c.model,
							enabled: c.enabled,
							last_checked_at: lastCheckedAt,
							last_status: lastStatus,
							stats: {
								'5h': summarizeWindow(c, '5h', nowMs),
								'24h': summarizeWindow(c, '24h', nowMs),
								'7d': summarizeWindow(c, '7d', nowMs),
								'30d': summarizeWindow(c, '30d', nowMs),
							},
						};
					});
					return sendJson(res, { generated_at: nowMs, checks });
				}

				if (req.method === 'GET' && url.pathname === '/api/public/timeseries') {
					const type = url.searchParams.get('type');
					const model = url.searchParams.get('model');
					const window = getWindowKey(url.searchParams.get('window')) ?? '5h';

					const check =
						type === 'head'
							? checksState.find((c) => c.type === 'head') ?? null
							: type === 'model' && model
								? checksState.find((c) => c.type === 'model' && c.model === model) ?? null
								: null;

					if (!check) return sendJson(res, { error: 'Invalid check' }, 400);
					return sendJson(res, generateTimeseries(check, window, nowMs));
				}

				// Admin
				if (url.pathname.startsWith('/api/admin/') && !isAuthed(req) && url.pathname !== '/api/admin/login') {
					return sendJson(res, { error: 'Unauthorized' }, 401);
				}

				if (req.method === 'GET' && url.pathname === '/api/admin/checks') {
					return sendJson(res, {
						checks: checksState.map((c) => ({
							id: c.id,
							type: c.type,
							target: c.target,
							model: c.model,
							enabled: c.enabled,
							created_at: nowMs,
						})),
					});
				}

				if (req.method === 'POST' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					if (!body || body.type !== 'model') return sendJson(res, { error: 'Only model checks can be created' }, 400);
					const model = typeof body.model === 'string' ? body.model.trim() : '';
					if (!model) return sendJson(res, { error: 'Missing model' }, 400);

					const id = `model:${model}`;
					if (checksState.some((c) => c.id === id)) return sendJson(res, { error: 'Already exists' }, 409);

					const enabled = body.enabled !== false;
					checksState = [
						...checksState,
						{
							id,
							type: 'model',
							target: 'https://router.tumuer.me/v1',
							model,
							enabled,
							successRate: 0.97,
						},
					];

					return sendJson(res, { ok: true, id }, 200);
				}

				if (req.method === 'PATCH' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					const id = typeof body?.id === 'string' ? body.id.trim() : '';
					const enabled = body?.enabled;
					if (!id) return sendJson(res, { error: 'Missing id' }, 400);
					if (typeof enabled !== 'boolean') return sendJson(res, { error: 'Missing enabled' }, 400);

					const idx = checksState.findIndex((c) => c.id === id);
					if (idx === -1) return sendJson(res, { error: 'Not found' }, 404);
					if (checksState[idx].type !== 'model') return sendJson(res, { error: 'Only model checks can be modified' }, 400);

					checksState = checksState.map((c, i) => (i === idx ? { ...c, enabled } : c));
					return sendJson(res, { ok: true }, 200);
				}

				if (req.method === 'DELETE' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					const id = typeof body?.id === 'string' ? body.id.trim() : '';
					if (!id) return sendJson(res, { error: 'Missing id' }, 400);

					const target = checksState.find((c) => c.id === id) ?? null;
					if (!target) return sendJson(res, { error: 'Not found' }, 404);
					if (target.type !== 'model') return sendJson(res, { error: 'Only model checks can be deleted' }, 400);

					checksState = checksState.filter((c) => c.id !== id);
					return sendJson(res, { ok: true }, 200);
				}

				if (req.method === 'POST' && url.pathname === '/api/admin/login') {
					const body = await readJson(req);
					const username = body?.username;
					const password = body?.password;

					if (username !== 'admin' || typeof password !== 'string' || password !== MOCK_ADMIN_PASSWORD) {
						return sendJson(res, { error: 'Invalid credentials (mock: admin/admin)' }, 401);
					}

					return sendJson(
						res,
						{ ok: true, mock: true },
						200,
						{
							'set-cookie': `${SESSION_COOKIE}=${MOCK_SESSION_VALUE}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
						},
					);
				}

				if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
					return sendJson(
						res,
						{ ok: true, mock: true },
						200,
						{
							'set-cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
						},
					);
				}

				if (req.method === 'POST' && url.pathname === '/api/admin/run') {
					return sendJson(res, { ok: true, ts: nowMs, triggeredBy: 'manual', mock: true });
				}

				if (req.method === 'GET' && url.pathname === '/api/admin/results') {
					const type = url.searchParams.get('type');
					const model = url.searchParams.get('model');
					const limit = clamp(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1, 500);

					const check =
						type === 'head'
							? checksState.find((c) => c.type === 'head') ?? null
							: type === 'model' && model
								? checksState.find((c) => c.type === 'model' && c.model === model) ?? null
								: null;

					if (!check) return sendJson(res, { error: 'Invalid check' }, 400);
					return sendJson(res, { check_id: check.id, results: generateAdminResults(check, nowMs, limit) });
				}

				return sendJson(res, { error: 'Not Found' }, 404);
			});
		},
	};
}
