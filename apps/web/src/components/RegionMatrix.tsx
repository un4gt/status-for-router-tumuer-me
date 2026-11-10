import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import type { ModelHealth, RegionInfo } from '../api';
import { STATUS_BACKGROUNDS, STATUS_BORDERS, STATUS_COLORS, STATUS_LABELS, TYPE_LABELS, TYPE_STYLES } from '../constants';
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
		<TableContainer
			sx={{
				maxWidth: '100%',
				scrollbarWidth: 'none',
				'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
			}}
		>
			<Table size="small" aria-label="模型地区矩阵" sx={{ minWidth: 640 }}>
				<TableHead>
					<TableRow>
						<TableCell sx={{ minWidth: 230, color: '#64748b', fontWeight: 700, fontSize: '0.72rem' }}>模型 / 服务类型</TableCell>
						{regions.map((region) => (
							<TableCell key={region.id} align="center" sx={{ minWidth: 130, color: '#64748b', fontWeight: 700, fontSize: '0.72rem' }}>
								<Stack direction="row" spacing={0.6} alignItems="center" justifyContent="center">
									<StatusDot status={region.status} size={7} pulse={false} />
									<span>{region.label}</span>
									<Box
										component="span"
										sx={{
											px: 0.5,
											py: 0.05,
											borderRadius: '4px',
											bgcolor: '#f1f5f9',
											color: '#64748b',
											fontSize: '0.625rem',
											fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
										}}
									>
										{region.code}
									</Box>
								</Stack>
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{models.map((model) => {
						const typeStyle = TYPE_STYLES[model.type] ?? TYPE_STYLES.model;
						return (
							<TableRow key={model.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
								<TableCell sx={{ py: 1 }}>
									<Stack spacing={0.4} alignItems="flex-start">
										<Typography
											variant="body2"
											sx={{
												fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
												fontSize: '0.78rem',
												fontWeight: 700,
												color: '#0f172a',
												overflowWrap: 'anywhere',
											}}
										>
											{model.model}
										</Typography>
										<Box
											component="span"
											sx={{
												display: 'inline-flex',
												alignItems: 'center',
												px: 0.65,
												py: 0.1,
												borderRadius: '5px',
												fontSize: '0.64rem',
												fontWeight: 650,
												color: typeStyle.color,
												bgcolor: typeStyle.bg,
												border: '1px solid',
												borderColor: typeStyle.border,
												lineHeight: 1.3,
											}}
										>
											{TYPE_LABELS[model.type]}
										</Box>
									</Stack>
								</TableCell>
								{regions.map((region) => {
									const stats = model.regions[region.id];
									const hasData = (stats?.total_count ?? 0) > 0;
									const status = stats?.status ?? 'unknown';
									return (
										<TableCell key={region.id} align="center" sx={{ p: 0.65 }}>
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
														py: 0.6,
														bgcolor: STATUS_BACKGROUNDS[status],
														border: '1px solid',
														borderColor: STATUS_BORDERS[status],
														color: hasData ? 'text.primary' : 'text.secondary',
														minWidth: 96,
													}}
												>
													<Typography
														variant="caption"
														fontWeight={750}
														sx={{
															fontVariantNumeric: 'tabular-nums',
															display: 'block',
															color: hasData ? STATUS_COLORS[status] : 'text.secondary',
														}}
													>
														{hasData ? formatPercent(stats?.availability ?? null) : '无数据'}
													</Typography>
													<Typography
														variant="caption"
														sx={{
															fontVariantNumeric: 'tabular-nums',
															display: 'block',
															fontSize: '0.68rem',
															color: '#64748b',
														}}
													>
														p95 {hasData ? formatLatency(stats?.p95_ms ?? null) : '—'}
													</Typography>
												</Box>
											</Tooltip>
										</TableCell>
									);
								})}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</TableContainer>
	);
}
