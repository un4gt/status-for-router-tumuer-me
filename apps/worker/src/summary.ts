import type { Env } from './env';
import { getLastResultForCheck, listChecks } from './db';

export type WindowKey = '5h' | '24h' | '7d' | '30d';

const WINDOWS: Record<WindowKey, number> = {
	'5h': 5 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
};

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

export async function getSummary(env: Env) {
	const { nowMs, starts } = getWindowStarts();

	const checks = await listChecks(env);
	const checkIds = checks.map((c) => c.id);
	if (checkIds.length === 0) {
		return { generated_at: nowMs, checks: [] as any[] };
	}

	const oldest = starts['30d'];
	const statsRes = await env.DB.prepare(
		`SELECT
       check_id,
       SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS total_5h,
       SUM(CASE WHEN ts >= ? THEN success ELSE 0 END) AS success_5h,
       SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS total_24h,
       SUM(CASE WHEN ts >= ? THEN success ELSE 0 END) AS success_24h,
       SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS total_7d,
       SUM(CASE WHEN ts >= ? THEN success ELSE 0 END) AS success_7d,
       SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS total_30d,
       SUM(CASE WHEN ts >= ? THEN success ELSE 0 END) AS success_30d
     FROM results
     WHERE ts >= ?
     GROUP BY check_id`,
	)
		.bind(
			starts['5h'],
			starts['5h'],
			starts['24h'],
			starts['24h'],
			starts['7d'],
			starts['7d'],
			starts['30d'],
			starts['30d'],
			oldest,
		)
		.all<{
			check_id: string;
			total_5h: number;
			success_5h: number;
			total_24h: number;
			success_24h: number;
			total_7d: number;
			success_7d: number;
			total_30d: number;
			success_30d: number;
		}>();

	const statsById = new Map<string, any>();
	for (const row of statsRes.results ?? []) statsById.set(row.check_id, row);

	const out = [];
	for (const check of checks) {
		const stats = statsById.get(check.id) ?? {
			total_5h: 0,
			success_5h: 0,
			total_24h: 0,
			success_24h: 0,
			total_7d: 0,
			success_7d: 0,
			total_30d: 0,
			success_30d: 0,
		};

		const last = await getLastResultForCheck(env, check.id);

		const windowStats = {
			'5h': {
				success_count: Number(stats.success_5h ?? 0),
				total_count: Number(stats.total_5h ?? 0),
			},
			'24h': {
				success_count: Number(stats.success_24h ?? 0),
				total_count: Number(stats.total_24h ?? 0),
			},
			'7d': {
				success_count: Number(stats.success_7d ?? 0),
				total_count: Number(stats.total_7d ?? 0),
			},
			'30d': {
				success_count: Number(stats.success_30d ?? 0),
				total_count: Number(stats.total_30d ?? 0),
			},
		} satisfies Record<WindowKey, { success_count: number; total_count: number }>;

		for (const k of Object.keys(windowStats) as WindowKey[]) {
			const s = windowStats[k];
			(windowStats[k] as any).availability = s.total_count > 0 ? s.success_count / s.total_count : null;
		}

		out.push({
			id: check.id,
			type: check.type,
			target: check.target,
			model: check.model,
			enabled: check.enabled === 1,
			last_checked_at: last?.ts ?? null,
			last_status: last ? (last.success === 1 ? 'success' : 'failure') : null,
			stats: windowStats,
		});
	}

	return { generated_at: nowMs, checks: out };
}

