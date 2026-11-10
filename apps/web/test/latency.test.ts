import { expect, test } from 'bun:test';
import { latencyTier, worstTier } from '../src/latency';

test('Figma latency bands preserve boundary, failure and missing-data semantics', () => {
	for (const [ms, tier] of [
		[0, 'fast'],
		[799, 'fast'],
		[800, 'slow'],
		[1999, 'slow'],
		[2000, 'bad'],
		[9999, 'bad'],
		[10000, 'timeout'],
		[null, 'timeout'],
		[NaN, 'timeout'],
		[Infinity, 'timeout'],
	] as const) {
		expect(latencyTier(ms)).toBe(tier);
	}
	expect(latencyTier(50, true)).toBe('bad');
	expect(latencyTier(15000, true)).toBe('timeout');
	expect(worstTier(['fast', 'bad', 'slow'])).toBe('bad');
	expect(worstTier(['bad', 'timeout'])).toBe('timeout');
});
