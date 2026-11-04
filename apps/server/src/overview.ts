import { getMeta, listChecks, type Services } from './db';
import { getSummary, getWindowStarts, type AvailabilityStats, type WindowKey } from './summary';
import { getBucketMs } from './timeseries';

export type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';
export type SeriesPoint = {
	ts: number;
	total_count: number;
	success_count: number;
	availability: number | null;
	avg_latency_ms: number | null;
};
export type Series = { from: number; to: number; bucket_ms: number; series: SeriesPoint[] };
export type RegionStats = {
	status: HealthStatus;
	availability: number | null;
	total_count: number;
	success_count: number;
	avg_latency_ms: number | null;
	p95_ms: number | null;
	last_status: 'success' | 'failure' | null;
	last_checked_at: number | null;
	last_latency_ms: number | null;
	series: Series;
};
export type ModelHealth = {
	id: string;
	type: string;
	model: string;
	enabled: boolean;
	provider: string;
	probe_configured: boolean;
	status: HealthStatus;
	availability: number | null;
	total_count: number;
	success_count: number;
	avg_latency_ms: number | null;
	p95_ms: number | null;
	last_status: 'success' | 'failure' | null;
	last_checked_at: number | null;
	stats: Record<WindowKey, AvailabilityStats>;
	regions: Record<string, RegionStats>;
	series: Series;
};
export type GatewayEndpoint = {
	id: string;
	label: string;
	method: 'HEAD' | 'GET';
	path: string;
	status: HealthStatus;
	last_checked_at: number | null;
	stats: Record<WindowKey, AvailabilityStats>;
	regions: Record<string, RegionStats>;
};
export type GatewayRegion = RegionStats & {
	id: string;
	label: string;
	code: string;
};
export type SourceStatus = {
	configured: boolean;
	last_sync_at: number | null;
	last_error: string | null;
	last_warning: string | null;
};

type SummaryCheck = ReturnType<typeof getSummary>['checks'][number];
type BucketRow = {
	check_id: string;
	region_id: string;
	bucket_ts: number;
	total_count: number;
	success_count: number;
	avg_latency_ms: number | null;
};
type P95Row = { check_id?: string; region_id?: string; p95: number | null };

const MODEL_TYPES = new Set(['model', 'rerank', 'systemone', 'decisions']);
const NETWORK_IDS = new Set(['net:root', 'net:health', 'net:models']);
const WINDOW_MS: Record<WindowKey, number> = {
	'5h': 5 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
};

function emptyAvailability(): AvailabilityStats {
	return { success_count: 0, total_count: 0, availability: null };
}

function availabilityStatus(availability: number | null, lastStatus: 'success' | 'failure' | null, total: number): HealthStatus {
	if (total <= 0 || availability === null) return 'unknown';
	if (availability < 0.95) return 'outage';
	if (availability < 0.99 || lastStatus === 'failure') return 'degraded';
	return 'operational';
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
	const rank: Record<HealthStatus, number> = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, outage: 4 };
	let worst: HealthStatus = 'unknown';
	for (const status of statuses) if (rank[status] > rank[worst]) worst = status;
	return worst;
}

function averageLatency(points: SeriesPoint[]): number | null {
	let total = 0;
	let sum = 0;
	for (const point of points) {
		if (point.avg_latency_ms !== null && point.total_count > 0) {
			sum += point.avg_latency_ms * point.total_count;
			total += point.total_count;
		}
	}
	return total > 0 ? Math.round(sum / total) : null;
}

function mergePoints(lists: SeriesPoint[][]): SeriesPoint[] {
	const buckets = new Map<number, { total: number; success: number; latency: number; latencyCount: number }>();
	for (const list of lists) {
		for (const point of list) {
			const current = buckets.get(point.ts) ?? { total: 0, success: 0, latency: 0, latencyCount: 0 };
			current.total += point.total_count;
			current.success += point.success_count;
			if (point.avg_latency_ms !== null && point.total_count > 0) {
				current.latency += point.avg_latency_ms * point.total_count;
				current.latencyCount += point.total_count;
			}
			buckets.set(point.ts, current);
		}
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([ts, value]) => ({
			ts,
			total_count: value.total,
			success_count: value.success,
			availability: value.total > 0 ? value.success / value.total : null,
			avg_latency_ms: value.latencyCount > 0 ? Math.round(value.latency / value.latencyCount) : null,
		}));
}

