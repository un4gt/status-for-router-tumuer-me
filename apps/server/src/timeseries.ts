import type { Services } from './db';

type BucketRow = { bucket_ts: number; total_count: number; success_count: number; avg_latency_ms: number | null };

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

export function getBucketMs(window: TimeseriesWindow, opts?: { minBucketMs?: number }) {
	const base = BUCKET_MS[window];
	const min = opts?.minBucketMs ?? 0;
	return min > base ? min : base;
}

export function getFromTs(window: TimeseriesWindow, nowMs = Date.now()) {
	return nowMs - WINDOW_MS[window];
}

export function getTimeseries(
	services: Services,
	checkId: string,
	window: TimeseriesWindow,
	nowMs = Date.now(),
	opts?: { bucketMs?: number },
) {
	const bucketMs = opts?.bucketMs ?? getBucketMs(window);
	const from = getFromTs(window, nowMs);
	const to = nowMs;

	const res = services.db
		.query<BucketRow, (string | number)[]>(
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
		.all(bucketMs, bucketMs, checkId, from, to);

	const series = res.map((r) => {
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
