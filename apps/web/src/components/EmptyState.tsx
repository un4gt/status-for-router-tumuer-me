import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
	return (
		<Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ px: 2, py: 3 }}>
			<Box
				sx={{
					width: 44,
					height: 44,
					display: 'grid',
					placeItems: 'center',
					bgcolor: '#eef2f8',
					color: 'text.secondary',
					borderRadius: '14px',
					flexShrink: 0,
				}}
			>
				{icon}
			</Box>
			<Stack spacing={0.25} sx={{ maxWidth: 520, minWidth: 0 }}>
				<Typography variant="body2" fontWeight={600}>
					{title}
				</Typography>
				{description ? (
					<Typography variant="caption" color="text.secondary">
						{description}
					</Typography>
				) : null}
			</Stack>
		</Stack>
	);
}
