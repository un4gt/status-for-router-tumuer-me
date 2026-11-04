import { describe, expect, test } from 'bun:test';
import { collectGlobalping, matchRegion } from '../src/providers/globalping';
import { fixture } from './helpers';
import { DEFAULT_REGIONS } from '../src/config';

const NOW = Date.parse('2026-11-04T00:00:00.000Z');
const results = [
	{ city: 'Shanghai', country: 'CN', statusCode: 200, latency: 68 },
	{ city: 'Beijing', country: 'CN', statusCode: 200, latency: 88 },
	{ city: 'Hong Kong', country: 'HK', statusCode: 200, latency: 45 },
	{ city: 'Tokyo', country: 'JP', statusCode: 200, latency: 32 },
	{ city: 'San Jose', country: 'US', statusCode: 200, latency: 21 },
];

function makeFetch(options: { regions?: number; statusForModels?: number; createStatus?: number } = {}) {
	const measurements = new Map<string, any>();
	let nextId = 1;
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		if (url.pathname === '/v1/measurements' && init?.method === 'POST') {
			if (options.createStatus && options.createStatus !== 202) {
				return new Response('rate limited', { status: options.createStatus });
			}
			const body = JSON.parse(String(init.body));
			const id = `m${nextId++}`;
			measurements.set(id, body);
			return Response.json({ id, probesCount: body.locations.length }, { status: 202 });
		}
		const id = url.pathname.split('/').at(-1)!;
		const request = measurements.get(id);
		const path = request?.measurementOptions?.request?.path;
		const statusCode = path === '/v1/models' ? (options.statusForModels ?? 401) : 200;
		const selected = results.slice(0, options.regions ?? results.length);
		return Response.json({
			id,
			type: 'http',
			status: 'finished',
			createdAt: new Date(NOW).toISOString(),
			results: selected.map((entry) => ({
				probe: { city: entry.city, country: entry.country },
				result: {
					status: 'finished',
					statusCode: path.endsWith('/v1/models') ? statusCode : entry.statusCode,
					timings: { total: entry.latency },
				},
			})),
		});
	}) as typeof fetch;
	return { fetchImpl, measurements };
}

describe('Globalping network probes', () => {
	test('maps probe cities to configured regions', () => {
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Shanghai', country: 'CN' })?.id).toBe('shanghai');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Beijing', country: 'CN' })?.id).toBe('beijing');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Hong Kong', country: 'HK' })?.id).toBe('hongkong');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Tsuen Wan', country: 'HK' })?.id).toBe('hongkong');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Tokyo', country: 'JP' })?.id).toBe('tokyo');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'San Jose', country: 'US' })?.id).toBe('siliconvalley');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Santa Clara', country: 'US' })?.id).toBe('siliconvalley');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'San Francisco', country: 'US' })?.id).toBe('siliconvalley');
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Los Angeles', country: 'US' })).toBeNull();
		expect(matchRegion(DEFAULT_REGIONS, { city: 'Berlin', country: 'DE' })).toBeNull();
	});

	test('creates one measurement per endpoint and stores per-region results', async () => {
		const { fetchImpl, measurements } = makeFetch();
		const services = fixture({ monitoringMode: 'live' });
		const result = await collectGlobalping(services, { fetch: fetchImpl });
		expect(result.ok).toBe(true);
		expect(measurements.size).toBe(3);
		for (const body of measurements.values()) {
			expect(body.locations.map((location: any) => location.magic)).toEqual([
				'Shanghai+CN',
				'Beijing+CN',
				'Hong Kong+HK',
				'Tokyo+JP',
				'San Jose+US',
			]);
		}
		expect(result.inserted).toBe(15);
		const rows = services.db
			.query<{ check_id: string; region_id: string; success: number; status_code: number; latency_ms: number }, [string]>(
				'SELECT check_id, region_id, success, status_code, latency_ms FROM results WHERE source=? ORDER BY check_id, region_id',
			)
			.all('globalping');
		expect(rows).toHaveLength(15);
		expect(rows.filter((row) => row.check_id === 'net:models').map((row) => [row.region_id, row.success, row.status_code])).toEqual([
			['beijing', 1, 401],
			['hongkong', 1, 401],
			['shanghai', 1, 401],
			['siliconvalley', 1, 401],
			['tokyo', 1, 401],
		]);
		expect(rows.filter((row) => row.check_id === 'net:root').map((row) => row.latency_ms)).toEqual([88, 45, 68, 21, 32]);
	});

	test('records missing probes as warnings instead of failures', async () => {
		const { fetchImpl } = makeFetch({ regions: 2 });
		const services = fixture({ monitoringMode: 'live' });
		const result = await collectGlobalping(services, { fetch: fetchImpl });
		expect(result.ok).toBe(true);
		expect(result.inserted).toBe(6);
		expect(result.warnings.some((warning) => warning.includes('香港'))).toBe(true);
		expect(
			services.db
				.query<{ count: number }, [string, string]>('SELECT COUNT(*) AS count FROM results WHERE region_id=? AND source=?')
				.get('siliconvalley', 'globalping'),
		).toEqual({ count: 0 });
	});

	test('surfaces rate limits without writing synthetic failures', async () => {
		const { fetchImpl } = makeFetch({ createStatus: 429 });
		const services = fixture({ monitoringMode: 'live' });
		const result = await collectGlobalping(services, { fetch: fetchImpl });
		expect(result.ok).toBe(false);
		expect(result.error).toContain('429');
		expect(services.db.query('SELECT COUNT(*) AS count FROM results WHERE source=?').get('globalping')).toEqual({ count: 0 });
	});
});
