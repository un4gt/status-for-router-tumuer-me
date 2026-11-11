import { Box } from '@mui/material';
import { memo, useMemo, useRef, useState } from 'react';
import type { Series } from '../api';
import { motion, radius, size, v } from '../design/tokens';
import { formatLatency } from '../format';

const shortTime = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

type Bucket = {
	ts: number;
	total: number;
	success: number;
	availability: number | null;
	latency: number | null;
	/** Before the first sample in the window: the source was not yet collecting. */
	beforeData: boolean;
	future: boolean;
};

export function bucketize(series: Series): Bucket[] {
	const { from, to, bucket_ms: step } = series;
	if (!step || to <= from) return [];
	const byTs = new Map(series.series.map((point) => [point.ts, point]));
	const start = Math.floor(from / step) * step;
	const end = Math.floor(to / step) * step;
	const firstData = series.series.filter((point) => point.total_count > 0).reduce((min, point) => Math.min(min, point.ts), Infinity);
	const buckets: Bucket[] = [];
	for (let ts = start; ts <= end; ts += step) {
		const point = byTs.get(ts);
		const total = point?.total_count ?? 0;
		buckets.push({
			ts,
			total,
			success: point?.success_count ?? 0,
			availability: total > 0 ? (point?.availability ?? null) : null,
			latency: point?.avg_latency_ms ?? null,
			beforeData: ts < firstData,
			future: ts + step > to && total === 0,
		});
	}
	return buckets;
}

type Tone = 'ok' | 'warn' | 'crit' | 'none' | 'pending';
function toneOf(bucket: Bucket): Tone {
	if (bucket.availability === null) return bucket.beforeData ? 'pending' : 'none';
	if (bucket.availability >= 0.999) return 'ok';
	if (bucket.availability >= 0.95) return 'warn';
	return 'crit';
}
const FILL: Record<Tone, string> = { ok: v('okFill'), warn: v('warnFill'), crit: v('critFill'), none: v('noneFill'), pending: v('surface3') };

/**
 * One SVG per row with a single shared readout. Healthy buckets are short and
 * calm; a bucket with failures stands taller so the eye lands on it first.
 * Bars keep a minimum width; when space runs out the most recent ones show.
 */
export const UptimeStrip = memo(function UptimeStrip({
	series,
	height = 22,
	minBar = 3,
	gap = 2,
	label = '可用性时间条',
}: {
	series: Series | null;
	height?: number;
	minBar?: number;
	gap?: number;
	label?: string;
}) {
	const host = useRef<HTMLDivElement | null>(null);
	const observer = useRef<ResizeObserver | null>(null);
	const [width, setWidth] = useState(0);
	const [hover, setHover] = useState<number | null>(null);
	const all = useMemo(() => (series ? bucketize(series) : []), [series]);

	const attach = (element: HTMLDivElement | null) => {
		observer.current?.disconnect();
		host.current = element;
		if (!element) return;
		setWidth(element.clientWidth);
		observer.current = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.current.observe(element);
	};

	const fit = width > 0 ? Math.max(1, Math.floor((width + gap) / (minBar + gap))) : all.length;
	const buckets = all.length > fit ? all.slice(all.length - fit) : all;
	const barWidth = buckets.length ? (width - gap * (buckets.length - 1)) / buckets.length : 0;
	const summary = useMemo(() => {
		const measured = all.filter((bucket) => bucket.total > 0);
		const bad = measured.filter((bucket) => (bucket.availability ?? 1) < 0.999).length;
		return measured.length ? `${label}：${measured.length} 个时段有数据，其中 ${bad} 个时段有失败` : `${label}：暂无检测数据`;
	}, [all, label]);

	const active = hover !== null ? buckets[hover] : null;
	const step = series?.bucket_ms ?? 0;
	const rest = Math.round(height * 0.62);

	return (
		<Box
			ref={attach}
			sx={{ position: 'relative', width: '100%', minWidth: 0, height }}
			onMouseLeave={() => setHover(null)}
			onMouseMove={(event) => {
				if (!buckets.length || barWidth <= 0) return;
				const rect = event.currentTarget.getBoundingClientRect();
				const index = Math.floor((event.clientX - rect.left) / (barWidth + gap));
				setHover(Math.max(0, Math.min(buckets.length - 1, index)));
			}}
		>
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label={summary} style={{ display: 'block', overflow: 'visible' }}>
					{buckets.map((bucket, index) => {
						const tone = toneOf(bucket);
						const tall = tone === 'warn' || tone === 'crit' || hover === index;
						const h = tall ? height : tone === 'pending' ? Math.round(height * 0.32) : rest;
						return (
							<rect
								key={bucket.ts}
								x={index * (barWidth + gap)}
								y={(height - h) / 2}
								width={Math.max(1, barWidth)}
								height={h}
								rx={Math.min(barWidth / 2, 2)}
								fill={FILL[tone]}
								// Healthy buckets recede; failures keep full strength so the eye finds them.
								opacity={(bucket.future ? 0.4 : 1) * (tone === 'ok' ? (hover === index ? 1 : 0.55) : 1) * (hover !== null && hover !== index ? 0.7 : 1)}
								style={{ transition: `opacity ${motion.fast} ${motion.ease}` }}
							/>
						);
					})}
				</svg>
			)}
			{active && (
				<Box
					role="tooltip"
					className="num"
					sx={{
						position: 'absolute',
						bottom: 'calc(100% + 8px)',
						left: `${((hover! + 0.5) * (barWidth + gap) * 100) / Math.max(1, width)}%`,
						transform: `translateX(${hover! > buckets.length * 0.7 ? '-88%' : hover! < buckets.length * 0.3 ? '-12%' : '-50%'})`,
						px: 1.25,
						py: 0.75,
						borderRadius: `${radius.control + 2}px`,
						bgcolor: v('tooltipBg'),
						color: v('tooltipFg'),
						fontSize: size.xs,
						lineHeight: 1.55,
						whiteSpace: 'nowrap',
						pointerEvents: 'none',
						zIndex: 5,
						boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.35)',
					}}
				>
					<div style={{ opacity: 0.7 }}>
						{shortTime.format(active.ts)} – {shortTime.format(active.ts + step)}
					</div>
					<div>
						{active.total > 0
							? `${active.success} / ${active.total} 次成功 · ${((active.availability ?? 0) * 100).toFixed(1)}%${active.latency === null ? '' : ` · ${formatLatency(active.latency)}`}`
							: active.beforeData
								? '尚未开始采集'
								: active.future
									? '本时段尚无检测'
									: '该时段没有检测记录'}
					</div>
				</Box>
			)}
		</Box>
	);
});
