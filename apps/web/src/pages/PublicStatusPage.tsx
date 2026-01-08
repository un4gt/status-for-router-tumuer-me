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

function formatAgoShort(ts: number | null, nowMs = Date.now()) {
	if (!ts) return '—';
	const delta = Math.max(0, nowMs - ts);
	if (delta < 60_000) return 'now';
	const mins = Math.round(delta / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
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

export function PublicStatusPage() {
	const [summary, setSummary] = useState<SummaryResponse | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [windowKey, setWindowKey] = useState<WindowKey>('5h');
	const [timelineLoading, setTimelineLoading] = useState(false);
	const [timelineError, setTimelineError] = useState<string | null>(null);
	const [timelineByCheckId, setTimelineByCheckId] = useState<Record<string, TimeseriesResponse | null>>({});

	useEffect(() => {
		setLoading(true);
		setSummaryError(null);
		fetchSummary()
			.then((s) => setSummary(s))
			.catch((e) => setSummaryError(e?.message || String(e)))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (!summary) return;
		const enabled = summary.checks.filter((c) => c.enabled);
		if (enabled.length === 0) return;

		let cancelled = false;
		setTimelineLoading(true);
		setTimelineError(null);

		Promise.allSettled(
			enabled.map(async (c) => {
				const r = await fetchTimeseries({ type: c.type, model: c.model ?? undefined, window: windowKey });
				return { id: c.id, r };
			}),
		)
			.then((settled) => {
				if (cancelled) return;
				const map: Record<string, TimeseriesResponse | null> = {};
				let anyFailed = false;
				for (const s of settled) {
					if (s.status === 'fulfilled') map[s.value.id] = s.value.r;
					else anyFailed = true;
				}
				setTimelineByCheckId(map);
				if (anyFailed) setTimelineError('部分检查项趋势数据加载失败（可刷新重试）');
			})
			.finally(() => {
				if (!cancelled) setTimelineLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [summary, windowKey]);

	return (
		<Stack spacing={3}>
			<Box>
				<Typography variant="h4" gutterBottom>
					状态总览
				</Typography>
				<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Stack direction="row" spacing={1} alignItems="center">
						{timelineLoading ? <CircularProgress size={18} /> : null}
						<FormControl size="small" sx={{ minWidth: 180 }} disabled={timelineLoading}>
						<InputLabel id="window-label">时间窗口</InputLabel>
						<Select
							labelId="window-label"
							label="时间窗口"
							value={windowKey}
							onChange={(e) => setWindowKey(e.target.value as WindowKey)}
						>
							{WINDOWS.map((w) => (
								<MenuItem value={w.key} key={w.key}>
									{w.label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
					</Stack>
				</Box>
			</Box>

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
						<Typography variant="h5" gutterBottom>
							整体状态
						</Typography>
						<Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
							<Stack spacing={2} divider={<Divider flexItem />}>
								{summary.checks
									.filter((c) => c.enabled && c.type === 'head')
									.map((c) => {
										const ts = timelineByCheckId[c.id] ?? null;
										const now = Date.now();
										const lastDataTs =
											(ts?.series ?? []).filter((p) => (p.total_count ?? 0) > 0).at(-1)?.ts ?? null;
										const badgeAvailability = c.stats[windowKey].availability;
										const badgeColor = c.last_status === 'success' ? 'success' : c.last_status === 'failure' ? 'error' : 'default';

										return (
											<Stack key={c.id} spacing={1.25} sx={{ py: 0.5 }}>
												<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
													<Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 300 }}>
														<Chip label={formatPercentShort(badgeAvailability)} color={badgeColor as any} size="small" sx={{ minWidth: 90, fontWeight: 700 }} />
														<Box>
															<Typography variant="subtitle1" fontWeight={700}>
																{checkTitle(c)}
															</Typography>
														</Box>
													</Stack>

													<Box sx={{ flexGrow: 1, minWidth: 260 }}>
														<UptimeBar
															loading={timelineLoading}
															placeholderCount={placeholderCountForWindow(windowKey)}
															timeseries={ts}
														/>
														<Stack direction="row" justifyContent="space-between">
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : ts ? formatAgoShort(ts.from, now) : '—'}
															</Typography>
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : formatAgoShort(lastDataTs, now)}
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
						<Typography variant="h5" gutterBottom>
							模型可用性
						</Typography>
						<Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
							<Stack spacing={2} divider={<Divider flexItem />}>
								{summary.checks
									.filter((c) => c.enabled && c.type === 'model')
									.sort((a, b) => String(a.model).localeCompare(String(b.model)))
									.map((c) => {
										const ts = timelineByCheckId[c.id] ?? null;
										const now = Date.now();
										const lastDataTs =
											(ts?.series ?? []).filter((p) => (p.total_count ?? 0) > 0).at(-1)?.ts ?? null;
										const badgeAvailability = c.stats[windowKey].availability;
										const badgeColor = c.last_status === 'success' ? 'success' : c.last_status === 'failure' ? 'error' : 'default';

										return (
											<Stack key={c.id} spacing={1.25} sx={{ py: 0.5 }}>
												<Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
													<Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 300 }}>
														<Chip label={formatPercentShort(badgeAvailability)} color={badgeColor as any} size="small" sx={{ minWidth: 90, fontWeight: 700 }} />
														<Box>
															<Typography variant="subtitle1" fontWeight={700}>
																{checkTitle(c)}
															</Typography>
														</Box>
													</Stack>

													<Box sx={{ flexGrow: 1, minWidth: 260 }}>
														<UptimeBar
															loading={timelineLoading}
															placeholderCount={placeholderCountForWindow(windowKey)}
															timeseries={ts}
														/>
														<Stack direction="row" justifyContent="space-between">
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : ts ? formatAgoShort(ts.from, now) : '—'}
															</Typography>
															<Typography variant="caption" color="text.secondary">
																{timelineLoading ? '…' : formatAgoShort(lastDataTs, now)}
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
