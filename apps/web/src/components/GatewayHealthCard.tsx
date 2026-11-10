import { Box, Divider, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { GatewayEndpoint, OverviewResponse, WindowKey } from '../api';
import { STATUS_BACKGROUNDS, STATUS_BORDERS, STATUS_COLORS, STATUS_LABELS } from '../constants';
import { formatAgoShort, formatPercent } from '../format';
import { RegionCard } from './RegionCard';
import { StatusDot } from './StatusDot';

function EndpointChip({ endpoint, now, windowKey }: { endpoint: GatewayEndpoint; now: number; windowKey: WindowKey }) {
	const color = STATUS_COLORS[endpoint.status];
	const availability = endpoint.stats[windowKey]?.availability ?? endpoint.stats['5h']?.availability ?? null;
	return (
		<Tooltip
			arrow
			title={`${endpoint.label} · ${STATUS_LABELS[endpoint.status]} · 可用率 ${formatPercent(availability)} · 上次检测 ${formatAgoShort(endpoint.last_checked_at, now)}`}
		>
			<Box
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.15,
					py: 0.4,
					borderRadius: '999px',
					bgcolor: '#f8fafc',
					border: '1px solid #e2e8f0',
					transition: 'border-color 140ms ease, background-color 140ms ease',
					'&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' },
				}}
			>
				<Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
				<Typography
					component="span"
					sx={{
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
						fontSize: '0.73rem',
						fontWeight: 600,
						color: '#334155',
						lineHeight: 1.2,
					}}
				>
					{endpoint.method} {endpoint.path}
				</Typography>
			</Box>
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
				p: { xs: 1.25, md: 1.5 },
				'@media (min-width: 900px) and (max-height: 750px)': { p: 1.1 },
				borderRadius: '16px',
				background: `linear-gradient(135deg, ${alpha(statusColor, 0.055)} 0%, #ffffff 38%, #ffffff 100%)`,
			}}
		>
			<Stack spacing={1.1} sx={{ position: 'relative', zIndex: 1 }}>
				<Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
					<Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center" sx={{ minWidth: 0 }}>
						<Box
							sx={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 0.85,
								px: 1.2,
								py: 0.35,
								borderRadius: '999px',
								bgcolor: STATUS_BACKGROUNDS[gateway.status],
								border: '1px solid',
								borderColor: STATUS_BORDERS[gateway.status],
							}}
						>
							<StatusDot status={gateway.status} size={8} />
							<Typography component="h2" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: statusColor, lineHeight: 1.2 }}>
								网关{STATUS_LABELS[gateway.status]}
							</Typography>
						</Box>

						<Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center">
							<Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
								可用率{' '}
								<Box
									component="span"
									sx={{
										color: gateway.availability === null ? 'text.secondary' : statusColor,
										fontWeight: 750,
										fontVariantNumeric: 'tabular-nums',
										ml: 0.25,
									}}
								>
									{formatPercent(gateway.availability)}
								</Box>
							</Typography>
							<Box component="span" sx={{ color: '#cbd5e1', display: { xs: 'none', sm: 'inline' } }}>
								·
							</Box>
							<Typography variant="caption" sx={{ color: 'text.secondary' }}>
								{gateway.last_checked_at ? `更新于 ${formatAgoShort(gateway.last_checked_at, now)}` : '等待首次同步'}
							</Typography>
						</Stack>
					</Stack>

					<Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
						{gateway.endpoints.map((endpoint) => (
							<EndpointChip key={endpoint.id} endpoint={endpoint} now={now} windowKey={windowKey} />
						))}
					</Stack>
				</Stack>

				<Divider sx={{ borderColor: 'rgba(226, 232, 240, 0.75)' }} />

				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, minmax(0, 1fr))',
							md: 'repeat(5, minmax(0, 1fr))',
						},
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
		</Paper>
	);
}
