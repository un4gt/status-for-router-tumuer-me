import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { radius, v } from '../design/tokens';

export function SectionHeader({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
	return (
		<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
			<Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
				<Box
					sx={{
						display: 'grid',
						placeItems: 'center',
						width: 32,
						height: 32,
						borderRadius: `${radius.control}px`,
						bgcolor: v('brandSoft'),
						color: v('brandText'),
						flexShrink: 0,
					}}
				>
					{icon}
				</Box>
				<Box sx={{ minWidth: 0 }}>
					<Typography component="h2" variant="h2">
						{title}
					</Typography>
					{description ? (
						<Typography variant="body2" sx={{ color: v('text2') }}>
							{description}
						</Typography>
					) : null}
				</Box>
			</Stack>
			{action && <Box sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'auto' } }}>{action}</Box>}
		</Stack>
	);
}
