import type { CheckType, Coordinates, HealthStatus, OverviewResponse, RegionInfo, RegionStats } from '../../api';
import { TYPE_LABELS } from '../../constants';
import { SCENE_STATUS } from '../../design/tokens';
import { formatLatency } from '../../format';

export type Layer = 'both' | 'network' | 'model';
export type Signal = { status: HealthStatus; latency: number | null; stale: boolean };
export type ProbeLink = { checkId: string; label: string; model?: string; type?: CheckType; layer: Exclude<Layer, 'both'>; signal: Signal };
export type GlobeNode = Coordinates & { id: string; label: string; code: string; checks: ProbeLink[]; status: HealthStatus };
export type GlobeArc = {
	checkId: string;
	label: string;
	phase: number;
	node: GlobeNode;
	layer: Exclude<Layer, 'both'>;
	startLat: number;
	startLng: number;
	endLat: number;
	endLng: number;
	altitude: number;
	signal: Signal;
};
export const COLORS: Record<HealthStatus, string> = SCENE_STATUS;
export const LABELS: Record<HealthStatus, string> = {
	operational: '正常',
	degraded: '降级或较慢',
	outage: '故障',
	unknown: '无新数据',
	maintenance: '维护',
};

export function signalFor(stats: RegionStats | undefined, layer: Exclude<Layer, 'both'>, interval: number, now: number): Signal {
	const stale = !stats?.last_checked_at || now - stats.last_checked_at > Math.max(interval * 3, 120_000);
	if (!stats || !stats.total_count || stale) return { status: 'unknown', latency: null, stale };
	const latency = stats.last_latency_ms;
	const status =
		stats.last_status === 'failure'
			? 'outage'
			: stats.status === 'operational' && latency !== null && latency > (layer === 'network' ? 1000 : 3000)
				? 'degraded'
				: stats.status;
	return { status, latency, stale: false };
}

export function worst(signals: Signal[]): HealthStatus {
	return (
		(['outage', 'degraded', 'maintenance', 'unknown', 'operational'] as const).find((status) => signals.some((s) => s.status === status)) ??
		'unknown'
	);
}

// A bounded logarithmic visual scale shared by both sources, not literal time playback.
export function animationDuration(latency: number | null) {
	return latency === null ? 0 : Math.min(8500, 1000 + Math.log1p(Math.max(0, latency) / 80) * 1100);
}

export function angularDistance(a: Coordinates, b: Coordinates) {
	const rad = Math.PI / 180;
	const hav =
		Math.sin(((a.lat - b.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((a.lng - b.lng) * rad) / 2) ** 2;
	return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, hav))));
}

export function buildGlobeData(overview: OverviewResponse, layer: Layer, now: number) {
	const checks = [
		...overview.gateway.endpoints.map((item) => ({ ...item, label: `${item.method} ${item.path}`, layer: 'network' as const })),
		...overview.models
			.filter((item) => item.enabled)
			.map((item) => ({ ...item, label: `${item.model} · ${TYPE_LABELS[item.type]}`, layer: 'model' as const })),
	];
	const nodes: GlobeNode[] = [];
	const unmapped: RegionInfo[] = [];
	const arcs: GlobeArc[] = [];
	for (const region of overview.regions) {
		if (!region.coordinates) {
			unmapped.push(region);
			continue;
		}
		const links: ProbeLink[] = checks.map((check) => ({
			checkId: check.id,
			label: check.label,
			type: 'type' in check ? check.type : undefined,
			model: 'model' in check ? check.model : undefined,
			layer: check.layer,
			signal: signalFor(check.regions[region.id], check.layer, overview.topology.intervals[check.layer], now),
		}));
		const visible = links.filter((link) => layer === 'both' || link.layer === layer);
		const node: GlobeNode = {
			...region.coordinates,
			id: region.id,
			label: region.label,
			code: region.code,
			checks: links,
			status: worst(visible.map((link) => link.signal)),
		};
		nodes.push(node);
		const distance = angularDistance(node, overview.topology.target);
		if (distance < 0.015) continue; // Co-located probes have no geographic arc.
		for (const link of visible) {
			const siblings = links.filter((item) => item.layer === link.layer);
			const index = siblings.findIndex((item) => item.checkId === link.checkId);
			// A stable height/phase for every check: refreshing or hiding a layer must
			// not reshuffle the remaining routes, and no enabled model is sampled away.
			let hash = 0;
			for (const c of `${region.id}:${link.checkId}`) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
			arcs.push({
				checkId: link.checkId,
				label: link.label,
				phase: (hash % 1000) / 1000,
				node,
				layer: link.layer,
				startLat: node.lat,
				startLng: node.lng,
				endLat: overview.topology.target.lat,
				endLng: overview.topology.target.lng,
				altitude:
					distance * 0.19 +
					(link.layer === 'model' ? 0.05 : 0) +
					(index / Math.max(1, siblings.length - 1)) * (link.layer === 'model' ? 0.14 : 0.025),
				signal: link.signal,
			});
		}
	}
	return { nodes, arcs, unmapped };
}

/** Kept for existing callers; same rule as the 2D view. */
export const latencyLabel = formatLatency;
