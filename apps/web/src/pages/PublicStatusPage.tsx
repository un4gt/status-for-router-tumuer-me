import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchOverview, type ModelHealth, type OverviewResponse, type WindowKey } from '../api';
import { WINDOWS } from '../constants';
import { radius, size, v, weight } from '../design/tokens';
import { EmptyState } from '../components/EmptyState';
import { ModelDrawer } from '../components/ModelDrawer';
import { ModelRows, ModelTableHeader } from '../components/ModelTable';
import { ModelToolbar } from '../components/ModelToolbar';
import { PageLoading } from '../components/PageLoading';
import { RegionMatrix } from '../components/RegionMatrix';
import { RegionStrip } from '../components/RegionStrip';
import { SourceStatusBar } from '../components/SourceStatus';
import { StatusAura, StatusBanner } from '../components/StatusBanner';
import { PageSkeleton } from '../components/PageSkeleton';
import { GlobeGuard } from '../components/globe/GlobeGuard';
import { useViewTransition } from '../components/ViewTransition';
import { ViewModeSwitch } from '../components/ViewModeSwitch';
import { filterModels, sortModels, type SortKey } from '../status';
import { Icon, SearchX, Server } from '../design/icons';

const loadGlobe = () => import('../components/globe/GlobeStatusView');
const GlobeStatusView = lazy(loadGlobe);

type StatusSnapshot = {
	overview: OverviewResponse | null;
	summaryError: string | null;
	loading: boolean;
	refreshing: boolean;
	now: number;
};

const SORT_KEYS: SortKey[] = ['attention', 'name', 'availability', 'latency'];
const REFRESH_MS = 60_000;

/**
 * The 3D view costs ~160 KB of JS plus ~2.6 MB of textures. Warm it in the
 * background only on a large screen with a fast connection; everywhere else it
 * loads when the visitor asks for it.
 */
function canPrewarmGlobe() {
	if (typeof window === 'undefined') return false;
	const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
	// effectiveType is a live estimate that flips between 3g and 4g on ordinary links;
	// only skip on an explicit Data Saver request or a genuinely slow (2g) connection.
	if (connection?.saveData || /2g$/.test(connection?.effectiveType ?? '')) return false;
	return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
}

