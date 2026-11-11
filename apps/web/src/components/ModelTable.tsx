import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { HealthStatus, ModelHealth, RegionInfo } from '../api';
import { TYPE_LABELS } from '../constants';
import { motion, size, STATUS_META, statusFill, statusText, v, weight } from '../design/tokens';
import { formatLatency, formatPercent } from '../format';
import { modelStats, modelStatus } from '../status';
import { ModelIcon } from './ModelIcon';
import { ModelName } from './ModelName';
import { StatusGlyph } from './StatusBadge';
import { UptimeStrip } from './UptimeStrip';
import { Icon, ChevronRight } from '../design/icons';

/** Shared column template so the header and every row line up. */
const COLUMNS = 'minmax(260px, 1.5fr) 88px 80px minmax(180px, 2.2fr) 108px 16px';

export function ModelTableHeader({ regionLabel }: { regionLabel: string | null }) {
	const cell = { fontSize: size.xs, color: v('text3'), fontWeight: weight.medium, whiteSpace: 'nowrap', letterSpacing: '0.01em' } as const;
	return (
		<Box
			role="row"
			sx={{
				display: { xs: 'none', md: 'grid' },
				gridTemplateColumns: COLUMNS,
				columnGap: 2.5,
				alignItems: 'center',
				px: 2.5,
				py: 1,
				borderBottom: `1px solid ${v('border')}`,
			}}
		>
			<Box role="columnheader" sx={cell}>
				模型
			</Box>
			<Box role="columnheader" sx={{ ...cell, textAlign: 'right' }}>
				可用率
			</Box>
			<Box role="columnheader" sx={{ ...cell, textAlign: 'right' }}>
				P95
			</Box>
			<Box role="columnheader" sx={cell}>
				时间线{regionLabel ? ` · ${regionLabel}` : ''}
			</Box>
			<Box role="columnheader" sx={cell}>
				地区
			</Box>
			<Box role="columnheader" />
		</Box>
	);
}

const ModelRow = memo(function ModelRow({
	model,
	regions,
	region,
	onOpen,
}: {
	model: ModelHealth;
	regions: RegionInfo[];
	region: string;
	onOpen: (model: ModelHealth) => void;
}) {
	const status = modelStatus(model, region);
	const stats = modelStats(model, region);
	const hasData = stats.total_count > 0;
	const bad = status === 'degraded' || status === 'outage';
	const regionLabel = region === 'all' ? null : regions.find((item) => item.id === region)?.label;
	// Only an outage colours the figure; degradation is carried by the glyph and timeline.
	const availabilityColor = status === 'outage' ? statusText(status) : hasData ? v('text1') : v('text3');
	return (
		<ButtonBase
			role="row"
			aria-label={`${model.model}，${TYPE_LABELS[model.type]}，${STATUS_META[status].label}，可用率 ${formatPercent(stats.availability)}，查看详情`}
			onClick={() => onOpen(model)}
			sx={{
				width: '100%',
				display: 'grid',
				gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: COLUMNS },
				gridTemplateAreas: { xs: '"name avail" "strip strip" "meta meta"', md: 'none' },
				columnGap: 2.5,
				rowGap: 1.25,
				alignItems: 'center',
				textAlign: 'left',
				px: 2.5,
				py: { xs: 1.75, md: 1.375 },
				borderBottom: `1px solid ${v('border')}`,
				opacity: model.enabled ? 1 : 0.55,
				transition: `background-color ${motion.fast} ${motion.ease}`,
				'&:hover': { bgcolor: v('rowHover') },
				'&:hover .row-chevron': { opacity: 1, transform: 'translateX(0)' },
				'&.Mui-focusVisible': { outline: `2px solid ${v('focus')}`, outlineOffset: -2, borderRadius: 1 },
			}}
		>
			<Stack role="cell" direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, gridArea: { xs: 'name', md: 'auto' } }}>
				{/* Lab logo with the row's status pinned to its corner. */}
				<Box sx={{ position: 'relative', flexShrink: 0 }}>
					<ModelIcon model={model.model} size={28} />
					<Box
						sx={{
							position: 'absolute',
							right: -4,
							bottom: -4,
							width: 14,
							height: 14,
							borderRadius: '50%',
							bgcolor: v('surface'),
							display: 'grid',
							placeItems: 'center',
						}}
					>
						{bad || status === 'unknown' ? (
							<StatusGlyph status={status} size={12} />
						) : (
							<Box component="span" aria-label={STATUS_META[status].label} role="img" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusFill(status) }} />
						)}
					</Box>
				</Box>
				<Box sx={{ minWidth: 0 }}>
					<ModelName name={model.model} wrapOnPhone />
					<Typography component="span" sx={{ display: 'block', mt: 0.25, fontSize: size.xs, color: v('text3'), lineHeight: 1.3 }}>
						{TYPE_LABELS[model.type]}
						{!model.enabled ? ' · 已停用' : !model.probe_configured ? ' · 未配置检测' : ''}
					</Typography>
				</Box>
			</Stack>
			<Typography
				role="cell"
				component="span"
				className="num"
				sx={{ gridArea: { xs: 'avail', md: 'auto' }, textAlign: 'right', fontSize: size.md, fontWeight: weight.semibold, letterSpacing: '-0.01em', color: availabilityColor }}
			>
				{hasData ? formatPercent(stats.availability) : '—'}
			</Typography>
			<Typography role="cell" component="span" className="num" sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right', fontSize: size.sm, color: v('text2'), whiteSpace: 'nowrap' }}>
				{formatLatency(stats.p95_ms)}
			</Typography>
			<Box role="cell" sx={{ minWidth: 0, gridArea: { xs: 'strip', md: 'auto' } }}>
				<UptimeStrip series={hasData ? stats.series : null} height={18} label={`${model.model}${regionLabel ? `（${regionLabel}）` : ''}可用性时间线`} />
			</Box>
			<Stack role="cell" direction="row" alignItems="center" sx={{ gridArea: { xs: 'meta', md: 'auto' }, justifyContent: { xs: 'space-between', md: 'flex-start' }, minWidth: 0, gap: 1.5 }}>
				<Typography component="span" className="num" sx={{ display: { md: 'none' }, fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>
					P95 {formatLatency(stats.p95_ms)}
				</Typography>
				<RegionMarks model={model} regions={regions} selected={region} />
			</Stack>
			<Box
				className="row-chevron"
				aria-hidden
				sx={{
					display: { xs: 'none', md: 'block' },
					color: v('text3'),
					opacity: 0,
					transform: 'translateX(-4px)',
					transition: `opacity ${motion.fast} ${motion.ease}, transform ${motion.fast} ${motion.ease}`,
				}}
			>
				<Icon icon={ChevronRight} size={16} />
			</Box>
		</ButtonBase>
	);
});

