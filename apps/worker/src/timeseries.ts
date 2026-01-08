import type { Env } from './env';

export type TimeseriesWindow = '5h' | '24h' | '7d' | '30d';

const WINDOW_MS: Record<TimeseriesWindow, number> = {
	'5h': 5 * 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
};

const BUCKET_MS: Record<TimeseriesWindow, number> = {
	'5h': 5 * 60 * 1000,
	'24h': 30 * 60 * 1000,
	'7d': 2 * 60 * 60 * 1000,
	'30d': 6 * 60 * 60 * 1000,
};

export function getBucketMs(window: TimeseriesWindow) {
	return BUCKET_MS[window];
}

export function getFromTs(window: TimeseriesWindow, nowMs = Date.now()) {
	return nowMs - WINDOW_MS[window];
}

export async function getTimeseries(env: Env, checkId: string, window: TimeseriesWindow, nowMs = Date.now()) {
	const bucketMs = getBucketMs(window);
	const from = getFromTs(window, nowMs);
	const to = nowMs;

	const res = await env.DB.prepare(
		`SELECT
       (CAST(ts / ? AS INTEGER) * ?) AS bucket_ts,
       COUNT(*) AS total_count,
       SUM(success) AS success_count,
       AVG(latency_ms) AS avg_latency_ms
     FROM results
     WHERE check_id = ? AND ts >= ? AND ts <= ?
     GROUP BY bucket_ts
     ORDER BY bucket_ts ASC`,
	)
		.bind(bucketMs, bucketMs, checkId, from, to)
		.all<{
			bucket_ts: number;
			total_count: number;
			success_count: number;
			avg_latency_ms: number | null;
		}>();

	const series = (res.results ?? []).map((r) => {
		const total = Number(r.total_count ?? 0);
		const success = Number(r.success_count ?? 0);
		return {
			ts: Number(r.bucket_ts),
			total_count: total,
			success_count: success,
			availability: total > 0 ? success / total : null,
			avg_latency_ms: r.avg_latency_ms === null ? null : Math.round(r.avg_latency_ms),
		};
	});

	return { from, to, window, bucket_ms: bucketMs, series };
}

