import { createCheck, getMeta, insertResult, listChecks, setMeta, type CheckRow, type Services } from '../db';
import type { ProviderResult } from './globalping';
import type { ModelType } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;
const NETWORK_BUCKET_MS = 5 * 60 * 1000;
const MODEL_BUCKET_MS = 15 * 60 * 1000;
const SEED_DAYS = 30;

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
const MODEL_TYPES = new Set<ModelType>(['model', 'rerank', 'decisions', 'systemone']);

const DEFAULT_CHECKS: Array<{ id: string; type: ModelType; model: string }> = [
	{ id: 'model:BAAI/bge-m3', type: 'model', model: 'BAAI/bge-m3' },
	{ id: 'model:Qwen/Qwen3-Embedding-0.6B', type: 'model', model: 'Qwen/Qwen3-Embedding-0.6B' },
	{ id: 'rerank:Pro/BAAI/bge-reranker-v2-m3', type: 'rerank', model: 'Pro/BAAI/bge-reranker-v2-m3' },
	{ id: 'decisions:typesafe/jev-latest', type: 'decisions', model: 'typesafe/jev-latest' },
	{ id: 'systemone:typesafe/jev-latest', type: 'systemone', model: 'typesafe/jev-latest' },
];

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

function baseSuccessRate(check: CheckRow): number {
	switch (check.type) {
		case 'head':
			return 0.9995;
		case 'rerank':
			return 0.997;
		case 'decisions':
			return 0.993;
		case 'systemone':
			return 0.991;
		default:
			return 0.996;
	}
}

function latencyFor(check: CheckRow, regionId: string, rng: () => number, failed: boolean): number {
	const regionFactor = REGION_FACTOR[regionId] ?? 1;
	let base: number;
	if (check.type === 'head') base = REGION_LATENCY[regionId] ?? 40;
	else if (check.type === 'rerank') base = 240;
	else if (check.type === 'decisions') base = 780;
	else if (check.type === 'systemone') base = 840;
	else base = 340;
	const jitter = rng() * base * 0.35;
	const penalty = failed ? base * 0.8 + rng() * 400 : 0;
	return Math.round(base * regionFactor + jitter + penalty);
}

function generateSample(check: CheckRow, regionId: string, ts: number) {
	const rng = mulberry32(hashString(`${check.id}|${regionId}|${ts}`));
	const rate = baseSuccessRate(check);
	const incident = rng() < (check.type === 'head' ? 0.0005 : 0.0025);
	const success = incident ? 0 : rng() < rate ? 1 : 0;
	const failed = success === 0;
	const statusCode =
		check.type === 'head'
			? success
				? check.id === 'net:models'
					? 401
					: 200
				: 503
			: success
				? 200
				: 500;
	return {
		success: success as 0 | 1,
		status_code: statusCode,
		latency_ms: latencyFor(check, regionId, rng, failed),
		error: failed ? (check.type === 'head' ? `HTTP ${statusCode} (mock)` : 'Upstream error / timeout (mock)') : null,
	};
}

function ensureMockChecks(services: Services) {
	const existing = listChecks(services).filter((check) => MODEL_TYPES.has(check.type as ModelType));
	if (existing.length > 0) return;
	for (const check of DEFAULT_CHECKS) {
		createCheck(services, {
			id: check.id,
			type: check.type,
			target: services.config.routerBaseUrl,
			model: check.model,
			provider: 'mock',
			enabled: 1,
		});
	}
}

function checksForMock(services: Services): CheckRow[] {
	return listChecks(services).filter(
		(check) =>
			check.enabled === 1 &&
			(check.type === 'head' || MODEL_TYPES.has(check.type as ModelType)) &&
			check.id.startsWith('net:') === (check.type === 'head'),
	);
}

function bucketMs(check: CheckRow): number {
	return check.type === 'head' ? NETWORK_BUCKET_MS : MODEL_BUCKET_MS;
}

function seed(services: Services, now: number) {
	const checks = checksForMock(services);
	services.db.transaction(() => {
		const insert = services.db.query(
			'INSERT INTO results (check_id, ts, success, status_code, latency_ms, error, region_id, source) VALUES (?,?,?,?,?,?,?,?)',
		);
		for (const check of checks) {
			const step = bucketMs(check);
			const end = Math.floor(now / step) * step - step;
			const start = end - SEED_DAYS * DAY_MS;
			for (let ts = start; ts <= end; ts += step) {
				for (const region of services.config.regions) {
					const sample = generateSample(check, region.id, ts);
					insert.run(
						check.id,
						ts,
						sample.success,
						sample.status_code,
						sample.latency_ms,
						sample.error,
						region.id,
						'mock',
					);
				}
			}
		}
	})();
	setMeta(services, 'mock:seeded_at', String(now));
}

function appendCurrent(services: Services, now: number): number {
	let inserted = 0;
	for (const check of checksForMock(services)) {
		const step = bucketMs(check);
		const ts = Math.floor(now / step) * step;
		for (const region of services.config.regions) {
			const sample = generateSample(check, region.id, ts);
			insertResult(services, {
				check_id: check.id,
				ts,
				...sample,
				region_id: region.id,
				source: 'mock',
			});
			inserted++;
		}
	}
	return inserted;
}

export async function collectMock(services: Services, opts: { now?: () => number } = {}): Promise<ProviderResult> {
	const now = opts.now?.() ?? Date.now();
	ensureMockChecks(services);
	if (!getMeta(services, 'mock:seeded_at')) seed(services, now);
	const inserted = appendCurrent(services, now);
	return {
		ok: true,
		error: null,
		inserted,
		warnings: ['mock mode: data is synthetic'],
		details: { mode: 'mock', seeded_at: getMeta(services, 'mock:seeded_at') },
	};
}
