import { expect, test } from 'bun:test';
import type { OverviewResponse, RegionStats } from '../src/api';
import { animationDuration, angularDistance, buildGlobeData, signalFor, worst } from '../src/components/globe/globeData';

const now = 1_000_000;
const stats = {
	status: 'operational',
	total_count: 10,
	last_checked_at: now,
	last_status: 'success',
	last_latency_ms: 1500,
} as RegionStats;

test('network and model thresholds are independent; failures and stale data dominate latency', () => {
	expect(signalFor(stats, 'network', 300_000, now).status).toBe('degraded');
	expect(signalFor(stats, 'model', 30_000, now).status).toBe('operational');
	expect(signalFor({ ...stats, last_status: 'failure', last_latency_ms: 2 }, 'model', 30_000, now).status).toBe('outage');
	expect(signalFor(stats, 'model', 30_000, now + 120_001)).toMatchObject({ status: 'unknown', latency: null, stale: true });
	expect(signalFor(stats, 'network', 300_000, now + 120_001).status).toBe('degraded');
	expect(signalFor(undefined, 'model', 30_000, now).status).toBe('unknown');
	expect(worst([signalFor(undefined, 'model', 30_000, now), signalFor(stats, 'model', 30_000, now)])).toBe('unknown');
});

test('higher latency slows flight on a shared bounded scale; missing data does not animate', () => {
	const durations = [0, 25, 150, 500, 1500, 5000, 30000].map(animationDuration);
	expect(durations).toEqual([...durations].sort((a, b) => a - b));
	expect(animationDuration(null)).toBe(0);
	expect(animationDuration(1e12)).toBeLessThanOrEqual(8500);
});

test('co-located probes have zero distance and the Pacific route crosses the date line correctly', () => {
	const siliconValley = { lat: 37.3382, lng: -121.8863 };
	expect(angularDistance(siliconValley, siliconValley)).toBe(0);
	const tokyoDistance = angularDistance({ lat: 35.6762, lng: 139.6503 }, siliconValley);
	expect(tokyoDistance).toBeGreaterThan(1);
	expect(tokyoDistance).toBeLessThan(2);
});

test('all enabled models and endpoints appear together without sampling or combining latency', () => {
	const models = Array.from({ length: 30 }, (_, i) => ({
		id: `model:${i}`,
		model: `model-${i}`,
		type: 'model',
		enabled: true,
		regions: { tokyo: { ...stats, last_latency_ms: 50 + i, last_status: i === 29 ? 'failure' : 'success' }, siliconvalley: stats },
	}));
	const overview = {
		topology: { target: { lat: 37.3382, lng: -121.8863, label: 'Target' }, intervals: { network: 300_000, model: 30_000 } },
		regions: [
			{ id: 'tokyo', label: 'Tokyo', code: 'TYO', coordinates: { lat: 35.6762, lng: 139.6503 } },
			{ id: 'siliconvalley', label: 'SJC', code: 'SJC', coordinates: { lat: 37.3382, lng: -121.8863 } },
		],
		gateway: { endpoints: [{ id: 'net:health', method: 'GET', path: '/health', regions: { tokyo: stats, siliconvalley: stats } }] },
		models: [...models, { ...models[0], id: 'disabled', enabled: false }],
	} as unknown as OverviewResponse;
	const all = buildGlobeData(overview, 'both', now);
	expect(all.arcs).toHaveLength(31);
	expect(all.arcs.filter((arc) => arc.layer === 'model')).toHaveLength(30);
	expect(new Set(all.arcs.map((arc) => arc.checkId)).size).toBe(31);
	expect(all.arcs.find((arc) => arc.checkId === 'model:29')?.signal).toMatchObject({ status: 'outage', latency: 79 });
	expect(all.nodes[0].status).toBe('outage');
	expect(all.nodes[1].checks).toHaveLength(31); // Same-city samples stay inspectable without false long arcs.
	const modelOnly = buildGlobeData(overview, 'model', now);
	for (const arc of modelOnly.arcs) {
		const original = all.arcs.find((item) => item.checkId === arc.checkId)!;
		expect([arc.altitude, arc.phase]).toEqual([original.altitude, original.phase]);
	}
	expect(new Set(modelOnly.arcs.map((arc) => arc.altitude)).size).toBe(30);
});
