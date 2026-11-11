import { Box, Chip, IconButton, InputAdornment, MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import type { RegionInfo, WindowKey } from '../api';
import { WINDOWS } from '../constants';
import { size, v, weight } from '../design/tokens';
import type { SortKey } from '../status';
import { Icon, LayoutGrid, LayoutList, Search, X } from '../design/icons';

const SORTS: Array<{ key: SortKey; label: string }> = [
	{ key: 'attention', label: '问题优先' },
	{ key: 'name', label: '名称' },
	{ key: 'availability', label: '可用率最低' },
	{ key: 'latency', label: '延迟最高' },
];

/**
 * One quiet row: title and count, then search, time range as a segmented
 * control, sort and view. Region filtering lives on the region strip above.
 */
export function ModelToolbar({
	count,
	total,
	query,
	onQuery,
	regions,
	region,
	onRegion,
	windowKey,
	onWindow,
	sort,
	onSort,
	view,
	onView,
}: {
	count: number;
	total: number;
	query: string;
	onQuery: (value: string) => void;
	regions: RegionInfo[];
	region: string;
	onRegion: (value: string) => void;
	windowKey: WindowKey;
	onWindow: (value: WindowKey) => void;
	sort: SortKey;
	onSort: (value: SortKey) => void;
	view: 'list' | 'matrix';
	onView: (value: 'list' | 'matrix') => void;
}) {
	const regionLabel = regions.find((item) => item.id === region)?.label;
	return (
		<Stack
			direction={{ xs: 'column', md: 'row' }}
			spacing={1.5}
			alignItems={{ md: 'center' }}
			justifyContent="space-between"
			sx={{ px: 2.5, pt: 2, pb: 1.75 }}
		>
			<Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap" sx={{ minWidth: 0 }}>
				<Typography id="models-title" component="h2" sx={{ fontSize: size.lg, fontWeight: weight.semibold, letterSpacing: '-0.01em' }}>
					模型
				</Typography>
				<Typography component="span" className="num" sx={{ fontSize: size.sm, color: v('text3') }}>
					{count === total ? total : `${count} / ${total}`}
				</Typography>
				{regionLabel ? (
					<Chip
						size="small"
						label={`仅看 ${regionLabel}`}
						onDelete={() => onRegion('all')}
						deleteIcon={<Icon icon={X} size={14} />}
						sx={{ height: 24, bgcolor: v('brandSoft'), color: v('brandText'), fontWeight: weight.medium, '& .MuiChip-deleteIcon': { color: v('brandText'), mr: 0.5, '&:hover': { color: v('text1') } } }}
					/>
				) : null}
			</Stack>
			<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
				<TextField
					size="small"
					placeholder="搜索模型"
					value={query}
					onChange={(event) => onQuery(event.target.value)}
					inputProps={{ 'aria-label': '搜索模型', id: 'model-search' }}
					InputProps={{
						startAdornment: (
							<InputAdornment position="start" sx={{ mr: 0.5 }}>
								<Icon icon={Search} size={16} style={{ color: v('text3') }} />
							</InputAdornment>
						),
						endAdornment: query ? (
							<InputAdornment position="end">
								<IconButton size="small" aria-label="清除搜索" onClick={() => onQuery('')} sx={{ width: 22, height: 22, mr: -0.75 }}>
									<Icon icon={X} size={14} />
								</IconButton>
							</InputAdornment>
						) : null,
						sx: { height: 32, fontSize: size.sm, pl: 1.25 },
					}}
					sx={{ width: { xs: '100%', sm: 200 } }}
				/>
				<ToggleButtonGroup exclusive size="small" value={windowKey} onChange={(_, next) => next && onWindow(next)} aria-label="统计时间范围" sx={{ height: 32, flex: { xs: 1, sm: 'none' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' } } }}>
					{WINDOWS.map((item) => (
						<ToggleButton key={item.key} value={item.key} aria-label={item.label} className="num" sx={{ px: 1.25 }}>
							{item.key.toUpperCase()}
						</ToggleButton>
					))}
				</ToggleButtonGroup>
				<Select
					size="small"
					value={sort}
					onChange={(event) => onSort(event.target.value as SortKey)}
					inputProps={{ 'aria-label': '排序方式' }}
					renderValue={(value) => (
						<Box component="span" sx={{ color: v('text2') }}>
							排序：<Box component="span" sx={{ color: v('text1') }}>{SORTS.find((item) => item.key === value)?.label}</Box>
						</Box>
					)}
					sx={{ height: 32, fontSize: size.xs, minWidth: 132, '& .MuiSelect-select': { py: 0, pl: 1.25, display: 'flex', alignItems: 'center' } }}
				>
					{SORTS.map((item) => (
						<MenuItem key={item.key} value={item.key}>
							{item.label}
						</MenuItem>
					))}
				</Select>
				<ToggleButtonGroup exclusive size="small" value={view} onChange={(_, next) => next && onView(next)} aria-label="展示方式" sx={{ height: 32, display: { xs: 'none', sm: 'inline-flex' } }}>
					<Tooltip title="列表">
						<ToggleButton value="list" aria-label="列表" sx={{ px: 0.875 }}>
							<Icon icon={LayoutList} size={16} />
						</ToggleButton>
					</Tooltip>
					<Tooltip title="地区对比">
						<ToggleButton value="matrix" aria-label="地区对比" sx={{ px: 0.875 }}>
							<Icon icon={LayoutGrid} size={14} />
						</ToggleButton>
					</Tooltip>
				</ToggleButtonGroup>
			</Stack>
		</Stack>
	);
}
