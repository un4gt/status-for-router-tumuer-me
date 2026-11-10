import { Box, Stack, Tooltip, Typography } from '@mui/material';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import type { OverviewResponse, SourceStatus } from '../api';
import { formatAgoShort } from '../format';

const LABELS: Record<string, string> = {
	globalping: 'Globalping',
	cloudprobe: '云函数拨测',
	mock: 'Mock 数据',
	direct: '本站直连',
};

function SourceItem({ name, source }: { name: string; source: SourceStatus }) {
	const hasError = Boolean(source.last_error);
	const statusColor = !source.configured ? 'text.secondary' : hasError ? 'error.main' : 'success.main';
	return (
		<Tooltip
			arrow
			title={
				<Box sx={{ maxWidth: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
					{source.configured ? (source.last_sync_at ? `最近同步：${new Date(source.last_sync_at).toLocaleString('zh-CN')}` : '尚未同步') : '未配置拨测函数'}
					{source.last_error ? `\n错误：${source.last_error}` : ''}
					{source.last_warning ? `\n提示：${source.last_warning}` : ''}
				</Box>
			}
		>
			<Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
				<Box component="span" sx={{ color: statusColor, display: 'inline-flex' }}>
					{hasError ? <ErrorOutlineRounded sx={{ fontSize: 14 }} /> : <CheckCircleOutlineRounded sx={{ fontSize: 14 }} />}
				</Box>
				<Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
					{LABELS[name] ?? name}
					{source.configured
						? source.last_sync_at
							? ` · ${formatAgoShort(source.last_sync_at)}`
							: ' · 待同步'
						: ' · 未配置'}
				</Typography>
			</Stack>
		</Tooltip>
	);
}

export function SourceStatusBar({ overview }: { overview: OverviewResponse }) {
	const names =
		overview.mode === 'mock'
			? ['mock']
			: overview.mode === 'direct'
				? ['direct']
				: ['globalping', 'cloudprobe'];
	return (
		<Stack
			direction="row"
			spacing={2}
			useFlexGap
			flexWrap="wrap"
			alignItems="center"
			justifyContent="space-between"
			sx={{ minWidth: 0, pt: 0.25 }}
		>
			<Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center" sx={{ minWidth: 0 }}>
				{names.map((name) =>
					overview.sources[name] ? <SourceItem key={name} name={name} source={overview.sources[name]} /> : null,
				)}
				{overview.mode === 'mock' ? (
					<Stack direction="row" spacing={0.5} alignItems="center">
						<ScienceOutlined sx={{ fontSize: 14, color: 'warning.dark' }} />
						<Typography variant="caption" sx={{ color: '#b45309', fontWeight: 500 }}>
							模拟数据，仅用于联调
						</Typography>
					</Stack>
				) : null}
			</Stack>
			<Stack
				direction="row"
				spacing={1.75}
				alignItems="center"
				sx={{ display: { xs: 'none', sm: 'flex' }, color: 'text.secondary' }}
			>
				<Stack direction="row" spacing={0.6} alignItems="center">
					<Box component="span" sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: 'success.main' }} />
					<Typography variant="caption" color="text.secondary">
						正常 ≥99%
					</Typography>
				</Stack>
				<Stack direction="row" spacing={0.6} alignItems="center">
					<Box component="span" sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: 'warning.main' }} />
					<Typography variant="caption" color="text.secondary">
						降级 95–99%
					</Typography>
				</Stack>
				<Stack direction="row" spacing={0.6} alignItems="center">
					<Box component="span" sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: 'error.main' }} />
					<Typography variant="caption" color="text.secondary">
						故障 &lt;95%
					</Typography>
				</Stack>
			</Stack>
		</Stack>
	);
}
