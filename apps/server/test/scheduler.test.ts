import { describe, expect, test } from 'bun:test';
import { createScheduler, RunBusyError } from '../src/scheduler';
import { fixture } from './helpers';

describe('scheduler', () => {
	test('shares a lock across manual/scheduled runs and preserves the interval across restarts', async () => {
		const services = fixture({ checkIntervalSeconds: 60 });
		let clock = 1_000_000;
		let release!: () => void;
		let runs = 0;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const execute = async () => {
			runs++;
			await gate;
			return { ok: true, ts: clock, triggeredBy: 'scheduled' as const };
		};
		const scheduler = createScheduler(services, execute, () => clock);
		const first = scheduler.run('scheduled');
		expect(first).not.toBeNull();
		expect(scheduler.run('scheduled')).toBeNull();
		expect(() => scheduler.run('manual')).toThrow(RunBusyError);
		release();
		await first;
		expect(runs).toBe(1);
		const restarted = createScheduler(services, execute, () => clock);
		expect(restarted.run('scheduled')).toBeNull();
		clock += 60_000;
		await restarted.run('scheduled');
		expect(runs).toBe(2);
		clock += 1_000;
		await restarted.run('manual');
		clock += 59_999;
		expect(restarted.run('scheduled')).toBeNull();
		clock++;
		await restarted.run('scheduled');
		expect(runs).toBe(4);
		await restarted.stop();
		expect(restarted.run('scheduled')).toBeNull();
	});
	test('releases the lock after failures and waits for an active run on shutdown', async () => {
		const services = fixture();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let runs = 0;
		const scheduler = createScheduler(services, async () => {
			if (++runs === 1) throw new Error('simulated failure');
			await gate;
			return { ok: true, ts: Date.now(), triggeredBy: 'manual' };
		});
		await expect(scheduler.run('manual')!).rejects.toThrow('simulated failure');
		const running = scheduler.run('manual');
		let stopped = false;
		const stopping = scheduler.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release();
		await Promise.all([running, stopping]);
		expect(stopped).toBe(true);
	});
});
