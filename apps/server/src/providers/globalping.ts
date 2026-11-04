import { getCheckById, insertResult, type Services } from '../db';
import type { RegionDefinition } from '../config';

const API_BASE = 'https://api.globalping.io/v1';
const POLL_INTERVAL_MS = 500;
const POLL_ATTEMPTS = 40;

type HttpMethod = 'HEAD' | 'GET';
type NetworkTarget = {
	checkId: string;
	method: HttpMethod;
	path: string;
	accept: (statusCode: number) => boolean;
};

export type ProviderResult = {
	ok: boolean;
	error: string | null;
	inserted: number;
	warnings: string[];
	details: Record<string, unknown>;
};

function compact(value: unknown): string {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

// `|` separates matching aliases (e.g. Bay Area cities). The first alias is
// the actual Globalping location magic used when creating a measurement.
function measurementLocation(region: RegionDefinition): string {
	return region.globalping.split('|')[0].trim();
}

function targetList(services: Services): NetworkTarget[] {
	const { healthPath, modelsPath } = services.config.globalping;
	return [
		{ checkId: 'net:root', method: 'HEAD', path: '/', accept: (code) => code >= 200 && code < 400 },
		{ checkId: 'net:health', method: 'GET', path: healthPath, accept: (code) => code === 200 },
		// No router API key is sent to third-party probes: 401 proves the endpoint is reachable.
		{ checkId: 'net:models', method: 'GET', path: modelsPath, accept: (code) => code === 200 || code === 401 },
	];
}

function measurementHeaders(services: Services): Record<string, string> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		accept: 'application/json',
		'user-agent': 'emrank-status/1.0',
	};
	if (services.config.globalping.token) headers.authorization = `Bearer ${services.config.globalping.token}`;
	return headers;
}

export function matchRegion(regions: RegionDefinition[], location: Record<string, unknown>): RegionDefinition | null {
	const fields = ['city', 'state', 'country', 'region', 'network']
		.map((key) => compact(location[key]))
		.filter(Boolean);
	for (const region of regions) {
		// `|` separates alternative city matches, e.g.
		// "San Jose+US|Santa Clara+US|San Francisco+US".
		for (const alternative of region.globalping.split('|')) {
			const tokens = alternative.split('+').map(compact).filter(Boolean);
			if (tokens.length > 0 && tokens.every((token) => fields.includes(token))) return region;
		}
	}
	return null;
}

function latencyFromTimings(timings: Record<string, unknown> | null | undefined): number | null {
	if (!timings) return null;
	const total = Number(timings.total);
	if (Number.isFinite(total) && total > 0) return Math.round(total);
	const firstByte = Number(timings.firstByte);
	if (Number.isFinite(firstByte) && firstByte > 0) return Math.round(firstByte);
	const parts = [timings.tcp, timings.tls, timings.firstByte].map(Number).filter((value) => Number.isFinite(value));
	if (parts.length === 0) return null;
	const sum = parts.reduce((acc, value) => acc + value, 0);
	return sum > 0 ? Math.round(sum) : null;
}

function truncate(value: unknown, length = 500): string | null {
	if (value === null || value === undefined) return null;
	const text = String(value);
	return text.length > length ? `${text.slice(0, length)}…` : text;
}

async function sleep(ms: number) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTarget(
	services: Services,
	target: NetworkTarget,
	fetchImpl: typeof fetch,
): Promise<{ inserted: number; warnings: string[]; measurementId: string }> {
	const { config } = services;
	const check = getCheckById(services, target.checkId);
	if (!check || check.enabled !== 1) return { inserted: 0, warnings: [], measurementId: '' };

	const hostname = new URL(config.globalping.targetUrl).hostname;
	const createResponse = await fetchImpl(`${API_BASE}/measurements`, {
		method: 'POST',
		headers: measurementHeaders(services),
		body: JSON.stringify({
			type: 'http',
			target: hostname,
			locations: config.regions.map((region) => ({ magic: measurementLocation(region), limit: 1 })),
			measurementOptions: {
				request: { method: target.method, path: target.path },
				protocol: 'HTTPS',
			},
		}),
	});
	if (createResponse.status === 429) throw new Error('Globalping rate limit reached (429)');
	if (!createResponse.ok) throw new Error(`Globalping create measurement failed: HTTP ${createResponse.status}`);
	const created = (await createResponse.json()) as { id?: unknown };
	if (typeof created.id !== 'string' || !created.id) throw new Error('Globalping returned an invalid measurement id');

	const measurementId = created.id;
	let measurement: any = null;
	for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
		const response = await fetchImpl(`${API_BASE}/measurements/${measurementId}`, {
			headers: measurementHeaders(services),
		});
		if (response.status === 429) throw new Error('Globalping rate limit reached while polling (429)');
		if (!response.ok) throw new Error(`Globalping poll failed: HTTP ${response.status}`);
		measurement = await response.json();
		if (measurement?.status !== 'in-progress') break;
		await sleep(POLL_INTERVAL_MS);
	}
	if (measurement?.status === 'in-progress') throw new Error('Globalping measurement timed out');

	const createdAt = Number.isFinite(Date.parse(measurement?.createdAt)) ? Date.parse(measurement.createdAt) : Date.now();
	const results = Array.isArray(measurement?.results) ? measurement.results : [];
	const byRegion = new Map<string, any>();
	const warnings: string[] = [];
	for (const entry of results) {
		// Measurement results expose the location on `probe` directly; older examples nest it under `probe.location`.
		const location = entry?.probe?.location ?? entry?.probe ?? {};
		const region = matchRegion(config.regions, location);
		if (!region) {
			warnings.push(`未匹配到地区：${location?.city ?? 'unknown'}`);
			continue;
		}
		byRegion.set(region.id, entry);
	}

	let inserted = 0;
	for (const region of config.regions) {
		const entry = byRegion.get(region.id);
		if (!entry) {
			warnings.push(`${region.label} 无可用探针`);
			continue;
		}
		const result = entry.result ?? {};
		const statusCode = Number.isFinite(Number(result.statusCode)) ? Number(result.statusCode) : null;
		const finished = result.status === 'finished';
		const accepted = statusCode !== null && target.accept(statusCode);
		const success = finished && accepted ? 1 : 0;
		let error: string | null = null;
		if (!finished) error = truncate(result.rawOutput ?? 'Probe did not finish');
		else if (!accepted) error = statusCode === null ? 'Missing status code' : `HTTP ${statusCode}`;
		insertResult(services, {
			check_id: target.checkId,
			ts: createdAt,
			success,
			status_code: statusCode,
			latency_ms: latencyFromTimings(result.timings),
			error,
			region_id: region.id,
			source: 'globalping',
		});
		inserted++;
	}

	return { inserted, warnings, measurementId };
}

export async function collectGlobalping(
	services: Services,
	opts: { fetch?: typeof fetch } = {},
): Promise<ProviderResult> {
	const fetchImpl = opts.fetch ?? fetch;
	const warnings: string[] = [];
	const details: Record<string, unknown> = {};
	let inserted = 0;
	const errors: string[] = [];

	for (const target of targetList(services)) {
		try {
			const result = await runTarget(services, target, fetchImpl);
			inserted += result.inserted;
			warnings.push(...result.warnings);
			if (result.measurementId) details[target.checkId] = result.measurementId;
		} catch (error) {
			errors.push(`${target.checkId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return {
		ok: errors.length === 0,
		error: errors.length > 0 ? errors.join('; ').slice(0, 2000) : null,
		inserted,
		warnings,
		details,
	};
}
