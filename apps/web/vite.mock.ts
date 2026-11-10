import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { regionCoordinates } from '../server/src/topology';

type WindowKey = '5h' | '24h' | '7d' | '30d';
type CheckType = 'head' | 'model' | 'rerank' | 'systemone' | 'decisions';
type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

type CheckDef = {
	id: string;
	type: CheckType;
	target: string;
	model: string | null;
	enabled: boolean;
	provider: string;
	successRate: number;
};

type RegionDef = { id: string; label: string; code: string };

const REGIONS: RegionDef[] = [
	{ id: 'shanghai', label: '上海', code: 'SHA' },
	{ id: 'beijing', label: '北京', code: 'BJS' },
	{ id: 'hongkong', label: '香港', code: 'HKG' },
	{ id: 'tokyo', label: '东京', code: 'TYO' },
	{ id: 'siliconvalley', label: '硅谷', code: 'SJC' },
];

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

const REGION_LATENCY: Record<string, number> = {
	shanghai: 68,
	beijing: 88,
	hongkong: 45,
	tokyo: 32,
	siliconvalley: 21,
};
const REGION_FACTOR: Record<string, number> = {
	shanghai: 1.18,
	beijing: 1.12,
	hongkong: 1.08,
	tokyo: 0.95,
	siliconvalley: 1.05,
};

const SESSION_COOKIE = 'router_status_session';
const MOCK_SESSION_VALUE = 'mock';
const MOCK_ADMIN_PASSWORD = 'admin';

const DEFAULT_CHECKS: CheckDef[] = [
	{ id: 'net:root', type: 'head', target: 'https://emrank.tech/', model: null, enabled: true, provider: 'mock', successRate: 0.9995 },
	{ id: 'net:health', type: 'head', target: 'https://emrank.tech/health', model: null, enabled: true, provider: 'mock', successRate: 0.999 },
	{ id: 'net:models', type: 'head', target: 'https://emrank.tech/v1/models', model: null, enabled: true, provider: 'mock', successRate: 0.998 },
	{ id: 'model:BAAI/bge-m3', type: 'model', target: 'https://emrank.tech/v1', model: 'BAAI/bge-m3', enabled: true, provider: 'mock', successRate: 0.997 },
	{ id: 'model:Qwen/Qwen3-Embedding-0.6B', type: 'model', target: 'https://emrank.tech/v1', model: 'Qwen/Qwen3-Embedding-0.6B', enabled: true, provider: 'mock', successRate: 0.996 },
	{ id: 'model:Qwen/Qwen3-Embedding-4B', type: 'model', target: 'https://emrank.tech/v1', model: 'Qwen/Qwen3-Embedding-4B', enabled: true, provider: 'mock', successRate: 0.995 },
	{ id: 'rerank:Pro/BAAI/bge-reranker-v2-m3', type: 'rerank', target: 'https://emrank.tech/v1', model: 'Pro/BAAI/bge-reranker-v2-m3', enabled: true, provider: 'mock', successRate: 0.997 },
	{ id: 'decisions:typesafe/jev-latest', type: 'decisions', target: 'https://emrank.tech/v1', model: 'typesafe/jev-latest', enabled: true, provider: 'mock', successRate: 0.993 },
	{ id: 'systemone:typesafe/jev-latest', type: 'systemone', target: 'https://emrank.tech/v1', model: 'typesafe/jev-latest', enabled: true, provider: 'mock', successRate: 0.991 },
];

let checksState: CheckDef[] = [...DEFAULT_CHECKS];

function sendJson(res: ServerResponse, body: unknown, status = 200, extraHeaders?: Record<string, string>) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	if (extraHeaders) for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
	res.end(JSON.stringify(body));
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
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

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!cookieHeader) return out;
	for (const part of cookieHeader.split(';')) {
		const [key, ...rest] = part.trim().split('=');
		if (key) out[key] = rest.join('=');
	}
	return out;
}

function isAuthed(req: IncomingMessage) {
	return parseCookies(req.headers.cookie)[SESSION_COOKIE] === MOCK_SESSION_VALUE;
}

async function readJson(req: IncomingMessage): Promise<any> {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (chunk) => (data += String(chunk)));
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
	return raw === '5h' || raw === '24h' || raw === '7d' || raw === '30d' ? raw : null;
}

function alignedRange(from: number, to: number, step: number) {
	const start = Math.floor(from / step) * step;
	const end = Math.floor(to / step) * step;
	const out: number[] = [];
	for (let ts = start; ts <= end; ts += step) out.push(ts);
	return out;
}

