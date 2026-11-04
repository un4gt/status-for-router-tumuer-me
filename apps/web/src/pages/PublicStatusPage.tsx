import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Divider,
	FormControl,
	InputLabel,
	MenuItem,
	Paper,
	Select,
	Stack,
	Typography,
} from '@mui/material';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import ViewAgendaRounded from '@mui/icons-material/ViewAgendaRounded';
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchOverview, type OverviewResponse, type WindowKey } from '../api';
import { STATUS_BACKGROUNDS, STATUS_COLORS, STATUS_LABELS, WINDOWS } from '../constants';
import { EmptyState } from '../components/EmptyState';
import { GatewayHealthCard } from '../components/GatewayHealthCard';
import { ModelHealthRow } from '../components/ModelHealthRow';
import { RegionFilter } from '../components/RegionFilter';
import { RegionMatrix } from '../components/RegionMatrix';
import { SourceStatusBar } from '../components/SourceStatus';

export function PublicStatusPage() {
	const [params, setParams] = useSearchParams();
	const rawWindow = params.get('window');
	const windowKey: WindowKey = WINDOWS.some((item) => item.key === rawWindow) ? (rawWindow as WindowKey) : '5h';
	const regionParam = params.get('region') || 'all';

	const [overview, setOverview] = useState<OverviewResponse | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [now, setNow] = useState(Date.now());
	const showMatrix = params.get('view') === 'matrix';
	const [reloadTick, setReloadTick] = useState(0);

	const regionFilter =
		regionParam === 'all' || overview?.regions.some((region) => region.id === regionParam) ? regionParam : 'all';

	function updateParams(patch: Record<string, string | null>) {
		const next = new URLSearchParams(params);
		for (const [key, value] of Object.entries(patch)) {
			if (value === null || value === 'all') next.delete(key);
			else next.set(key, value);
		}
		setParams(next, { replace: true });
	}

	useEffect(() => {
		let cancelled = false;
		let inFlight = false;
		const controller = new AbortController();

		async function refresh(initial = false) {
			if (inFlight || cancelled) return;
			inFlight = true;
			if (initial) setLoading(true);
			else setRefreshing(true);
			const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
			try {
				const next = await fetchOverview(windowKey, signal);
				if (cancelled) return;
				setOverview(next);
				setSummaryError(null);
				setNow(Date.now());
			} catch {
				if (!cancelled) setSummaryError('状态暂时无法更新，将自动重试。');
			} finally {
				inFlight = false;
				if (!cancelled) {
					setLoading(false);
					setRefreshing(false);
				}
			}
		}

		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		void refresh(true);
		const timer = window.setInterval(refreshWhenVisible, 60_000);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		return () => {
			cancelled = true;
			controller.abort();
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
		};
	}, [windowKey, reloadTick]);

	const counts = useMemo(() => {
		const result: Record<string, number> = { operational: 0, degraded: 0, outage: 0, maintenance: 0, unknown: 0 };
		for (const model of overview?.models ?? []) result[model.status] = (result[model.status] ?? 0) + 1;
		return result;
	}, [overview]);

	return (
		<Stack
			spacing={{ xs: 2.5, sm: 3 }}
			sx={{
				'@keyframes riseIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
				'& > *': { animation: 'riseIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both' },
				'& > *:nth-of-type(2)': { animationDelay: '60ms' },
				'& > *:nth-of-type(3)': { animationDelay: '120ms' },
				'@media (prefers-reduced-motion: reduce)': { '& > *': { animation: 'none' } },
			}}
		>
			<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ md: 'flex-end' }}>
				<Box>
					<Typography variant="caption" sx={{ letterSpacing: '0.14em', fontWeight: 700, color: 'text.secondary' }}>
						STATUS OVERVIEW
					</Typography>
					<Typography component="h1" variant="h4" sx={{ mt: 0.5 }}>
						网关与模型健康
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 680 }}>
						Globalping 多地区网络探针 + 腾讯云函数真实请求与响应校验，统一展示整体和分地区状态。
					</Typography>
				</Box>
				<Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} useFlexGap flexWrap="wrap">
					{refreshing ? <CircularProgress size={18} aria-label="正在刷新" /> : null}
					<FormControl size="small" sx={{ minWidth: 170 }}>
						<InputLabel id="window-label">显示范围</InputLabel>
						<Select
							labelId="window-label"
							label="显示范围"
							value={windowKey}
							onChange={(event) => updateParams({ window: event.target.value })}
						>
							{WINDOWS.map((item) => (
								<MenuItem value={item.key} key={item.key}>
									{item.label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
					<Button
						variant="outlined"
						color="inherit"
						size="small"
						startIcon={<RefreshRounded />}
						disabled={refreshing}
						onClick={() => setReloadTick((value) => value + 1)}
					>
						刷新
					</Button>
				</Stack>
			</Stack>

			{overview?.mode === 'mock' ? (
				<Alert severity="warning" icon={<ScienceOutlined />}>
					当前为模拟数据（MONITORING_MODE=mock），用于界面与联调测试，不代表真实服务状态。
				</Alert>
			) : null}
			{overview?.mode === 'direct' ? (
				<Alert severity="info">当前为本站直连模式，仅供测试与兜底使用，生产环境应使用 Globalping + 云函数拨测。</Alert>
			) : null}
			{summaryError ? <Alert severity="error">{summaryError}</Alert> : null}
			{loading && !overview ? (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
					<CircularProgress />
				</Box>
			) : null}

			{overview ? (
				<>
					<GatewayHealthCard
						overview={overview}
						regionFilter={regionFilter}
						onRegionSelect={(region) => updateParams({ region })}
						now={now}
						windowKey={windowKey}
					/>

					<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: '20px' }}>
						<Stack spacing={2}>
							<Stack
								direction={{ xs: 'column', lg: 'row' }}
								spacing={1.5}
								justifyContent="space-between"
								alignItems={{ lg: 'flex-end' }}
							>
								<Box sx={{ minWidth: 0 }}>
									<Typography variant="caption" sx={{ letterSpacing: '0.12em', fontWeight: 700, color: 'text.secondary' }}>
										MODEL HEALTH
									</Typography>
									<Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
										<Typography component="h2" variant="h5">
											模型健康
										</Typography>
										{(['operational', 'degraded', 'outage', 'unknown'] as const).map((status) =>
											counts[status] > 0 ? (
												<Chip
													key={status}
													size="small"
													label={`${counts[status]} ${STATUS_LABELS[status]}`}
													sx={{
														height: 22,
														fontSize: '0.6875rem',
														bgcolor: STATUS_BACKGROUNDS[status],
														color: STATUS_COLORS[status],
														fontWeight: 700,
													}}
												/>
											) : null,
										)}
									</Stack>
									<Typography variant="caption" color="text.secondary">
										由各地区的腾讯云函数定时发送真实请求并校验响应值；统一视图按地区样本加权。
									</Typography>
								</Box>
								<Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }} useFlexGap flexWrap="wrap">
									<RegionFilter
										regions={overview.regions}
										value={regionFilter}
										onChange={(region) => updateParams({ region })}
									/>
									<Button
										variant={showMatrix ? 'contained' : 'outlined'}
										color={showMatrix ? 'primary' : 'inherit'}
										size="small"
										startIcon={showMatrix ? <ViewAgendaRounded /> : <GridViewRounded />}
										onClick={() => updateParams({ view: showMatrix ? null : 'matrix' })}
									>
										{showMatrix ? '列表视图' : '地区矩阵'}
									</Button>
								</Stack>
							</Stack>

							<Divider />

							{overview.models.length === 0 ? (
								<EmptyState icon={<WidgetsOutlined />} title="暂无模型监测数据" description="在管理控制台选择模型并配置云函数拨测后，这里会显示模型健康。" />
							) : showMatrix ? (
								<RegionMatrix models={overview.models} regions={overview.regions} now={now} />
							) : (
								<Box>
									{overview.models.map((model) => (
										<ModelHealthRow
											key={model.id}
											model={model}
											regions={overview.regions}
											regionFilter={regionFilter}
											windowKey={windowKey}
											now={now}
											onRegionSelect={(region) => updateParams({ region })}
										/>
									))}
								</Box>
							)}

							<Divider />
							<SourceStatusBar overview={overview} />
							<Typography variant="caption" color="text.secondary">
								网络层只验证可达性与延迟；业务层由腾讯云函数校验 HTTP 状态码和响应字段。无数据地区不计入故障率。
							</Typography>
						</Stack>
					</Paper>
				</>
			) : null}
		</Stack>
	);
}
