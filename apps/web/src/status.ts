import type { CheckType, HealthStatus, ModelHealth, OverviewResponse, RegionStats } from './api';
import { STATUS_RANK } from './design/tokens';

/**
 * The status shown for a model row. The server already folds availability, the
 * latest result and every region into `status`; the page must not recompute it
 * from availability alone (that hid regional degradation as "正常").
 */
export function modelStatus(model: ModelHealth, region: string): HealthStatus {
	if (region === 'all') return model.status;
	return model.regions[region]?.status ?? 'unknown';
}

export function modelStats(model: ModelHealth, region: string): RegionStats {
	if (region === 'all') {
		return {
			status: model.status,
			availability: model.availability,
			total_count: model.total_count,
			success_count: model.success_count,
			avg_latency_ms: model.avg_latency_ms,
			p95_ms: model.p95_ms,
			last_status: model.last_status,
			last_checked_at: model.last_checked_at,
			last_latency_ms: null,
			series: model.series,
		};
	}
	return (
		model.regions[region] ?? {
			status: 'unknown',
			availability: null,
			total_count: 0,
			success_count: 0,
			avg_latency_ms: null,
			p95_ms: null,
			last_status: null,
			last_checked_at: null,
			last_latency_ms: null,
			series: { ...model.series, series: [] },
		}
	);
}

export function worstStatus(statuses: HealthStatus[]): HealthStatus {
	return statuses.reduce<HealthStatus>((worst, status) => (STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst), 'unknown');
}

export function countStatuses(statuses: HealthStatus[]): Record<HealthStatus, number> {
	const counts: Record<HealthStatus, number> = { operational: 0, degraded: 0, outage: 0, maintenance: 0, unknown: 0 };
	for (const status of statuses) counts[status] += 1;
	return counts;
}

/** Worst first, so the most important colour claims its share of the particle field first. */
const SHARE_ORDER: HealthStatus[] = ['outage', 'degraded', 'maintenance', 'operational', 'unknown'];

/**
 * Split [0, 1) into one band per status, in proportion to the counts. Subjects without data
 * only fill the field when nothing has data yet. Any status that is present keeps at least
 * `floor` of the field, so one degraded model among many is still visible.
 */
export function statusShares(counts: Record<HealthStatus, number>, floor = 0.06): Array<{ status: HealthStatus; end: number }> {
	const known = SHARE_ORDER.filter((status) => status !== 'unknown' && counts[status] > 0);
	const present = known.length ? known : (['unknown'] as HealthStatus[]);
	const total = present.reduce((sum, status) => sum + Math.max(counts[status], 1), 0);
	const raw = present.map((status) => Math.max(Math.max(counts[status], 1) / total, floor));
	const scale = raw.reduce((sum, share) => sum + share, 0);
	let end = 0;
	return present.map((status, index) => {
		end = index === present.length - 1 ? 1 : end + raw[index] / scale;
		return { status, end };
	});
}

export type SortKey = 'attention' | 'name' | 'availability' | 'latency';

const TYPE_ORDER: CheckType[] = ['model', 'rerank', 'decisions', 'systemone', 'head'];

/** Problems first, then by type and name, so the row that needs a look is on top. */
export function sortModels(models: ModelHealth[], region: string, key: SortKey): ModelHealth[] {
	const list = [...models];
	const byName = (a: ModelHealth, b: ModelHealth) =>
		TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.model.localeCompare(b.model);
	if (key === 'name') return list.sort(byName);
	if (key === 'availability')
		return list.sort((a, b) => (modelStats(a, region).availability ?? 2) - (modelStats(b, region).availability ?? 2) || byName(a, b));
	if (key === 'latency')
		return list.sort((a, b) => (modelStats(b, region).p95_ms ?? -1) - (modelStats(a, region).p95_ms ?? -1) || byName(a, b));
	return list.sort((a, b) => {
		const enabled = Number(b.enabled) - Number(a.enabled);
		if (enabled) return enabled;
		// Missing data deserves a look before healthy rows, but after real problems.
		const rank = (status: HealthStatus) => (status === 'unknown' ? 1.5 : STATUS_RANK[status]);
		return rank(modelStatus(b, region)) - rank(modelStatus(a, region)) || byName(a, b);
	});
}

