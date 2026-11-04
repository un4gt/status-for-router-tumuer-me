import { insertResult, listChecks, type CheckRow, type Services } from '../db';
import type { RegionDefinition } from '../config';
import type { ProviderResult } from './globalping';
import { scfCamConfigError, signScfCamRequest } from './scfCam';

type ProbeLocation = {
	location_name?: unknown;
	status?: unknown;
	last_polled_time?: unknown;
	attribute_value?: unknown;
};

type ProbeResponse = {
	code?: unknown;
	message?: unknown;
	data?: {
		status?: unknown;
		last_polled_time?: unknown;
		attribute_value?: unknown;
		unit?: unknown;
		down_reason?: unknown;
		locations?: unknown;
	};
};

const MODEL_TYPES = new Set(['model', 'rerank', 'systemone', 'decisions']);

function truncate(value: unknown, length = 500): string | null {
	if (value === null || value === undefined) return null;
	const text = String(value);
	return text.length > length ? `${text.slice(0, length)}…` : text;
}

function safeError(value: unknown, services: Services, authorization = ''): string | null {
	if (value === null || value === undefined) return null;
	const { apiKey, cloudProbe } = services.config;
	let text = String(value);
	const secrets = [authorization, apiKey, cloudProbe.token, cloudProbe.cam.secretId, cloudProbe.cam.secretKey, cloudProbe.cam.token];
	for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
		text = text.replaceAll(secret, '[redacted]');
	}
	return truncate(text);
}

export function parseCloudProbeTime(value: unknown): number | null {
	if (typeof value !== 'string' || !value) return null;
	const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLatency(value: unknown, unit: unknown): number | null {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric < 0) return null;
	const normalizedUnit = String(unit ?? 'ms').trim().toLowerCase();
	const inSeconds = ['s', 'sec', 'second', 'seconds'].includes(normalizedUnit);
	return Math.round(inSeconds ? numeric * 1000 : numeric);
}

export function cloudProbeStatusToSuccess(status: unknown): 0 | 1 | null {
	const value = Number(status);
	if (value === 1) return 1;
	if (value === 0 || value === 2 || value === 3) return 0;
	// 5 Suspended, 7 Maintenance, 9 Discovery, 10 Configuration Error, unknown: not a service outage.
	return null;
}

function statusLabel(status: unknown): string {
	const labels: Record<number, string> = {
		0: 'Down',
		1: 'Up',
		2: 'Trouble',
		3: 'Critical',
		5: 'Suspended',
		7: 'Maintenance',
		9: 'Discovery',
		10: 'Configuration Error',
	};
	return labels[Number(status)] ?? `Status ${String(status)}`;
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
	let index = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const current = index++;
			if (current >= items.length) return;
			await fn(items[current]);
		}
	});
	await Promise.allSettled(workers);
}

async function requestProbe(
	services: Services,
	region: RegionDefinition,
	check: CheckRow,
	fetchImpl: typeof fetch,
): Promise<ProbeResponse> {
	const { cloudProbe } = services.config;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort('timeout'), cloudProbe.requestTimeoutMs);
	let authorization = '';
	try {
		// Serialize once: the bytes hashed for CAM must match the transmitted body.
		const payload = JSON.stringify({
			target: services.config.routerBaseUrl,
			apiKey: services.config.apiKey,
			check: { id: check.id, type: check.type, model: check.model },
			timeoutMs: cloudProbe.probeTimeoutMs,
		});
		const headers = { ...signScfCamRequest(region.probeUrl!, payload, cloudProbe.cam), accept: 'application/json' } as Record<string, string>;
		authorization = headers.authorization;
		if (cloudProbe.token) headers['x-probe-token'] = cloudProbe.token;
		const response = await fetchImpl(region.probeUrl!, {
			method: 'POST',
			headers,
			body: payload,
			redirect: 'error',
			signal: controller.signal,
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => '');
			throw new Error(`云函数 ${region.id} 返回 HTTP ${response.status}${detail ? `: ${safeError(detail, services, authorization)}` : ''}`);
		}
		const body = (await response.json().catch(() => null)) as ProbeResponse | null;
		if (!body || typeof body !== 'object') throw new Error(`云函数 ${region.id} 返回了无效 JSON`);
		if (body.code !== undefined && Number(body.code) !== 0) {
			throw new Error(`云函数 ${region.id} 失败：${String(body.message ?? body.code)}`);
		}
		return body;
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error(`云函数 ${region.id} 请求超时（${cloudProbe.requestTimeoutMs}ms）`);
		}
		throw new Error(safeError(error instanceof Error ? error.message : error, services, authorization) ?? '云函数请求失败');
	} finally {
		clearTimeout(timeout);
	}
}

