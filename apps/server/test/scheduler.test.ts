import { describe, expect, spyOn, test } from 'bun:test';
import { createScheduler, RunBusyError } from '../src/scheduler';
import { fixture } from './helpers';

describe('scheduler', () => {
	test('aligns five-minute runs to the clock across restarts and manual checks', async () => {
		const services = fixture({ checkIntervalSeconds: 300 });
		let clock = Date.parse('2026-10-03T22:59:04+08:00');
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
		clock = Date.parse('2026-10-03T23:00:00+08:00');
		await restarted.run('scheduled');
		expect(runs).toBe(2);
		clock = Date.parse('2026-10-03T23:04:30+08:00');
		await restarted.run('manual');
		clock = Date.parse('2026-10-03T23:04:59.999+08:00');
		expect(restarted.run('scheduled')).toBeNull();
		clock++;
		await restarted.run('scheduled');
		expect(runs).toBe(4);
		await restarted.stop();
		expect(restarted.run('scheduled')).toBeNull();
	});
	test('sets timers for exact boundaries and corrects timer drift', async () => {
		const services = fixture({ checkIntervalSeconds: 300 });
		let clock = Date.parse('2026-10-03T22:59:04+08:00');
		const runs: number[] = [];
		const callbacks: Array<() => void> = [];
		const delays: number[] = [];
		const schedule = ((callback: () => void, delay?: number) => {
			callbacks.push(callback);
			delays.push(delay ?? 0);
			return callbacks.length as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout;
		const timeout = spyOn(globalThis, 'setTimeout').mockImplementation(schedule);
		const clear = spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);
		const scheduler = createScheduler(
			services,
			async (_, options) => {
				runs.push(clock);
				return { ok: true, ts: clock, triggeredBy: options?.triggeredBy ?? 'scheduled' };
			},
			() => clock,
		);
		try {
			scheduler.start();
			scheduler.start();
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(delays).toEqual([56_000]);
			clock = Date.parse('2026-10-03T23:00:00+08:00');
			callbacks[0]();
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(delays.at(-1)).toBe(300_000);
			clock = Date.parse('2026-10-03T23:05:00.025+08:00');
			callbacks[1]();
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(delays.at(-1)).toBe(299_975);
			expect(runs.map((ts) => new Date(ts).toISOString())).toEqual([
				'2026-10-03T14:59:04.000Z',
				'2026-10-03T15:00:00.000Z',
				'2026-10-03T15:05:00.025Z',
			]);
			await scheduler.stop();
			callbacks[2]();
			expect(runs).toHaveLength(3);
			expect(delays).toHaveLength(3);
		} finally {
			await scheduler.stop();
			timeout.mockRestore();
			clear.mockRestore();
		}
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
