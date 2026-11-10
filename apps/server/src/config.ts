import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scfCamConfigError } from './providers/scfCam';

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export type CheckType = 'head' | 'model' | 'rerank' | 'systemone' | 'decisions';
export type ModelType = Exclude<CheckType, 'head'>;
export type MonitoringMode = 'live' | 'mock' | 'direct';
export type RegionDefinition = {
	id: string;
	label: string;
	code: string;
	globalping: string;
	probeUrl: string | null;
	lat?: number;
	lng?: number;
};

export const DEFAULT_REGIONS: RegionDefinition[] = [
	{ id: 'shanghai', label: '上海', code: 'SHA', globalping: 'Shanghai+CN', probeUrl: null },
	{ id: 'beijing', label: '北京', code: 'BJS', globalping: 'Beijing+CN', probeUrl: null },
	{ id: 'hongkong', label: '香港', code: 'HKG', globalping: 'Hong Kong+HK|Tsuen Wan+HK', probeUrl: null },
	{ id: 'tokyo', label: '东京', code: 'TYO', globalping: 'Tokyo+JP', probeUrl: null },
	{
		id: 'siliconvalley',
		label: '硅谷',
		code: 'SJC',
		globalping: 'San Jose+US|Santa Clara+US|San Francisco+US',
		probeUrl: null,
	},
];