function probeTargets(
	services: Services,
	region: RegionDefinition,
	check: CheckRow,
	data: NonNullable<ProbeResponse['data']>,
	warnings: string[],
): Array<{ success: 0 | 1; ts: number; latency: number | null; error: string | null }> {
	const locations = Array.isArray(data.locations) ? (data.locations as ProbeLocation[]) : [];
	if (locations.length === 0) {
		const success = cloudProbeStatusToSuccess(data.status);
		if (success === null) {
			warnings.push(`${check.id} ${region.label} 状态为 ${statusLabel(data.status)}，记为无数据`);
			return [];
		}
		warnings.push(`${check.id} ${region.label} 未返回地区明细，使用整体状态`);
		return [
			{
				success,
				ts: parseCloudProbeTime(data.last_polled_time) ?? Date.now(),
				latency: normalizeLatency(data.attribute_value, data.unit),
				error: success === 0 ? safeError(data.down_reason ?? statusLabel(data.status), services) : null,
			},
		];
	}

	const out: Array<{ success: 0 | 1; ts: number; latency: number | null; error: string | null }> = [];
	for (const location of locations) {
		const success = cloudProbeStatusToSuccess(location?.status ?? data.status);
		if (success === null) {
			warnings.push(`${check.id} ${region.label} 状态为 ${statusLabel(location?.status ?? data.status)}，记为无数据`);
			continue;
		}
		out.push({
			success,
			ts: parseCloudProbeTime(location?.last_polled_time) ?? parseCloudProbeTime(data.last_polled_time) ?? Date.now(),
			latency: normalizeLatency(location?.attribute_value ?? data.attribute_value, data.unit),
			error:
				success === 0
					? safeError(data.down_reason ?? statusLabel(location?.status ?? data.status), services)
					: null,
		});
	}
	return out;
}

async function collectRegion(
	services: Services,
	region: RegionDefinition,
	checks: CheckRow[],
	fetchImpl: typeof fetch,
): Promise<{ inserted: number; warnings: string[]; errors: string[] }> {
	const warnings: string[] = [];
	const errors: string[] = [];
	let inserted = 0;

	await mapWithConcurrency(checks, services.config.cloudProbe.concurrency, async (check) => {
		try {
			const body = await requestProbe(services, region, check, fetchImpl);
			const data = body.data ?? {};
			for (const result of probeTargets(services, region, check, data, warnings)) {
				insertResult(services, {
					check_id: check.id,
					ts: result.ts,
					success: result.success,
					status_code: null,
					latency_ms: result.latency,
					error: result.error,
					region_id: region.id,
					source: 'cloudprobe',
				});
				inserted++;
			}
		} catch (error) {
			errors.push(`${check.id}@${region.id}: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	return { inserted, warnings, errors };
}

export async function collectCloudProbe(
	services: Services,
	opts: { fetch?: typeof fetch } = {},
): Promise<ProviderResult> {
	const fetchImpl = opts.fetch ?? fetch;
	const warnings: string[] = [];
	const details: Record<string, unknown> = {};

	if (!services.config.apiKey) {
		return { ok: false, error: 'OPENAI_API_KEY not configured', inserted: 0, warnings, details };
	}
	const regions = services.config.regions.filter((region) => region.probeUrl);
	if (regions.length === 0) {
		return { ok: false, error: '未配置云函数拨测地址（regions[].probe_url）', inserted: 0, warnings, details };
	}
	const camError = scfCamConfigError(services.config.cloudProbe.cam);
	if (camError) return { ok: false, error: camError, inserted: 0, warnings, details };
	const unconfigured = services.config.regions.filter((region) => !region.probeUrl).map((region) => region.id);
	if (unconfigured.length > 0) warnings.push(`未配置云函数拨测地址：${unconfigured.join(', ')}`);

	const checks = listChecks(services).filter(
		(check) => check.enabled === 1 && MODEL_TYPES.has(check.type) && Boolean(check.model),
	);
	if (checks.length === 0) {
		return { ok: true, error: null, inserted: 0, warnings: ['没有启用的模型检查项'], details };
	}

	const errors: string[] = [];
	let inserted = 0;
	await Promise.all(
		regions.map(async (region) => {
			try {
				const result = await collectRegion(services, region, checks, fetchImpl);
				inserted += result.inserted;
				warnings.push(...result.warnings);
				errors.push(...result.errors);
				details[region.id] = { url: region.probeUrl, inserted: result.inserted };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push(`${region.id}: ${message}`);
				details[region.id] = { url: region.probeUrl, error: message.slice(0, 500) };
			}
		}),
	);

	return {
		ok: errors.length === 0,
		error: errors.length > 0 ? errors.join('; ').slice(0, 2000) : null,
		inserted,
		warnings,
		details,
	};
}