function makeSeries(points: SeriesPoint[], from: number, to: number, bucketMs: number): Series {
	return { from, to, bucket_ms: bucketMs, series: points };
}

function loadSeries(
	services: Services,
	from: number,
	to: number,
	bucketMs: number,
	kind: 'head' | 'model',
): Map<string, Map<string, SeriesPoint[]>> {
	const typeFilter =
		kind === 'head'
			? "checks.type = 'head' AND checks.id IN ('net:root','net:health','net:models')"
			: "checks.type IN ('model','rerank','systemone','decisions')";
	const rows = services.db
		.query<BucketRow, (string | number)[]>(
			`SELECT
			   results.check_id,
			   results.region_id,
			   (CAST(results.ts / ? AS INTEGER) * ?) AS bucket_ts,
			   COUNT(*) AS total_count,
			   SUM(results.success) AS success_count,
			   AVG(results.latency_ms) AS avg_latency_ms
			 FROM results
			 JOIN checks ON checks.id = results.check_id AND checks.provider = results.source
			 WHERE results.ts >= ? AND results.ts <= ? AND ${typeFilter}
			 GROUP BY results.check_id, results.region_id, bucket_ts
			 ORDER BY bucket_ts ASC`,
		)
		.all(bucketMs, bucketMs, from, to);
	const out = new Map<string, Map<string, SeriesPoint[]>>();
	for (const row of rows) {
		const total = Number(row.total_count ?? 0);
		const success = Number(row.success_count ?? 0);
		const point: SeriesPoint = {
			ts: Number(row.bucket_ts),
			total_count: total,
			success_count: success,
			availability: total > 0 ? success / total : null,
			avg_latency_ms: row.avg_latency_ms === null ? null : Math.round(Number(row.avg_latency_ms)),
		};
		if (!out.has(row.check_id)) out.set(row.check_id, new Map());
		const byRegion = out.get(row.check_id)!;
		if (!byRegion.has(row.region_id)) byRegion.set(row.region_id, []);
		byRegion.get(row.region_id)!.push(point);
	}
	return out;
}

function p95RankExpression(): string {
	return `MIN(cnt, CAST(cnt * 0.95 AS INTEGER) + CASE WHEN cnt * 0.95 > CAST(cnt * 0.95 AS INTEGER) THEN 1 ELSE 0 END)`;
}

export function loadP95(
	services: Services,
	from: number,
	to: number,
	group: 'check' | 'check_region' | 'head_region',
): Map<string, number> {
	const partition =
		group === 'check' ? 'results.check_id' : group === 'head_region' ? 'results.region_id' : 'results.check_id, results.region_id';
	const select =
		group === 'head_region'
			? 'results.region_id,'
			: group === 'check'
				? 'results.check_id,'
				: 'results.check_id, results.region_id,';
	const groupBy = group === 'head_region' ? 'region_id' : group === 'check' ? 'check_id' : 'check_id, region_id';
	const typeFilter = group === 'head_region' ? "AND checks.type = 'head' AND checks.id IN ('net:root','net:health','net:models')" : '';
	const rows = services.db
		.query<P95Row, (string | number)[]>(
			`WITH ranked AS (
			   SELECT
			     ${select}
			     results.latency_ms,
			     ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY results.latency_ms) AS rn,
			     COUNT(*) OVER (PARTITION BY ${partition}) AS cnt
			   FROM results
			   JOIN checks ON checks.id = results.check_id AND checks.provider = results.source
			   WHERE results.ts >= ? AND results.ts <= ? AND results.latency_ms IS NOT NULL ${typeFilter}
			 )
			 SELECT ${groupBy},
			        MAX(CASE WHEN rn = ${p95RankExpression()} THEN latency_ms END) AS p95
			 FROM ranked
			 GROUP BY ${groupBy}`,
		)
		.all(from, to);
	const out = new Map<string, number>();
	for (const row of rows) {
		if (row.p95 === null || row.p95 === undefined) continue;
		const key =
			group === 'head_region'
				? String(row.region_id ?? '')
				: group === 'check'
					? String(row.check_id ?? '')
					: `${row.check_id ?? ''}|${row.region_id ?? ''}`;
		out.set(key, Math.round(Number(row.p95)));
	}
	return out;
}

