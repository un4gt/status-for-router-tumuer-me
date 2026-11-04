import { describe, expect, test } from 'bun:test';
import { runCollection } from '../src/collector';
import { getMeta, setMeta } from '../src/db';
import { fixture } from './helpers';

const NOW = Date.parse('2026-11-04T00:00:00.000Z');

function fakeGlobalpingFetch(options: { rateLimit?: boolean } = {}) {
	let nextId = 1;
	const targets = new Map<string, string>();
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (options.rateLimit) return new Response('rate limited', { status: 429 });
		const url = new URL(String(input));
		if (url.pathname === '/v1/measurements' && init?.method === 'POST') {
			const body = JSON.parse(String(init.body));
			const id = `m${nextId++}`;
			targets.set(id, body.measurementOptions.request.path);
			return Response.json({ id, probesCount: 5 }, { status: 202 });
		}
		const id = url.pathname.split('/').at(-1)!;
		const path = targets.get(id);
		return Response.json({
			id,
			status: 'finished',
			createdAt: new Date(NOW).toISOString(),
			results: [
				['Shanghai', 'CN', 68],
				['Beijing', 'CN', 88],
				['Hong Kong', 'HK', 45],
				['Tokyo', 'JP', 32],
				['San Jose', 'US', 21],
			].map(([city, country, latency]) => ({
				probe: { city, country },
				result: {
					status: 'finished',
					statusCode: path === '/v1/models' ? 401 : 200,
					timings: { total: latency },
				},
			})),
		});
	}) as typeof fetch;
}

describe('collection orchestration', () => {
	test('collects at the next 30-second boundary despite timer jitter', async () => {
		const services = fixture({ monitoringMode: 'live' });
		services.config.cloudProbe.intervalSeconds = 30;
		setMeta(services, 'source:cloudprobe:last_run_at', String(NOW + 4));
		setMeta(services, 'source:globalping:last_run_at', String(NOW + 4));
		const options = { triggeredBy: 'scheduled' as const, fetch: fakeGlobalpingFetch() };
		const sameSlot = await runCollection(services, { ...options, now: () => NOW + 29_999 });
		expect(sameSlot.sources.cloudprobe).toBeUndefined();
		const nextSlot = await runCollection(services, { ...options, now: () => NOW + 30_001 });
		// Missing URLs report a source error, proving that collection was attempted.
		expect(nextSlot.sources.cloudprobe?.error).toContain('probe_url');
		expect(nextSlot.sources.globalping).toBeUndefined();
	});

	test('runs due sources independently, records errors, and forces both on manual runs', async () => {
		const services = fixture({ monitoringMode: 'live' });
		const first = await runCollection(services, { triggeredBy: 'scheduled', fetch: fakeGlobalpingFetch(), now: () => NOW });
		expect(first.sources.globalping?.ok).toBe(true);
		expect(first.sources.globalping?.inserted).toBe(15);
		expect(first.sources.cloudprobe?.ok).toBe(false);
		expect(first.sources.cloudprobe?.error).toContain('probe_url');
		expect(Number(getMeta(services, 'source:globalping:last_run_at'))).toBe(NOW);
		expect(getMeta(services, 'source:cloudprobe:last_run_at')).toBeNull();
		expect(getMeta(services, 'source:cloudprobe:last_error')).toContain('probe_url');

		const second = await runCollection(services, {
			triggeredBy: 'scheduled',
			fetch: fakeGlobalpingFetch(),
			now: () => NOW + 1000,
		});
		expect(second.sources.globalping).toBeUndefined();
		expect(second.sources.cloudprobe?.ok).toBe(false);

		const manual = await runCollection(services, {
			triggeredBy: 'manual',
			fetch: fakeGlobalpingFetch(),
			now: () => NOW + 1000,
		});
		expect(manual.sources.globalping?.ok).toBe(true);
	});

	test('backs off after a rate-limited source instead of retrying every tick', async () => {
		const services = fixture({ monitoringMode: 'live' });
		const first = await runCollection(services, {
			triggeredBy: 'scheduled',
			fetch: fakeGlobalpingFetch({ rateLimit: true }),
			now: () => NOW,
		});
		expect(first.sources.globalping?.ok).toBe(false);
		expect(first.sources.globalping?.error).toContain('429');
		expect(Number(getMeta(services, 'source:globalping:backoff_until'))).toBeGreaterThan(NOW);
		const second = await runCollection(services, {
			triggeredBy: 'scheduled',
			fetch: fakeGlobalpingFetch({ rateLimit: true }),
			now: () => NOW + 1000,
		});
		expect(second.sources.globalping).toBeUndefined();
	});

	test('mock mode seeds deterministic history and records its source', async () => {
		const services = fixture({ monitoringMode: 'mock' });
		const result = await runCollection(services, { triggeredBy: 'manual', now: () => NOW });
		expect(result.sources.mock?.ok).toBe(true);
		expect(Number(getMeta(services, 'source:mock:last_run_at'))).toBe(NOW);
		const rows = services.db.query<{ source: string; count: number }, []>(
			'SELECT source, COUNT(*) AS count FROM results GROUP BY source',
		).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].source).toBe('mock');
		expect(rows[0].count).toBeGreaterThan(1000);
	});
});
