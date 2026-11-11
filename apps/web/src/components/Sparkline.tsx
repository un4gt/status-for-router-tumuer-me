import { Box } from '@mui/material';
import { useId, useMemo } from 'react';
import type { SeriesPoint } from '../api';
import { v } from '../design/tokens';
import { formatLatency } from '../format';

const WIDTH = 160;
const HEIGHT = 36;
const PAD = 3;

/** Monotone cubic (Fritsch–Carlson) so the curve never overshoots the data. */
function monotonePath(points: Array<{ x: number; y: number }>): string {
	const n = points.length;
	if (n < 2) return '';
	const dx = points.slice(1).map((p, i) => p.x - points[i].x);
	const slope = points.slice(1).map((p, i) => (p.y - points[i].y) / (dx[i] || 1));
	const tangent = points.map((_, i) => {
		if (i === 0) return slope[0];
		if (i === n - 1) return slope[n - 2];
		return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
	});
	let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
	for (let i = 0; i < n - 1; i++) {
		const h = dx[i] / 3;
		d += ` C${(points[i].x + h).toFixed(2)},${(points[i].y + tangent[i] * h).toFixed(2)} ${(points[i + 1].x - h).toFixed(2)},${(points[i + 1].y - tangent[i + 1] * h).toFixed(2)} ${points[i + 1].x.toFixed(2)},${points[i + 1].y.toFixed(2)}`;
	}
	return d;
}

/**
 * A calm latency trend: values are lightly smoothed (3-point average) so probe
 * jitter does not read as alarm, while the endpoint marks the true latest value.
 */
export function Sparkline({
	points,
	color,
	height = HEIGHT,
	label = '延迟趋势',
	quiet = false,
}: {
	points: SeriesPoint[];
	color: string;
	height?: number;
	label?: string;
	/** Healthy regions draw in a neutral ink; colour is reserved for problems. */
	quiet?: boolean;
}) {
	const gradientId = useId().replace(/:/g, '');
	const geometry = useMemo(() => {
		const raw = points.filter((point) => point.avg_latency_ms !== null).map((point) => point.avg_latency_ms as number);
		if (raw.length < 2) return null;
		const smoothed = raw.map((_, i) => {
			const window = raw.slice(Math.max(0, i - 1), i + 2);
			return window.reduce((sum, value) => sum + value, 0) / window.length;
		});
		const sorted = [...smoothed].sort((a, b) => a - b);
		const min = sorted[0];
		const ceiling = Math.max(sorted[Math.floor(sorted.length * 0.96)] ?? sorted.at(-1)!, min * 1.25, min + 8);
		const floor = Math.max(0, min - (ceiling - min) * 0.15);
		const coords = smoothed.map((value, index) => ({
			x: PAD + (index / (smoothed.length - 1)) * (WIDTH - PAD * 2),
			y: HEIGHT - PAD - ((Math.min(value, ceiling) - floor) / (ceiling - floor || 1)) * (HEIGHT - PAD * 2),
		}));
		const line = monotonePath(coords);
		return { coords, line, area: `${line} L${coords.at(-1)!.x},${HEIGHT} L${coords[0].x},${HEIGHT} Z`, latest: raw.at(-1)!, min: Math.min(...raw), max: Math.max(...raw) };
	}, [points]);

	const summary = geometry
		? `${label}：最近 ${formatLatency(geometry.latest)}，最低 ${formatLatency(geometry.min)}，最高 ${formatLatency(geometry.max)}`
		: `${label}：暂无数据`;
	if (!geometry) return <Box role="img" aria-label={summary} sx={{ height, borderRadius: 1, bgcolor: v('surface2') }} />;
	const stroke = quiet ? v('text3') : color;
	const end = geometry.coords.at(-1)!;
	return (
		<Box component="svg" role="img" aria-label={summary} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" sx={{ display: 'block', width: '100%', height, overflow: 'visible' }}>
			<title>{summary}</title>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={stroke} stopOpacity={quiet ? 0.08 : 0.16} />
					<stop offset="100%" stopColor={stroke} stopOpacity={0} />
				</linearGradient>
			</defs>
			<path d={geometry.area} fill={`url(#${gradientId})`} />
			<path d={geometry.line} fill="none" stroke={stroke} strokeOpacity={quiet ? 0.7 : 1} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
			<circle cx={end.x} cy={end.y} r={2.25} fill={quiet ? v('text2') : color} stroke={v('surface')} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
		</Box>
	);
}
