import { Box, Tooltip, useTheme } from '@mui/material';
import type { TimeseriesResponse } from '../api';

function bucketRange(from: number, to: number, step: number) {
	const start = Math.floor(from / step) * step;
	const end = Math.floor((to - 1) / step) * step;
	const out: number[] = [];
	for (let ts = start; ts <= end; ts += step) out.push(ts);
	return out;
}

function formatDateTimeShort(ts: number) {
	return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }).format(
		new Date(ts),
	);
}

export type UptimeBarProps = {
	timeseries: Pick<TimeseriesResponse, 'from' | 'to' | 'bucket_ms' | 'series'> | null;
	loading?: boolean;
	placeholderCount?: number;
	height?: number;
};

export function UptimeBar({ timeseries, loading = false, placeholderCount = 48, height = 14 }: UptimeBarProps) {
	const theme = useTheme();

	if (loading) {
		return (
			<Box
				sx={{
					display: 'flex',
					gap: '3px',
					alignItems: 'center',
					width: '100%',
					minWidth: 0,
					overflow: 'hidden',
					py: '2px',
					'@keyframes barPulse': {
						'0%': { opacity: 0.35 },
						'50%': { opacity: 0.9 },
						'100%': { opacity: 0.35 },
					},
				}}
			>
				{Array.from({ length: placeholderCount }).map((_, idx) => (
					<Box
						// eslint-disable-next-line react/no-array-index-key
						key={idx}
						sx={{
							flex: '1 1 0',
							minWidth: 0,
							height,
							borderRadius: 1,
							bgcolor: theme.palette.action.disabledBackground,
							animation: 'barPulse 1.2s ease-in-out infinite',
							animationDelay: `${(idx % 24) * 0.03}s`,
						}}
					/>
				))}
			</Box>
		);
	}

	if (!timeseries) return <Box sx={{ display: 'flex', gap: '3px', alignItems: 'center', width: '100%' }} />;

	const { from, to, bucket_ms: bucketMs, series } = timeseries;
	const buckets = bucketRange(from, to, bucketMs);
	const seriesByTs = new Map(series.map((s) => [s.ts, s]));

	return (
		<Box
			sx={{
				display: 'flex',
				gap: '3px',
				alignItems: 'center',
				width: '100%',
				minWidth: 0,
				overflowX: 'hidden',
				py: '2px',
			}}
		>
			{buckets.map((ts) => {
				const point = seriesByTs.get(ts);
				const availability = point?.availability ?? null;
				const total = point?.total_count ?? 0;
				const success = point?.success_count ?? 0;
				const avgLatency = point?.avg_latency_ms ?? null;

				let color: string;
				if (!point || total === 0 || availability === null) color = theme.palette.action.disabledBackground;
				else if (availability === 1) color = theme.palette.success.main;
				else if (availability === 0) color = theme.palette.error.main;
				else color = theme.palette.warning.main;

				const availabilityText = availability === null ? '—' : `${(availability * 100).toFixed(2)}%`;
				const title = point
					? `${formatDateTimeShort(ts)}  |  ${success}/${total}  |  ${availabilityText}${
							avgLatency === null ? '' : `  |  ${avgLatency}ms`
						}`
					: `${formatDateTimeShort(ts)}  |  No data`;

				return (
					<Tooltip key={ts} title={title} arrow>
						<Box sx={{ flex: '1 1 0', minWidth: 0, height, borderRadius: 1, bgcolor: color }} />
					</Tooltip>
				);
			})}
		</Box>
	);
}
