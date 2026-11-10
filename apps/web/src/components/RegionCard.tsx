import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { GatewayRegion } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS } from '../constants';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { Sparkline } from './Sparkline';
import { StatusDot } from './StatusDot';
import { latencyTier, TIER_TEXT } from '../latency';

export function RegionCard({
	region,
	selected,
	onSelect,
	now,
}: {
	region: GatewayRegion;
	selected: boolean;
	onSelect: () => void;
	now: number;
}) {
	const hasData = region.total_count > 0;
	const color = STATUS_COLORS[region.status];
	const latency = region.last_latency_ms ?? region.avg_latency_ms;

	return (
		<Tooltip
			arrow
			title={`${region.label} (${region.code}) · ${STATUS_LABELS[region.status]} · 可用率 ${formatPercent(region.availability)} · ${hasData ? `检测于 ${formatAgoShort(region.last_checked_at, now)}` : '暂无数据'}`}
		>
			<Paper
				variant="outlined"
				role="button"
				tabIndex={0}
				aria-pressed={selected}
				aria-label={`${region.label}地区，${STATUS_LABELS[region.status]}`}
				onClick={onSelect}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onSelect();
					}
				}}
				sx={{
					position: 'relative',
					display: 'block',
					textAlign: 'left',
					width: '100%',
					px: 1.5,
					py: 1.2,
					'@media (min-width: 900px) and (max-height: 750px)': { px: 1.25, py: 0.95 },
					borderRadius: '12px',
					borderColor: selected ? 'primary.main' : '#e2e8f0',
					bgcolor: selected ? '#f0f6ff' : '#ffffff',
					boxShadow: selected ? '0 8px 20px -4px rgba(37, 99, 235, 0.14)' : '0 1px 2px rgba(15, 23, 42, 0.02)',
					cursor: 'pointer',
					overflow: 'hidden',
					transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background-color 150ms ease',
					'&:hover': {
						transform: 'translateY(-1px)',
						borderColor: selected ? 'primary.main' : '#cbd5e1',
						boxShadow: '0 6px 16px -4px rgba(15, 23, 42, 0.06)',
					},
					'&:focus-visible': { outline: '3px solid #bfdbfe', outlineOffset: 2 },
					'&::before': {
						content: '""',
						position: 'absolute',
						inset: 0,
						background: `linear-gradient(180deg, ${STATUS_BACKGROUNDS[region.status]} 0%, rgba(255,255,255,0) 60%)`,
						opacity: selected ? 0.5 : 0.65,
						pointerEvents: 'none',
					},
				}}
			>
				<Stack spacing={0.5} sx={{ position: 'relative' }}>
					<Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
						<Stack direction="row" spacing={0.65} alignItems="baseline" sx={{ minWidth: 0 }}>
							<Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
								{region.label}
							</Typography>
							<Typography sx={{ fontSize: 10.8, color: '#94a3b8', fontFamily: 'var(--status-mono)', fontWeight: 600 }}>
								{region.code}
							</Typography>
						</Stack>
						<Typography
							sx={{
								fontSize: 12,
								fontFamily: 'var(--status-mono)',
								fontWeight: 600,
								color: TIER_TEXT[latencyTier(latency, region.last_status === 'failure')],
							}}
						>
							{formatLatency(latency)}
						</Typography>
					</Stack>
					<Stack direction="row" alignItems="flex-end" spacing={1.25}>
						<Stack direction="row" alignItems="center" spacing={0.9} sx={{ flexShrink: 0 }}>
							<StatusDot status={region.status} size={6} pulse={false} />
							<Typography
								sx={{
									fontFamily: 'var(--status-mono)',
									fontSize: 20.8,
									lineHeight: '26px',
									letterSpacing: '-0.624px',
									color: region.status === 'operational' ? '#0f172a' : color,
								}}
							>
								{hasData ? formatPercent(region.availability) : '—'}
							</Typography>
						</Stack>
						<Box sx={{ flex: 1, minWidth: 0, pb: 0.15, display: { xs: 'none', lg: 'block' } }}>
							<Sparkline points={region.series.series} color={color} height={28} label={region.label + '延迟趋势'} />
						</Box>
					</Stack>
				</Stack>
			</Paper>
		</Tooltip>
	);
}
