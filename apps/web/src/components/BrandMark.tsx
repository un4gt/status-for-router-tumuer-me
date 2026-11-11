import { Box, Typography } from '@mui/material';
import { size as type, v, weight } from '../design/tokens';

/**
 * EMRank mark: a lowercase "e" — the first letter of emrank.tech — whose
 * stroke ends in a mint dot, the service's "online" signal. The tile inverts
 * with the theme (ink on light, paper on dark); the dot stays on brand.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
	return (
		<Box component="svg" viewBox="0 0 32 32" aria-hidden sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}>
			<rect width="32" height="32" rx="8.5" fill={v('text1')} />
			<path d="M8.7 15.1H21.1A6.2 6.2 0 1 0 19.79 18.92" fill="none" stroke={v('surface')} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="23.25" cy="21.63" r="2.6" fill={v('okFill')} />
		</Box>
	);
}

/** "emrank.tech | 状态" — the domain is the name; the dot repeats the mark's signal. */
export function BrandWordmark({ compact = false }: { compact?: boolean }) {
	return (
		<Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center', fontSize: type.lg, fontWeight: weight.semibold, letterSpacing: '-0.02em', whiteSpace: 'nowrap', lineHeight: 1 }}>
			emrank
			<Box component="span" sx={{ color: v('okFill'), fontWeight: 700 }}>
				.
			</Box>
			<Box component="span" sx={{ color: v('text3'), fontWeight: weight.medium }}>
				tech
			</Box>
			{compact ? null : (
				<Box
					component="span"
					sx={{ ml: 1.25, pl: 1.25, borderLeft: `1px solid ${v('borderStrong')}`, color: v('text2'), fontWeight: weight.regular, fontSize: type.md, letterSpacing: 0, display: { xs: 'none', sm: 'inline' } }}
				>
					状态
				</Box>
			)}
		</Typography>
	);
}
