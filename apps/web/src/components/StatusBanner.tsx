import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { OverviewResponse } from '../api';
import { radius, size, statusFill, statusGlow, statusText, v, weight } from '../design/tokens';
import { formatAgoShort, formatClock, formatPercent } from '../format';
import { summarize, type Incident } from '../status';
import { HeroArt, heroGrid } from './hero/HeroArt';

/**
 * The page's thesis, read top to bottom in one column:
 *   [● 数据来源] 3 分钟前检测 · 刷新
 *   部分服务出现故障                     ← the only large type
 *   上海访问网关不稳定；自 06:25 起。     ← only when a region is affected
 *   ─────────────────────────────
 *   受影响模型 3/5 (1 故障 · 2 降级) │ 异常地区 无 │ 网关可用率 99.67%
 * The figures are a quiet row that belongs to the headline instead of a second
 * hero floating at the far edge; the most relevant figure comes first.
 * From md up a drifting particle field fills the right column, coloured by the status mix.
 */
export function StatusBanner({
	overview,
	now,
	windowLabel,
	refreshing,
	onRefresh,
}: {
	overview: OverviewResponse;
	now: number;
	windowLabel: string;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	const incident = summarize(overview);
	const healthy = incident.status === 'operational';
	const clauses = [...incident.detail];
	if (incident.since && !healthy) clauses.push(`自 ${formatClock(incident.since, now)} 起`);

	return (
		<Box component="section" aria-labelledby="status-headline" role="status" sx={{ ...heroGrid, position: 'relative', pt: { xs: 3.5, md: 5 }, pb: { xs: 3.5, md: 4.5 }, animation: 'fadeUp 480ms var(--ease) both' }}>
			<Box sx={{ minWidth: 0 }}>
				<Freshness incident={incident} mode={overview.mode} now={now} refreshing={refreshing} onRefresh={onRefresh} />
				<Typography
					id="status-headline"
					component="h1"
					sx={{
						mt: 1.75,
						fontSize: { xs: size.xxl, md: size.display },
						fontWeight: weight.semibold,
						lineHeight: 1.15,
						letterSpacing: '-0.028em',
						color: v('text1'),
						textWrap: 'balance',
					}}
				>
					{incident.headline}
				</Typography>
				{clauses.length || healthy ? (
					<Typography component="p" sx={{ mt: 1.25, maxWidth: 760, fontSize: { xs: size.md, md: size.lg }, lineHeight: 1.65, color: v('text2') }}>
						{clauses.length ? (
							// One plain sentence joined by Chinese punctuation, so wrapping never strands a separator.
							<>{clauses.join('；')}。</>
						) : (
							<>
								{incident.totalModels} 个模型与 {overview.gateway.regions.length} 个地区的网关检测全部通过。
							</>
						)}
					</Typography>
				) : null}

				<Box
					component="dl"
					aria-label="关键指标"
					sx={{
						m: 0,
						mt: { xs: 3, md: 3.5 },
						display: 'grid',
						gridTemplateColumns: 'repeat(3, minmax(0, auto))',
						justifyContent: { xs: 'space-between', sm: 'start' },
						columnGap: { xs: 2, sm: 5, md: 8 },
						rowGap: 2,
						maxWidth: '100%',
					}}
				>
					<Figure
						label="受影响模型"
						value={
							<>
								{incident.affectedModels}
								<Box component="span" sx={{ color: v('text3'), fontWeight: weight.regular }}>
									&nbsp;/ {incident.totalModels}
								</Box>
							</>
						}
						note={<Breakdown incident={incident} />}
					/>
					<Figure
						label="异常地区"
						value={incident.affectedRegions.length ? String(incident.affectedRegions.length) : '无'}
						muted={!incident.affectedRegions.length}
						note={incident.affectedRegions.length ? incident.affectedRegions.join('、') : `${overview.gateway.regions.length} 个地区均正常`}
					/>
					<Figure label="网关可用率" value={formatPercent(overview.gateway.availability)} note={windowLabel} />
				</Box>
			</Box>
			<HeroArt counts={incident.statusCounts} />
		</Box>
	);
}

/** "1 故障 · 2 降级": the split the headline colour alone cannot carry. */
function Breakdown({ incident }: { incident: Incident }) {
	if (!incident.affectedModels) return <>全部正常</>;
	const parts: Array<[number, 'outage' | 'degraded', string]> = [
		[incident.outageModels, 'outage', '故障'],
		[incident.degradedModels, 'degraded', '降级'],
	];
	return (
		<Stack component="span" direction="row" spacing={1.25} sx={{ display: 'inline-flex' }}>
			{parts
				.filter(([count]) => count > 0)
				.map(([count, status, label]) => (
					<Stack key={status} component="span" direction="row" spacing={0.625} alignItems="center">
						<Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: status === 'outage' ? '1.5px' : '50%', bgcolor: statusFill(status) }} />
						<Box component="span" sx={{ color: statusText(status) }}>
							{count} {label}
						</Box>
					</Stack>
				))}
		</Stack>
	);
}

