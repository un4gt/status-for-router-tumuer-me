import { Box, useTheme } from '@mui/material';
import { useId, useMemo, useState } from 'react';
import type { SeriesPoint } from '../api';
import { formatLatency } from '../format';

const WIDTH = 100;
const HEIGHT = 36;

export function Sparkline({
	points,
	color,
	height = 44,
	label = '延迟趋势',
}: {
	points: SeriesPoint[];
	color: string;
	height?: number;
	label?: string;
}) {
	const theme = useTheme();
	const gradientId = useId().replace(/:/g, '');
	const [hovered, setHovered] = useState<number | null>(null);

	const values = useMemo(
		() =>
			points
				.map((point, index) => ({ point, index }))
				.filter((item) => item.point.avg_latency_ms !== null),
		[points],
	);

	const geometry = useMemo(() => {
		if (values.length === 0) return null;
		const latencies = values.map((item) => item.point.avg_latency_ms as number);
		const min = Math.min(...latencies);
		const max = Math.max(...latencies);
		const span = max - min || 1;
		const coords = values.map((item, position) => {
			const x = values.length === 1 ? WIDTH : (position / (values.length - 1)) * WIDTH;
			const y = HEIGHT - 3 - (((item.point.avg_latency_ms as number) - min) / span) * (HEIGHT - 8);
			return { x, y, point: item.point, originalIndex: item.index };
		});
		const line = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');
		const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
		return { coords, line, area, min, max };
	}, [values]);

	const latest = values.at(-1)?.point.avg_latency_ms ?? null;
	const summary =
		geometry === null
			? `${label}：暂无数据`
			: `${label}：最近 ${formatLatency(latest)}，最低 ${formatLatency(geometry.min)}，最高 ${formatLatency(geometry.max)}`;

	const active =
		hovered !== null ? (geometry?.coords.find((coord) => coord.originalIndex === hovered) ?? null) : null;

	return (
		<Box
			sx={{ position: 'relative', width: '100%', height, minWidth: 0 }}
			onMouseLeave={() => setHovered(null)}
			onMouseMove={(event) => {
				if (!geometry || geometry.coords.length === 0) return;
				const rect = event.currentTarget.getBoundingClientRect();
				const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
				const nearest = geometry.coords.reduce((best, coord) =>
					Math.abs(coord.x / WIDTH - ratio) < Math.abs(best.x / WIDTH - ratio) ? coord : best,
				);
				setHovered(nearest.originalIndex);
			}}
		>
			{geometry === null ? (
				<Box
					aria-label={summary}
					role="img"
					sx={{ height: '100%', borderRadius: 1, border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover' }}
				/>
			) : (
				<Box
					component="svg"
					role="img"
					aria-label={summary}
					viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					preserveAspectRatio="none"
					sx={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
				>
					<title>{summary}</title>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={color} stopOpacity={0.22} />
							<stop offset="100%" stopColor={color} stopOpacity={0} />
						</linearGradient>
					</defs>
					<path d={geometry.area} fill={`url(#${gradientId})`} />
					<path
						d={geometry.line}
						fill="none"
						stroke={color}
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
					{active ? (
						<>
							<line
								x1={active.x}
								y1={0}
								x2={active.x}
								y2={HEIGHT}
								stroke={theme.palette.divider}
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
							<circle cx={active.x} cy={active.y} r={2.4} fill={theme.palette.background.paper} stroke={color} strokeWidth={2} />
						</>
					) : null}
					<circle
						cx={geometry.coords.at(-1)!.x}
						cy={geometry.coords.at(-1)!.y}
						r={2.4}
						fill={theme.palette.background.paper}
						stroke={color}
						strokeWidth={2}
						vectorEffect="non-scaling-stroke"
					/>
				</Box>
			)}
			{active ? (
				<Box
					sx={{
						position: 'absolute',
						left: `${(active.x / WIDTH) * 100}%`,
						top: `${(active.y / HEIGHT) * 100}%`,
						transform: 'translate(-50%, -135%)',
						px: 0.75,
						py: 0.25,
						borderRadius: 1,
						bgcolor: 'rgba(29,43,67,0.92)',
						color: '#fff',
						fontSize: '0.6875rem',
						fontVariantNumeric: 'tabular-nums',
						whiteSpace: 'nowrap',
						pointerEvents: 'none',
						zIndex: 2,
					}}
				>
					{formatLatency(active.point.avg_latency_ms)}
				</Box>
			) : null}
		</Box>
	);
}