export function PublicStatusPage() {
	const { changeView, viewReady, publishViewUpdate } = useViewTransition();
	const [params, setParams] = useSearchParams();
	const rawWindow = params.get('window');
	const windowKey: WindowKey = WINDOWS.some((item) => item.key === rawWindow) ? (rawWindow as WindowKey) : '5h';
	const windowLabel = WINDOWS.find((item) => item.key === windowKey)!.label;
	const regionParam = params.get('region') || 'all';
	const sortParam = params.get('sort') as SortKey | null;
	const sort: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'attention';
	const showMatrix = params.get('view') === 'matrix';
	const globeMode = params.get('mode') === '3d';

	const [status, setStatus] = useState<StatusSnapshot>(() => ({ overview: null, summaryError: null, loading: true, refreshing: false, now: Date.now() }));
	const latestStatus = useRef(status);
	const { overview, summaryError, loading, refreshing, now } = status;
	const [reloadTick, setReloadTick] = useState(0);
	const [fallbackReason, setFallbackReason] = useState<string | null>(null);
	const [globeAllowed, setGlobeAllowed] = useState(false);
	const prewarmAttempted = useRef(false);
	const [query, setQuery] = useState('');
	const [openId, setOpenId] = useState<string | null>(null);
	const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

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
		if (mode === '3d') void loadGlobe();
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
		if (!overview?.topology || globeAllowed || prewarmAttempted.current || !canPrewarmGlobe()) return;
		const warm = () => {
			if (document.hidden) return;
			prewarmAttempted.current = true;
			setGlobeAllowed(true);
		};
		// Keep the first 2D paint ahead of module loading, texture upload and compilation.
		let idle: number | undefined;
		const timer = window.setTimeout(() => {
			if ('requestIdleCallback' in window) idle = window.requestIdleCallback(warm, { timeout: 4000 });
			else warm();
		}, 2500);
		return () => {
			clearTimeout(timer);
			if (idle !== undefined) window.cancelIdleCallback(idle);
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
			try {
				const next = await fetchOverview(windowKey, requestController.signal);
				publish({ overview: next, summaryError: null, now: Date.now(), loading: false, refreshing: false });
			} catch {
				publish({ summaryError: '暂时无法获取最新状态，页面显示的是上次结果，会自动重试。', loading: false, refreshing: false });
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
		const timer = window.setInterval(refreshWhenVisible, REFRESH_MS);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		return () => {
			cancelled = true;
			controller.abort();
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
		};
	}, [windowKey, reloadTick, publishViewUpdate]);

	const enabledModels = useMemo(() => overview?.models ?? [], [overview]);
	const visibleModels = useMemo(
		() => sortModels(filterModels(enabledModels, query), regionFilter, sort),
		[enabledModels, query, regionFilter, sort],
	);
	const openModel = useMemo(() => enabledModels.find((model) => model.id === openId) ?? null, [enabledModels, openId]);
	const onOpen = useCallback((model: ModelHealth) => setOpenId(model.id), []);

	const globeView = (
		<Box data-status-view="3d" hidden={!globeMode} sx={{ display: globeMode ? 'contents' : 'none' }}>
			<GlobeGuard onFallback={fallback}>
				<Suspense
					fallback={
						<Box data-color-scheme="dark" sx={{ position: 'fixed', inset: 0, zIndex: 1200, bgcolor: 'var(--g-bg, #05060f)', color: 'var(--g-text-1, #eceef8)', display: 'grid', placeContent: 'center', gap: 2, textAlign: 'center' }}>
							<PageLoading label="正在加载全球视图…" />
							<Button onClick={() => updateParams({ mode: null })} sx={{ color: 'var(--g-brand, #dfe3f2)' }}>
								返回列表
							</Button>
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
			<ViewModeSwitch mode={globeMode ? '3d' : '2d'} onChange={switchMode} covered={!!openModel} />
			{(globeMode || globeAllowed) && globeView}
			<Box
				ref={setScrollParent}
				data-status-view="2d"
				data-status-scroll
				hidden={globeMode}
				sx={{
					display: globeMode ? 'none' : 'block',
					position: 'relative',
					height: '100%',
					overflowY: 'auto',
					overflowX: 'hidden',
					overscrollBehavior: 'contain',
					scrollbarWidth: 'none',
					'&::-webkit-scrollbar': { display: 'none' },
				}}
			>
				<StatusAura overview={overview} />
				<Stack
					spacing={2.5}
					sx={{
						position: 'relative',
						maxWidth: 1440,
						mx: 'auto',
						pt: '56px',
						pl: 'max(16px, env(safe-area-inset-left))',
						pr: 'max(16px, env(safe-area-inset-right))',
						pb: 'max(48px, env(safe-area-inset-bottom))',
						'@media (min-width: 900px)': { pl: 'max(32px, env(safe-area-inset-left))', pr: 'max(32px, env(safe-area-inset-right))' },
					}}
				>
					{fallbackReason && (
						<Alert severity="info" onClose={() => setFallbackReason(null)} sx={{ mt: 2 }}>
							{fallbackReason}
						</Alert>
					)}
					{summaryError ? (
						<Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
							{summaryError}
						</Alert>
					) : null}
					{loading && !overview ? <PageSkeleton /> : null}

					{overview ? (
						<>
							<StatusBanner
								overview={overview}
								now={now}
								windowLabel={windowLabel}
								refreshing={refreshing}
								onRefresh={() => setReloadTick((value) => value + 1)}
							/>
							<RegionStrip overview={overview} value={regionFilter} onChange={(region) => updateParams({ region })} now={now} />

							<Box
								component="section"
								aria-labelledby="models-title"
								data-model-panel
								sx={{ bgcolor: v('surface'), boxShadow: v('shadow'), borderRadius: `${radius.section}px`, overflow: 'clip', animation: 'fadeUp 480ms 180ms var(--ease) both' }}
							>
								<ModelToolbar
									count={visibleModels.length}
									total={enabledModels.length}
									query={query}
									onQuery={setQuery}
									regions={overview.regions}
									region={regionFilter}
									onRegion={(region) => updateParams({ region })}
									windowKey={windowKey}
									onWindow={(window) => updateParams({ window })}
									sort={sort}
									onSort={(value) => updateParams({ sort: value === 'attention' ? null : value })}
									view={showMatrix ? 'matrix' : 'list'}
									onView={(next) => updateParams({ view: next === 'matrix' ? 'matrix' : null })}
								/>

								{enabledModels.length === 0 ? (
									<EmptyState icon={<Icon icon={Server} size={18} />} title="还没有监测的模型" description="在管理控制台选择模型并配置云函数检测后，这里会显示各模型的运行状态。" />
								) : visibleModels.length === 0 ? (
									<EmptyState
										icon={<Icon icon={SearchX} size={18} />}
										title={`没有名称包含“${query.trim()}”的模型`}
										action={
											<Button size="small" onClick={() => setQuery('')}>
												清除搜索
											</Button>
										}
									/>
								) : showMatrix ? (
									<RegionMatrix models={visibleModels} regions={overview.regions} selected={regionFilter} now={now} onOpen={onOpen} />
								) : (
									<>
										<ModelTableHeader regionLabel={regionFilter === 'all' ? null : (overview.regions.find((r) => r.id === regionFilter)?.label ?? null)} />
										<ModelRows models={visibleModels} regions={overview.regions} region={regionFilter} scrollParent={scrollParent} onOpen={onOpen} />
									</>
								)}
								<SourceStatusBar overview={overview} now={now} />
							</Box>
							<Typography sx={{ px: 0.5, pt: 0.5, fontSize: size.xs, color: v('text3') }}>
								{overview.mode === 'mock'
									? '当前为模拟数据，仅用于联调，不代表真实服务状态。'
									: overview.mode === 'direct'
										? '当前为本站直连检测，仅用于测试。'
										: '网关由 Globalping 全球节点检测；模型由各地区云函数发起真实请求检测。'}
							</Typography>
						</>
					) : null}
				</Stack>
			</Box>
			{overview ? (
				<ModelDrawer
					model={openModel}
					regions={overview.regions}
					initialRegion={regionFilter}
					windowKey={windowKey}
					windowLabel={windowLabel}
					revision={overview.generated_at}
					now={now}
					onClose={() => setOpenId(null)}
				/>
			) : null}
		</>
	);
}