function regionStats(
	check: SummaryCheck,
	regionId: string,
	window: WindowKey,
	p95ByCheckRegion: Map<string, number>,
	seriesByCheck: Map<string, Map<string, SeriesPoint[]>>,
	from: number,
	to: number,
	bucketMs: number,
): RegionStats {
	const availabilityStats = check.stats_by_region[regionId]?.[window] ?? emptyAvailability();
	const last = check.last_by_region[regionId];
	const points = seriesByCheck.get(check.id)?.get(regionId) ?? [];
	const p95 = p95ByCheckRegion.get(`${check.id}|${regionId}`) ?? null;
	const lastStatus = last ? (last.success === 1 ? 'success' : 'failure') : null;
	return {
		status: availabilityStatus(availabilityStats.availability, lastStatus, availabilityStats.total_count),
		availability: availabilityStats.availability,
		total_count: availabilityStats.total_count,
		success_count: availabilityStats.success_count,
		avg_latency_ms: averageLatency(points),
		p95_ms: p95,
		last_status: lastStatus,
		last_checked_at: last?.ts ?? null,
		last_latency_ms: last?.latency_ms ?? null,
		series: makeSeries(points, from, to, bucketMs),
	};
}

function sourceStatus(services: Services, key: string, configured: boolean): SourceStatus {
	const lastSync = Number(getMeta(services, `source:${key}:last_run_at`) ?? getMeta(services, `source:${key}:last_success_at`));
	const lastError = getMeta(services, `source:${key}:last_error`);
	const lastWarning = getMeta(services, `source:${key}:last_warning`);
	return {
		configured,
		last_sync_at: Number.isFinite(lastSync) && lastSync > 0 ? lastSync : null,
		last_error: lastError?.trim() ? lastError : null,
		last_warning: lastWarning?.trim() ? lastWarning : null,
	};
}

function endpointMeta(services: Services, checkId: string): { label: string; method: 'HEAD' | 'GET'; path: string } {
	if (checkId === 'net:root') return { label: 'HEAD /', method: 'HEAD', path: '/' };
	if (checkId === 'net:health') return { label: `GET ${services.config.globalping.healthPath}`, method: 'GET', path: services.config.globalping.healthPath };
	return { label: `GET ${services.config.globalping.modelsPath}`, method: 'GET', path: services.config.globalping.modelsPath };
}

export function getSources(services: Services): Record<string, SourceStatus> {
	return {
		globalping: sourceStatus(services, 'globalping', true),
		cloudprobe: sourceStatus(services, 'cloudprobe', services.config.cloudProbe.configured),
		mock: sourceStatus(services, 'mock', services.config.monitoringMode === 'mock'),
		direct: sourceStatus(services, 'direct', services.config.monitoringMode === 'direct'),
	};
}

