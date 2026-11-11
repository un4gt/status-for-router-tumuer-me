import { Box, Tooltip } from '@mui/material';
import { radius, size, v, weight } from '../design/tokens';
import { splitModelName } from '../status';

/**
 * The vendor prefix shrinks first and the base name stays visible; a tag such
 * as `[official]` becomes a small label, so `…-3-small` and
 * `…-3-small[official]` can no longer truncate to the same text.
 */
export function ModelName({ name, fontSize = size.sm, wrapOnPhone = false }: { name: string; fontSize?: string; wrapOnPhone?: boolean }) {
	const { vendor, base, tag } = splitModelName(name);
	return (
		<Tooltip title={name} disableInteractive placement="top-start">
			<Box
				component="span"
				sx={{
					display: 'flex',
					minWidth: 0,
					alignItems: 'center',
					fontFamily: 'var(--font-mono)',
					fontSize,
					lineHeight: 1.4,
					letterSpacing: '-0.01em',
					// Phones show the whole name over two lines instead of truncating both halves.
					...(wrapOnPhone
						? { flexWrap: { xs: 'wrap', md: 'nowrap' }, '& > .part': { whiteSpace: { xs: 'normal', md: 'nowrap' }, overflowWrap: { xs: 'anywhere', md: 'normal' }, overflow: { xs: 'visible', md: 'hidden' } } }
						: null),
				}}
			>
				{vendor ? (
					<Box component="span" className="part" sx={{ color: v('text3'), flexShrink: 1, minWidth: '3ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
						{vendor}
					</Box>
				) : null}
				<Box component="span" className="part" sx={{ color: v('text1'), fontWeight: weight.medium, flexShrink: 0.15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{base}
				</Box>
				{tag ? (
					<Box
						component="span"
						sx={{
							flexShrink: 0,
							ml: 0.75,
							px: 0.625,
							height: 18,
							display: 'inline-flex',
							alignItems: 'center',
							borderRadius: `${radius.control - 2}px`,
							bgcolor: v('brandSoft'),
							color: v('brandText'),
							fontFamily: 'var(--font-sans)',
							fontSize: size.xs,
							fontWeight: weight.medium,
							letterSpacing: 0,
						}}
					>
						{tag.replace(/^\[|\]$/g, '')}
					</Box>
				) : null}
			</Box>
		</Tooltip>
	);
}
