import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import type { OverviewResponse } from '../api';
import { motion, radius, size, STATUS_META, statusFill, statusText, v, weight } from '../design/tokens';
import { formatLatency, formatPercent } from '../format';
import { Sparkline } from './Sparkline';
import { StatusGlyph } from './StatusBadge';

/**
 * Gateway reachability per region, one raised panel divided by hairlines.
 * Healthy cells stay neutral; only a problem region carries colour.
 */
export function RegionStrip({ overview, value, onChange }: { overview: OverviewResponse; value: string; onChange: (region: string) => void; now: number }) {
	const regions = overview.gateway.regions;
	return (
		<Box component="section" aria-labelledby="regions-title" sx={{ animation: 'fadeUp 480ms 120ms var(--ease) both' }}>
			<Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'baseline' }} spacing={{ xs: 0.75, md: 2 }} sx={{ mb: 1.5, px: 0.25 }}>
				<Typography id="regions-title" component="h2" sx={{ fontSize: size.lg, fontWeight: weight.semibold, letterSpacing: '-0.01em', color: v('text1'), whiteSpace: 'nowrap' }}>
					网关
				</Typography>
				<Typography component="span" sx={{ fontSize: size.sm, color: v('text3') }}>
					各地区访问 emrank.tech 的情况
					<Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>，点击地区可筛选下方模型</Box>
				</Typography>
				<Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
				<EndpointList overview={overview} />
			</Stack>
			<Box
				role="group"
				aria-label="按地区筛选模型"
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: `repeat(${regions.length}, minmax(152px, 1fr))`, md: `repeat(${regions.length}, minmax(0, 1fr))` },
					overflowX: { xs: 'auto', md: 'visible' },
					scrollSnapType: { xs: 'x mandatory', md: 'none' },
					scrollbarWidth: 'none',
					'&::-webkit-scrollbar': { display: 'none' },
					bgcolor: v('surface'),
					borderRadius: `${radius.section}px`,
					boxShadow: v('shadow'),
				}}
			>
				{regions.map((region, index) => {
					const selected = value === region.id;
					const hasData = region.total_count > 0;
					const bad = region.status === 'degraded' || region.status === 'outage';
					return (
						<ButtonBase
							key={region.id}
							aria-pressed={selected}
							aria-label={`${region.label}，${STATUS_META[region.status].label}，可用率 ${formatPercent(region.availability)}${selected ? '，正在筛选，再次点击取消' : '，点击只看该地区'}`}
							onClick={() => onChange(selected ? 'all' : region.id)}
							sx={{
								position: 'relative',
								display: 'block',
								textAlign: 'left',
								scrollSnapAlign: 'start',
								px: 2,
								pt: 1.75,
								pb: 1.5,
								borderLeft: index ? `1px solid ${v('border')}` : 0,
								borderRadius: index === 0 ? `${radius.section}px 0 0 ${radius.section}px` : index === regions.length - 1 ? `0 ${radius.section}px ${radius.section}px 0` : 0,
								transition: `background-color ${motion.fast} ${motion.ease}`,
								'&:hover': { bgcolor: v('rowHover') },
								'&:hover .region-hint': { opacity: 1 },
								'&.Mui-focusVisible': { outline: `2px solid ${v('focus')}`, outlineOffset: -2 },
								'&::after': {
									content: '""',
									position: 'absolute',
									left: 16,
									right: 16,
									bottom: 0,
									height: 2,
									borderRadius: 2,
									bgcolor: v('brand'),
									transform: selected ? 'scaleX(1)' : 'scaleX(0)',
									transition: `transform ${motion.base} ${motion.ease}`,
								},
							}}
						>
							<Stack direction="row" alignItems="center" spacing={0.875} sx={{ minWidth: 0 }}>
								{bad ? <StatusGlyph status={region.status} size={14} /> : <Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: hasData ? statusFill('operational') : v('noneFill'), mx: '4px' }} />}
								<Typography component="span" sx={{ fontSize: size.sm, fontWeight: weight.semibold, color: v('text1') }} noWrap>
									{region.label}
								</Typography>
								<Typography component="span" sx={{ fontSize: size.xs, color: v('text3'), fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
									{region.code}
								</Typography>
							</Stack>
							<Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mt: 1.25 }}>
								<Typography component="span" className="num" sx={{ fontSize: size.xl, fontWeight: weight.semibold, letterSpacing: '-0.02em', color: bad ? statusText(region.status) : v('text1'), lineHeight: 1.1 }}>
									{hasData ? formatPercent(region.availability) : '—'}
								</Typography>
								<Typography component="span" className="num" sx={{ fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>
									{formatLatency(region.last_latency_ms ?? region.avg_latency_ms)}
								</Typography>
							</Stack>
							<Box sx={{ mt: 1.25, mb: 0.25 }}>
								<Sparkline points={region.series.series} color={statusFill(region.status)} quiet={!bad} height={28} label={`${region.label}网关延迟`} />
							</Box>
						</ButtonBase>
					);
				})}
			</Box>
		</Box>
	);
}

/**
 * The three checked endpoints, labelled and with their own status, so a
 * failing `/health` is visible even when every region card looks fine.
 */
function EndpointList({ overview }: { overview: OverviewResponse }) {
	const endpoints = overview.gateway.endpoints;
	if (!endpoints.length) return null;
	return (
		<Stack component="ul" aria-label="检测的网关端点" direction="row" alignItems="center" sx={{ m: 0, p: 0, listStyle: 'none', gap: 1.75, flexWrap: 'wrap', rowGap: 0.75 }}>
			<Typography component="li" sx={{ fontSize: size.xs, color: v('text3') }}>
				检测端点
			</Typography>
			{endpoints.map((endpoint) => {
				const status = endpoint.status;
				const bad = status === 'degraded' || status === 'outage';
				return (
					<Tooltip key={endpoint.id} title={`${endpoint.method} ${endpoint.path} · ${STATUS_META[status].label}`}>
						<Stack component="li" direction="row" spacing={0.75} alignItems="center" tabIndex={0} sx={{ borderRadius: 1 }}>
							<Box
								component="span"
								aria-label={STATUS_META[status].label}
								role="img"
								sx={{ width: 6, height: 6, borderRadius: status === 'outage' ? '1.5px' : '50%', bgcolor: status === 'unknown' ? v('noneFill') : statusFill(status), flexShrink: 0 }}
							/>
							<Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontSize: size.xs, color: bad ? statusText(status) : v('text2'), whiteSpace: 'nowrap' }}>
								<Box component="span" sx={{ color: bad ? 'inherit' : v('text3') }}>
									{endpoint.method}
								</Box>{' '}
								{endpoint.path}
							</Box>
						</Stack>
					</Tooltip>
				);
			})}
		</Stack>
	);
}