export function getOverview(services: Services, window: WindowKey = '24h', now = Date.now()) {
	const summary = getSummary(services, now);
	const checks = summary.checks;
	const from = getWindowStarts(now).starts[window];
	const to = now;
	const gatewayBucketMs = getBucketMs(window, { minBucketMs: services.config.globalping.intervalSeconds * 1000 });
	const modelBucketMs = getBucketMs(window, { minBucketMs: services.config.cloudProbe.intervalSeconds * 1000 });

	const networkChecks = checks.filter((check) => NETWORK_IDS.has(check.id));
	const modelChecks = checks.filter((check) => MODEL_TYPES.has(check.type as string) && check.model);
	const networkSeries = loadSeries(services, from, to, gatewayBucketMs, 'head');
	const modelSeries = loadSeries(services, from, to, modelBucketMs, 'model');
	const p95CheckRegion = loadP95(services, from, to, 'check_region');
	const p95Check = loadP95(services, from, to, 'check');
	const p95HeadRegion = loadP95(services, from, to, 'head_region');

	const gatewayRegionCards: GatewayRegion[] = services.config.regions.map((region) => {
		let total = 0;
		let success = 0;
		let lastChecked: number | null = null;
		let lastStatus: 'success' | 'failure' | null = null;
		let lastLatency: number | null = null;
		let latestSuccessTs = -1;
		const allPoints: SeriesPoint[][] = [];
		for (const check of networkChecks) {
			const stats = check.stats_by_region[region.id]?.[window] ?? emptyAvailability();
			total += stats.total_count;
			success += stats.success_count;
			const last = check.last_by_region[region.id];
			if (last) {
				if (lastChecked === null || last.ts > lastChecked) {
					lastChecked = last.ts;
					lastStatus = last.success === 1 ? 'success' : 'failure';
				}
				if (last.success === 1 && last.latency_ms !== null && last.ts > latestSuccessTs) {
					latestSuccessTs = last.ts;
					lastLatency = last.latency_ms;
				}
			}
			allPoints.push(networkSeries.get(check.id)?.get(region.id) ?? []);
		}
		const points = mergePoints(allPoints);
		const availability = total > 0 ? success / total : null;
		return {
			id: region.id,
			label: region.label,
			code: region.code,
			status: availabilityStatus(availability, lastStatus, total),
			availability,
			total_count: total,
			success_count: success,
			avg_latency_ms: averageLatency(points),
			p95_ms: p95HeadRegion.get(region.id) ?? null,
			last_status: lastStatus,
			last_checked_at: lastChecked,
			// The big region number is the latest bucket's average across all network endpoints,
			// so it is consistent with the p95 population (all endpoints) instead of one endpoint.
			last_latency_ms: points.at(-1)?.avg_latency_ms ?? lastLatency ?? averageLatency(points),
			series: makeSeries(points, from, to, gatewayBucketMs),
		};
	});

	const endpoints: GatewayEndpoint[] = networkChecks.map((check) => {
		const meta = endpointMeta(services, check.id);
		const windowStats = check.stats[window];
		const lastStatus = check.last_status;
		return {
			id: check.id,
			label: meta.label,
			method: meta.method,
			path: meta.path,
			status: availabilityStatus(windowStats.availability, lastStatus, windowStats.total_count),
			last_checked_at: check.last_checked_at,
			stats: check.stats,
			regions: Object.fromEntries(
				services.config.regions.map((region) => [
					region.id,
					regionStats(check, region.id, window, p95CheckRegion, networkSeries, from, to, gatewayBucketMs),
				]),
			),
		};
	});

	let gatewayTotal = 0;
	let gatewaySuccess = 0;
	let gatewayLastChecked: number | null = null;
	for (const check of networkChecks) {
		const stats = check.stats[window];
		gatewayTotal += stats.total_count;
		gatewaySuccess += stats.success_count;
		if (check.last_checked_at !== null && (gatewayLastChecked === null || check.last_checked_at > gatewayLastChecked)) {
			gatewayLastChecked = check.last_checked_at;
		}
	}
	const gatewayAvailability = gatewayTotal > 0 ? gatewaySuccess / gatewayTotal : null;

	const models: ModelHealth[] = modelChecks
		.map((check) => {
			const windowStats = check.stats[window];
			const aggregatePoints = mergePoints(
				[...(modelSeries.get(check.id)?.values() ?? [])].map((points) => points),
			);
			const regions = Object.fromEntries(
				services.config.regions.map((region) => [
					region.id,
					regionStats(check, region.id, window, p95CheckRegion, modelSeries, from, to, modelBucketMs),
				]),
			);
			const regionStatuses = Object.values(regions).map((region) => region.status);
			const rowStatus =
				regionStatuses.some((status) => status !== 'unknown')
					? worstStatus(regionStatuses)
					: availabilityStatus(windowStats.availability, check.last_status, windowStats.total_count);
			return {
				id: check.id,
				type: check.type,
				model: check.model ?? check.id,
				enabled: check.enabled,
				provider: check.provider,
				probe_configured: services.config.monitoringMode !== 'live' || services.config.cloudProbe.configured,
				status: rowStatus,
				availability: windowStats.availability,
				total_count: windowStats.total_count,
				success_count: windowStats.success_count,
				avg_latency_ms: averageLatency(aggregatePoints),
				p95_ms: p95Check.get(check.id) ?? null,
				last_status: check.last_status,
				last_checked_at: check.last_checked_at,
				stats: check.stats,
				regions,
				series: makeSeries(aggregatePoints, from, to, modelBucketMs),
			} satisfies ModelHealth;
		})
		.sort((a, b) => a.type.localeCompare(b.type) || a.model.localeCompare(b.model));

	const regionInfo = services.config.regions.map((region) => {
		const card = gatewayRegionCards.find((item) => item.id === region.id);
		return { id: region.id, label: region.label, code: region.code, status: card?.status ?? 'unknown' };
	});

	return {
		generated_at: now,
		mode: services.config.monitoringMode,
		window,
		regions: regionInfo,
		gateway: {
			status: worstStatus(gatewayRegionCards.map((region) => region.status)),
			availability: gatewayAvailability,
			last_checked_at: gatewayLastChecked,
			endpoints,
			regions: gatewayRegionCards,
		},
		models,
		sources: getSources(services),
	};
}

export type OverviewResponse = ReturnType<typeof getOverview>;