export function filterModels(models: ModelHealth[], query: string): ModelHealth[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return models;
	return models.filter((model) => model.model.toLowerCase().includes(needle));
}

/** Short model names collide once truncated; keep the distinguishing suffix visible. */
export function splitModelName(name: string): { vendor: string; base: string; tag: string } {
	const tagMatch = name.match(/^(.*?)(\[[^\]]+\])$/);
	const withoutTag = tagMatch ? tagMatch[1] : name;
	const tag = tagMatch ? tagMatch[2] : '';
	const slash = withoutTag.lastIndexOf('/');
	return slash >= 0
		? { vendor: withoutTag.slice(0, slash + 1), base: withoutTag.slice(slash + 1), tag }
		: { vendor: '', base: withoutTag, tag };
}

export type Incident = {
	status: HealthStatus;
	headline: string;
	/** Plain-language clauses about regions; empty when no region is affected. */
	detail: string[];
	affectedModels: number;
	outageModels: number;
	degradedModels: number;
	totalModels: number;
	affectedRegions: string[];
	/** How many checked subjects (the gateway and each enabled model) are in each status. */
	statusCounts: Record<HealthStatus, number>;
	since: number | null;
	/** Newest check across gateway and models — the data's real freshness. */
	lastCheckedAt: number | null;
};

/**
 * Turn the overview into the one sentence a visitor came for. `since` is the
 * start of the current unbroken run of imperfect buckets in the worst region.
 */
export function summarize(overview: OverviewResponse): Incident {
	const enabled = overview.models.filter((model) => model.enabled);
	const outage = enabled.filter((model) => model.status === 'outage');
	const degraded = enabled.filter((model) => model.status === 'degraded');
	const affected = [...outage, ...degraded];
	const badRegions = overview.gateway.regions.filter((region) => region.status === 'degraded' || region.status === 'outage');
	const statuses = [overview.gateway.status, ...enabled.map((model) => model.status)];
	const status = worstStatus(statuses.filter((s) => s !== 'unknown')) || 'unknown';
	const hasData = statuses.some((s) => s !== 'unknown');
	const overall: HealthStatus = hasData ? status : 'unknown';

	let since: number | null = null;
	for (const region of badRegions) {
		const points = [...region.series.series].sort((a, b) => a.ts - b.ts);
		let start: number | null = null;
		for (let index = points.length - 1; index >= 0; index--) {
			const point = points[index];
			if (!point.total_count) continue;
			if ((point.availability ?? 1) < 1) start = point.ts;
			else if (start !== null) break;
		}
		if (start !== null && (since === null || start < since)) since = start;
	}

	const regionNames = badRegions.map((region) => region.label);
	// Affected models are counted in the figures row and listed in the table;
	// the sentence only carries what those don't: which regions and since when.
	const detail: string[] = [];
	if (badRegions.length) detail.push(`${regionNames.join('、')}访问网关不稳定`);

	const headline =
		overall === 'unknown'
			? '等待首次检测'
			: overall === 'operational'
				? '所有服务运行正常'
				: overall === 'outage'
					? '部分服务出现故障'
					: '部分服务性能下降';

	const lastCheckedAt = Math.max(overview.gateway.last_checked_at ?? 0, ...enabled.map((model) => model.last_checked_at ?? 0)) || null;

	return {
		status: overall,
		headline,
		detail,
		affectedModels: affected.length,
		outageModels: outage.length,
		degradedModels: degraded.length,
		totalModels: enabled.length,
		affectedRegions: regionNames,
		statusCounts: countStatuses(statuses),
		since,
		lastCheckedAt,
	};
}