function baseLatency(check: CheckDef, regionId: string): number {
	const factor = REGION_FACTOR[regionId] ?? 1;
	if (check.type === 'head') return REGION_LATENCY[regionId] ?? 40;
	if (check.type === 'rerank') return 280 * factor;
	if (check.type === 'decisions') return 880 * factor;
	if (check.type === 'systemone') return 940 * factor;
	return 410 * factor;
}

function generateSeries(check: CheckDef, window: WindowKey, nowMs: number, regionId: string) {
	const bucketMs = BUCKET_MS[window];
	const from = nowMs - WINDOW_MS[window];
	const to = nowMs;
	const buckets = alignedRange(from, to, bucketMs);
	const series = [];
	for (const ts of buckets) {
		const rng = mulberry32(hashString(`${check.id}|${regionId}|${ts}`));
		if (rng() < 0.02) continue;
		const incident = rng() < (check.type === 'head' ? 0.0008 : 0.0025);
		const success = incident ? 0 : rng() < check.successRate ? 1 : 0;
		const base = baseLatency(check, regionId);
		const latency = Math.round(base + rng() * base * 0.35 + (success ? 0 : base * 0.7 + rng() * 300));
		series.push({
			ts,
			total_count: 1,
			success_count: success,
			availability: success,
			avg_latency_ms: latency,
		});
	}
	return { from, to, bucket_ms: bucketMs, series };
}

type Series = ReturnType<typeof generateSeries>;

function mergeSeries(lists: Series[], from: number, to: number, bucketMs: number): Series {
	const buckets = new Map<number, { total: number; success: number; latency: number; latencyCount: number }>();
	for (const list of lists) {
		for (const point of list.series) {
			const current = buckets.get(point.ts) ?? { total: 0, success: 0, latency: 0, latencyCount: 0 };
			current.total += point.total_count;
			current.success += point.success_count;
			if (point.avg_latency_ms !== null) {
				current.latency += point.avg_latency_ms;
				current.latencyCount++;
			}
			buckets.set(point.ts, current);
		}
	}
	return {
		from,
		to,
		bucket_ms: bucketMs,
		series: [...buckets.entries()]
			.sort(([a], [b]) => a - b)
			.map(([ts, value]) => ({
				ts,
				total_count: value.total,
				success_count: value.success,
				availability: value.total > 0 ? value.success / value.total : null,
				avg_latency_ms: value.latencyCount > 0 ? Math.round(value.latency / value.latencyCount) : null,
			})),
	};
}

function summarize(series: Series) {
	let total = 0;
	let success = 0;
	for (const point of series.series) {
		total += point.total_count;
		success += point.success_count;
	}
	return { success_count: success, total_count: total, availability: total > 0 ? success / total : null };
}

function averageLatency(series: Series): number | null {
	const values = series.series.map((point) => point.avg_latency_ms).filter((value): value is number => value !== null);
	if (values.length === 0) return null;
	return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function p95(series: Series): number | null {
	const values = series.series.map((point) => point.avg_latency_ms).filter((value): value is number => value !== null).sort((a, b) => a - b);
	if (values.length === 0) return null;
	const rank = Math.min(values.length, Math.ceil(values.length * 0.95));
	return values[rank - 1] ?? null;
}

function statusFor(availability: number | null, lastStatus: 'success' | 'failure' | null, total: number): HealthStatus {
	if (total <= 0 || availability === null) return 'unknown';
	if (availability < 0.95) return 'outage';
	if (availability < 0.99 || lastStatus === 'failure') return 'degraded';
	return 'operational';
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
	const rank: Record<HealthStatus, number> = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, outage: 4 };
	return statuses.reduce<HealthStatus>((worst, status) => (rank[status] > rank[worst] ? status : worst), 'unknown');
}

function regionStats(check: CheckDef, window: WindowKey, nowMs: number, regionId: string) {
	const series = generateSeries(check, window, nowMs, regionId);
	const stats = summarize(series);
	const last = generateAdminResults(check, Math.floor(nowMs / 300_000) * 300_000, 1, regionId)[0];
	const lastStatus = last.success ? 'success' : 'failure';
	return {
		status: statusFor(stats.availability, lastStatus, stats.total_count),
		availability: stats.availability,
		total_count: stats.total_count,
		success_count: stats.success_count,
		avg_latency_ms: averageLatency(series),
		p95_ms: p95(series),
		last_status: lastStatus,
		last_checked_at: last.ts,
		last_latency_ms: last.latency_ms,
		series,
	};
}

