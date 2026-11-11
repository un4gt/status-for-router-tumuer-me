import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { radius, v } from '../design/tokens';

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
	return (
		<Stack alignItems="center" justifyContent="center" spacing={1.25} sx={{ px: 2, py: 5, textAlign: 'center' }}>
			<Box
				sx={{
					width: 40,
					height: 40,
					display: 'grid',
					placeItems: 'center',
					bgcolor: v('surface2'),
					color: v('text3'),
					borderRadius: `${radius.block}px`,
				}}
			>
				{icon}
			</Box>
			<Typography variant="body1" fontWeight={600}>
				{title}
			</Typography>
			{description ? (
				<Typography variant="body2" sx={{ color: v('text2'), maxWidth: 460 }}>
					{description}
				</Typography>
			) : null}
			{action}
		</Stack>
	);
}
