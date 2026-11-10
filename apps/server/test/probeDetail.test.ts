import { expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { insertResult, saveSelection } from '../src/db';
import { getProbeDetail } from '../src/probeDetail';
import { createScheduler } from '../src/scheduler';
import { getOverview } from '../src/overview';
import { fixture } from './helpers';

const NOW = Date.UTC(2026, 10, 4, 10);

test('detail percentiles use raw successful samples, isolate provider/region and leave gaps', () => {
	const services = fixture({ monitoringMode: 'live' });
	saveSelection(services, [{ model: 'embed', type: 'model' }]);
	const base = {
		check_id: 'model:embed',
		ts: NOW - 60_000,
		success: 1 as const,
		status_code: 200,
		region_id: 'tokyo',
		source: 'cloudprobe',
	};
	for (let i = 1; i <= 100; i++) insertResult(services, { ...base, ts: base.ts - i, latency_ms: i });
	insertResult(services, { ...base, success: 0, latency_ms: 10_000, error: 'private upstream secret', status_code: null });
	insertResult(services, { ...base, latency_ms: 800_000, source: 'direct' });
	insertResult(services, { ...base, latency_ms: 900_000, region_id: 'beijing' });
	insertResult(services, { ...base, latency_ms: 900_000, ts: NOW + 1 });
	insertResult(services, { ...base, latency_ms: 900_000, ts: NOW - 6 * 3600_000 });
	services.db.exec('PRAGMA query_only=ON');
	const detail = getProbeDetail(services, base.check_id, 'tokyo', '5h', NOW);
	expect(detail).toMatchObject({ p95_ms: 95, p99_ms: 99, sample_count: 100, total_count: 101, success_count: 100 });
	expect(detail.series.filter((point) => point.sample_count)).toEqual([{ ts: NOW - 300_000, p95_ms: 95, p99_ms: 99, sample_count: 100 }]);
	expect(detail.series.some((point) => point.p95_ms === null)).toBe(true);
	expect(detail.history).toHaveLength(24);
	expect(detail.history[0].success).toBe(0);
	expect(JSON.stringify(detail)).not.toContain('private upstream secret');
	expect(Object.keys(detail.history[0]).sort()).toEqual(['latency_ms', 'status_code', 'success', 'ts']);
});

test('detail has null percentiles for failures, null durations and empty regions', () => {
	const services = fixture({ monitoringMode: 'live' });
	for (const success of [0, 1] as const)
		insertResult(services, {
			check_id: 'net:health',
			region_id: 'tokyo',
			ts: NOW - success,
			success,
			latency_ms: null,
			status_code: success ? 200 : null,
			source: 'globalping',
		});
	expect(getProbeDetail(services, 'net:health', 'tokyo', '5h', NOW)).toMatchObject({
		total_count: 2,
		availability: 0.5,
		p95_ms: null,
		p99_ms: null,
		sample_count: 0,
	});
	expect(getProbeDetail(services, 'net:health', 'beijing', '5h', NOW)).toMatchObject({ total_count: 0, availability: null, history: [] });
});

test('public detail validates queries and remains read only', async () => {
	const services = fixture();
	const app = createApp(services, createScheduler(services));
	services.db.exec('PRAGMA query_only=ON');
	const query = '/api/public/probe-detail?check_id=net:health&region=tokyo';
	expect((await app.request(query)).status).toBe(200);
	for (const suffix of ['&window=bad', '&region=all', '&region=unknown', '&check_id=missing']) {
		const url = new URL(query, 'http://localhost');
		for (const [key, value] of new URLSearchParams(suffix)) url.searchParams.set(key, value);
		expect((await app.request(url.pathname + url.search)).status).toBe(400);
	}
	expect((await app.request('/api/public/probe-detail?check_id=net:health')).status).toBe(400);
});

test('overview exposes only safe topology metadata and keeps unknown regions unmapped', () => {
	const services = fixture({
		regions: [
			{ id: 'custom', label: 'Custom', code: 'CUS', globalping: 'private', probeUrl: 'https://secret.example/' },
			{ id: 'elsewhere', label: 'Elsewhere', code: 'ELS', globalping: 'private', probeUrl: null, lat: -33, lng: 151 },
		],
	});
	const overview = getOverview(services, '5h', NOW);
	expect(overview.topology.target).toMatchObject({ lat: 37.3382, lng: -121.8863 });
	expect(overview.regions[0].coordinates).toBeNull();
	expect(overview.regions[1].coordinates).toEqual({ lat: -33, lng: 151 });
	expect(JSON.stringify(overview)).not.toContain('secret.example');
});
