import { acquireScheduledSlot, forceSetLastRunAt, type Services } from './db';
import { runAllChecks } from './checkRunner';

export class RunBusyError extends Error {
	constructor() {
		super('A check run is already in progress');
	}
}

export function createScheduler(services: Services, execute: typeof runAllChecks = runAllChecks, now = Date.now) {
	let active: ReturnType<typeof runAllChecks> | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	const intervalMs = services.config.checkIntervalSeconds * 1000;

	function run(triggeredBy: 'scheduled' | 'manual') {
		if (active || stopped) {
			if (triggeredBy === 'manual') throw new RunBusyError();
			return null;
		}
		const timestamp = now();
		if (triggeredBy === 'scheduled' && !acquireScheduledSlot(services, timestamp, intervalMs)) return null;
		if (triggeredBy === 'manual') forceSetLastRunAt(services, timestamp);
		console.info(`Check run started (${triggeredBy}) at ${new Date(timestamp).toISOString()}`);
		// Install the lock before any asynchronous work starts.
		active = Promise.resolve()
			.then(() => execute(services, { triggeredBy }))
			.then((result) => {
				console.info(`Check run completed (${triggeredBy}) in ${now() - timestamp}ms`);
				return result;
			})
			.finally(() => {
				active = null;
			});
		return active;
	}

	function tick() {
		if (stopped) return;
		try {
			const pending = run('scheduled');
			void pending?.catch(() => console.error('Scheduled check run failed; retrying on the next due interval'));
		} catch {
			console.error('Unable to schedule checks');
		}
		// Recalculate against the clock so startup time and timer delays do not shift later runs.
		timer = setTimeout(tick, Math.min(intervalMs - (now() % intervalMs), 2_147_483_647));
	}

	return {
		run,
		start() {
			if (timer !== undefined || stopped) return;
			tick();
		},
		async stop() {
			stopped = true;
			clearTimeout(timer);
			await active?.catch(() => undefined);
		},
	};
}

export type Scheduler = ReturnType<typeof createScheduler>;