/**
 * Where the numbers come from and how fresh they are. Replaces the per-second
 * countdown: visitors need "checked 3 min ago", not a ticking timer. Mock data
 * is labelled here so the page never claims to be live when it is not.
 */
function Freshness({ incident, mode, now, refreshing, onRefresh }: { incident: Incident; mode: OverviewResponse['mode']; now: number; refreshing: boolean; onRefresh: () => void }) {
	const live = mode === 'live';
	const source = mode === 'mock' ? '模拟数据' : mode === 'direct' ? '本站直连' : '实时检测';
	const checked = incident.lastCheckedAt ? `${formatAgoShort(incident.lastCheckedAt, now)}检测` : '等待首次检测';
	return (
		<Stack direction="row" alignItems="center" spacing={1} sx={{ color: v('text3'), flexWrap: 'wrap', rowGap: 0.5, lineHeight: 1.5, '& > *': { lineHeight: 1.5 } }}>
			<Box
				component="span"
				sx={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 0.75,
					height: 24,
					px: 1,
					borderRadius: `${radius.pill}px`,
					bgcolor: live ? v('surface') : v('warnSoft'),
					boxShadow: live ? v('shadowControl') : 'none',
					color: live ? v('text2') : v('warnText'),
					fontSize: size.xs,
					fontWeight: weight.medium,
				}}
			>
				<Box component="span" aria-hidden sx={{ position: 'relative', width: 6, height: 6 }}>
					<Box component="span" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: live ? v('okFill') : v('warnFill') }} />
					{live ? <Box component="span" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: v('okFill'), animation: 'pulseRing 2.4s var(--ease) infinite' }} /> : null}
				</Box>
				{source}
			</Box>
			<Typography component="span" className="num" sx={{ fontSize: size.xs, color: v('text3') }}>
				{checked}
			</Typography>
			<Box component="span" aria-hidden sx={{ fontSize: size.xs, color: v('borderStrong') }}>
				·
			</Box>
			<Tooltip title="页面每分钟自动更新">
				<ButtonBase
					onClick={onRefresh}
					disabled={refreshing}
					sx={{ fontSize: size.xs, lineHeight: 1.5, verticalAlign: 'baseline', color: v('text3'), borderRadius: 1, px: 0.25, textDecoration: 'underline', textDecorationColor: v('borderStrong'), textUnderlineOffset: 3, '&:hover': { color: v('text1') }, '&.Mui-disabled': { color: v('text3') } }}
				>
					{refreshing ? '正在刷新…' : '刷新'}
				</ButtonBase>
			</Tooltip>
		</Stack>
	);
}

/** A wide, very soft radial tint in the state's hue behind the hero. */
export function StatusAura({ overview }: { overview: OverviewResponse | null }) {
	const status = overview ? summarize(overview).status : 'unknown';
	return (
		<Box
			aria-hidden
			sx={{
				position: 'absolute',
				inset: '0 0 auto 0',
				height: { xs: 420, md: 520 },
				pointerEvents: 'none',
				background: `radial-gradient(60% 90% at 10% 0%, ${statusGlow(status)}, transparent 72%)`,
				// Mask uses alpha only; the colour is irrelevant.
				WebkitMaskImage: 'linear-gradient(to bottom, black 35%, transparent)',
				maskImage: 'linear-gradient(to bottom, black 35%, transparent)',
			}}
		/>
	);
}

function Figure({ label, value, note, muted = false }: { label: string; value: ReactNode; note?: ReactNode; muted?: boolean }) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography component="dt" sx={{ fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>
				{label}
			</Typography>
			<Typography
				component="dd"
				className="num"
				sx={{ m: 0, mt: 0.5, fontSize: { xs: size.lg, sm: size.xl }, fontWeight: weight.semibold, letterSpacing: '-0.015em', lineHeight: 1.2, color: muted ? v('text3') : v('text1'), whiteSpace: 'nowrap' }}
			>
				{value}
			</Typography>
			{note ? (
				<Typography component="dd" sx={{ m: 0, mt: 0.5, fontSize: size.xs, color: v('text3'), whiteSpace: { xs: 'normal', sm: 'nowrap' }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{note}
				</Typography>
			) : null}
		</Box>
	);
}
