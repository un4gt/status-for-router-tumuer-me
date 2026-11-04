import { describe, expect, test } from 'bun:test';
import { saveSelection } from '../src/db';
import { DEFAULT_REGIONS } from '../src/config';
import {
	cloudProbeStatusToSuccess,
	collectCloudProbe,
	parseCloudProbeTime,
} from '../src/providers/cloudProbe';
import { fixture } from './helpers';
import { signScfCamRequest } from '../src/providers/scfCam';

const REGIONS = DEFAULT_REGIONS.map((region) => ({ ...region, probeUrl: `https://${region.id}.probe.test/` }));

const CLOUD_PROBE = {
	intervalSeconds: 900,
	requestTimeoutMs: 30_000,
	probeTimeoutMs: 15_000,
	concurrency: 2,
	token: 'probe-token',
	cam: { secretId: 'AKID-test', secretKey: 'test-secret-key', uin: '123456789', token: '' },
	configured: true,
};

function servicesWithProbe() {
	const services = fixture({
		monitoringMode: 'live',
		regions: REGIONS,
		cloudProbe: CLOUD_PROBE,
	});
	saveSelection(services, [
		{ model: 'embed', type: 'model' },
		{ model: 'rerank', type: 'rerank' },
	]);
	return services;
}

type Call = { url: string; body: any; rawBody: string; headers: Record<string, string>; redirect?: RequestRedirect };

function makeFetch(options: { failRegion?: string; noLocations?: boolean; httpStatus?: number; code?: number } = {}) {
	const calls: Call[] = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = JSON.parse(String(init?.body ?? '{}'));
		calls.push({ url, body, rawBody: String(init?.body), headers: (init?.headers ?? {}) as Record<string, string>, redirect: init?.redirect });
		if (options.httpStatus) return new Response('function failed', { status: options.httpStatus });
		if (options.code) return Response.json({ code: options.code, message: 'bad request', data: null });
		const region = REGIONS.find((item) => item.probeUrl === url)!;
		const status = options.failRegion === region.id ? 0 : 1;
		return Response.json({
			code: 0,
			message: 'success',
			data: {
				status,
				unit: 'ms',
				attribute_value: 100,
				last_polled_time: '2026-11-04T10:00:00+0530',
				down_reason: status === 0 ? 'HTTP 503' : null,
				...(options.noLocations
					? {}
					: {
							locations: [
								{
									location_name: region.label,
									status,
									last_polled_time: '2026-11-04T10:01:00+0530',
									attribute_value: 120,
								},
							],
						}),
			},
		});
	}) as typeof fetch;
	return { fetchImpl, calls };
}

