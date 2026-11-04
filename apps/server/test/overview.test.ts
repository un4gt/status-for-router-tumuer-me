import { describe, expect, test } from 'bun:test';
import { insertResult, saveSelection } from '../src/db';
import { getOverview } from '../src/overview';
import { fixture } from './helpers';

const NOW = Date.parse('2026-11-04T00:00:00.000Z');
const HOUR = 3600_000;

function seedNetwork(services: ReturnType<typeof fixture>, checkId: string, region: string, latencies: number[], successes: number[]) {
	latencies.forEach((latency, index) => {
		insertResult(services, {
			check_id: checkId,
			ts: NOW - (index + 1) * HOUR,
			success: successes[index] as 0 | 1,
			status_code: successes[index] ? 200 : 503,
			latency_ms: latency,
			region_id: region,
			source: 'globalping',
		});
	});
}

describe('overview aggregation', () => {
	test('aggregates unified and per-region model health with p95 and worst-region status', () => {
		const services = fixture({ monitoringMode: 'live' });
		saveSelection(services, [{ model: 'embed', type: 'model' }]);
		const modelId = 'model:embed';
		for (const [region, latencies, successes] of [
			['shanghai', [100, 200, 300], [1, 1, 1]],
			['tokyo', [110, 210, 310], [1, 0, 0]],
			['siliconvalley', [120, 220, 320], [1, 1, 1]],
		] as const) {
			latencies.forEach((latency, index) => {
				insertResult(services, {
					check_id: modelId,
					ts: NOW - (index + 1) * HOUR,
					success: successes[index],
					status_code: 200,
					latency_ms: latency,
					region_id: region,
					source: 'cloudprobe',
				});
			});
		}
		// Old direct-probe data must not leak into the live overview.
		insertResult(services, {
			check_id: modelId,
			ts: NOW - HOUR,
			success: 1,
			status_code: 200,
			latency_ms: 1,
			region_id: 'shanghai',
			source: 'local',
		});

		const overview = getOverview(services, '5h', NOW);
		const model = overview.models.find((item) => item.id === modelId)!;
		expect(model.availability).toBeCloseTo(7 / 9, 6);
		expect(model.regions.shanghai.availability).toBe(1);
		expect(model.regions.tokyo.availability).toBeCloseTo(1 / 3, 6);
		expect(model.regions.tokyo.status).toBe('outage');
		expect(model.status).toBe('outage');
		expect(model.p95_ms).toBe(320);
		expect(model.regions.shanghai.p95_ms).toBe(300);
		expect(model.series.series.length).toBeGreaterThan(0);
	});

	test('separates no-data regions from failures and computes gateway region p95', () => {
		const services = fixture({ monitoringMode: 'live' });
		seedNetwork(services, 'net:root', 'shanghai', [68, 70, 72], [1, 1, 0]);
		seedNetwork(services, 'net:root', 'tokyo', [32, 34, 36], [1, 1, 1]);
		// Beijing intentionally has no samples in this window.
		const overview = getOverview(services, '5h', NOW);
		const shanghai = overview.gateway.regions.find((region) => region.id === 'shanghai')!;
		const tokyo = overview.gateway.regions.find((region) => region.id === 'tokyo')!;
		const beijing = overview.gateway.regions.find((region) => region.id === 'beijing')!;
		expect(shanghai.availability).toBeCloseTo(2 / 3, 6);
		expect(shanghai.status).toBe('outage');
		expect(tokyo.status).toBe('operational');
		expect(tokyo.p95_ms).toBe(36);
		expect(beijing.availability).toBeNull();
		expect(beijing.status).toBe('unknown');
		expect(overview.gateway.availability).toBeCloseTo(5 / 6, 6);
		expect(overview.gateway.status).toBe('outage');
	});

	test('returns an empty but well-shaped overview when no results exist', () => {
		const services = fixture({ monitoringMode: 'live' });
		const overview = getOverview(services, '24h', NOW);
		expect(overview.gateway.status).toBe('unknown');
		expect(overview.gateway.availability).toBeNull();
		expect(overview.gateway.endpoints.map((endpoint) => endpoint.id)).toEqual(['net:health', 'net:models', 'net:root']);
		expect(overview.models).toEqual([]);
		expect(overview.sources.cloudprobe.configured).toBe(false);
	});
});
