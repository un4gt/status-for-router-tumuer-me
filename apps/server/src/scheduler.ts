import { acquireIntervalLock, forceSetLastRunAt, type Services } from './db';
import { runAllChecks } from './checkRunner';

export class RunBusyError extends Error {
	constructor() {
		super('A check run is already in progress');
	}
}

export function createScheduler(services: Services, execute: typeof runAllChecks = runAllChecks, now = Date.now) {
	let active: ReturnType<typeof runAllChecks> | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;
	let stopped = false;

	function run(triggeredBy: 'scheduled' | 'manual') {
		if (active || stopped) {
			if (triggeredBy === 'manual') throw new RunBusyError();
			return null;
		}
		const timestamp = now();
		if (triggeredBy === 'scheduled' && !acquireIntervalLock(services, timestamp, services.config.checkIntervalSeconds * 1000)) return null;
		if (triggeredBy === 'manual') forceSetLastRunAt(services, timestamp);
		// Install the lock before any asynchronous work starts.
		active = Promise.resolve()
			.then(() => execute(services, { triggeredBy }))
			.finally(() => {
				active = null;
			});
		return active;
	}

	function tick() {
		try {
			const pending = run('scheduled');
			void pending?.catch(() => console.error('Scheduled check run failed; retrying on the next due interval'));
		} catch {
			console.error('Unable to schedule checks');
		}
	}

	return {
		run,
		start() {
			if (timer || stopped) return;
			tick();
			timer = setInterval(tick, 60_000);
		},
		async stop() {
			stopped = true;
			clearInterval(timer);
			await active?.catch(() => undefined);
		},
	};
}

export type Scheduler = ReturnType<typeof createScheduler>;
