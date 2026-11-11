import { Box, ButtonBase, Drawer, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useState } from 'react';
import type { ModelHealth, RegionInfo, WindowKey } from '../api';
import { motion, radius, size, STATUS_META, statusGlow, statusText, v, weight } from '../design/tokens';
import { formatAgoShort, formatLatency, formatPercent } from '../format';
import { brandFor } from '../modelBrand';
import { ModelIcon } from './ModelIcon';
import { ProbeTrend } from './ProbeTrend';
import { StatusBadge, StatusGlyph } from './StatusBadge';
import { TypeTag } from './TypeTag';
import { UptimeStrip } from './UptimeStrip';
import { Icon, X } from '../design/icons';

/**
 * Everything about one model: per-region figures and timelines, then the
 * latency trend and recent checks for the chosen region. Right-side panel on
 * desktop, bottom sheet on phones.
 */
export function ModelDrawer({
	model,
	regions,
	initialRegion,
	windowKey,
	windowLabel,
	revision,
	now,
	onClose,
}: {
	model: ModelHealth | null;
	regions: RegionInfo[];
	initialRegion: string;
	windowKey: WindowKey;
	windowLabel: string;
	revision: number;
	now: number;
	onClose: () => void;
}) {
	const phone = useMediaQuery('(max-width: 599.95px)');
	const fallbackRegion = () => {
		if (!model) return regions[0]?.id ?? '';
		if (initialRegion !== 'all') return initialRegion;
		// Open on the region that needs attention, otherwise the first one.
		const worst = regions.find((region) => {
			const status = model.regions[region.id]?.status;
			return status === 'outage' || status === 'degraded';
		});
		return (worst ?? regions[0])?.id ?? '';
	};
	const [region, setRegion] = useState(fallbackRegion);
	useEffect(() => setRegion(fallbackRegion()), [model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<Drawer
			anchor={phone ? 'bottom' : 'right'}
			open={!!model}
			onClose={onClose}
			PaperProps={{
				'aria-labelledby': 'model-drawer-title',
				sx: {
					width: phone ? '100%' : 'min(580px, calc(100vw - 24px))',
					maxHeight: phone ? '90dvh' : 'calc(100% - 24px)',
					height: phone ? 'auto' : 'calc(100% - 24px)',
					m: phone ? 0 : '12px',
					borderRadius: phone ? `${radius.section + 4}px ${radius.section + 4}px 0 0` : `${radius.section + 2}px`,
					bgcolor: v('surface'),
					backgroundImage: 'none',
					overflow: 'hidden',
					pb: 'env(safe-area-inset-bottom)',
				},
			}}
		>
			{model && (
				<Stack sx={{ height: '100%', minHeight: 0 }}>
					{phone ? <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: v('borderStrong'), mx: 'auto', mt: 1 }} /> : null}
					<Box sx={{ position: 'relative', px: 3, pt: phone ? 1.5 : 2.75, pb: 2.5, borderBottom: `1px solid ${v('border')}`, background: `linear-gradient(180deg, ${statusGlow(model.status)}, transparent)` }}>
						<IconButton aria-label="关闭详情" onClick={onClose} sx={{ position: 'absolute', top: phone ? 8 : 16, right: 16, width: 32, height: 32 }}>
							<Icon icon={X} size={18} />
						</IconButton>
						<Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, pr: 5 }}>
							<StatusBadge status={model.status} />
							<TypeTag type={model.type} />
						</Stack>
						<Stack direction="row" spacing={1.5} alignItems="center" sx={{ pr: 4 }}>
							<ModelIcon model={model.model} size={36} />
							<Box sx={{ minWidth: 0 }}>
								<Typography id="model-drawer-title" component="h2" sx={{ fontFamily: 'var(--font-mono)', fontSize: size.lg, fontWeight: weight.semibold, letterSpacing: '-0.015em', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
									{model.model}
								</Typography>
								<Typography sx={{ fontSize: size.xs, color: v('text3'), mt: 0.25 }}>{brandFor(model.model)?.name ?? '未识别的厂商'}</Typography>
							</Box>
						</Stack>
						<Stack direction="row" spacing={3.5} sx={{ mt: 2 }}>
							<HeadFigure label={`可用率 · ${windowLabel.replace('最近 ', '')}`} value={formatPercent(model.availability)} tone={model.status === 'outage' ? statusText(model.status) : undefined} />
							<HeadFigure label="P95 延迟" value={formatLatency(model.p95_ms)} />
							<HeadFigure label="最近检测" value={formatAgoShort(model.last_checked_at, now)} />
						</Stack>
					</Box>

					<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
						<Typography component="h3" sx={{ mb: 1.25, fontSize: size.xs, fontWeight: weight.semibold, color: v('text3'), letterSpacing: '0.04em' }}>
							各地区 · 点击查看明细
						</Typography>
						<Stack role="list" sx={{ borderRadius: `${radius.block + 2}px`, overflow: 'hidden', boxShadow: `0 0 0 1px ${v('border')}` }}>
							{regions.map((item, index) => {
								const stats = model.regions[item.id];
								const status = stats?.status ?? 'unknown';
								const hasData = (stats?.total_count ?? 0) > 0;
								const selected = region === item.id;
								const bad = status === 'outage' || status === 'degraded';
								return (
									<ButtonBase
										key={item.id}
										role="listitem"
										aria-pressed={selected}
										aria-label={`${item.label}，${STATUS_META[status].label}，查看该地区明细`}
										onClick={() => setRegion(item.id)}
										sx={{
											display: 'grid',
											gridTemplateColumns: '92px 76px 1fr',
											gridTemplateRows: 'auto auto',
											columnGap: 1.5,
											rowGap: 0.75,
											alignItems: 'center',
											textAlign: 'left',
											px: 1.75,
											py: 1.375,
											borderTop: index ? `1px solid ${v('border')}` : 0,
											bgcolor: selected ? v('brandSoft') : 'transparent',
											boxShadow: selected ? `inset 2px 0 0 ${v('brand')}` : 'none',
											transition: `background-color ${motion.fast} ${motion.ease}`,
											'&:hover': { bgcolor: selected ? v('brandSoft') : v('rowHover') },
										}}
									>
										<Stack direction="row" spacing={0.75} alignItems="center">
											<StatusGlyph status={status} size={14} />
											<Typography component="span" sx={{ fontSize: size.md, fontWeight: weight.semibold }}>
												{item.label}
											</Typography>
										</Stack>
										<Typography
											component="span"
											sx={{ fontSize: size.md, fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums', color: bad ? statusText(status) : hasData ? v('text1') : v('text3') }}
										>
											{hasData ? formatPercent(stats!.availability) : '无数据'}
										</Typography>
										<Typography component="span" sx={{ fontSize: size.sm, color: v('text2'), fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}>
											均值 {formatLatency(stats?.avg_latency_ms)} · P95 {formatLatency(stats?.p95_ms)}
										</Typography>
										<Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
											<UptimeStrip series={hasData ? stats!.series : null} height={14} minBar={3} gap={1.5} label={`${item.label}可用性时间线`} />
										</Box>
									</ButtonBase>
								);
							})}
						</Stack>

						<Typography component="h3" sx={{ mt: 3.5, mb: 1.5, fontSize: size.xs, fontWeight: weight.semibold, color: v('text3'), letterSpacing: '0.04em' }}>
							{regions.find((item) => item.id === region)?.label ?? ''} · 检测明细
						</Typography>
						{region ? <ProbeTrend checkId={model.id} region={region} windowKey={windowKey} revision={revision} /> : null}
					</Box>
				</Stack>
			)}
		</Drawer>
	);
}

function HeadFigure({ label, value, tone }: { label: string; value: string; tone?: string }) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography sx={{ fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>{label}</Typography>
			<Typography className="num" sx={{ mt: 0.5, fontSize: size.xl, fontWeight: weight.semibold, letterSpacing: '-0.02em', lineHeight: 1.15, color: tone ?? v('text1'), whiteSpace: 'nowrap' }}>
				{value}
			</Typography>
		</Box>
	);
}
