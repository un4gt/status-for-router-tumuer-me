import { getCheckById, type Services } from './db';
import { getBucketMs, getFromTs, type TimeseriesWindow } from './timeseries';

type Percentiles = { ts: number; sample_count: number; p95_ms: number | null; p99_ms: number | null };
type History = { ts: number; success: number; status_code: number | null; latency_ms: number | null };

export function getProbeDetail(services: Services, checkId: string, regionId: string, window: TimeseriesWindow, now = Date.now()) {
	const check = getCheckById(services, checkId)!;
	const from = getFromTs(window, now);
	const bucketMs = getBucketMs(window);
	const params = [checkId, regionId, check.provider, from, now];
	const where = 'check_id = ? AND region_id = ? AND source = ? AND ts >= ? AND ts <= ?';
	// Successful responses only; errors/timeouts stay in availability and history.
	const percentiles = services.db
		.query<Percentiles, (string | number)[]>(
			`
		WITH samples AS (
			SELECT CAST(ts / ? AS INTEGER) * ? AS ts, latency_ms FROM results
			WHERE ${where} AND success = 1 AND latency_ms >= 0
		), populations AS (
			SELECT ts, latency_ms FROM samples UNION ALL SELECT -1, latency_ms FROM samples
		), ranked AS (
			SELECT ts, latency_ms, ROW_NUMBER() OVER (PARTITION BY ts ORDER BY latency_ms) AS rank,
			COUNT(*) OVER (PARTITION BY ts) AS n FROM populations
		)
		SELECT ts, MAX(n) AS sample_count,
		MIN(CASE WHEN rank * 100 >= n * 95 THEN latency_ms END) AS p95_ms,
		MIN(CASE WHEN rank * 100 >= n * 99 THEN latency_ms END) AS p99_ms
		FROM ranked GROUP BY ts ORDER BY ts
	`,
		)
		.all(bucketMs, bucketMs, ...params);
	const stats = services.db
		.query<{ total_count: number; success_count: number }, (string | number)[]>(
			`
		SELECT COUNT(*) AS total_count, COALESCE(SUM(success), 0) AS success_count FROM results WHERE ${where}
	`,
		)
		.get(...params)!;
	const history = services.db
		.query<History, (string | number)[]>(
			`
		SELECT ts, success, status_code, latency_ms FROM results WHERE ${where} ORDER BY ts DESC, id DESC LIMIT 24
	`,
		)
		.all(...params);
	const aggregate = percentiles.find((point) => point.ts === -1);
	const buckets = new Map(percentiles.filter((point) => point.ts !== -1).map((point) => [point.ts, point]));
	const series: Percentiles[] = [];
	for (let ts = Math.floor(from / bucketMs) * bucketMs; ts <= now; ts += bucketMs) {
		series.push(buckets.get(ts) ?? { ts, sample_count: 0, p95_ms: null, p99_ms: null });
	}
	return {
		check_id: checkId,
		region: regionId,
		source: check.provider,
		window,
		from,
		to: now,
		bucket_ms: bucketMs,
		...stats,
		availability: stats.total_count ? stats.success_count / stats.total_count : null,
		sample_count: aggregate?.sample_count ?? 0,
		p95_ms: aggregate?.p95_ms ?? null,
		p99_ms: aggregate?.p99_ms ?? null,
		series,
		history,
	};
}
