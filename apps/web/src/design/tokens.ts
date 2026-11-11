/**
 * emrank.tech status design tokens — the single source of truth for colour, type,
 * radius and status semantics. Components read these through CSS variables
 * (`var(--…)`) so light/dark switch without re-rendering; the 3D scene reads the
 * raw hex values below because WebGL cannot resolve CSS variables.
 *
 * Brand: ink tile + mint signal (see BrandMark). Interactive accent is the ink itself;
 * green stays reserved for status so a selected control never reads as "healthy". Status fills were
 * validated for colour-vision deficiency (all pairs, ΔE ≥ 8) and text contrast
 * (≥ 4.5:1 on their surfaces) in both themes.
 */
import type { HealthStatus } from '../api';

type Palette = Record<string, string>;

export const light = {
	bg: '#F6F7FB',
	surface: '#FFFFFF',
	surface2: '#F3F4F9',
	surface3: '#EBEDF4',
	border: '#E8EAF1',
	borderStrong: '#D3D6E2',
	hairline: 'rgba(20, 22, 43, 0.07)',
	text1: '#14162B',
	text2: '#464A60',
	text3: '#5F6479',
	brand: '#14162B',
	brandHover: '#2B2E48',
	brandSoft: '#ECEDF3',
	brandText: '#14162B',
	onBrand: '#FFFFFF',
	focus: '#14162B',
	tooltipBg: '#14162B',
	tooltipFg: '#F7F8FC',
	okFill: '#1AAE96',
	okText: '#0B7A66',
	okSoft: '#E6F6F2',
	warnFill: '#E8A33C',
	warnText: '#A35A00',
	warnSoft: '#FDF3E3',
	critFill: '#B8284C',
	critText: '#A8233F',
	critSoft: '#FBEAEE',
	infoFill: '#4A6FB5',
	infoText: '#3B5C94',
	infoSoft: '#EAF0FA',
	noneFill: '#D5D8E3',
	noneText: '#5F6479',
	noneSoft: '#F1F2F8',
	hatch: '#E3E5EE',
	onStatus: '#FFFFFF',
	onWarn: '#3B2500',
	shadow: '0 0 0 1px rgba(20, 22, 43, 0.06), 0 1px 2px rgba(20, 22, 43, 0.04), 0 2px 8px -2px rgba(20, 22, 43, 0.04)',
	shadowRaised: '0 0 0 1px rgba(20, 22, 43, 0.06), 0 8px 24px -8px rgba(20, 22, 43, 0.18), 0 24px 48px -16px rgba(20, 22, 43, 0.14)',
	shadowControl: '0 0 0 1px rgba(20, 22, 43, 0.09), 0 1px 2px rgba(20, 22, 43, 0.06)',
	highlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
	glowOk: 'rgba(26, 174, 150, 0.10)',
	glowWarn: 'rgba(232, 163, 60, 0.16)',
	glowCrit: 'rgba(184, 40, 76, 0.13)',
	glowNone: 'rgba(20, 22, 43, 0.05)',
	rowHover: 'rgba(20, 22, 43, 0.025)',
	scrim: 'rgba(12, 14, 26, 0.32)',
	headerBg: 'rgba(246, 247, 251, 0.72)',
	/** Lab logos keep their own colours, so their tile stays light in both themes. */
	logoTile: '#FFFFFF',
	logoInk: '#14162B',
} satisfies Palette;

