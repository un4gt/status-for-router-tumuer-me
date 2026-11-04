import { Box, Typography } from '@mui/material';
import type { HealthStatus } from '../api';
import { STATUS_COLORS, STATUS_LABELS } from '../constants';

export function StatusDot({
	status,
	size = 9,
	label = false,
	pulse = true,
}: {
	status: HealthStatus;
	size?: number;
	label?: boolean;
	pulse?: boolean;
}) {
	const color = STATUS_COLORS[status];
	const animated = pulse && (status === 'outage' || status === 'degraded');
	return (
		<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
			<Box
				component="span"
				role="img"
				aria-label={STATUS_LABELS[status]}
				sx={{
					width: size,
					height: size,
					borderRadius: '50%',
					bgcolor: color,
					flexShrink: 0,
					boxShadow: `0 0 0 3px ${color}20`,
					position: 'relative',
					...(animated
						? {
								'&::after': {
									content: '""',
									position: 'absolute',
									inset: -3,
									borderRadius: '50%',
									border: `1px solid ${color}`,
									animation: 'statusPulse 2.2s ease-out infinite',
									'@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.4 },
								},
								'@keyframes statusPulse': {
									'0%': { transform: 'scale(0.6)', opacity: 0.6 },
									'70%': { transform: 'scale(1.8)', opacity: 0 },
									'100%': { transform: 'scale(1.8)', opacity: 0 },
								},
							}
						: {}),
				}}
			/>
			{label ? (
				<Typography component="span" variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
					{STATUS_LABELS[status]}
				</Typography>
			) : null}
		</Box>
	);
}
