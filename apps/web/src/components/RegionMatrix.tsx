import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { ModelHealth, RegionInfo } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '../constants';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { StatusDot } from './StatusDot';

export function RegionMatrix({
	models,
	regions,
	now,
}: {
	models: ModelHealth[];
	regions: RegionInfo[];
	now: number;
}) {
	return (
		<TableContainer sx={{ maxWidth: '100%' }}>
			<Table size="small" aria-label="模型地区矩阵" sx={{ minWidth: 640 }}>
				<TableHead>
					<TableRow>
						<TableCell sx={{ minWidth: 220 }}>模型</TableCell>
						{regions.map((region) => (
							<TableCell key={region.id} align="center" sx={{ minWidth: 130 }}>
								<Stack direction="row" spacing={0.6} alignItems="center" justifyContent="center">
									<StatusDot status={region.status} size={7} pulse={false} />
									{region.label}
								</Stack>
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{models.map((model) => (
						<TableRow key={model.id} hover>
							<TableCell>
								<Stack spacing={0.25}>
									<Typography
										variant="body2"
										sx={{
											fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
											fontSize: '0.75rem',
											overflowWrap: 'anywhere',
										}}
									>
										{model.model}
									</Typography>
									<Typography variant="caption" color="text.secondary">
										{TYPE_LABELS[model.type]}
									</Typography>
								</Stack>
							</TableCell>
							{regions.map((region) => {
								const stats = model.regions[region.id];
								const hasData = (stats?.total_count ?? 0) > 0;
								const status = stats?.status ?? 'unknown';
								return (
									<TableCell key={region.id} align="center" sx={{ p: 0.75 }}>
										<Tooltip
											arrow
											title={
												hasData
													? `${region.label} · ${STATUS_LABELS[status]} · 平均 ${formatLatency(stats?.avg_latency_ms ?? null)} · p95 ${formatLatency(stats?.p95_ms ?? null)} · 上次检测 ${formatAgoShort(stats?.last_checked_at ?? null, now)}`
													: `${region.label} · 该地区暂无数据`
											}
										>
											<Box
												sx={{
													borderRadius: '8px',
													px: 1,
													py: 0.75,
													bgcolor: STATUS_BACKGROUNDS[status],
													color: hasData ? 'text.primary' : 'text.secondary',
													minWidth: 96,
												}}
											>
												<Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', display: 'block' }}>
													{hasData ? formatPercent(stats?.availability ?? null) : '无数据'}
												</Typography>
												<Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', display: 'block' }}>
													{hasData ? formatLatency(stats?.p95_ms ?? null) : '—'}
												</Typography>
											</Box>
										</Tooltip>
									</TableCell>
								);
							})}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
}
