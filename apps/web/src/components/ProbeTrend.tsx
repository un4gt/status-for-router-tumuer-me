import { Alert, Box, Button, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchProbeDetail, type ProbeDetail, type WindowKey } from '../api';
import { radius, size, v, weight } from '../design/tokens';
import { formatLatency, formatPercent } from '../format';

const tick = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const tickDay = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const fullTime = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function niceCeil(value: number) {
	if (value <= 0) return 100;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
	return 10 * magnitude;
}

/** P95/P99 latency over the window; one scale, gaps where no successful sample exists. */
function TrendChart({ detail }: { detail: ProbeDetail }) {
	const host = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(480);
	const [hover, setHover] = useState<number | null>(null);
	useEffect(() => {
		if (!host.current) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
		observer.observe(host.current);
		return () => observer.disconnect();
	}, []);
	const height = 168;
	const m = { top: 12, right: 8, bottom: 22, left: 44 };
	const innerW = width - m.left - m.right;
	const innerH = height - m.top - m.bottom;
	const max = niceCeil(Math.max(1, ...detail.series.flatMap((p) => [p.p95_ms ?? 0, p.p99_ms ?? 0])));
	const span = Math.max(1, detail.to - detail.from);
	const x = (ts: number) => m.left + ((ts - detail.from) / span) * innerW;
	const y = (ms: number) => m.top + (1 - ms / max) * innerH;
	const path = (key: 'p95_ms' | 'p99_ms') => {
		let open = false;
		return detail.series
			.map((point) => {
				const value = point[key];
				if (value === null) {
					open = false;
					return '';
				}
				const cmd = `${open ? 'L' : 'M'}${x(point.ts).toFixed(1)},${y(value).toFixed(1)}`;
				open = true;
				return cmd;
			})
			.join(' ');
	};
	const multiDay = span > 20 * 3_600_000;
	// Wash under the longest unbroken P95 run only, so gaps stay visible as gaps.
	const areaPath = (() => {
		const runs: Array<Array<{ ts: number; v: number }>> = [];
		let run: Array<{ ts: number; v: number }> = [];
		for (const point of detail.series) {
			if (point.p95_ms === null) {
				if (run.length) runs.push(run);
				run = [];
			} else run.push({ ts: point.ts, v: point.p95_ms });
		}
		if (run.length) runs.push(run);
		return runs
			.filter((r) => r.length > 1)
			.map((r) => `M${x(r[0].ts).toFixed(1)},${(m.top + innerH).toFixed(1)} ${r.map((p) => `L${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} L${x(r.at(-1)!.ts).toFixed(1)},${(m.top + innerH).toFixed(1)} Z`)
			.join(' ');
	})();
	const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => detail.from + r * span);
	const points = detail.series.filter((p) => p.p95_ms !== null);
	const active = hover !== null ? points[hover] : null;
	return (
		<Box ref={host} sx={{ position: 'relative' }}>
			<svg
				width={width}
				height={height}
				role="img"
				aria-label={`P95 ${formatLatency(detail.p95_ms)}，P99 ${formatLatency(detail.p99_ms)}；缺失样本处断开`}
				style={{ display: 'block', overflow: 'visible' }}
				onMouseLeave={() => setHover(null)}
				onMouseMove={(event) => {
					if (!points.length) return;
					const rect = event.currentTarget.getBoundingClientRect();
					const px = event.clientX - rect.left;
					let best = 0;
					for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].ts) - px) < Math.abs(x(points[best].ts) - px)) best = i;
					setHover(best);
				}}
			>
				{[0, 0.5, 1].map((r) => (
					<g key={r}>
						<line x1={m.left} x2={width - m.right} y1={y(max * r)} y2={y(max * r)} stroke={v('border')} strokeWidth={1} strokeOpacity={r === 0 ? 1 : 0.6} />
						<text x={m.left - 6} y={y(max * r) + 4} textAnchor="end" fontSize="11" fill={v('text3')} style={{ fontVariantNumeric: 'tabular-nums' }}>
							{formatLatency(max * r)}
						</text>
					</g>
				))}
				{ticks.map((ts, i) => (
					<text
						key={ts}
						x={x(ts)}
						y={height - 4}
						textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
						fontSize="11"
						fill={v('text3')}
						style={{ fontVariantNumeric: 'tabular-nums' }}
					>
						{(multiDay ? tickDay : tick).format(ts)}
					</text>
				))}
				<path d={path('p99_ms')} fill="none" stroke={v('text3')} strokeOpacity={0.7} strokeWidth={1.25} strokeDasharray="3 3" strokeLinejoin="round" />
				<defs>
					<linearGradient id="p95-wash" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={v('brand')} stopOpacity={0.14} />
						<stop offset="100%" stopColor={v('brand')} stopOpacity={0} />
					</linearGradient>
				</defs>
				{areaPath ? <path d={areaPath} fill="url(#p95-wash)" /> : null}
				<path d={path('p95_ms')} fill="none" stroke={v('brand')} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
				{active && (
					<g>
						<line x1={x(active.ts)} x2={x(active.ts)} y1={m.top} y2={m.top + innerH} stroke={v('borderStrong')} />
						<circle cx={x(active.ts)} cy={y(active.p95_ms!)} r={4} fill={v('brand')} stroke={v('surface')} strokeWidth={2} />
					</g>
				)}
				{!detail.sample_count && (
					<text x={m.left + innerW / 2} y={m.top + innerH / 2} textAnchor="middle" fontSize="12" fill={v('text2')}>
						这段时间没有成功请求
					</text>
				)}
			</svg>
			{active && (
				<Box
					role="tooltip"
					sx={{
						position: 'absolute',
						top: 0,
						left: Math.min(width - 170, Math.max(0, x(active.ts) - 85)),
						width: 170,
						px: 1,
						py: 0.75,
						borderRadius: `${radius.control}px`,
						bgcolor: v('tooltipBg'),
						color: v('tooltipFg'),
						fontSize: size.xs,
						lineHeight: 1.55,
						pointerEvents: 'none',
						fontVariantNumeric: 'tabular-nums',
					}}
				>
					<div>{fullTime.format(active.ts)}</div>
					<div>
						P95 {formatLatency(active.p95_ms)} · P99 {formatLatency(active.p99_ms)}
					</div>
					<div style={{ opacity: 0.75 }}>{active.sample_count} 个成功样本</div>
				</Box>
			)}
		</Box>
	);
}

export function ProbeTrend({ checkId, region, windowKey, revision }: { checkId: string; region: string; windowKey: WindowKey; revision: number }) {
	const [state, setState] = useState<{ key: string; data?: ProbeDetail; error?: string } | null>(null);
	const [tab, setTab] = useState<'chart' | 'history'>('chart');
	const [retry, setRetry] = useState(0);
	const key = `${checkId}|${region}|${windowKey}|${revision}|${retry}`;
	useEffect(() => {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), 15_000);
		fetchProbeDetail(checkId, region, windowKey, controller.signal)
			.then((data) => setState({ key, data }))
			.catch(() => {
				if (!controller.signal.aborted || !state?.data) setState({ key, error: '这个地区的检测明细暂时无法读取。' });
			})
			.finally(() => window.clearTimeout(timer));
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);
	const current = state?.key === key ? state : null;
	const detail = current?.data;
	const history = useMemo(() => detail?.history ?? [], [detail]);

	if (current?.error)
		return (
			<Alert severity="warning" action={<Button size="small" color="inherit" onClick={() => setRetry((n) => n + 1)}>重试</Button>}>
				{current.error}
			</Alert>
		);
	if (!detail) return <Skeleton variant="rounded" height={236} aria-label="正在读取检测明细" />;

	return (
		<Stack spacing={1.5}>
			<Stack direction="row" spacing={3.5} className="num">
				<Figure label="P95" value={formatLatency(detail.p95_ms)} swatch="solid" />
				<Figure label="P99" value={formatLatency(detail.p99_ms)} swatch="dashed" />
				<Figure label="成功率" value={formatPercent(detail.availability)} />
				<Figure label="检测次数" value={String(detail.total_count)} />
			</Stack>
			<ToggleButtonGroup
				exclusive
				size="small"
				value={tab}
				onChange={(_, next) => next && setTab(next)}
				aria-label="明细内容"
				sx={{ alignSelf: 'flex-start', '& .MuiToggleButton-root': { px: 1.5, py: 0.375 } }}
			>
				<ToggleButton value="chart">延迟趋势</ToggleButton>
				<ToggleButton value="history">最近检测 · {history.length}</ToggleButton>
			</ToggleButtonGroup>
			{tab === 'chart' ? (
				<>
					<TrendChart detail={detail} />
					<Typography sx={{ fontSize: size.xs, color: v('text2') }}>
						只统计成功请求的耗时（{detail.sample_count} 个样本，每 {Math.round(detail.bucket_ms / 60000)} 分钟一组）；失败请求计入成功率，不计入延迟。
					</Typography>
				</>
			) : (
				<Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: size.sm, fontVariantNumeric: 'tabular-nums' }}>
					<Box component="thead">
						<Box component="tr" sx={{ '& th': { textAlign: 'left', fontWeight: weight.medium, color: v('text2'), fontSize: size.xs, py: 0.75, borderBottom: `1px solid ${v('border')}` } }}>
							<th>时间</th>
							<th>结果</th>
							<th style={{ textAlign: 'right' }}>耗时</th>
						</Box>
					</Box>
					<Box component="tbody">
						{history.map((row, index) => (
							<Box component="tr" key={`${row.ts}-${index}`} sx={{ '& td': { py: 0.75, borderBottom: `1px solid ${v('border')}` } }}>
								<td>{fullTime.format(row.ts)}</td>
								<Box component="td" sx={{ color: row.success ? v('okText') : v('critText'), fontWeight: weight.medium }}>
									{row.success ? '成功' : '失败'}
									<Box component="span" sx={{ color: v('text3'), fontWeight: weight.regular, ml: 0.75 }}>
										{row.status_code ?? '超时或连接失败'}
									</Box>
								</Box>
								<td style={{ textAlign: 'right' }}>{formatLatency(row.latency_ms)}</td>
							</Box>
						))}
						{!history.length && (
							<tr>
								<Box component="td" colSpan={3} sx={{ py: 2, color: v('text2'), textAlign: 'center' }}>
									这段时间没有检测记录
								</Box>
							</tr>
						)}
					</Box>
				</Box>
			)}
		</Stack>
	);
}

function Figure({ label, value, swatch }: { label: string; value: string; swatch?: 'solid' | 'dashed' }) {
	return (
		<Box>
			<Stack direction="row" spacing={0.75} alignItems="center">
				{swatch && <Box sx={{ width: 14, borderTop: `2px ${swatch} ${swatch === 'solid' ? v('brand') : v('text3')}` }} />}
				<Typography sx={{ fontSize: size.xs, color: v('text3') }}>{label}</Typography>
			</Stack>
			<Typography className="num" sx={{ fontSize: size.lg, fontWeight: weight.semibold, letterSpacing: '-0.01em', mt: 0.375 }}>
				{value}
			</Typography>
		</Box>
	);
}