function aggregateCheckSeries(check: CheckDef, window: WindowKey, nowMs: number) {
	const lists = REGIONS.map((region) => generateSeries(check, window, nowMs, region.id));
	return mergeSeries(lists, nowMs - WINDOW_MS[window], nowMs, BUCKET_MS[window]);
}

function statsByRegion(check: CheckDef, window: WindowKey, nowMs: number) {
	const out: Record<string, Record<WindowKey, ReturnType<typeof summarize>>> = {};
	for (const region of REGIONS) {
		out[region.id] = {} as Record<WindowKey, ReturnType<typeof summarize>>;
		for (const key of Object.keys(WINDOW_MS) as WindowKey[]) {
			out[region.id][key] = summarize(generateSeries(check, key, nowMs, region.id));
		}
	}
	return out;
}

function buildOverview(nowMs: number, window: WindowKey) {
	const networkChecks = checksState.filter((check) => check.type === 'head');
	const modelChecks = checksState.filter((check) => check.type !== 'head');
	const gatewayRegions = REGIONS.map((region) => {
		const lists = networkChecks.map((check) => generateSeries(check, window, nowMs, region.id));
		const series = mergeSeries(lists, nowMs - WINDOW_MS[window], nowMs, BUCKET_MS[window]);
		const stats = summarize(series);
		const last = series.series.at(-1);
		const lastStatus = last ? (last.success_count > 0 ? 'success' : 'failure') : null;
		return {
			id: region.id,
			label: region.label,
			code: region.code,
			status: statusFor(stats.availability, lastStatus, stats.total_count),
			availability: stats.availability,
			total_count: stats.total_count,
			success_count: stats.success_count,
			avg_latency_ms: averageLatency(series),
			p95_ms: p95(series),
			last_status: lastStatus,
			last_checked_at: last?.ts ?? null,
			last_latency_ms: last?.avg_latency_ms ?? null,
			series,
		};
	});
	const endpoints = networkChecks.map((check) => {
		const regions = Object.fromEntries(REGIONS.map((region) => [region.id, regionStats(check, window, nowMs, region.id)]));
		const aggregate = aggregateCheckSeries(check, window, nowMs);
		const stats = summarize(aggregate);
		const last = aggregate.series.at(-1);
		const meta =
			check.id === 'net:root'
				? { label: 'HEAD /', method: 'HEAD', path: '/' }
				: check.id === 'net:health'
					? { label: 'GET /health', method: 'GET', path: '/health' }
					: { label: 'GET /v1/models', method: 'GET', path: '/v1/models' };
		return {
			id: check.id,
			...meta,
			status: statusFor(stats.availability, last ? (last.success_count > 0 ? 'success' : 'failure') : null, stats.total_count),
			last_checked_at: last?.ts ?? null,
			stats: Object.fromEntries(
				(Object.keys(WINDOW_MS) as WindowKey[]).map((key) => [key, summarize(aggregateCheckSeries(check, key, nowMs))]),
			),
			regions,
		};
	});
	const models = modelChecks.map((check) => {
		const aggregate = aggregateCheckSeries(check, window, nowMs);
		const stats = summarize(aggregate);
		const regions = Object.fromEntries(REGIONS.map((region) => [region.id, regionStats(check, window, nowMs, region.id)]));
		const last = aggregate.series.at(-1);
		const lastStatus = last ? (last.success_count > 0 ? 'success' : 'failure') : null;
		return {
			id: check.id,
			type: check.type,
			model: check.model ?? check.id,
			enabled: check.enabled,
			provider: check.provider,
			probe_configured: true,
			status: worstStatus(Object.values(regions).map((region: any) => region.status)),
			availability: stats.availability,
			total_count: stats.total_count,
			success_count: stats.success_count,
			avg_latency_ms: averageLatency(aggregate),
			p95_ms: p95(aggregate),
			last_status: lastStatus,
			last_checked_at: last?.ts ?? null,
			stats: Object.fromEntries((Object.keys(WINDOW_MS) as WindowKey[]).map((key) => [key, summarize(aggregateCheckSeries(check, key, nowMs))])),
			regions,
			series: aggregate,
		};
	});
	return {
		generated_at: nowMs,
		mode: 'mock',
		window,
		topology: { target: { label: '硅谷 · 服务目标', lat: 37.3382, lng: -121.8863 }, intervals: { network: 300_000, model: 300_000 } },
		regions: REGIONS.map((region) => ({
			...region,
			coordinates: regionCoordinates(region),
			status: gatewayRegions.find((item) => item.id === region.id)?.status ?? 'unknown',
		})),
		gateway: {
			status: worstStatus(gatewayRegions.map((region) => region.status)),
			availability: (() => {
				const total = gatewayRegions.reduce((sum, region) => sum + region.total_count, 0);
				const success = gatewayRegions.reduce((sum, region) => sum + region.success_count, 0);
				return total > 0 ? success / total : null;
			})(),
			last_checked_at: Math.max(0, ...gatewayRegions.map((region) => region.last_checked_at ?? 0)) || null,
			endpoints,
			regions: gatewayRegions,
		},
		models,
		sources: {
			globalping: { configured: true, last_sync_at: nowMs, last_error: null, last_warning: null },
			cloudprobe: { configured: false, last_sync_at: null, last_error: null, last_warning: null },
			mock: { configured: true, last_sync_at: nowMs, last_error: null, last_warning: 'mock mode: data is synthetic' },
			direct: { configured: false, last_sync_at: null, last_error: null, last_warning: null },
		},
	};
}

