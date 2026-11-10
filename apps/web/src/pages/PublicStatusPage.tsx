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
import ViewAgendaRounded from '@mui/icons-material/ViewAgendaRounded';
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchOverview, type OverviewResponse, type WindowKey } from '../api';
import { STATUS_BACKGROUNDS, STATUS_BORDERS, STATUS_COLORS, STATUS_LABELS, WINDOWS, availabilityStatus } from '../constants';
import { formatAgoShort } from '../format';
import { EmptyState } from '../components/EmptyState';
import { GatewayHealthCard } from '../components/GatewayHealthCard';
import { VirtualModelList } from '../components/VirtualModelList';
import { RegionFilter } from '../components/RegionFilter';
import { RegionMatrix } from '../components/RegionMatrix';
import { SourceStatusBar } from '../components/SourceStatus';
import { GlobeGuard } from '../components/globe/GlobeGuard';
import { useViewTransition } from '../components/ViewTransition';
import { ViewModeSwitch } from '../components/ViewModeSwitch';

const GlobeStatusView = lazy(() => import('../components/globe/GlobeStatusView'));

type StatusSnapshot = {
	overview: OverviewResponse | null;
	summaryError: string | null;
	loading: boolean;
	refreshing: boolean;
	now: number;
};

export function PublicStatusPage() {
	const { changeView, viewReady, publishViewUpdate } = useViewTransition();
	const [params, setParams] = useSearchParams();
	const rawWindow = params.get('window');
	const windowKey: WindowKey = WINDOWS.some((item) => item.key === rawWindow) ? (rawWindow as WindowKey) : '5h';
	const regionParam = params.get('region') || 'all';

	const [status, setStatus] = useState<StatusSnapshot>(() => ({
		overview: null,
		summaryError: null,
		loading: true,
		refreshing: false,
		now: Date.now(),
	}));
	const latestStatus = useRef(status);
	const { overview, summaryError, loading, refreshing, now } = status;
	const showMatrix = params.get('view') === 'matrix';
	const [reloadTick, setReloadTick] = useState(0);
	const globeMode = params.get('mode') === '3d';
	const [fallbackReason, setFallbackReason] = useState<string | null>(null);
	const [globeAllowed, setGlobeAllowed] = useState(false);
	const prewarmAttempted = useRef(false);
	useEffect(() => {
		if (!globeMode) viewReady();
	}, [globeMode, viewReady]);

	const regionFilter = regionParam === 'all' || overview?.regions.some((region) => region.id === regionParam) ? regionParam : 'all';

	function updateParams(patch: Record<string, string | null>) {
		const next = new URLSearchParams(params);
		for (const [key, value] of Object.entries(patch)) {
			if (value === null || value === 'all') next.delete(key);
			else next.set(key, value);
		}
		setParams(next, { replace: true });
	}
	function fallback(reason: string) {
		setGlobeAllowed(false);
		// A failed background warmup must not disturb the 2D page.
		if (globeMode) {
			setFallbackReason(reason);
			updateParams({ mode: null });
		}
	}
	function switchMode(mode: '2d' | '3d') {
		changeView(mode, () => updateParams({ mode: mode === '3d' ? '3d' : null }));
	}
	useEffect(() => {
		if (!globeMode || globeAllowed) return;
		prewarmAttempted.current = true;
		// The real renderer is the capability check; do not allocate a throwaway context.
		setFallbackReason(null);
		setGlobeAllowed(true);
	}, [globeMode, globeAllowed]);
	useEffect(() => {
		if (!overview?.topology || globeAllowed || prewarmAttempted.current) return;
		const warm = () => {
			if (document.hidden) return;
			prewarmAttempted.current = true;
			setGlobeAllowed(true);
		};
		// Keep the first 2D paint ahead of module loading, texture upload and compilation.
		let idle: number | undefined;
		const timer = window.setTimeout(() => {
			if ('requestIdleCallback' in window) idle = window.requestIdleCallback(warm, { timeout: 2000 });
			else warm();
		}, 500);
		document.addEventListener('visibilitychange', warm);
		return () => {
			clearTimeout(timer);
			if (idle !== undefined) window.cancelIdleCallback(idle);
			document.removeEventListener('visibilitychange', warm);
		};
	}, [!!overview?.topology, globeAllowed]);

	useEffect(() => {
		let cancelled = false;
		let inFlight = false;
		const controller = new AbortController();
		const publish = (patch: Partial<StatusSnapshot>) => {
			if (cancelled) return;
			// Merge before queuing so a later loading/error update preserves new data.
			const next = { ...latestStatus.current, ...patch };
			latestStatus.current = next;
			publishViewUpdate(() => {
				if (!cancelled) setStatus(next);
			});
		};

		async function refresh(initial = false) {
			if (inFlight || cancelled) return;
			inFlight = true;
			publish(initial ? { loading: true } : { refreshing: true });
			// AbortSignal.any is absent on older iOS/Samsung browsers.
			const requestController = new AbortController();
			const cancelRequest = () => requestController.abort();
			controller.signal.addEventListener('abort', cancelRequest, { once: true });
			const requestTimer = window.setTimeout(cancelRequest, 15_000);
			const signal = requestController.signal;
			try {
				const next = await fetchOverview(windowKey, signal);
				publish({ overview: next, summaryError: null, now: Date.now(), loading: false, refreshing: false });
			} catch {
				publish({ summaryError: '状态暂时无法更新，将自动重试。', loading: false, refreshing: false });
			} finally {
				clearTimeout(requestTimer);
				controller.signal.removeEventListener('abort', cancelRequest);
				inFlight = false;
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
	}, [windowKey, reloadTick, publishViewUpdate]);

	const counts = useMemo(() => {
		const result: Record<string, number> = { operational: 0, degraded: 0, outage: 0, maintenance: 0, unknown: 0 };
		for (const model of overview?.models ?? []) {
			const effectiveStatus =
				regionFilter === 'all'
					? model.last_status === 'failure'
						? model.status
						: availabilityStatus(model.availability, model.total_count)
					: (model.regions[regionFilter]?.status ?? 'unknown');
			result[effectiveStatus] = (result[effectiveStatus] ?? 0) + 1;
		}
		return result;
	}, [overview, regionFilter]);

	const latestModelCheckAt = useMemo(() => {
		let max = 0;
		for (const model of overview?.models ?? []) {
			if (model.last_checked_at && model.last_checked_at > max) max = model.last_checked_at;
		}
		return max > 0 ? max : null;
	}, [overview]);

	const globeView = (
		<Box data-status-view="3d" hidden={!globeMode} sx={{ display: globeMode ? 'contents' : 'none' }}>
			<GlobeGuard onFallback={fallback}>
				<Suspense
					fallback={
						<Box sx={{ height: '100dvh', bgcolor: '#070f1c', color: '#dce9f5', display: 'grid', placeContent: 'center', gap: 2 }}>
							<CircularProgress />
							<Typography>正在加载全球视图…</Typography>
							<Button onClick={() => updateParams({ mode: null })}>返回 2D</Button>
						</Box>
					}
				>
					{globeAllowed && (
						<GlobeStatusView
							active={globeMode}
							overview={overview}
							windowKey={windowKey}
							error={summaryError}
							refreshing={refreshing || loading}
							onWindowChange={(window) => updateParams({ window })}
							onRefresh={() => setReloadTick((value) => value + 1)}
							onExit={() => switchMode('2d')}
							onFallback={fallback}
						/>
					)}
				</Suspense>
			</GlobeGuard>
		</Box>
	);

	return (
		<>
			<ViewModeSwitch mode={globeMode ? '3d' : '2d'} onChange={switchMode} />
			{(globeMode || globeAllowed) && globeView}
			<Stack
				data-status-view="2d"
				hidden={globeMode}
				spacing={1.25}
				sx={{ display: globeMode ? 'none' : 'flex', height: '100%', minHeight: 0, '& > *': { flexShrink: 0 } }}
			>
				<Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
					<Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap">
						<Typography
							component="h1"
							variant="h5"
							sx={{ fontSize: '1.25rem', fontWeight: 750, letterSpacing: '-0.025em', color: '#0f172a' }}
						>
							网关与模型健康
						</Typography>
						{overview?.mode === 'mock' && (
							<Chip
								size="small"
								label="模拟数据"
								sx={{
									height: 22,
									fontSize: '0.7rem',
									fontWeight: 650,
									bgcolor: '#fffbeb',
									color: '#b45309',
									border: '1px solid rgba(245, 158, 11, 0.28)',
								}}
							/>
						)}
					</Stack>
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
						useFlexGap
						flexWrap="wrap"
					>
						{refreshing ? <CircularProgress size={16} aria-label="正在刷新" /> : null}
						<FormControl size="small" sx={{ minWidth: 136 }}>
							<InputLabel id="window-label" sx={{ display: 'none' }}>
								显示范围
							</InputLabel>
							<Select
								labelId="window-label"
								notched={false}
								value={windowKey}
								onChange={(event) => updateParams({ window: event.target.value })}
								sx={{
									height: 34,
									borderRadius: '10px',
									bgcolor: '#ffffff',
									fontSize: '0.8125rem',
									fontWeight: 600,
									color: '#1e293b',
									'& .MuiSelect-select': { py: 0, display: 'flex', alignItems: 'center', height: '100%' },
								}}
							>
								{WINDOWS.map((item) => (
									<MenuItem value={item.key} key={item.key} sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>
										{item.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<Button
							variant="outlined"
							color="inherit"
							size="small"
							startIcon={<RefreshRounded sx={{ fontSize: '16px !important' }} />}
							disabled={refreshing}
							onClick={() => setReloadTick((value) => value + 1)}
							sx={{
								height: 34,
								px: 1.5,
								borderRadius: '10px',
								bgcolor: '#ffffff',
								borderColor: '#dbe3ef',
								color: '#1e293b',
								fontSize: '0.8125rem',
								fontWeight: 600,
								'&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
							}}
						>
							刷新
						</Button>
					</Stack>
				</Stack>

				{fallbackReason && (
					<Alert severity="info" onClose={() => setFallbackReason(null)}>
						{fallbackReason}
					</Alert>
				)}
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
						<Box
							data-status-summary
							sx={{
								maxHeight: { xs: '30%', md: 'none' },
								overflow: 'auto',
								scrollbarWidth: 'none',
								'&::-webkit-scrollbar': { display: 'none' },
							}}
						>
							<GatewayHealthCard
								overview={overview}
								regionFilter={regionFilter}
								onRegionSelect={(region) => updateParams({ region })}
								now={now}
								windowKey={windowKey}
							/>
						</Box>

						<Paper
							data-model-panel
							variant="outlined"
							sx={{
								p: { xs: 1.25, md: 1.5 },
								'@media (min-width: 900px) and (max-height: 750px)': { p: 1.1 },
								borderRadius: '16px',
								flex: '1 1 0',
								minHeight: 0,
								overflow: 'hidden',
							}}
						>
							<Stack spacing={0.85} sx={{ height: '100%', minHeight: 0, '& > *': { flexShrink: 0 } }}>
								<Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
									<Box sx={{ minWidth: 0 }}>
										<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
											<Typography component="h2" variant="h5" sx={{ fontSize: '1.05rem', fontWeight: 750, color: '#0f172a' }}>
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
															fontSize: '0.7rem',
															bgcolor: STATUS_BACKGROUNDS[status],
															color: STATUS_COLORS[status],
															border: '1px solid',
															borderColor: STATUS_BORDERS[status],
															fontWeight: 700,
														}}
													/>
												) : null,
											)}
											<Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.25 }}>
												{latestModelCheckAt
													? `更新于 ${formatAgoShort(latestModelCheckAt, now)}`
													: `共 ${overview.models.length} 个监控模型`}
											</Typography>
										</Stack>
									</Box>
									<Stack
										direction="row"
										spacing={1}
										alignItems="center"
										justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}
										useFlexGap
										flexWrap="wrap"
									>
										<RegionFilter regions={overview.regions} value={regionFilter} onChange={(region) => updateParams({ region })} />
										<Button
											variant={showMatrix ? 'contained' : 'outlined'}
											color={showMatrix ? 'primary' : 'inherit'}
											size="small"
											startIcon={
												showMatrix ? (
													<ViewAgendaRounded sx={{ fontSize: '16px !important' }} />
												) : (
													<GridViewRounded sx={{ fontSize: '16px !important' }} />
												)
											}
											onClick={() => updateParams({ view: showMatrix ? null : 'matrix' })}
											sx={{
												height: 32,
												px: 1.35,
												borderRadius: '9px',
												fontSize: '0.75rem',
												fontWeight: 650,
												...(showMatrix
													? {}
													: {
															bgcolor: '#ffffff',
															borderColor: '#e2e8f0',
															color: '#334155',
															'&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
														}),
											}}
										>
											{showMatrix ? '列表视图' : '地区矩阵'}
										</Button>
									</Stack>
								</Stack>

								<Divider sx={{ borderColor: 'rgba(226, 232, 240, 0.75)' }} />

								<Box
									sx={{
										flex: '1 1 0',
										minHeight: 0,
										overflow: showMatrix ? 'auto' : 'hidden',
										scrollbarWidth: 'none',
										'&::-webkit-scrollbar': { display: 'none' },
									}}
								>
									{overview.models.length === 0 ? (
										<EmptyState
											icon={<WidgetsOutlined />}
											title="暂无模型监测数据"
											description="在管理控制台选择模型并配置云函数拨测后，这里会显示模型健康。"
										/>
									) : showMatrix ? (
										<RegionMatrix models={overview.models} regions={overview.regions} now={now} />
									) : (
										<VirtualModelList
											models={overview.models}
											regions={overview.regions}
											regionFilter={regionFilter}
											windowKey={windowKey}
											now={now}
											onRegionSelect={(region) => updateParams({ region })}
										/>
									)}
								</Box>

								<Divider sx={{ borderColor: 'rgba(226, 232, 240, 0.75)' }} />
								<SourceStatusBar overview={overview} />
							</Stack>
						</Paper>
					</>
				) : null}
			</Stack>
		</>
	);
}