export const dark: typeof light = {
	bg: '#0A0B14',
	surface: '#12141F',
	surface2: '#191C2A',
	surface3: '#222536',
	border: '#23273A',
	borderStrong: '#343950',
	hairline: 'rgba(255, 255, 255, 0.07)',
	text1: '#ECEEF8',
	text2: '#B3B8CE',
	text3: '#8C92AC',
	brand: '#ECEEF8',
	brandHover: '#FFFFFF',
	brandSoft: '#242838',
	brandText: '#ECEEF8',
	onBrand: '#0A0B14',
	focus: '#ECEEF8',
	tooltipBg: '#ECEEF8',
	tooltipFg: '#14162B',
	okFill: '#1FA88F',
	okText: '#5EDCC4',
	okSoft: '#0F2A26',
	warnFill: '#BA8526',
	warnText: '#F3C06B',
	warnSoft: '#2C2111',
	critFill: '#C93C62',
	critText: '#FF92AE',
	critSoft: '#33171F',
	infoFill: '#6E8FD0',
	infoText: '#9DB8E6',
	infoSoft: '#18223A',
	noneFill: '#3A3F5C',
	noneText: '#8C92AC',
	noneSoft: '#1B1F36',
	hatch: '#262B47',
	onStatus: '#FFFFFF',
	onWarn: '#1A1206',
	shadow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.5)',
	shadowRaised: '0 0 0 1px rgba(255, 255, 255, 0.08), 0 16px 40px -12px rgba(0, 0, 0, 0.7)',
	shadowControl: '0 0 0 1px rgba(255, 255, 255, 0.09), 0 1px 2px rgba(0, 0, 0, 0.4)',
	highlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
	glowOk: 'rgba(31, 168, 143, 0.12)',
	glowWarn: 'rgba(186, 133, 38, 0.16)',
	glowCrit: 'rgba(201, 60, 98, 0.16)',
	glowNone: 'rgba(255, 255, 255, 0.035)',
	rowHover: 'rgba(255, 255, 255, 0.025)',
	scrim: 'rgba(0, 0, 0, 0.55)',
	headerBg: 'rgba(10, 11, 20, 0.7)',
	logoTile: '#ECEEF8',
	logoInk: '#14162B',
};

export type TokenName = keyof typeof light;

const kebab = (name: string) => name.replace(/[A-Z0-9]+/g, (match) => `-${match.toLowerCase()}`);
export const cssVarName = (name: TokenName) => `--${kebab(name)}`;
/** `v('text1')` → `var(--text-1)`; use in sx/style props. */
export const v = (name: TokenName) => `var(${cssVarName(name)})`;

export function cssVariables(palette: typeof light): Record<string, string> {
	return Object.fromEntries(Object.entries(palette).map(([key, value]) => [cssVarName(key as TokenName), value]));
}

export const font = {
	sans: '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
	mono: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** One easing and three durations for every transition on the page. */
export const motion = {
	ease: 'cubic-bezier(0.2, 0, 0, 1)',
	fast: '120ms',
	base: '200ms',
	slow: '360ms',
} as const;

/** Six text steps plus one display step. Never use sizes outside this scale. */
export const size = {
	xs: '0.75rem', // 12 — captions, meta, chips
	sm: '0.8125rem', // 13 — dense table text, secondary
	md: '0.875rem', // 14 — body, row titles
	lg: '1rem', // 16 — section titles
	xl: '1.25rem', // 20 — page title, region figures
	xxl: '1.75rem', // 28 — banner headline
	display: '2.5rem', // 40 — the one hero number
} as const;

export const weight = { regular: 400, medium: 500, semibold: 600 } as const;

export const radius = { control: 6, block: 10, section: 14, pill: 999 } as const;

/** Status meaning, label and glyph. Colour is never the only carrier. */
export const STATUS_ORDER: HealthStatus[] = ['outage', 'degraded', 'maintenance', 'unknown', 'operational'];

export const STATUS_RANK: Record<HealthStatus, number> = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, outage: 4 };

export const STATUS_META: Record<HealthStatus, { label: string; fill: TokenName; text: TokenName; soft: TokenName; glow: TokenName }> = {
	operational: { label: '正常', fill: 'okFill', text: 'okText', soft: 'okSoft', glow: 'glowOk' },
	degraded: { label: '降级', fill: 'warnFill', text: 'warnText', soft: 'warnSoft', glow: 'glowWarn' },
	outage: { label: '故障', fill: 'critFill', text: 'critText', soft: 'critSoft', glow: 'glowCrit' },
	maintenance: { label: '维护', fill: 'infoFill', text: 'infoText', soft: 'infoSoft', glow: 'glowNone' },
	unknown: { label: '无数据', fill: 'noneFill', text: 'noneText', soft: 'noneSoft', glow: 'glowNone' },
};

export const statusFill = (status: HealthStatus) => v(STATUS_META[status].fill);
export const statusText = (status: HealthStatus) => v(STATUS_META[status].text);
export const statusSoft = (status: HealthStatus) => v(STATUS_META[status].soft);
export const statusGlow = (status: HealthStatus) => v(STATUS_META[status].glow);

/**
 * Bright status hues for the always-dark 3D scene (WebGL needs literal values).
 * Same hue family as the 2D fills, lifted for glow on a near-black globe.
 */
export const SCENE_STATUS: Record<HealthStatus, string> = {
	operational: '#3FD9B9',
	degraded: '#F2B450',
	outage: '#FF6A8B',
	maintenance: '#8FB0F0',
	unknown: '#7E86A6',
};
