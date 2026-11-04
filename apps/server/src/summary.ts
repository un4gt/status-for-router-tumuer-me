import type { Services } from './db';
import { listChecks } from './db';

type StatsRow = {
	check_id: string;
	region_id: string;
	total_5h: number;
	success_5h: number;
	total_24h: number;
	success_24h: number;
	total_7d: number;
	success_7d: number;
	total_30d: number;
	success_30d: number;
};

type LastRow = { check_id: string; region_id: string; ts: number; success: number; latency_ms: number | null };

export type WindowKey = '5h' | '24h' | '7d' | '30d';

const WINDOWS: Record<WindowKey, number> = {
	'5h': 5 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
};

export type AvailabilityStats = { success_count: number; total_count: number; availability: number | null };

export function getWindowStarts(nowMs = Date.now()) {
	return {
		nowMs,
		starts: {
			'5h': nowMs - WINDOWS['5h'],
			'24h': nowMs - WINDOWS['24h'],
			'7d': nowMs - WINDOWS['7d'],
			'30d': nowMs - WINDOWS['30d'],
		} as Record<WindowKey, number>,
	};
}

export function emptyStats(): Record<WindowKey, AvailabilityStats> {
	return {
		'5h': { success_count: 0, total_count: 0, availability: null },
		'24h': { success_count: 0, total_count: 0, availability: null },
		'7d': { success_count: 0, total_count: 0, availability: null },
		'30d': { success_count: 0, total_count: 0, availability: null },
	};
}

function statsFromRow(row: StatsRow | undefined): Record<WindowKey, AvailabilityStats> {
	const out = emptyStats();
	for (const window of Object.keys(WINDOWS) as WindowKey[]) {
		const success = Number((row as any)?.[`success_${window}`] ?? 0);
		const total = Number((row as any)?.[`total_${window}`] ?? 0);
		out[window] = { success_count: success, total_count: total, availability: total > 0 ? success / total : null };
	}
	return out;
}

function addStats(target: Record<WindowKey, AvailabilityStats>, row: StatsRow) {
	for (const window of Object.keys(WINDOWS) as WindowKey[]) {
		target[window].success_count += Number((row as any)[`success_${window}`] ?? 0);
		target[window].total_count += Number((row as any)[`total_${window}`] ?? 0);
	}
}

function finalizeStats(stats: Record<WindowKey, AvailabilityStats>) {
	for (const window of Object.keys(WINDOWS) as WindowKey[]) {
		const item = stats[window];
		item.availability = item.total_count > 0 ? item.success_count / item.total_count : null;
	}
	return stats;
}

export function getSummary(services: Services, now = Date.now()) {
	const { nowMs, starts } = getWindowStarts(now);

	const checks = listChecks(services);
	if (checks.length === 0) return { generated_at: nowMs, checks: [] as any[] };

	const oldest = starts['30d'];
	const rows = services.db
		.query<StatsRow, number[]>(
			`SELECT
       results.check_id,
       results.region_id,
       SUM(CASE WHEN results.ts >= ? THEN 1 ELSE 0 END) AS total_5h,
       SUM(CASE WHEN results.ts >= ? THEN results.success ELSE 0 END) AS success_5h,
       SUM(CASE WHEN results.ts >= ? THEN 1 ELSE 0 END) AS total_24h,
       SUM(CASE WHEN results.ts >= ? THEN results.success ELSE 0 END) AS success_24h,
       SUM(CASE WHEN results.ts >= ? THEN 1 ELSE 0 END) AS total_7d,
       SUM(CASE WHEN results.ts >= ? THEN results.success ELSE 0 END) AS success_7d,
       SUM(CASE WHEN results.ts >= ? THEN 1 ELSE 0 END) AS total_30d,
       SUM(CASE WHEN results.ts >= ? THEN results.success ELSE 0 END) AS success_30d
     FROM results
     JOIN checks ON checks.id = results.check_id AND checks.provider = results.source
     WHERE results.ts >= ?
     GROUP BY results.check_id, results.region_id`,
		)
		.all(starts['5h'], starts['5h'], starts['24h'], starts['24h'], starts['7d'], starts['7d'], starts['30d'], starts['30d'], oldest);

	const statsByCheck = new Map<string, Record<WindowKey, AvailabilityStats>>();
	const statsByCheckRegion = new Map<string, Record<string, Record<WindowKey, AvailabilityStats>>>();
	for (const row of rows) {
		if (!statsByCheck.has(row.check_id)) statsByCheck.set(row.check_id, emptyStats());
		addStats(statsByCheck.get(row.check_id)!, row);
		if (!statsByCheckRegion.has(row.check_id)) statsByCheckRegion.set(row.check_id, {});
		statsByCheckRegion.get(row.check_id)![row.region_id] = statsFromRow(row);
	}

	const lastRows = services.db
		.query<LastRow, number[]>(
			`SELECT r.check_id, r.region_id, r.ts, r.success, r.latency_ms
			 FROM results r
			 JOIN checks c ON c.id = r.check_id AND c.provider = r.source
			 JOIN (
			   SELECT r.check_id, r.region_id, MAX(r.ts) AS ts
			   FROM results r
			   JOIN checks c ON c.id = r.check_id AND c.provider = r.source
			   WHERE r.ts >= ?
			   GROUP BY r.check_id, r.region_id
			 ) latest ON latest.check_id = r.check_id AND latest.region_id = r.region_id AND latest.ts = r.ts
			 WHERE r.ts >= ?`,
		)
		.all(oldest, oldest);
	const lastByCheck = new Map<string, LastRow>();
	const lastByCheckRegion = new Map<string, Record<string, LastRow>>();
	for (const row of lastRows) {
		if (!lastByCheckRegion.has(row.check_id)) lastByCheckRegion.set(row.check_id, {});
		lastByCheckRegion.get(row.check_id)![row.region_id] = row;
		const current = lastByCheck.get(row.check_id);
		if (!current || row.ts > current.ts) lastByCheck.set(row.check_id, row);
	}

	const out = [];
	for (const check of checks) {
		const last = lastByCheck.get(check.id);
		out.push({
			id: check.id,
			type: check.type,
			target: check.target,
			model: check.model,
			enabled: check.enabled === 1,
			provider: check.provider,
			last_checked_at: last?.ts ?? null,
			last_status: last ? (last.success === 1 ? 'success' : 'failure') : null,
			stats: finalizeStats(statsByCheck.get(check.id) ?? emptyStats()),
			stats_by_region: statsByCheckRegion.get(check.id) ?? {},
			last_by_region: lastByCheckRegion.get(check.id) ?? {},
		});
	}

	return { generated_at: nowMs, checks: out };
}
