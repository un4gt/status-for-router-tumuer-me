import { getMeta, listChecks, setMeta, type CheckRow, type Services } from './db';

export const MIN_CHECK_INTERVAL_SECONDS = 30;
export const MAX_CHECK_INTERVAL_SECONDS = 7 * 24 * 60 * 60;

const MODEL_TYPES = new Set(['model', 'rerank', 'systemone', 'decisions']);

type IntervalCheck = Pick<CheckRow, 'id' | 'type' | 'interval_seconds'>;

export function isModelCheck(check: Pick<CheckRow, 'type'>): boolean {
	return MODEL_TYPES.has(check.type);
}

export function defaultIntervalSeconds({ config }: Services, check: Pick<CheckRow, 'type'>): number {
	return check.type === 'head' ? config.globalping.intervalSeconds : config.cloudProbe.intervalSeconds;
}

export function effectiveIntervalSeconds(services: Services, check: IntervalCheck): number {
	if (check.type === 'head') return services.config.globalping.intervalSeconds;
	const configured = check.interval_seconds;
	return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
		? configured
		: services.config.cloudProbe.intervalSeconds;
}

export function isCheckDue(services: Services, check: IntervalCheck, now: number, force = false): boolean {
	if (force) return true;
	const last = Number(getMeta(services, `check:${check.id}:last_run_at`));
	if (!Number.isFinite(last) || last <= 0) return true;
	// Match the scheduler's clock boundaries: a tick that arrives a few
	// milliseconds early must not skip an entire interval.
	const intervalMs = effectiveIntervalSeconds(services, check) * 1000;
	return Math.floor(now / intervalMs) > Math.floor(last / intervalMs);
}

export function dueModelChecks(services: Services, now: number, force = false): CheckRow[] {
	return listChecks(services).filter(
		(check) =>
			check.enabled === 1 &&
			isModelCheck(check) &&
			Boolean(check.model) &&
			isCheckDue(services, check, now, force),
	);
}

export function markCheckAttempt(services: Services, checkId: string, now: number) {
	setMeta(services, `check:${checkId}:last_attempt_at`, String(now));
}

export function markCheckRun(services: Services, checkId: string, now: number) {
	setMeta(services, `check:${checkId}:last_attempt_at`, String(now));
	setMeta(services, `check:${checkId}:last_run_at`, String(now));
}

export function computeSchedulerTickSeconds(services: Services): number {
	const intervals = listChecks(services)
		.filter((check) => check.enabled === 1)
		.map((check) => effectiveIntervalSeconds(services, check));
	return Math.min(services.config.schedulerTickSeconds, ...intervals);
}