describe('cloud function model probes', () => {
	test('maps statuses and timestamps from the Site24x7-compatible payload', () => {
		expect(cloudProbeStatusToSuccess(1)).toBe(1);
		expect(cloudProbeStatusToSuccess(0)).toBe(0);
		expect(cloudProbeStatusToSuccess(2)).toBe(0);
		expect(cloudProbeStatusToSuccess(3)).toBe(0);
		expect(cloudProbeStatusToSuccess(5)).toBeNull();
		expect(cloudProbeStatusToSuccess(7)).toBeNull();
		expect(parseCloudProbeTime('2015-07-21T15:16:17+0530')).toBe(Date.parse('2015-07-21T15:16:17+05:30'));
	});

	test('collects one result per check per region with latency and probe token', async () => {
		const services = servicesWithProbe();
		const { fetchImpl, calls } = makeFetch();
		const result = await collectCloudProbe(services, { fetch: fetchImpl });

		expect(result.ok).toBe(true);
		expect(result.inserted).toBe(10);
		expect(calls).toHaveLength(10);
		for (const call of calls) {
			const expected = signScfCamRequest(call.url, call.rawBody, CLOUD_PROBE.cam, Number(call.headers['x-scf-cam-timestamp']));
			expect(call.headers.authorization).toBe(expected.authorization);
			expect(call.headers.host).toBe(new URL(call.url).host);
			expect(call.headers['x-scf-cam-uin']).toBe(CLOUD_PROBE.cam.uin);
			expect(call.headers['content-type']).toBe('application/json');
			expect(call.redirect).toBe('error');
			expect(call.headers['x-probe-token']).toBe('probe-token');
			expect(call.body.target).toBe('https://emrank.tech/v1');
			expect(call.body.apiKey).toBe('test-api-key');
			expect(call.body.timeoutMs).toBe(15_000);
			expect(['model:embed', 'rerank:rerank']).toContain(call.body.check.id);
		}

		const rows = services.db
			.query<{ check_id: string; region_id: string; success: number; latency_ms: number; ts: number }, [string]>(
				'SELECT check_id, region_id, success, latency_ms, ts FROM results WHERE source=? ORDER BY check_id, region_id',
			)
			.all('cloudprobe');
		expect(rows).toHaveLength(10);
		expect(rows.every((row) => row.success === 1 && row.latency_ms === 120)).toBe(true);
		expect([...new Set(rows.map((row) => row.region_id))].sort()).toEqual([
			'beijing',
			'hongkong',
			'shanghai',
			'siliconvalley',
			'tokyo',
		]);
		expect(rows[0].ts).toBe(Date.parse('2026-11-04T10:01:00+05:30'));
	});

	test('stores the failure status and down reason without treating it as a source error', async () => {
		const services = servicesWithProbe();
		const { fetchImpl } = makeFetch({ failRegion: 'shanghai' });
		const result = await collectCloudProbe(services, { fetch: fetchImpl });

		expect(result.ok).toBe(true);
		expect(result.inserted).toBe(10);
		const failed = services.db
			.query<{ success: number; error: string }, [string, string]>(
				'SELECT success, error FROM results WHERE source=? AND region_id=? ORDER BY check_id',
			)
			.all('cloudprobe', 'shanghai');
		expect(failed.map((row) => [row.success, row.error])).toEqual([
			[0, 'HTTP 503'],
			[0, 'HTTP 503'],
		]);
	});

	test('falls back to the overall status when the function omits locations', async () => {
		const services = servicesWithProbe();
		const { fetchImpl } = makeFetch({ noLocations: true });
		const result = await collectCloudProbe(services, { fetch: fetchImpl });

		expect(result.ok).toBe(true);
		expect(result.inserted).toBe(10);
		expect(result.warnings.some((warning) => warning.includes('未返回地区明细'))).toBe(true);
		const rows = services.db
			.query<{ region_id: string; success: number }, [string]>('SELECT region_id, success FROM results WHERE source=?')
			.all('cloudprobe');
		expect(rows).toHaveLength(10);
		expect(rows.every((row) => row.success === 1 && row.region_id !== '')).toBe(true);
	});

	test('reports function HTTP failures without writing synthetic model outages', async () => {
		const services = servicesWithProbe();
		const { fetchImpl } = makeFetch({ httpStatus: 503 });
		const result = await collectCloudProbe(services, { fetch: fetchImpl });

		expect(result.ok).toBe(false);
		expect(result.error).toContain('503');
		expect(result.inserted).toBe(0);
		expect(services.db.query('SELECT COUNT(*) AS count FROM results WHERE source=?').get('cloudprobe')).toEqual({ count: 0 });
	});

	test('reports a missing probe configuration without writing results', async () => {
		const services = fixture({ monitoringMode: 'live' });
		const result = await collectCloudProbe(services, { fetch: makeFetch().fetchImpl });
		expect(result.ok).toBe(false);
		expect(result.error).toContain('probe_url');
	});

	test('does not send unsigned requests when CAM credentials are incomplete', async () => {
		const services = servicesWithProbe();
		services.config.cloudProbe = { ...CLOUD_PROBE, cam: { ...CLOUD_PROBE.cam, secretKey: '' } };
		const { fetchImpl, calls } = makeFetch();
		const result = await collectCloudProbe(services, { fetch: fetchImpl });
		expect(result.ok).toBe(false);
		expect(result.error).toContain('TENCENTCLOUD_SECRET_KEY');
		expect(result.inserted).toBe(0);
		expect(calls).toHaveLength(0);
	});

	test('sends temporary credential tokens and redacts credentials echoed in failures', async () => {
		const services = servicesWithProbe();
		services.config.cloudProbe = { ...CLOUD_PROBE, cam: { ...CLOUD_PROBE.cam, token: 'temporary-session-token' } };
		const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			const headers = init!.headers as Record<string, string>;
			expect(headers['x-scf-cam-token']).toBe('temporary-session-token');
			return new Response([
				headers.authorization, headers['x-scf-cam-token'], headers['x-probe-token'],
				services.config.apiKey, CLOUD_PROBE.cam.secretKey,
			].join(' '), { status: 403 });
		}) as typeof fetch;
		const result = await collectCloudProbe(services, { fetch: fetchImpl });
		expect(result.ok).toBe(false);
		expect(result.inserted).toBe(0);
		expect(result.error).toContain('403');
		for (const secret of ['TC3-HMAC-SHA256', CLOUD_PROBE.cam.secretId, CLOUD_PROBE.cam.secretKey, 'temporary-session-token', CLOUD_PROBE.token, services.config.apiKey]) {
			expect(result.error).not.toContain(secret);
		}
	});
});
