import { Box } from '@mui/material';
import type { CheckType } from '../api';
import { TYPE_LABELS } from '../constants';
import { radius, size, v, weight } from '../design/tokens';

/**
 * Model type is metadata, not state: a neutral outlined tag, so the only
 * coloured marks in a row are the ones that mean good/bad.
 */
export function TypeTag({ type }: { type: CheckType }) {
	return (
		<Box
			component="span"
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				flexShrink: 0,
				height: 20,
				px: 0.75,
				borderRadius: `${radius.control - 2}px`,
				border: `1px solid ${v('border')}`,
				color: v('text2'),
				fontSize: size.xs,
				fontWeight: weight.medium,
				lineHeight: 1,
				whiteSpace: 'nowrap',
			}}
		>
			{TYPE_LABELS[type]}
		</Box>
	);
}
