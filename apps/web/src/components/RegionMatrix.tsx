import { Box, ButtonBase, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { ModelHealth, RegionInfo } from '../api';
import { size, STATUS_META, statusSoft, statusText, v, weight } from '../design/tokens';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { ModelIcon } from './ModelIcon';
import { ModelName } from './ModelName';
import { RegionMark } from './ModelTable';
import { TYPE_LABELS } from '../constants';

/**
 * Model × region comparison. Healthy cells stay on the plain surface; only cells
 * that need attention get a tinted background, so problems stand out.
 */
export function RegionMatrix({
	models,
	regions,
	selected,
	now,
	onOpen,
}: {
	models: ModelHealth[];
	regions: RegionInfo[];
	selected: string;
	now: number;
	onOpen: (model: ModelHealth) => void;
}) {
	return (
		<TableContainer sx={{ border: 0, borderRadius: 0 }}>
			<Table size="small" aria-label="模型地区对比" sx={{ minWidth: 300 + regions.length * 120 }}>
				<TableHead>
					<TableRow>
						<TableCell sx={{ minWidth: 300, width: '28%' }}>模型</TableCell>
						{regions.map((region) => (
							<TableCell
								key={region.id}
								align="center"
								sx={{ minWidth: 112, ...(selected === region.id ? { color: v('brandText'), boxShadow: `inset 0 -2px 0 ${v('brand')}` } : null) }}
							>
								{region.label}
								<Box component="span" sx={{ ml: 0.5, fontFamily: 'var(--font-mono)', color: v('text3') }}>
									{region.code}
								</Box>
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{models.map((model) => (
						<TableRow key={model.id} hover>
							<TableCell sx={{ py: 1 }}>
								<ButtonBase onClick={() => onOpen(model)} aria-label={`查看 ${model.model} 详情`} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', minWidth: 0, width: '100%', justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1 }}>
									<ModelIcon model={model.model} size={24} />
									<Box sx={{ minWidth: 0 }}>
										<ModelName name={model.model} fontSize={size.sm} />
										<Typography component="span" sx={{ display: 'block', fontSize: size.xs, color: v('text3'), mt: 0.25 }}>
											{TYPE_LABELS[model.type]}
										</Typography>
									</Box>
								</ButtonBase>
							</TableCell>
							{regions.map((region) => {
								const stats = model.regions[region.id];
								const status = stats?.status ?? 'unknown';
								const hasData = (stats?.total_count ?? 0) > 0;
								const bad = status === 'outage' || status === 'degraded';
								return (
									<TableCell key={region.id} align="center" sx={{ p: 0.5 }}>
										<Tooltip
											title={
												hasData
													? `${region.label} · ${STATUS_META[status].label} · 均值 ${formatLatency(stats?.avg_latency_ms)} · P95 ${formatLatency(stats?.p95_ms)} · 检测于 ${formatAgoShort(stats?.last_checked_at ?? null, now)}`
													: `${region.label} · 暂无检测数据`
											}
										>
											<Stack
												spacing={0.25}
												alignItems="center"
												sx={{ borderRadius: 1, py: 0.75, bgcolor: bad ? statusSoft(status) : 'transparent', fontVariantNumeric: 'tabular-nums' }}
											>
												<Stack direction="row" spacing={0.75} alignItems="center">
													<RegionMark status={status} size={10} />
													<Typography component="span" sx={{ fontSize: size.sm, fontWeight: weight.semibold, color: bad ? statusText(status) : hasData ? v('text1') : v('text3') }}>
														{hasData ? formatPercent(stats!.availability) : '无数据'}
													</Typography>
												</Stack>
												<Typography component="span" sx={{ fontSize: size.xs, color: v('text2') }}>
													P95 {hasData ? formatLatency(stats?.p95_ms) : '—'}
												</Typography>
											</Stack>
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
