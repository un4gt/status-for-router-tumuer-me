import { Box, Stack, Tooltip, Typography } from '@mui/material';
import type { OverviewResponse, SourceStatus } from '../api';
import { SOURCE_LABELS } from '../constants';
import { size, v } from '../design/tokens';
import { formatAgoShort, formatDateTime } from '../format';

function SourceItem({ name, source, now }: { name: string; source: SourceStatus; now: number }) {
	const tone = !source.configured ? v('noneFill') : source.last_error ? v('warnFill') : v('okFill');
	const text = !source.configured ? '未配置' : source.last_sync_at ? `${formatAgoShort(source.last_sync_at, now)}同步` : '等待首次同步';
	return (
		<Tooltip
			title={
				<Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
					{source.last_sync_at ? `最近同步：${formatDateTime(source.last_sync_at)}` : '尚未同步'}
					{source.last_error ? '\n部分请求失败；失败的地区记为“无数据”，不计入故障。' : ''}
				</Box>
			}
		>
			<Stack direction="row" spacing={0.75} alignItems="center" tabIndex={0} sx={{ minWidth: 0, borderRadius: 1 }}>
				<Box component="span" aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tone, flexShrink: 0 }} />
				<Typography component="span" sx={{ fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>
					{SOURCE_LABELS[name] ?? name}
					<Box component="span" sx={{ color: v('text3'), opacity: 0.8 }}>
						{' · '}
						{text}
					</Box>
				</Typography>
			</Stack>
		</Tooltip>
	);
}

const LEGEND = [
	{ tone: 'okFill', label: '全部成功', tall: false },
	{ tone: 'warnFill', label: '少量失败', tall: true },
	{ tone: 'critFill', label: '大量失败', tall: true },
	{ tone: 'noneFill', label: '无检测', tall: false },
	{ tone: 'surface3', label: '未开始', tall: false, short: true },
] as const;

/** How to read the timeline, and where the numbers come from. */
export function SourceStatusBar({ overview, now }: { overview: OverviewResponse; now: number }) {
	const names = overview.mode === 'mock' ? ['mock'] : overview.mode === 'direct' ? ['direct'] : ['globalping', 'cloudprobe'];
	return (
		<Stack
			component="footer"
			direction={{ xs: 'column', md: 'row' }}
			spacing={{ xs: 1.25, md: 3 }}
			alignItems={{ md: 'center' }}
			justifyContent="space-between"
			sx={{ px: 2.5, py: 1.5, bgcolor: v('surface2'), borderTop: `1px solid ${v('border')}` }}
		>
			<Stack direction="row" spacing={2.5} useFlexGap flexWrap="wrap" alignItems="center" sx={{ minWidth: 0 }}>
				{names.map((name) => (overview.sources[name] ? <SourceItem key={name} name={name} source={overview.sources[name]} now={now} /> : null))}
			</Stack>
			<Stack direction="row" spacing={1.75} useFlexGap flexWrap="wrap" alignItems="center" aria-label="时间线图例">
				{LEGEND.map((item) => (
					<Stack key={item.label} direction="row" spacing={0.75} alignItems="center">
						<Box component="span" aria-hidden sx={{ width: 4, height: 'short' in item ? 5 : item.tall ? 14 : 9, borderRadius: '1px', bgcolor: v(item.tone) }} />
						<Typography component="span" sx={{ fontSize: size.xs, color: v('text3'), whiteSpace: 'nowrap' }}>
							{item.label}
						</Typography>
					</Stack>
				))}
			</Stack>
		</Stack>
	);
}
