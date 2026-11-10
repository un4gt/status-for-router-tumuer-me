/**
 * Request-latency tiers shared by the 2D and 3D views.
 * < 800ms fast (green) · < 2s slow (yellow) · < 10s bad (red) · ≥ 10s / no response timeout (grey)
 */
export type Tier = 'fast' | 'slow' | 'bad' | 'timeout';

export const TIER_RANK: Record<Tier, number> = { fast: 0, slow: 1, bad: 2, timeout: 3 };

export const TIER_COLORS: Record<Tier, string> = {
	fast: '#34d399',
	slow: '#fbbf24',
	bad: '#f87171',
	timeout: '#94a3b8',
};

/** Darker variants for text on light (2D) surfaces. */
export const TIER_TEXT: Record<Tier, string> = {
	fast: '#334155',
	slow: '#d97706',
	bad: '#dc2626',
	timeout: '#64748b',
};

export const TIER_LABELS: Record<Tier, string> = {
	fast: '< 800ms',
	slow: '< 2s',
	bad: '< 10s',
	timeout: '≥ 10s',
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
