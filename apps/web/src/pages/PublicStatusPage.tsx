import {
	Alert,
	Box,
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
import { useEffect, useState } from 'react';
import { fetchSummary, fetchTimeseries, type SummaryResponse, type TimeseriesResponse, type WindowKey } from '../api';
import { WINDOWS } from '../constants';
import { UptimeBar } from '../components/UptimeBar';
import { EmptyState } from '../components/EmptyState';
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined';

function formatAgoShort(ts: number | null, nowMs = Date.now()) {
	if (!ts) return '—';
	const delta = Math.max(0, nowMs - ts);
	if (delta < 60_000) return '刚刚';
	const mins = Math.floor(delta / 60_000);
	if (mins < 60) return `${mins} 分钟前`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours} 小时前`;
	const days = Math.round(hours / 24);
	return `${days} 天前`;
}

function formatPercentShort(value: number | null): string {
	if (value === null) return '—';
	return `${(value * 100).toFixed(2)}%`;
}

function checkTitle(check: SummaryResponse['checks'][number]) {
	if (check.type === 'head') {
		try {
			return new URL(check.target).hostname;
		} catch {
			return 'HEAD';
		}
	}
	return check.model || check.id;
}

function placeholderCountForWindow(window: WindowKey) {
	switch (window) {
		case '5h':
			return 60;
		case '24h':
			return 48;
		case '7d':
			return 84;
		case '30d':
			return 120;
		default:
			return 48;
	}
}

function availabilityFromTimeseries(ts: TimeseriesResponse | null, window: WindowKey): number | null {
	if (!ts || ts.window !== window) return null;
	let total = 0;
	let success = 0;
	for (const p of ts.series) {
		total += p.total_count ?? 0;
		success += p.success_count ?? 0;
	}
	return total > 0 ? success / total : null;
}

export function PublicStatusPage() {
	const [summary, setSummary] = useState<SummaryResponse | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const [windowKey, setWindowKey] = useState<WindowKey>('5h');
	const [timelineLoading, setTimelineLoading] = useState(false);
	const [timelineError, setTimelineError] = useState<string | null>(null);
	const [timelineByCheckId, setTimelineByCheckId] = useState<Record<string, TimeseriesResponse | null>>({});

	useEffect(() => {
		let cancelled = false;
		let refreshing = false;
		const controller = new AbortController();

		async function refresh(initial = false) {
			if (refreshing || cancelled) return;
			refreshing = true;
			if (initial) setTimelineLoading(true);
			const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
			try {
				const nextSummary = await fetchSummary(signal);
				if (cancelled) return;
				setSummary(nextSummary);
				setSummaryError(null);
				const settled = await Promise.allSettled(
					nextSummary.checks.map((c) => fetchTimeseries({ type: c.type, model: c.model ?? undefined, window: windowKey }, signal)),
				);
				if (cancelled) return;
				setTimelineByCheckId((previous) => {
					const next: Record<string, TimeseriesResponse | null> = {};
					settled.forEach((result, index) => {
						const id = nextSummary.checks[index].id;
						next[id] = result.status === 'fulfilled' ? result.value : previous[id]?.window === windowKey ? previous[id] : null;
					});
					return next;
				});
				setTimelineError(settled.some((result) => result.status === 'rejected') ? '部分趋势暂时无法更新，将自动重试。' : null);
			} catch {
				if (!cancelled) setSummaryError('状态暂时无法更新，将自动重试。');
			} finally {
				refreshing = false;
				if (!cancelled) {
					setLoading(false);
					setTimelineLoading(false);
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
	}, [windowKey]);

	return (
		<Stack spacing={3}>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
				<Box>
					<Typography component="h1" variant="h4">
						状态总览
					</Typography>
				</Box>
				<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Stack direction="row" spacing={1} alignItems="center">
						{timelineLoading ? <CircularProgress size={18} /> : null}
						<FormControl size="small" sx={{ minWidth: 180 }} disabled={timelineLoading}>
							<InputLabel id="window-label">显示范围</InputLabel>
							<Select labelId="window-label" label="显示范围" value={windowKey} onChange={(e) => setWindowKey(e.target.value as WindowKey)}>
								{WINDOWS.map((w) => (
									<MenuItem value={w.key} key={w.key}>
										{w.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Stack>
				</Box>
			</Stack>

			{summaryError ? <Alert severity="error">{summaryError}</Alert> : null}
			{loading ? (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
					<CircularProgress />
				</Box>
			) : null}

			{timelineError ? <Alert severity="warning">{timelineError}</Alert> : null}

			{summary ? (
				<Stack spacing={3}>
					<Box>
						<Typography component="h2" variant="h5" sx={{ mb: 2 }}>
							整体状态
						</Typography>
						<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
							<Stack spacing={2} divider={<Divider flexItem />}>
								{summary.checks
									.filter((c) => c.type === 'head')
									.map((c) => {
										const ts = timelineByCheckId[c.id]?.window === windowKey ? timelineByCheckId[c.id] : null;
										const now = Date.now();
										const badgeAvailability =
											(!timelineLoading ? availabilityFromTimeseries(ts, windowKey) : null) ?? c.stats[windowKey]?.availability ?? null;
										const badgeColor = !c.enabled
											? 'default'
											: c.last_status === 'success'
												? 'success'
												: c.last_status === 'failure'
													? 'error'
													: 'default';

										return (
											<Stack key={c.id} spacing={1.25} sx={{ py: 0.5 }}>
												<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
													<Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0, width: { md: '48%' }, flexShrink: 0 }}>
														<Chip
															label={formatPercentShort(badgeAvailability)}
															color={badgeColor as any}
															size="small"
															sx={{ minWidth: 90, fontWeight: 700 }}
														/>
														<Box sx={{ minWidth: 0 }}>
															<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
																<Typography variant="subtitle1" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
																	{checkTitle(c)}
																</Typography>
																<Chip
																	size="small"
																	variant="outlined"
																	label={c.enabled ? '已启用' : '已停用'}
																	color={c.enabled ? ('success' as any) : ('default' as any)}
																/>
															</Stack>
														</Box>
													</Stack>

													<Box sx={{ flexGrow: 1, minWidth: 0 }}>
														<UptimeBar loading={timelineLoading} placeholderCount={placeholderCountForWindow(windowKey)} timeseries={ts} />
														<Stack direction="row" justifyContent="space-between">
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : ts ? formatAgoShort(ts.from, now) : '—'}
															</Typography>
															<Typography variant="caption" color="text.secondary">
																上次检测：{formatAgoShort(c.last_checked_at, now)}
															</Typography>
														</Stack>
													</Box>
												</Stack>
											</Stack>
										);
									})}
							</Stack>
						</Paper>
					</Box>

					<Box>
						<Typography component="h2" variant="h5" sx={{ mb: 2 }}>
							模型可用性
						</Typography>
						<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
							<Stack spacing={2} divider={<Divider flexItem />}>
								{!summary.checks.some((c) => c.type === 'model' || c.type === 'rerank') && (
									<EmptyState icon={<WidgetsOutlined />} title="暂无模型监测数据" />
								)}
								{summary.checks
									.filter((c) => c.type === 'model' || c.type === 'rerank')
									.sort((a, b) => String(a.model).localeCompare(String(b.model)))
									.map((c) => {
										const ts = timelineByCheckId[c.id]?.window === windowKey ? timelineByCheckId[c.id] : null;
										const now = Date.now();
										const badgeAvailability =
											(!timelineLoading ? availabilityFromTimeseries(ts, windowKey) : null) ?? c.stats[windowKey]?.availability ?? null;
										const badgeColor = !c.enabled
											? 'default'
											: c.last_status === 'success'
												? 'success'
												: c.last_status === 'failure'
													? 'error'
													: 'default';

										return (
											<Stack key={c.id} spacing={1.25} sx={{ py: 0.5 }}>
												<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
													<Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0, width: { md: '48%' }, flexShrink: 0 }}>
														<Chip
															label={formatPercentShort(badgeAvailability)}
															color={badgeColor as any}
															size="small"
															sx={{ minWidth: 90, fontWeight: 700 }}
														/>
														<Box sx={{ minWidth: 0 }}>
															<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
																<Typography variant="subtitle1" fontWeight={600} sx={{ width: '100%', overflowWrap: 'anywhere' }}>
																	{checkTitle(c)}
																</Typography>
																{c.type === 'rerank' ? (
																	<Chip size="small" variant="outlined" label="Reranker" />
																) : (
																	<Chip size="small" variant="outlined" label="Embedding" />
																)}
																<Chip
																	size="small"
																	variant="outlined"
																	label={c.enabled ? '已启用' : '已停用'}
																	color={c.enabled ? ('success' as any) : ('default' as any)}
																/>
															</Stack>
														</Box>
													</Stack>

													<Box sx={{ flexGrow: 1, minWidth: 0, opacity: c.enabled ? 1 : 0.55 }}>
														<UptimeBar loading={timelineLoading} placeholderCount={placeholderCountForWindow(windowKey)} timeseries={ts} />
														<Stack direction="row" justifyContent="space-between">
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : ts ? formatAgoShort(ts.from, now) : '—'}
															</Typography>
															<Typography variant="caption" color="text.secondary">
																上次检测：{formatAgoShort(c.last_checked_at, now)}
															</Typography>
														</Stack>
													</Box>
												</Stack>
											</Stack>
										);
									})}
							</Stack>
						</Paper>
					</Box>
				</Stack>
			) : null}
		</Stack>
	);
}
