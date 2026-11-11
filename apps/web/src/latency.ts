/**
 * Request-latency tiers for the 3D flight lines.
 * < 800ms fast · < 2s slow · < 10s bad · ≥ 10s / no response timeout.
 * Colours come from the scene palette so 2D and 3D read as one system.
 */
import { SCENE_STATUS } from './design/tokens';

export type Tier = 'fast' | 'slow' | 'bad' | 'timeout';

export const TIER_RANK: Record<Tier, number> = { fast: 0, slow: 1, bad: 2, timeout: 3 };

export const TIER_COLORS: Record<Tier, string> = {
	fast: SCENE_STATUS.operational,
	slow: SCENE_STATUS.degraded,
	bad: SCENE_STATUS.outage,
	timeout: SCENE_STATUS.unknown,
};

export const TIER_LABELS: Record<Tier, string> = {
	fast: '< 800 ms',
	slow: '< 2 s',
	bad: '< 10 s',
	timeout: '≥ 10 s 或无数据',
};

export function latencyTier(ms: number | null, failed = false): Tier {
	if (ms === null || !Number.isFinite(ms)) return 'timeout';
	let tier: Tier = ms < 800 ? 'fast' : ms < 2000 ? 'slow' : ms < 10_000 ? 'bad' : 'timeout';
	if (failed && TIER_RANK[tier] < TIER_RANK.bad) tier = 'bad';
	return tier;
}

export function worstTier(tiers: Tier[]): Tier {
	return tiers.reduce<Tier>((worst, t) => (TIER_RANK[t] > TIER_RANK[worst] ? t : worst), 'fast');
}
