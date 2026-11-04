import { getMeta, setMeta, type Services } from './db';
import { runAllChecks } from './checkRunner';
import { collectGlobalping, type ProviderResult } from './providers/globalping';
import { collectCloudProbe } from './providers/cloudProbe';
import { collectMock } from './providers/mock';

export type CollectionResult = {
	ok: boolean;
	ts: number;
	triggeredBy: 'scheduled' | 'manual';
	sources: Record<string, Pick<ProviderResult, 'ok' | 'error' | 'inserted'>>;
};

function isDue(services: Services, source: string, intervalSeconds: number, now: number, force: boolean): boolean {
	if (force) return true;
	const backoff = Number(getMeta(services, `source:${source}:backoff_until`));
	if (Number.isFinite(backoff) && backoff > now) return false;
	const last = Number(getMeta(services, `source:${source}:last_run_at`));
	if (!Number.isFinite(last) || last <= 0) return true;
	// Match the scheduler's clock boundaries; millisecond timer jitter must
	// not skip an entire interval when the next tick arrives slightly earlier.
	const intervalMs = intervalSeconds * 1000;
	return Math.floor(now / intervalMs) > Math.floor(last / intervalMs);
}

function recordSource(services: Services, source: string, result: ProviderResult, now: number) {
	setMeta(services, `source:${source}:last_attempt_at`, String(now));
	setMeta(services, `source:${source}:last_inserted`, String(result.inserted));
	if (result.ok) {
		setMeta(services, `source:${source}:last_run_at`, String(now));
		setMeta(services, `source:${source}:last_success_at`, String(now));
		setMeta(services, `source:${source}:last_error`, '');
		setMeta(services, `source:${source}:backoff_until`, '0');
	} else {
		// Leave last_run_at untouched so a failed source retries on the next tick.
		setMeta(services, `source:${source}:last_error`, result.error ?? 'Unknown source error');
		setMeta(services, `source:${source}:last_error_at`, String(now));
		if (result.error && /429|rate limit/i.test(result.error)) {
			// Do not hammer a rate-limited API; retry after 15 minutes or two intervals.
			const backoffMs = Math.max(
				15 * 60 * 1000,
				(source === 'cloudprobe' ? services.config.cloudProbe.intervalSeconds : services.config.globalping.intervalSeconds) * 2000,
			);
			setMeta(services, `source:${source}:backoff_until`, String(now + backoffMs));
		}
	}
	if (result.warnings.length > 0) {
		setMeta(services, `source:${source}:last_warning`, result.warnings.slice(0, 10).join('; ').slice(0, 2000));
	} else {
		setMeta(services, `source:${source}:last_warning`, '');
	}
}

function summarize(result: ProviderResult) {
	return { ok: result.ok, error: result.error, inserted: result.inserted };
}

export async function runCollection(
	services: Services,
	opts: { triggeredBy: 'scheduled' | 'manual'; fetch?: typeof fetch; now?: () => number } = { triggeredBy: 'manual' },
): Promise<CollectionResult> {
	const now = opts.now?.() ?? Date.now();
	const triggeredBy = opts.triggeredBy;
	const force = triggeredBy === 'manual';
	const mode = services.config.monitoringMode;

	if (mode === 'mock') {
		const result = await collectMock(services, { now: () => now });
		recordSource(services, 'mock', result, now);
		return { ok: true, ts: now, triggeredBy, sources: { mock: summarize(result) } };
	}

	if (mode === 'direct') {
		await runAllChecks(services, { triggeredBy });
		const result: ProviderResult = { ok: true, error: null, inserted: 0, warnings: [], details: {} };
		recordSource(services, 'direct', result, now);
		return { ok: true, ts: now, triggeredBy, sources: { direct: summarize(result) } };
	}

	const sources: Record<string, Pick<ProviderResult, 'ok' | 'error' | 'inserted'>> = {};
	const jobs: Array<Promise<void>> = [];

	if (isDue(services, 'globalping', services.config.globalping.intervalSeconds, now, force)) {
		jobs.push(
			collectGlobalping(services, { fetch: opts.fetch })
				.then((result) => {
					recordSource(services, 'globalping', result, now);
					sources.globalping = summarize(result);
				})
				.catch((error) => {
					const result: ProviderResult = {
						ok: false,
						error: error instanceof Error ? error.message : String(error),
						inserted: 0,
						warnings: [],
						details: {},
					};
					recordSource(services, 'globalping', result, now);
					sources.globalping = summarize(result);
				}),
		);
	}

	if (isDue(services, 'cloudprobe', services.config.cloudProbe.intervalSeconds, now, force)) {
		jobs.push(
			collectCloudProbe(services, { fetch: opts.fetch })
				.then((result) => {
					recordSource(services, 'cloudprobe', result, now);
					sources.cloudprobe = summarize(result);
				})
				.catch((error) => {
					const result: ProviderResult = {
						ok: false,
						error: error instanceof Error ? error.message : String(error),
						inserted: 0,
						warnings: [],
						details: {},
					};
					recordSource(services, 'cloudprobe', result, now);
					sources.cloudprobe = summarize(result);
				}),
		);
	}

	await Promise.all(jobs);
	return {
		ok: Object.values(sources).every((source) => source.ok),
		ts: now,
		triggeredBy,
		sources,
	};
}
