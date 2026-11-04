import { Box, Chip, Divider, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PublicRounded from '@mui/icons-material/PublicRounded';
import type { GatewayEndpoint, OverviewResponse, WindowKey } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS } from '../constants';
import { formatAgoShort, formatPercent } from '../format';
import { RegionCard } from './RegionCard';
import { StatusDot } from './StatusDot';

function EndpointChip({ endpoint, now }: { endpoint: GatewayEndpoint; now: number }) {
	const color = STATUS_COLORS[endpoint.status];
	const availability = endpoint.stats['5h']?.availability ?? null;
	return (
		<Tooltip
			arrow
			title={`${endpoint.label} · ${STATUS_LABELS[endpoint.status]} · 5h 可用率 ${formatPercent(availability)} · 上次检测 ${formatAgoShort(endpoint.last_checked_at, now)}`}
		>
			<Chip
				size="small"
				icon={<Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, ml: 1.1 }} />}
				label={endpoint.label}
				sx={{
					bgcolor: STATUS_BACKGROUNDS[endpoint.status],
					color: 'text.primary',
					border: '1px solid transparent',
					'& .MuiChip-icon': { ml: 0.9 },
					fontVariantNumeric: 'tabular-nums',
				}}
			/>
		</Tooltip>
	);
}

export function GatewayHealthCard({
	overview,
	regionFilter,
	onRegionSelect,
	now,
	windowKey,
}: {
	overview: OverviewResponse;
	regionFilter: string;
	onRegionSelect: (region: string) => void;
	now: number;
	windowKey: WindowKey;
}) {
	const { gateway } = overview;
	const statusColor = STATUS_COLORS[gateway.status];

	return (
		<Paper
			variant="outlined"
			sx={{
				position: 'relative',
				overflow: 'hidden',
				p: { xs: 2, sm: 3 },
				borderRadius: '20px',
				background: `linear-gradient(135deg, ${alpha(statusColor, 0.08)} 0%, #ffffff 42%, #ffffff 100%)`,
				'&::after': {
					content: '""',
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					backgroundImage:
						'radial-gradient(circle at 1px 1px, rgba(29,43,67,0.055) 1px, transparent 0)',
					backgroundSize: '18px 18px',
					maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.55), transparent 55%)',
				},
			}}
		>
			<Stack spacing={2.25} sx={{ position: 'relative', zIndex: 1 }}>
				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'flex-start' }}>
					<Stack spacing={0.75} sx={{ minWidth: 0 }}>
						<Stack direction="row" spacing={0.75} alignItems="center">
							<PublicRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
							<Typography variant="caption" sx={{ letterSpacing: '0.12em', fontWeight: 700, color: 'text.secondary' }}>
								GATEWAY HEALTH
							</Typography>
							{overview.mode === 'mock' ? (
								<Chip size="small" label="MOCK" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.625rem' }} />
							) : null}
						</Stack>
						<Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
							<StatusDot status={gateway.status} size={11} />
							<Typography component="h2" variant="h4" sx={{ fontSize: { xs: '1.55rem', sm: '1.8rem' } }}>
								{STATUS_LABELS[gateway.status]}
							</Typography>
						</Stack>
						<Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="baseline">
							<Typography variant="body2" color="text.secondary">
								Global availability{' '}
								<Box component="span" sx={{ color: gateway.availability === null ? 'text.secondary' : statusColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
									{formatPercent(gateway.availability)}
								</Box>
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{gateway.last_checked_at ? `上次检测：${formatAgoShort(gateway.last_checked_at, now)}` : '等待首次同步'}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{windowKey} 窗口
							</Typography>
						</Stack>
					</Stack>

					<Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
						{gateway.endpoints.map((endpoint) => (
							<EndpointChip key={endpoint.id} endpoint={endpoint} now={now} />
						))}
					</Stack>
				</Stack>

				<Divider />

				<Stack spacing={1.25}>
					<Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
						<Typography variant="caption" sx={{ letterSpacing: '0.12em', fontWeight: 700, color: 'text.secondary' }}>
							GLOBAL NETWORK
						</Typography>
						<Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
							点击地区卡片切换到该地区视图
						</Typography>
					</Stack>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
							gap: 1.5,
						}}
					>
						{gateway.regions.map((region) => (
							<RegionCard
								key={region.id}
								region={region}
								selected={regionFilter === region.id}
								onSelect={() => onRegionSelect(regionFilter === region.id ? 'all' : region.id)}
								now={now}
							/>
						))}
					</Box>
				</Stack>
			</Stack>
		</Paper>
	);
}
