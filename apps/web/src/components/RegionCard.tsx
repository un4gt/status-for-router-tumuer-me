import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import type { GatewayRegion } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS } from '../constants';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { Sparkline } from './Sparkline';
import { StatusDot } from './StatusDot';

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
				p: 2.25,
				borderRadius: '14px',
				borderColor: selected ? 'primary.main' : 'divider',
				bgcolor: selected ? 'primary.light' : 'background.paper',
				boxShadow: selected ? '0 8px 24px rgba(53,99,233,0.12)' : 'none',
				cursor: 'pointer',
				overflow: 'hidden',
				transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
				'&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(29,43,67,0.08)' },
				'&:focus-visible': { outline: '3px solid #b7c9ff', outlineOffset: 2 },
				'&::before': {
					content: '""',
					position: 'absolute',
					inset: 0,
					background: `linear-gradient(180deg, ${STATUS_BACKGROUNDS[region.status]} 0%, transparent 62%)`,
					opacity: selected ? 0.6 : 0.85,
					pointerEvents: 'none',
				},
			}}
		>
			<Stack spacing={1.25} sx={{ position: 'relative' }}>
				<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
					<Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
						<Typography variant="subtitle1" fontWeight={700} noWrap>
							{region.label}
						</Typography>
						<Chip size="small" variant="outlined" label={region.code} sx={{ height: 20, fontSize: '0.6875rem' }} />
					</Stack>
					<StatusDot status={region.status} label />
				</Stack>

				<Stack direction="row" alignItems="flex-end" spacing={0.5}>
					<Typography
						component="span"
						sx={{
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
							fontSize: '1.7rem',
							fontWeight: 650,
							lineHeight: 1,
							fontVariantNumeric: 'tabular-nums',
							letterSpacing: '-0.04em',
							color: hasData ? 'text.primary' : 'text.secondary',
						}}
					>
						{formatLatency(latency)}
					</Typography>
				</Stack>

				<Sparkline points={region.series.series} color={color} height={46} label={`${region.label}延迟趋势`} />

				<Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
					<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
						p95 <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatLatency(region.p95_ms)}</Box>
					</Typography>
					<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
						可用率{' '}
						<Box component="span" sx={{ color: hasData ? color : 'text.secondary', fontWeight: 700 }}>
							{formatPercent(region.availability)}
						</Box>
					</Typography>
				</Stack>
				<Typography variant="caption" color="text.secondary">
					{hasData ? `上次检测：${formatAgoShort(region.last_checked_at, now)}` : '尚未获取到探针数据'}
				</Typography>
			</Stack>
		</Paper>
	);
}
