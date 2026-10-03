import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function SectionHeader({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
	return (
		<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
			<Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
				<Box
					sx={{
						display: 'grid',
						placeItems: 'center',
						width: 42,
						height: 42,
						borderRadius: '12px',
						bgcolor: 'primary.light',
						color: 'primary.main',
						flexShrink: 0,
					}}
				>
					{icon}
				</Box>
				<Typography component="h2" variant="h6" sx={{ minWidth: 0 }}>
					{title}
				</Typography>
			</Stack>
			{action && <Box sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'auto' } }}>{action}</Box>}
		</Stack>
	);
}