export function parseIntervalSeconds(raw: string | undefined): number | null {
	const match = raw
		?.trim()
		.toLowerCase()
		.match(/^(\d+(?:\s*\*\s*\d+)*)\s*([smhd])?$/);
	if (!match) return null;
	const value = match[1].split('*').reduce((total, part) => total * Number(part.trim()), 1);
	const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
	const seconds = value * units[match[2] || 's'];
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function httpUrl(value: string, name: string): string {
	try {
		const url = new URL(value);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
		return value;
	} catch {
		throw new Error(`${name} must be an HTTP(S) URL without embedded credentials`);
	}
}

function loadRegions(path: string): RegionDefinition[] {
	if (!existsSync(path)) return DEFAULT_REGIONS;
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		throw new Error(`MONITOR_REGIONS_FILE is not valid JSON: ${path}`);
	}
	if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('MONITOR_REGIONS_FILE must contain a non-empty array');
	const seen = new Set<string>();
	return parsed.map((row: any) => {
		const id = typeof row?.id === 'string' ? row.id.trim() : '';
		const label = typeof row?.label === 'string' ? row.label.trim() : '';
		const globalping = typeof row?.globalping === 'string' ? row.globalping.trim() : '';
		const rawProbeUrl = typeof row?.probe_url === 'string' ? row.probe_url.trim() : typeof row?.probeUrl === 'string' ? row.probeUrl.trim() : '';
		if (!id || !label || !globalping) {
			throw new Error('Each region needs id, label, and globalping');
		}
		const probeUrl = rawProbeUrl ? httpUrl(rawProbeUrl, `Region ${id} probe_url`) : null;
		if (seen.has(id)) throw new Error(`Duplicate region id: ${id}`);
		seen.add(id);
		const coordinates = row.lat !== undefined || row.lng !== undefined;
		if (coordinates && (!Number.isFinite(row.lat) || Math.abs(row.lat) > 90 || !Number.isFinite(row.lng) || Math.abs(row.lng) > 180)) {
			throw new Error(`Region ${id} needs valid lat and lng coordinates`);
		}
		return {
			id,
			label,
			code: typeof row?.code === 'string' && row.code.trim() ? row.code.trim() : id.slice(0, 3).toUpperCase(),
			globalping,
			probeUrl,
			...(coordinates ? { lat: row.lat as number, lng: row.lng as number } : {}),
		};
	});
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
	const required = (name: string) => {
		const value = env[name];
		if (!value?.trim()) throw new Error(`${name} must be configured in .env`);
		return value;
	};
	const port = Number(env.PORT || 8787);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
	if (env.TRUST_PROXY && !['true', 'false'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be true or false');

	const monitoringMode = (env.MONITORING_MODE?.trim() || 'live') as MonitoringMode;
	if (!['live', 'mock', 'direct'].includes(monitoringMode)) throw new Error('MONITORING_MODE must be live, mock, or direct');

	const routerBaseUrl = httpUrl(env.ROUTER_BASE_URL?.trim() || 'https://emrank.tech/v1', 'ROUTER_BASE_URL').replace(/\/+$/, '');
	const headCheckUrl = httpUrl(env.HEAD_CHECK_URL?.trim() || 'https://emrank.tech/', 'HEAD_CHECK_URL');
	const globalpingTargetUrl = httpUrl(
		env.GLOBALPING_TARGET_URL?.trim() || new URL(headCheckUrl).origin,
		'GLOBALPING_TARGET_URL',
	).replace(/\/+$/, '');
	const checkIntervalSeconds = parseIntervalSeconds(env.CHECK_INTERVAL_SECONDS) ?? 300;
	const globalpingIntervalSeconds = parseIntervalSeconds(env.GLOBALPING_INTERVAL_SECONDS) ?? 300;
	const cloudProbeIntervalSeconds = parseIntervalSeconds(env.CLOUD_PROBE_INTERVAL_SECONDS) ?? 30;
	const positiveInteger = (name: string, fallback: number, min: number, max: number) => {
		const raw = env[name];
		if (raw === undefined || raw.trim() === '') return fallback;
		const value = Number(raw);
		if (!Number.isInteger(value) || value < min || value > max) {
			throw new Error(`${name} must be an integer between ${min} and ${max}`);
		}
		return value;
	};
	const cloudProbeRequestTimeoutMs = positiveInteger('CLOUD_PROBE_TIMEOUT_MS', 30_000, 1_000, 120_000);
	const cloudProbeProbeTimeoutMs = positiveInteger('CLOUD_PROBE_PROBE_TIMEOUT_MS', 15_000, 500, 60_000);
	const cloudProbeConcurrency = positiveInteger('CLOUD_PROBE_CONCURRENCY', 4, 1, 20);
	const apiKey = env.OPENAI_API_KEY?.trim() || '';
	const coordinate = (name: string, fallback: number, limit: number) => {
		const value = env[name]?.trim() ? Number(env[name]) : fallback;
		if (!Number.isFinite(value) || Math.abs(value) > limit) throw new Error(`${name} is outside its coordinate range`);
		return value;
	};
	const regions = loadRegions(resolve(PROJECT_ROOT, env.MONITOR_REGIONS_FILE || './data/regions.json'));
	const cam = {
		secretId: env.TENCENTCLOUD_SECRET_ID?.trim() || '',
		secretKey: env.TENCENTCLOUD_SECRET_KEY?.trim() || '',
		uin: env.TENCENTCLOUD_UIN?.trim() || '',
		token: env.TENCENTCLOUD_TOKEN?.trim() || '',
	};

	return {
		adminUsername: required('ADMIN_USERNAME').trim(),
		adminPassword: required('ADMIN_PASSWORD'),
		sessionSecret: required('SESSION_SECRET'),
		apiKey,
		globeTarget: {
			label: env.GLOBE_TARGET_LABEL?.trim() || '硅谷 · 服务目标',
			lat: coordinate('GLOBE_TARGET_LAT', 37.3382, 90),
			lng: coordinate('GLOBE_TARGET_LNG', -121.8863, 180),
		},
		routerBaseUrl,
		headCheckUrl,
		monitoringMode,
		checkIntervalSeconds,
		schedulerTickSeconds: Math.min(checkIntervalSeconds, globalpingIntervalSeconds, cloudProbeIntervalSeconds),
		databasePath: resolve(PROJECT_ROOT, env.DATABASE_PATH || './data/status.sqlite'),
		host: env.HOST?.trim() || '127.0.0.1',
		port,
		trustProxy: env.TRUST_PROXY === 'true',
		regions,
		globalping: {
			targetUrl: globalpingTargetUrl,
			token: env.GLOBALPING_TOKEN?.trim() || '',
			intervalSeconds: globalpingIntervalSeconds,
			healthPath: env.GLOBALPING_HEALTH_PATH?.trim() || '/health',
			modelsPath: env.GLOBALPING_MODELS_PATH?.trim() || '/v1/models',
		},
		cloudProbe: {
			intervalSeconds: cloudProbeIntervalSeconds,
			requestTimeoutMs: cloudProbeRequestTimeoutMs,
			probeTimeoutMs: cloudProbeProbeTimeoutMs,
			concurrency: cloudProbeConcurrency,
			token: env.CLOUD_PROBE_TOKEN?.trim() || '',
			cam,
			configured: Boolean(apiKey && regions.some((region) => region.probeUrl) && !scfCamConfigError(cam)),
		},
		decisionTestModel: env.DECISION_TEST_MODEL?.trim() || 'typesafe/jev-latest',
	};
}

export type Config = ReturnType<typeof loadConfig>;
