import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, parseIntervalSeconds, PROJECT_ROOT } from '../src/config';
import { deleteCheck, getCheckById, initializeChecks, insertResult, listChecks, openDatabase, saveSelection } from '../src/db';
import { getSummary } from '../src/summary';
import { getBucketMs, getTimeseries } from '../src/timeseries';
import { fixture, temporaryDirectory } from './helpers';

describe('configuration and SQLite', () => {
	test('requires configured credentials and preserves supported interval formats', () => {
		expect(() => loadConfig({})).toThrow('ADMIN_USERNAME');
		expect(() => loadConfig({ ADMIN_USERNAME: 'operator' })).toThrow('ADMIN_PASSWORD');
		expect(() => loadConfig({ ADMIN_USERNAME: 'operator', ADMIN_PASSWORD: 'password' })).toThrow('SESSION_SECRET');
		for (const value of ['3600', '3600s', '60m', '1h', '60*60s']) expect(parseIntervalSeconds(value)).toBe(3600);
		for (const value of ['', '0', '-1', 'broken']) expect(parseIntervalSeconds(value)).toBeNull();
	});
	test('initializes only HEAD, persists selections and history, and reopens without reseeding', () => {
		const path = join(temporaryDirectory(), 'status.sqlite');
		const services = fixture({ databasePath: path });
		expect(listChecks(services).map((check) => check.id)).toEqual(['head:router']);
		saveSelection(services, [{ model: 'custom', type: 'rerank' }]);
		insertResult(services, { check_id: 'rerank:custom', ts: 123, success: 1 });
		saveSelection(services, []);
		services.db.close();
		services.db = openDatabase(path);
		initializeChecks(services);
		expect(getCheckById(services, 'rerank:custom')?.enabled).toBe(0);
		expect(services.db.query('SELECT * FROM results').all()).toHaveLength(1);
		expect(services.db.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
		expect(services.db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
		expect(services.db.query('PRAGMA user_version').get()).toEqual({ user_version: 1 });
	});
	test('selection is atomic, repeatable, preserves history, and leaves HEAD enabled', () => {
		const services = fixture();
		saveSelection(services, [{ model: 'first', type: 'model' }]);
		insertResult(services, { check_id: 'model:first', ts: 1, success: 1 });
		services.db.exec(
			"CREATE TRIGGER reject_model BEFORE INSERT ON checks WHEN NEW.model='bad' BEGIN SELECT RAISE(ABORT, 'rejected'); END;",
		);
		expect(() =>
			saveSelection(services, [
				{ model: 'second', type: 'rerank' },
				{ model: 'bad', type: 'model' },
			]),
		).toThrow();
		expect(getCheckById(services, 'model:first')?.enabled).toBe(1);
		expect(getCheckById(services, 'rerank:second')).toBeNull();
		for (let i = 0; i < 2; i++) saveSelection(services, [{ model: 'second', type: 'rerank' }]);
		expect(listChecks(services)).toHaveLength(3);
		expect(getCheckById(services, 'model:first')?.enabled).toBe(0);
		expect(getCheckById(services, 'head:router')?.enabled).toBe(1);
		expect(services.db.query('SELECT * FROM results').all()).toHaveLength(1);
		deleteCheck(services, 'model:first');
		insertResult(services, { check_id: 'model:first', ts: 2, success: 1 });
		expect(services.db.query('SELECT * FROM results').all()).toHaveLength(0);
	});
	test('preserves four availability windows, empty statistics, and time buckets', () => {
		const services = fixture();
		const now = Date.UTC(2026, 8, 1);
		const hour = 3600_000;
		for (const [hoursAgo, success, latency] of [
			[1, 1, 100],
			[12, 0, 300],
			[72, 1, 200],
			[240, 1, 500],
			[960, 0, 900],
		]) {
			insertResult(services, { check_id: 'head:router', ts: now - hoursAgo * hour, success, latency_ms: latency });
		}
		saveSelection(services, [{ model: 'empty', type: 'model' }]);
		const summary = getSummary(services, now);
		const head = summary.checks.find((check) => check.id === 'head:router')!;
		for (const [window, total, successes] of [
			['5h', 1, 1],
			['24h', 2, 1],
			['7d', 3, 2],
			['30d', 4, 3],
		] as const) {
			expect(head.stats[window]).toEqual({ total_count: total, success_count: successes, availability: successes / total });
		}
		expect(summary.checks.find((check) => check.id === 'model:empty')!.stats['30d'].availability).toBeNull();
		const series = getTimeseries(services, 'head:router', '24h', now);
		expect(series.series.map((bucket) => [bucket.total_count, bucket.success_count, bucket.avg_latency_ms])).toEqual([
			[1, 0, 300],
			[1, 1, 100],
		]);
		expect(getBucketMs('5h', { minBucketMs: hour })).toBe(hour);
	});
	test('online backup includes committed WAL data and opens independently', () => {
		const directory = temporaryDirectory();
		const source = join(directory, 'live.sqlite');
		const target = join(directory, 'backup.sqlite');
		const services = fixture({ databasePath: source });
		insertResult(services, { check_id: 'head:router', ts: 42, success: 1 });
		const result = Bun.spawnSync([process.execPath, 'apps/server/src/backup.ts', target], {
			cwd: PROJECT_ROOT,
			env: { ...process.env, DATABASE_PATH: source },
		});
		expect(result.exitCode).toBe(0);
		const backup = openDatabase(target);
		try {
			expect(backup.query('SELECT ts FROM results').all()).toEqual([{ ts: 42 }]);
		} finally {
			backup.close();
		}
	});
});
