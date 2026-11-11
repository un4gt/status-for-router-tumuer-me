import { expect, test } from 'bun:test';
import type { ModelHealth, OverviewResponse, RegionStats, Series } from '../src/api';
import { formatAgoShort, formatLatency } from '../src/format';
import { countStatuses, filterModels, modelStatus, sortModels, splitModelName, statusShares, summarize } from '../src/status';

const series: Series = { from: 0, to: 3_600_000, bucket_ms: 300_000, series: [] };
const region = (status: RegionStats['status'], availability: number | null): RegionStats => ({
	status,
	availability,
	total_count: availability === null ? 0 : 20,
	success_count: 0,
	avg_latency_ms: 100,
	p95_ms: 200,
	last_status: 'success',
	last_checked_at: 1,
	last_latency_ms: 100,
	series,
});
const model = (name: string, status: ModelHealth['status'], availability: number, regions: Record<string, RegionStats> = {}): ModelHealth => ({
	id: `model:${name}`,
	type: 'model',
	model: name,
	enabled: true,
	provider: 'cloudprobe',
	probe_configured: true,
	status,
	availability,
	total_count: 100,
	success_count: Math.round(availability * 100),
	avg_latency_ms: 500,
	p95_ms: 900,
	last_status: 'success',
	last_checked_at: 1,
	stats: {} as ModelHealth['stats'],
	regions,
	series,
});

test('row status comes from the server, so regional degradation is never shown as healthy', () => {
	// 99.28% overall but degraded in two regions: the old page recomputed "正常" from availability.
	const m = model('BAAI/bge-small-en-v1.5', 'degraded', 0.9928, { shanghai: region('degraded', 0.97), tokyo: region('operational', 1) });
	expect(modelStatus(m, 'all')).toBe('degraded');
	expect(modelStatus(m, 'shanghai')).toBe('degraded');
	expect(modelStatus(m, 'tokyo')).toBe('operational');
	expect(modelStatus(m, 'missing')).toBe('unknown');
	expect(countStatuses([m, model('a', 'operational', 1)].map((x) => modelStatus(x, 'all')))).toMatchObject({ degraded: 1, operational: 1 });
});

test('attention sort puts outages first, then degraded, unknown, healthy; ties by name', () => {
	const list = [model('b', 'operational', 1), model('a', 'degraded', 0.98), model('c', 'outage', 0.9), model('d', 'unknown', 1), model('a2', 'operational', 1)];
	expect(sortModels(list, 'all', 'attention').map((m) => m.model)).toEqual(['c', 'a', 'd', 'a2', 'b']);
	expect(sortModels(list, 'all', 'availability')[0].model).toBe('c');
	expect(filterModels(list, ' A ').map((m) => m.model)).toEqual(['a', 'a2']);
});

test('model names keep vendor and tag apart so truncation cannot make two rows identical', () => {
	expect(splitModelName('openai/text-embedding-3-small[official]')).toEqual({ vendor: 'openai/', base: 'text-embedding-3-small', tag: '[official]' });
	expect(splitModelName('Pro/BAAI/bge-m3')).toEqual({ vendor: 'Pro/BAAI/', base: 'bge-m3', tag: '' });
	expect(splitModelName('embedding-001')).toEqual({ vendor: '', base: 'embedding-001', tag: '' });
});

test('latency switches to seconds at 1s for both views; relative time reads naturally', () => {
	expect(formatLatency(681.4)).toBe('681 ms');
	expect(formatLatency(1267)).toBe('1.27 s');
	expect(formatLatency(12965)).toBe('13.0 s');
	expect(formatLatency(null)).toBe('—');
	expect(formatAgoShort(1_000, 30_000)).toBe('不到 1 分钟前');
	expect(formatAgoShort(0, 30_000)).toBe('—');
	expect(formatAgoShort(1, 1 + 5 * 60_000)).toBe('5 分钟前');
});

test('summary names the affected regions, counts affected models and finds when the trouble began', () => {
	const bad: Series = {
		from: 0,
		to: 6 * 300_000,
		bucket_ms: 300_000,
		series: [0, 1, 2, 3, 4, 5].map((i) => ({ ts: i * 300_000, total_count: 3, success_count: 3, availability: i >= 3 ? 0.66 : 1, avg_latency_ms: 100 })),
	};
	const overview = {
		gateway: {
			status: 'outage',
			availability: 0.93,
			regions: [
				{ ...region('outage', 0.6), id: 'shanghai', label: '上海', code: 'SHA', series: bad },
				{ ...region('operational', 1), id: 'tokyo', label: '东京', code: 'TYO' },
			],
			endpoints: [],
			last_checked_at: 1,
		},
		models: [model('a', 'degraded', 0.98), model('b', 'operational', 1), { ...model('c', 'outage', 0.5), enabled: false }],
	} as unknown as OverviewResponse;
	const incident = summarize(overview);
	expect(incident.status).toBe('outage');
	expect(incident.headline).toBe('部分服务出现故障');
	expect(incident.affectedRegions).toEqual(['上海']);
	expect(incident.affectedModels).toBe(1);
	expect(incident.degradedModels).toBe(1);
	expect(incident.outageModels).toBe(0);
	expect(incident.totalModels).toBe(2);
	expect(incident.since).toBe(3 * 300_000);
	// Models are counted in the figures row, not repeated in the sentence.
	expect(incident.detail).toEqual(['上海访问网关不稳定']);
	expect(incident.lastCheckedAt).toBe(1);
});

test('the sentence never lists models; counts still split outage and degraded', () => {
	const many = {
		gateway: { status: 'operational', availability: 1, regions: [], endpoints: [], last_checked_at: 5 },
		models: [
			model('BAAI/bge-m3', 'degraded', 0.98),
			model('typesafe/jev-latest', 'outage', 0.9),
			model('openai/text-embedding-3-small[official]', 'degraded', 0.98),
			model('Qwen/Qwen3-Embedding-8B', 'operational', 1),
		],
	} as unknown as OverviewResponse;
	const incident = summarize(many);
	expect(incident.detail).toEqual([]);
	expect(incident.headline).toBe('部分服务出现故障');
	expect([incident.affectedModels, incident.outageModels, incident.degradedModels, incident.totalModels]).toEqual([3, 1, 2, 4]);
});

test('particle colour shares follow the status mix, worst first, with a visible floor', () => {
	const counts = (partial: Partial<Record<ModelHealth['status'], number>>) => ({ operational: 0, degraded: 0, outage: 0, maintenance: 0, unknown: 0, ...partial });
	expect(statusShares(counts({ operational: 7 }))).toEqual([{ status: 'operational', end: 1 }]);
	const mixed = statusShares(counts({ operational: 5, degraded: 2, unknown: 3 }));
	expect(mixed.map((band) => band.status)).toEqual(['degraded', 'operational']);
	expect(mixed[0].end).toBeCloseTo(2 / 7);
	expect(mixed[1].end).toBe(1);
	// One outage among 40 healthy subjects still claims a visible share.
	const rare = statusShares(counts({ operational: 40, outage: 1 }));
	expect(rare[0]).toEqual({ status: 'outage', end: expect.any(Number) });
	expect(rare[0].end).toBeGreaterThan(0.05);
	// Nothing checked yet: the field is the neutral "no data" colour.
	expect(statusShares(counts({ unknown: 4 }))).toEqual([{ status: 'unknown', end: 1 }]);
});
