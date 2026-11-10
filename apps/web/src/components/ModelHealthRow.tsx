import { Box, Chip, Collapse, IconButton, Stack, Table, TableBody, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { useState } from 'react';
import type { ModelHealth, RegionInfo, RegionStats, WindowKey } from '../api';
import {
	STATUS_BACKGROUNDS,
	STATUS_BORDERS,
	STATUS_COLORS,
	STATUS_LABELS,
	TYPE_LABELS,
	TYPE_STYLES,
	availabilityStatus,
} from '../constants';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { UptimeBar } from './UptimeBar';
import { StatusDot } from './StatusDot';
import { latencyTier, TIER_TEXT } from '../latency';

function emptyRegionStats(series: ModelHealth['series'], status: RegionStats['status'] = 'unknown'): RegionStats {
	return {
		status,
		availability: null,
		total_count: 0,
		success_count: 0,
		avg_latency_ms: null,
		p95_ms: null,
		last_status: null,
		last_checked_at: null,
		last_latency_ms: null,
		series,
	};
}

function SelectedRegionStats({ model, regionFilter }: { model: ModelHealth; regionFilter: string }) {
	if (regionFilter === 'all') {
		return {
			stats: {
				status: model.status,
				availability: model.availability,
				total_count: model.total_count,
				success_count: model.success_count,
				avg_latency_ms: model.avg_latency_ms,
				p95_ms: model.p95_ms,
				last_status: model.last_status,
				last_checked_at: model.last_checked_at,
				last_latency_ms: null,
				series: model.series,
			} satisfies RegionStats,
			series: model.series,
		};
	}
	const region = model.regions[regionFilter] ?? emptyRegionStats(model.series);
	return { stats: region, series: region.series };
}

export function ModelHealthRow({
	model,
	regions,
	regionFilter,
	windowKey,
	now,
	onRegionSelect,
	expanded: controlledExpanded,
	onExpandedChange,
}: {
	model: ModelHealth;
	regions: RegionInfo[];
	regionFilter: string;
	windowKey: WindowKey;
	now: number;
	onRegionSelect: (region: string) => void;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
}) {
	const [localExpanded, setLocalExpanded] = useState(false);
	const expanded = controlledExpanded ?? localExpanded;
	const setExpanded = onExpandedChange ?? setLocalExpanded;
	const { stats, series } = SelectedRegionStats({ model, regionFilter });
	const computedStatus = availabilityStatus(stats.availability, stats.total_count);
	const availabilityChipStatus =
		regionFilter === 'all'
			? stats.last_status === 'failure'
				? stats.status
				: computedStatus
			: stats.status === 'unknown'
				? computedStatus
				: stats.status;
	const hasData = stats.total_count > 0;
	const probeMissing = !model.probe_configured;
	const regionDetailUnavailable = model.total_count > 0 && Object.values(model.regions).every((region) => region.total_count === 0);
	const color = STATUS_COLORS[availabilityChipStatus];
	const typeStyle = TYPE_STYLES[model.type] ?? TYPE_STYLES.model;

	return (
		<Box
			sx={{
				'--model-name-width': { md: '300px', lg: '336px' },
				'--model-stats-width': { md: '215px', lg: '235px' },
				'--model-regions-width': { md: '148px', lg: '160px' },
				px: { xs: 1.25, md: 1.5 },
				py: { xs: 1, md: 1.1 },
				'@media (min-width: 900px) and (max-height: 860px)': { py: 0.85 },
				borderRadius: '10px',
				opacity: model.enabled ? 1 : 0.62,
				transition: 'background-color 140ms ease, border-color 140ms ease, opacity 160ms ease',
				border: '1px solid transparent',
				'&:hover': { bgcolor: '#f8fafc', borderColor: '#eef2f6' },
				'& + &': { borderTop: '1px solid #f1f5f9' },
			}}
		>
			<Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 2 }} alignItems={{ md: 'center' }}>
				<Stack
					data-model-identity
					direction="row"
					spacing={1}
					alignItems="center"
					sx={{ minWidth: 0, width: { md: 'var(--model-name-width)' }, flexShrink: 0 }}
				>
					<StatusDot status={availabilityChipStatus} size={8} />
					<Tooltip title={model.model} arrow disableInteractive>
						<Typography
							variant="subtitle1"
							fontWeight={400}
							noWrap
							sx={{
								fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
								fontSize: '0.825rem',
								color: '#0f172a',
								lineHeight: 1.3,
								minWidth: 0,
							}}
						>
							{model.model}
						</Typography>
					</Tooltip>
					<Box
						component="span"
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							flexShrink: 0,
							px: 0.7,
							py: 0.15,
							borderRadius: '6px',
							fontSize: '0.675rem',
							fontWeight: 600,
							color: typeStyle.color,
							bgcolor: typeStyle.bg,
							border: '1px solid',
							borderColor: typeStyle.border,
							lineHeight: 1.25,
						}}
					>
						{TYPE_LABELS[model.type]}
					</Box>
					{!model.enabled ? (
						<Chip size="small" variant="outlined" label="已停用" sx={{ height: 18, fontSize: '0.65rem', color: 'text.secondary' }} />
					) : null}
					{probeMissing ? (
						<Chip
							size="small"
							variant="outlined"
							label="未配置拨测"
							sx={{ height: 18, fontSize: '0.65rem', color: 'warning.dark', borderColor: '#fde68a', bgcolor: '#fffbeb' }}
						/>
					) : null}
					{regionDetailUnavailable ? (
						<Chip
							size="small"
							variant="outlined"
							label="地区明细不可用"
							sx={{ height: 18, fontSize: '0.65rem', color: 'text.secondary' }}
						/>
					) : null}
				</Stack>

				<Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: { md: 'var(--model-stats-width)' }, flexShrink: 0 }}>
					<Chip
						size="small"
						label={hasData ? formatPercent(stats.availability) : probeMissing ? '待配置' : '无数据'}
						sx={{
							minWidth: 68,
							height: 24,
							fontWeight: 700,
							fontSize: '0.74rem',
							fontVariantNumeric: 'tabular-nums',
							bgcolor: STATUS_BACKGROUNDS[availabilityChipStatus],
							color,
							border: '1px solid',
							borderColor: STATUS_BORDERS[availabilityChipStatus],
						}}
					/>
					<Stack direction="row" spacing={0.6} alignItems="baseline" sx={{ minWidth: 0, whiteSpace: 'nowrap' }}>
						<Typography
							component="span"
							sx={{
								color: TIER_TEXT[latencyTier(stats.last_latency_ms ?? stats.avg_latency_ms, stats.last_status === 'failure')],
								fontSize: '0.78rem',
								fontWeight: 650,
								fontVariantNumeric: 'tabular-nums',
							}}
						>
							{formatLatency(stats.avg_latency_ms)}
						</Typography>
						<Typography component="span" sx={{ color: '#94a3b8', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
							p95 {formatLatency(stats.p95_ms)}
						</Typography>
					</Stack>
				</Stack>

				<Box sx={{ flexGrow: 1, minWidth: 0, px: { md: 0.5 } }}>
					<UptimeBar loading={false} timeseries={hasData ? series : null} height={16} />
				</Box>

				<Stack
					direction="row"
					spacing={0.75}
					alignItems="center"
					justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
					sx={{ width: { md: 'var(--model-regions-width)' }, flexShrink: 0 }}
				>
					<Stack
						direction="row"
						spacing={0.35}
						alignItems="center"
						sx={{
							px: 0.75,
							py: 0.35,
							borderRadius: '999px',
							bgcolor: '#f8fafc',
							border: '1px solid #eef2f6',
						}}
					>
						{regions.map((region) => {
							const regionStats = model.regions[region.id];
							const status = regionStats?.status ?? 'unknown';
							const isSelected = regionFilter === region.id;
							return (
								<Tooltip
									key={region.id}
									arrow
									title={`${region.label} · ${STATUS_LABELS[status]} · 可用率 ${formatPercent(regionStats?.availability ?? null)} · p95 ${formatLatency(regionStats?.p95_ms ?? null)}`}
								>
									<IconButton
										size="small"
										aria-label={`查看 ${region.label} 的模型状态`}
										onClick={() => onRegionSelect(region.id)}
										sx={{
											width: 20,
											height: 20,
											p: 0,
											bgcolor: isSelected ? '#eff6ff' : 'transparent',
											boxShadow: isSelected ? '0 0 0 1.5px #3b82f6' : 'none',
											'&:hover': { bgcolor: '#e2e8f0' },
										}}
									>
										<StatusDot status={status} size={7} pulse={false} />
									</IconButton>
								</Tooltip>
							);
						})}
					</Stack>
					<IconButton
						size="small"
						aria-label={expanded ? '收起分地区明细' : '展开分地区明细'}
						aria-expanded={expanded}
						onClick={() => setExpanded(!expanded)}
						sx={{
							width: 26,
							height: 26,
							color: '#64748b',
							'&:hover': { bgcolor: '#f1f5f9', color: '#0f172a' },
						}}
					>
						<ExpandMoreRounded
							fontSize="small"
							sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
						/>
					</IconButton>
				</Stack>
			</Stack>

			<Collapse in={expanded} timeout={180} unmountOnExit>
				<Box
					sx={{
						mt: 1,
						ml: { md: 'calc(var(--model-name-width) + 16px)' },
						overflowX: 'auto',
						scrollbarWidth: 'none',
						'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
						borderRadius: '10px',
						border: '1px solid #eef2f6',
						bgcolor: '#f8fafc',
						px: 1,
						py: 0.5,
					}}
				>
					<Table size="small" aria-label={`${model.model} 分地区明细`}>
						<TableBody>
							{regions.map((region) => {
								const regionStats = model.regions[region.id];
								const hasRegionData = (regionStats?.total_count ?? 0) > 0;
								const rStatus = regionStats?.status ?? 'unknown';
								return (
									<TableRow key={region.id} hover sx={{ '& td': { borderColor: '#eef2f6', py: 0.6 } }}>
										<TableCell sx={{ width: 1, whiteSpace: 'nowrap' }}>
											<Stack direction="row" spacing={0.75} alignItems="center">
												<StatusDot status={rStatus} size={7} pulse={false} />
												<Typography variant="caption" fontWeight={700} sx={{ color: '#1e293b' }}>
													{region.label}
												</Typography>
											</Stack>
										</TableCell>
										<TableCell
											sx={{
												whiteSpace: 'nowrap',
												fontVariantNumeric: 'tabular-nums',
												fontWeight: 700,
												fontSize: '0.75rem',
												color: hasRegionData ? STATUS_COLORS[rStatus] : 'text.secondary',
											}}
										>
											{hasRegionData ? formatPercent(regionStats.availability) : '无数据'}
										</TableCell>
										<TableCell
											sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'text.secondary', fontSize: '0.75rem' }}
										>
											均值 {formatLatency(regionStats?.avg_latency_ms ?? null)}
										</TableCell>
										<TableCell
											sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'text.secondary', fontSize: '0.75rem' }}
										>
											p95 {formatLatency(regionStats?.p95_ms ?? null)}
										</TableCell>
										<TableCell sx={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '0.72rem' }}>
											{formatAgoShort(regionStats?.last_checked_at ?? null, now)}
										</TableCell>
										<TableCell sx={{ minWidth: 220 }}>
											<UptimeBar loading={false} timeseries={hasRegionData ? regionStats.series : null} height={12} />
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</Box>
			</Collapse>
		</Box>
	);
}