function buildSummary(nowMs: number) {
	const overview = buildOverview(nowMs, '24h');
	const checks = [...overview.gateway.endpoints, ...overview.models];
	return {
		generated_at: nowMs,
		checks: checks.map((check: any) => ({
			id: check.id,
			type: check.type ?? 'head',
			target: checksState.find((item) => item.id === check.id)?.target ?? '',
			model: check.model ?? null,
			enabled: check.enabled ?? true,
			provider: 'mock',
			last_checked_at: check.last_checked_at,
			last_status: check.last_status ?? (check.status === 'outage' ? 'failure' : check.status === 'unknown' ? null : 'success'),
			stats: check.stats,
			stats_by_region: check.regions
				? Object.fromEntries(
						Object.entries(check.regions).map(([regionId, region]: [string, any]) => [
							regionId,
							Object.fromEntries((Object.keys(WINDOW_MS) as WindowKey[]).map((key) => [key, { success_count: region.success_count, total_count: region.total_count, availability: region.availability }])),
						]),
					)
				: {},
			last_by_region: check.regions
				? Object.fromEntries(
						Object.entries(check.regions).map(([regionId, region]: [string, any]) => [
							regionId,
							{ ts: region.last_checked_at, success: region.last_status === 'success' ? 1 : 0, latency_ms: region.last_latency_ms },
						]),
					)
				: {},
		})),
	};
}

function resolveCheck(url: URL) {
	const checkId = url.searchParams.get('check_id');
	if (checkId) return checksState.find((check) => check.id === checkId) ?? null;
	const type = url.searchParams.get('type');
	const model = url.searchParams.get('model');
	if (type === 'head') return checksState.find((check) => check.id === 'net:root') ?? null;
	if ((type === 'model' || type === 'rerank' || type === 'systemone' || type === 'decisions') && model) {
		return checksState.find((check) => check.type === type && check.model === model) ?? null;
	}
	return null;
}

function generateAdminResults(check: CheckDef, nowMs: number, limit: number, regionId?: string) {
	const intervalMs = 5 * 60 * 1000;
	const out = [];
	for (let i = 0; i < limit; i++) {
		const ts = nowMs - i * intervalMs;
		const region = regionId ?? REGIONS[i % REGIONS.length].id;
		const rng = mulberry32(hashString(`${check.id}|result|${region}|${ts}`));
		const success = rng() < check.successRate ? 1 : 0;
		const base = baseLatency(check, region);
		const latency = Math.round(base + rng() * base * 0.5);
		out.push({
			id: i + 1,
			check_id: check.id,
			ts,
			success,
			status_code: check.type === 'head' ? (success ? (check.id === 'net:models' ? 401 : 200) : 503) : success ? 200 : 500,
			latency_ms: success ? latency : latency + Math.round(rng() * 400),
			error: success ? null : check.type === 'head' ? 'HTTP 503 (mock)' : 'Upstream error / timeout (mock)',
			region_id: region,
			source: 'mock',
		});
	}
	return out;
}

