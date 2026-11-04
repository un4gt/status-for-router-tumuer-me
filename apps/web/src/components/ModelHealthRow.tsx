import { Box, Chip, Collapse, IconButton, Stack, Table, TableBody, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { useState } from 'react';
import type { ModelHealth, RegionInfo, RegionStats, WindowKey } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS, availabilityStatus } from '../constants';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { UptimeBar } from './UptimeBar';
import { StatusDot } from './StatusDot';

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
}: {
	model: ModelHealth;
	regions: RegionInfo[];
	regionFilter: string;
	windowKey: WindowKey;
	now: number;
	onRegionSelect: (region: string) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const { stats, series } = SelectedRegionStats({ model, regionFilter });
	const availabilityChipStatus = stats.status === 'unknown' ? availabilityStatus(stats.availability, stats.total_count) : stats.status;
	const hasData = stats.total_count > 0;
	const probeMissing = !model.probe_configured;
	const regionDetailUnavailable =
		model.total_count > 0 && Object.values(model.regions).every((region) => region.total_count === 0);
	const color = STATUS_COLORS[availabilityChipStatus];

	return (
		<Box
			sx={{
				py: 1.5,
				opacity: model.enabled ? 1 : 0.62,
				transition: 'opacity 160ms ease',
				'& + &': { borderTop: '1px solid', borderColor: 'divider' },
			}}
		>
			<Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.25, md: 2 }} alignItems={{ md: 'center' }}>
				<Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, width: { md: '34%' }, flexShrink: 0 }}>
					<StatusDot status={availabilityChipStatus} size={8} />
					<Box sx={{ minWidth: 0, flex: 1 }}>
						<Typography
							variant="subtitle1"
							fontWeight={600}
							sx={{
								fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
								fontSize: '0.8125rem',
								overflowWrap: 'anywhere',
								lineHeight: 1.45,
							}}
						>
							{model.model}
						</Typography>
						<Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.5 }}>
							<Chip
								size="small"
								variant="outlined"
								label={TYPE_LABELS[model.type]}
								sx={{ height: 20, fontSize: '0.6875rem', borderColor: 'divider' }}
							/>
							{!model.enabled ? (
								<Chip size="small" variant="outlined" label="已停用" sx={{ height: 20, fontSize: '0.6875rem', color: 'text.secondary' }} />
							) : null}
							{probeMissing ? (
								<Chip
									size="small"
									variant="outlined"
									label="未配置拨测"
									sx={{ height: 20, fontSize: '0.6875rem', color: 'warning.dark', borderColor: '#ecd9ae', bgcolor: '#fff8e8' }}
								/>
							) : null}
							{regionDetailUnavailable ? (
								<Chip
									size="small"
									variant="outlined"
									label="地区明细不可用"
									sx={{ height: 20, fontSize: '0.6875rem', color: 'text.secondary' }}
								/>
							) : null}
						</Stack>
					</Box>
				</Stack>

				<Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: { md: 210 }, flexShrink: 0 }}>
					<Chip
						size="small"
						label={hasData ? formatPercent(stats.availability) : probeMissing ? '待配置' : '无数据'}
						sx={{
							minWidth: 72,
							fontWeight: 700,
							fontVariantNumeric: 'tabular-nums',
							bgcolor: STATUS_BACKGROUNDS[availabilityChipStatus],
							color,
							border: '1px solid transparent',
						}}
					/>
					<Box sx={{ minWidth: 0 }}>
						<Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
							平均 {formatLatency(stats.avg_latency_ms)}
						</Typography>
						<Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
							p95 {formatLatency(stats.p95_ms)}
						</Typography>
					</Box>
				</Stack>

				<Box sx={{ flexGrow: 1, minWidth: 0 }}>
					<UptimeBar loading={false} timeseries={hasData ? series : null} height={16} />
					<Stack direction="row" justifyContent="space-between" spacing={1}>
						<Typography variant="caption" color="text.secondary">
							{hasData ? `${windowKey} 窗口` : '—'}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{hasData ? `上次检测：${formatAgoShort(stats.last_checked_at, now)}` : '尚无检测记录'}
						</Typography>
					</Stack>
				</Box>

				<Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexShrink: 0 }}>
					{regions.map((region) => {
						const regionStats = model.regions[region.id];
						const status = regionStats?.status ?? 'unknown';
						return (
							<Tooltip
								key={region.id}
								arrow
								title={`${region.label} · ${STATUS_LABELS[status]} · 可用率 ${formatPercent(regionStats?.availability ?? null)} · p95 ${formatLatency(regionStats?.p95_ms ?? null)}`}
							>
								<Box
									component="button"
									type="button"
									aria-label={`查看 ${region.label} 的模型状态`}
									onClick={() => onRegionSelect(region.id)}
									sx={{
										border: 0,
										background: 'transparent',
										p: 0.4,
										cursor: 'pointer',
										borderRadius: '50%',
										display: 'inline-flex',
										'&:focus-visible': { outline: '2px solid #b7c9ff', outlineOffset: 1 },
									}}
								>
									<StatusDot status={status} size={regionFilter === region.id ? 10 : 7} pulse={false} />
								</Box>
							</Tooltip>
						);
					})}
					<IconButton
						size="small"
						aria-label={expanded ? '收起分地区明细' : '展开分地区明细'}
						aria-expanded={expanded}
						onClick={() => setExpanded((value) => !value)}
						sx={{ ml: 0.5 }}
					>
						<ExpandMoreRounded
							fontSize="small"
							sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
						/>
					</IconButton>
				</Stack>
			</Stack>

			<Collapse in={expanded} timeout={180} unmountOnExit>
				<Box sx={{ mt: 1.25, ml: { md: 'calc(34% + 12px)' }, overflowX: 'auto' }}>
					<Table size="small" aria-label={`${model.model} 分地区明细`}>
						<TableBody>
							{regions.map((region) => {
								const regionStats = model.regions[region.id];
								const hasRegionData = (regionStats?.total_count ?? 0) > 0;
								return (
									<TableRow key={region.id} hover>
										<TableCell sx={{ width: 1, whiteSpace: 'nowrap' }}>
											<Stack direction="row" spacing={0.75} alignItems="center">
												<StatusDot status={regionStats?.status ?? 'unknown'} size={7} pulse={false} />
												<Typography variant="caption" fontWeight={600}>
													{region.label}
												</Typography>
											</Stack>
										</TableCell>
										<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
											{hasRegionData ? formatPercent(regionStats.availability) : '无数据'}
										</TableCell>
										<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
											平均 {formatLatency(regionStats?.avg_latency_ms ?? null)}
										</TableCell>
										<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
											p95 {formatLatency(regionStats?.p95_ms ?? null)}
										</TableCell>
										<TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
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