/** A small mark whose shape follows the status, so it survives colour blindness. */
export function RegionMark({ status, selected = false, size: px = 10 }: { status: HealthStatus; selected?: boolean; size?: number }) {
	const shape =
		status === 'degraded'
			? { clipPath: 'polygon(50% 6%, 100% 94%, 0 94%)', borderRadius: 0, width: px + 2, height: px + 2 }
			: status === 'outage'
				? { borderRadius: '2px' }
				: status === 'maintenance'
					? { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)', borderRadius: 0 }
					: { borderRadius: '50%' };
	return (
		<Box
			component="span"
			aria-hidden
			sx={{
				width: px,
				height: px,
				flexShrink: 0,
				display: 'block',
				bgcolor: status === 'unknown' ? 'transparent' : statusFill(status),
				// Healthy marks recede so the triangles and squares carry the row.
				opacity: status === 'operational' ? 0.5 : 1,
				border: status === 'unknown' ? `1.5px solid ${v('noneFill')}` : 'none',
				boxShadow: selected ? `0 0 0 2px ${v('surface')}, 0 0 0 3.5px ${v('brand')}` : 'none',
				...shape,
			}}
		/>
	);
}

function RegionMarks({ model, regions, selected }: { model: ModelHealth; regions: RegionInfo[]; selected: string }) {
	return (
		<Stack direction="row" alignItems="center" sx={{ gap: 0.25 }}>
			{regions.map((region) => {
				const stats = model.regions[region.id];
				const status = stats?.status ?? 'unknown';
				return (
					<Tooltip key={region.id} title={`${region.label} · ${STATUS_META[status].label} · ${formatPercent(stats?.availability ?? null)} · P95 ${formatLatency(stats?.p95_ms)}`}>
						<Box component="span" role="img" aria-label={`${region.label}${STATUS_META[status].label}`} sx={{ width: 20, height: 20, display: 'grid', placeItems: 'center' }}>
							<RegionMark status={status} selected={selected === region.id} />
						</Box>
					</Tooltip>
				);
			})}
		</Stack>
	);
}

/** Virtualised rows inside the page's single scroll container. */
export function ModelRows({
	models,
	regions,
	region,
	scrollParent,
	onOpen,
}: {
	models: ModelHealth[];
	regions: RegionInfo[];
	region: string;
	scrollParent: HTMLElement | null;
	onOpen: (model: ModelHealth) => void;
}) {
	if (!scrollParent) return null;
	return (
		<Virtuoso
			customScrollParent={scrollParent}
			data={models}
			computeItemKey={(_, model) => model.id}
			increaseViewportBy={320}
			itemContent={(_, model) => <ModelRow model={model} regions={regions} region={region} onOpen={onOpen} />}
		/>
	);
}