function buildProbeDetail(check: CheckDef, region: string, window: WindowKey, nowMs: number) {
	const from = nowMs - WINDOW_MS[window];
	const bucketMs = BUCKET_MS[window];
	const rows = generateAdminResults(check, nowMs, Math.floor(WINDOW_MS[window] / 300_000) + 1, region);
	const quantile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
	const successes = rows.filter((row) => row.success);
	const latencies = successes.map((row) => row.latency_ms);
	const buckets = new Map<number, number[]>();
	for (const row of successes) { const ts = Math.floor(row.ts / bucketMs) * bucketMs; const values = buckets.get(ts) ?? []; values.push(row.latency_ms); buckets.set(ts, values); }
	const series = [];
	for (let ts = Math.floor(from / bucketMs) * bucketMs; ts <= nowMs; ts += bucketMs) {
		const values = buckets.get(ts) ?? [];
		series.push({ ts, sample_count: values.length, p95_ms: quantile(values, .95), p99_ms: quantile(values, .99) });
	}
	return { check_id: check.id, region, source: 'mock', window, from, to: nowMs, bucket_ms: bucketMs,
		total_count: rows.length, success_count: successes.length, availability: successes.length / rows.length,
		sample_count: latencies.length, p95_ms: quantile(latencies, .95), p99_ms: quantile(latencies, .99), series,
		history: rows.slice(0, 24).map(({ ts, success, status_code, latency_ms }) => ({ ts, success, status_code, latency_ms })),
	};
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

				if (req.method === 'GET' && url.pathname === '/api/public/overview') {
					const window = getWindowKey(url.searchParams.get('window')) ?? '5h';
					return sendJson(res, buildOverview(nowMs, window));
				}
				if (req.method === 'GET' && url.pathname === '/api/public/probe-detail') {
					const check = resolveCheck(url);
					const region = url.searchParams.get('region') ?? '';
					const window = getWindowKey(url.searchParams.get('window')) ?? '5h';
					if (!check || !REGIONS.some((item) => item.id === region)) return sendJson(res, { error: 'Invalid check or region' }, 400);
					return sendJson(res, buildProbeDetail(check, region, window, nowMs));
				}
				if (req.method === 'GET' && url.pathname === '/api/public/summary') {
					return sendJson(res, buildSummary(nowMs));
				}
				if (req.method === 'GET' && url.pathname === '/api/public/timeseries') {
					const window = getWindowKey(url.searchParams.get('window')) ?? '5h';
					const check = resolveCheck(url);
					if (!check) return sendJson(res, { error: 'Invalid check' }, 400);
					const region = url.searchParams.get('region');
					const series =
						region && region !== 'all'
							? generateSeries(check, window, nowMs, region)
							: mergeSeries(
									REGIONS.map((item) => generateSeries(check, window, nowMs, item.id)),
									nowMs - WINDOW_MS[window],
									nowMs,
									BUCKET_MS[window],
								);
					return sendJson(res, { check_id: check.id, region: region ?? 'all', ...series });
				}

				if (url.pathname.startsWith('/api/admin/') && !isAuthed(req) && url.pathname !== '/api/admin/login') {
					return sendJson(res, { error: 'Unauthorized' }, 401);
				}

				if (req.method === 'GET' && url.pathname === '/api/admin/models') {
					return sendJson(res, {
						models: [
							...checksState.filter((check) => check.model && check.type !== 'head').map((check) => ({
								id: check.model,
								detected_type: check.type,
								suggested_type: null,
								unsupported: false,
							})),
							{ id: 'custom-embedding', detected_type: null, suggested_type: 'model', unsupported: false },
							{ id: 'custom-decision', detected_type: null, suggested_type: 'decisions', unsupported: false },
							{ id: 'chat-model', detected_type: null, suggested_type: null, unsupported: true },
						],
					});
				}
				if (req.method === 'PUT' && url.pathname === '/api/admin/checks/selection') {
					const body = await readJson(req);
					if (
						!Array.isArray(body?.checks) ||
						body.checks.some(
							(item: any) =>
								!item ||
								!['model', 'rerank', 'systemone', 'decisions'].includes(item.type) ||
								typeof item.model !== 'string' ||
								!item.model.trim(),
						)
					) {
						return sendJson(res, { error: 'Each model needs a name and explicit type' }, 400);
					}
					const next = checksState.map((check) => (check.type === 'head' ? check : { ...check, enabled: false }));
					for (const row of body.checks) {
						const model = row.model.trim();
						const id = `${row.type}:${model}`;
						const existing = next.find((check) => check.id === id);
						if (existing) existing.enabled = true;
						else
							next.push({
								id,
								type: row.type,
								model,
								target: 'https://emrank.tech/v1',
								enabled: true,
								provider: 'mock',
								successRate: 0.99,
							});
					}
					checksState = next;
					return sendJson(res, { ok: true });
				}
				if (req.method === 'GET' && url.pathname === '/api/admin/checks') {
					return sendJson(res, { checks: checksState.map((check) => ({ ...check, created_at: nowMs })) });
				}
				if (req.method === 'POST' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					if (!body || !['model', 'rerank', 'systemone', 'decisions'].includes(body.type))
						return sendJson(res, { error: 'Only model checks can be created' }, 400);
					const model = typeof body.model === 'string' ? body.model.trim() : '';
					if (!model) return sendJson(res, { error: 'Missing model' }, 400);
					const id = `${body.type}:${model}`;
					if (checksState.some((check) => check.id === id)) return sendJson(res, { error: 'Already exists' }, 409);
					checksState = [
						...checksState,
						{
							id,
							type: body.type,
							model,
							target: 'https://emrank.tech/v1',
							enabled: body.enabled !== false,
							provider: 'mock',
							successRate: 0.99,
						},
					];
					return sendJson(res, { ok: true, id });
				}
				if (req.method === 'PATCH' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					const id = typeof body?.id === 'string' ? body.id.trim() : '';
					const index = checksState.findIndex((check) => check.id === id);
					if (index === -1) return sendJson(res, { error: 'Not found' }, 404);
					if (checksState[index].type === 'head') return sendJson(res, { error: 'Only model checks can be modified' }, 400);
					if (typeof body?.enabled !== 'boolean') return sendJson(res, { error: 'Missing enabled' }, 400);
					checksState = checksState.map((check, position) =>
						position === index ? { ...check, enabled: body.enabled } : check,
					);
					return sendJson(res, { ok: true });
				}
				if (req.method === 'DELETE' && url.pathname === '/api/admin/checks') {
					const body = await readJson(req);
					const id = typeof body?.id === 'string' ? body.id.trim() : '';
					const target = checksState.find((check) => check.id === id);
					if (!target) return sendJson(res, { error: 'Not found' }, 404);
					if (target.type === 'head') return sendJson(res, { error: 'Only model checks can be deleted' }, 400);
					checksState = checksState.filter((check) => check.id !== id);
					return sendJson(res, { ok: true });
				}
				if (req.method === 'GET' && url.pathname === '/api/admin/sources') {
					return sendJson(res, {
						mode: 'mock',
						regions: REGIONS.map((region) => ({ ...region, globalping: '', probeUrl: null })),
						sources: {
							globalping: { configured: true, last_sync_at: nowMs, last_error: null, last_warning: null },
							cloudprobe: { configured: false, last_sync_at: null, last_error: null, last_warning: null },
							mock: { configured: true, last_sync_at: nowMs, last_error: null, last_warning: 'mock mode: data is synthetic' },
						},
					});
				}
				if (req.method === 'POST' && url.pathname === '/api/admin/sources/sync') {
					return sendJson(res, { ok: true, ts: nowMs, triggeredBy: 'manual', sources: { mock: { ok: true, error: null, inserted: 24 } } });
				}
				if (req.method === 'POST' && url.pathname === '/api/admin/login') {
					const body = await readJson(req);
					if (body?.username !== 'admin' || typeof body?.password !== 'string' || body.password !== MOCK_ADMIN_PASSWORD) {
						return sendJson(res, { error: 'Invalid credentials (mock: admin/admin)' }, 401);
					}
					return sendJson(res, { ok: true, mock: true }, 200, {
						'set-cookie': `${SESSION_COOKIE}=${MOCK_SESSION_VALUE}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
					});
				}
				if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
					return sendJson(res, { ok: true, mock: true }, 200, {
						'set-cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
					});
				}
				if (req.method === 'POST' && (url.pathname === '/api/admin/run' || url.pathname === '/api/admin/sources/sync')) {
					return sendJson(res, { ok: true, ts: nowMs, triggeredBy: 'manual', mock: true });
				}
				if (req.method === 'GET' && url.pathname === '/api/admin/results') {
					const check = resolveCheck(url);
					if (!check) return sendJson(res, { error: 'Invalid check' }, 400);
					const limit = clamp(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1, 500);
					const region = url.searchParams.get('region') ?? undefined;
					return sendJson(res, {
						check_id: check.id,
						region: region ?? 'all',
						results: generateAdminResults(check, nowMs, limit, region === 'all' ? undefined : region),
					});
				}
				return sendJson(res, { error: 'Not Found' }, 404);
			});
		},
	};
}
