import { describe, expect, test } from 'bun:test';
import {
	deleteCheck,
	getCheckById,
	getMeta,
	saveSelection,
	setMeta,
	updateCheckSettings,
} from '../src/db';
import {
	computeSchedulerTickSeconds,
	dueModelChecks,
	effectiveIntervalSeconds,
	isCheckDue,
	markCheckAttempt,
	markCheckRun,
} from '../src/intervals';
import { fixture } from './helpers';

const NOW = Date.parse('2026-11-04T00:00:00.000Z');

describe('check intervals', () => {
	test('inherits the layer default and honors a per-check override', () => {
		const services = fixture({ schedulerTickSeconds: 300, checkIntervalSeconds: 300 });
		saveSelection(services, [{ model: 'embed', type: 'model' }]);
		const check = getCheckById(services, 'model:embed')!;
		const head = getCheckById(services, 'net:root')!;

		expect(effectiveIntervalSeconds(services, check)).toBe(30);
		expect(effectiveIntervalSeconds(services, head)).toBe(300);

		updateCheckSettings(services, 'model:embed', { interval_seconds: 900 });
		expect(effectiveIntervalSeconds(services, getCheckById(services, 'model:embed')!)).toBe(900);
		// The network layer is deliberately not affected by the per-check column.
		services.db.query('UPDATE checks SET interval_seconds=30 WHERE id=?').run('net:root');
		expect(effectiveIntervalSeconds(services, getCheckById(services, 'net:root')!)).toBe(300);
	});

	test('uses clock-aligned due buckets and lets manual runs bypass the schedule', () => {
		const services = fixture({ schedulerTickSeconds: 300, checkIntervalSeconds: 300 });
		saveSelection(services, [{ model: 'embed', type: 'model' }]);
		let check = getCheckById(services, 'model:embed')!;

		expect(isCheckDue(services, check, NOW)).toBe(true);
		markCheckRun(services, check.id, NOW + 4);
		expect(getMeta(services, `check:${check.id}:last_attempt_at`)).toBe(String(NOW + 4));
		expect(isCheckDue(services, check, NOW + 29_999)).toBe(false);
		expect(isCheckDue(services, check, NOW + 30_000)).toBe(true);
		expect(isCheckDue(services, check, NOW + 1, true)).toBe(true);

		updateCheckSettings(services, check.id, { interval_seconds: 300 });
		check = getCheckById(services, 'model:embed')!;
		expect(isCheckDue(services, check, NOW + 30_001)).toBe(false);
		expect(isCheckDue(services, check, NOW + 300_000)).toBe(true);
	});

	test('returns only enabled, due model checks', () => {
		const services = fixture({ schedulerTickSeconds: 300, checkIntervalSeconds: 300 });
		saveSelection(services, [
			{ model: 'due', type: 'model' },
			{ model: 'not-due', type: 'model' },
			{ model: 'disabled', type: 'model' },
		]);
		const now = NOW + 15_000;
		markCheckRun(services, 'model:not-due', now - 5_000);
		updateCheckSettings(services, 'model:disabled', { enabled: false });

		expect(dueModelChecks(services, now).map((check) => check.id)).toEqual(['model:due']);
		expect(dueModelChecks(services, now, true).map((check) => check.id)).toEqual(['model:due', 'model:not-due']);

		setMeta(services, 'check:model:due:last_run_at', String(NOW));
		markCheckAttempt(services, 'model:due', NOW + 1000);
		expect(getMeta(services, 'check:model:due:last_attempt_at')).toBe(String(NOW + 1000));
		expect(getMeta(services, 'check:model:due:last_run_at')).toBe(String(NOW));
	});

	test('scheduler tick follows the smallest enabled check interval', () => {
		const services = fixture({ schedulerTickSeconds: 300, checkIntervalSeconds: 300 });
		// Only the three network checks are enabled, so the configured ceiling wins.
		expect(computeSchedulerTickSeconds(services)).toBe(300);

		saveSelection(services, [{ model: 'embed', type: 'model' }]);
		expect(computeSchedulerTickSeconds(services)).toBe(30);

		updateCheckSettings(services, 'model:embed', { interval_seconds: 60 });
		expect(computeSchedulerTickSeconds(services)).toBe(60);

		updateCheckSettings(services, 'model:embed', { interval_seconds: 600 });
		expect(computeSchedulerTickSeconds(services)).toBe(300);

		updateCheckSettings(services, 'model:embed', { enabled: false });
		expect(computeSchedulerTickSeconds(services)).toBe(300);
	});

	test('deleting a check clears its scheduling state', () => {
		const services = fixture();
		saveSelection(services, [{ model: 'embed', type: 'model' }]);
		markCheckRun(services, 'model:embed', NOW);
		expect(getMeta(services, 'check:model:embed:last_run_at')).toBe(String(NOW));
		deleteCheck(services, 'model:embed');
		expect(getMeta(services, 'check:model:embed:last_run_at')).toBeNull();
		expect(getMeta(services, 'check:model:embed:last_attempt_at')).toBeNull();
	});
});
