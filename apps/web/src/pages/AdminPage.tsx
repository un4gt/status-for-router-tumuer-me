import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	InputLabel,
	MenuItem,
	Paper,
	Select,
	Switch,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import Pagination from '@mui/material/Pagination';
import {
	adminChecks,
	adminCreateCheck,
	adminDeleteCheck,
	adminLogin,
	adminLogout,
	adminResults,
	adminRun,
	adminSetCheckEnabled,
	adminSources,
	adminSyncSources,
	type AdminSourcesResponse,
	type ModelType,
} from '../api';
import { formatAgoShort, formatDateTime } from '../format';
import { MODEL_TYPES, SOURCE_LABELS, TYPE_LABELS } from '../constants';
import { v } from '../design/tokens';
import { TypeTag } from '../components/TypeTag';
import { getUserError } from '../messages';
import { ModelIcon } from '../components/ModelIcon';
import { ModelSelector } from '../components/ModelSelector';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { Icon, Check, History, ListChecks, Lock, LogIn, LogOut, Play, Plus, RefreshCw, Trash2, X } from '../design/icons';

type Filter = { type: 'head' } | { type: ModelType; model: string };

const PAGE_SIZE = 20;
const MODE_LABELS: Record<string, string> = { live: '正式检测', mock: '模拟数据', direct: '本站直连' };

export function AdminPage() {
	const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
	const [username, setUsername] = useState('admin');
	const [password, setPassword] = useState('');
	const [authError, setAuthError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [running, setRunning] = useState(false);

	const [filter, setFilter] = useState<Filter>({ type: 'head' });
	const [regionFilter, setRegionFilter] = useState('all');
	const [rows, setRows] = useState<any[]>([]);
	const [rowsError, setRowsError] = useState<string | null>(null);
	const [rowsLoading, setRowsLoading] = useState(false);

	const [errorDialog, setErrorDialog] = useState<{ title: string; body: string } | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{ id: string; model: string } | null>(null);
	const [page, setPage] = useState(1);

	const [checks, setChecks] = useState<any[]>([]);
	const [checksError, setChecksError] = useState<string | null>(null);
	const [checksLoading, setChecksLoading] = useState(false);
	const [newModel, setNewModel] = useState('');
	const [newCheckType, setNewCheckType] = useState<ModelType>('model');

	const [sources, setSources] = useState<AdminSourcesResponse | null>(null);
	const [sourcesError, setSourcesError] = useState<string | null>(null);
	const [sourcesLoading, setSourcesLoading] = useState(false);
	const [syncing, setSyncing] = useState(false);

	const modelChecks = useMemo(() => {
		return (checks || [])
			.filter((c) => MODEL_TYPES.includes(c.type) && c.model)
			.sort((a: any, b: any) => {
				const ta = String(a.type);
				const tb = String(b.type);
				if (ta !== tb) return ta.localeCompare(tb);
				return String(a.model).localeCompare(String(b.model));
			});
	}, [checks]);

	const checksForType = (type: ModelType) => modelChecks.filter((c: any) => c.type === type);

	const queryParams = useMemo(() => {
		const region = regionFilter === 'all' ? undefined : regionFilter;
		if (filter.type === 'head') return { type: 'head' as const, region };
		return { type: filter.type, model: filter.model, region };
	}, [filter, regionFilter]);

	useEffect(() => {
		// Probe auth by calling an admin endpoint that doesn't depend on existing data.
		adminChecks()
			.then((r) => {
				setLoggedIn(true);
				setChecks(r.checks);
			})
			.catch((e: any) => {
				if (e?.code === 401) setLoggedIn(false);
				else setLoggedIn(false);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!loggedIn) return;

		setChecksLoading(true);
		setChecksError(null);
		adminChecks()
			.then((r) => setChecks(r.checks))
			.catch((e: any) => {
				if (e?.code === 401) {
					setLoggedIn(false);
					return;
				}
				setChecksError(getUserError(e, '检查项加载失败，请稍后重试。'));
			})
			.finally(() => setChecksLoading(false));
	}, [loggedIn]);

	useEffect(() => {
		if (!loggedIn) return;
		if (filter.type === 'head') return;
		const list = checksForType(filter.type);
		if (!list.some((c: any) => c.model === filter.model)) {
			const first = list[0]?.model ?? '';
			if (first) setFilter({ type: filter.type, model: first });
		}
	}, [loggedIn, filter, modelChecks]);

	async function loadSources() {
		setSourcesLoading(true);
		setSourcesError(null);
		try {
			setSources(await adminSources());
		} catch (e: any) {
			if (e?.status === 401) setLoggedIn(false);
			else setSourcesError(getUserError(e, '数据源状态加载失败，请稍后重试。'));
		} finally {
			setSourcesLoading(false);
		}
	}

	useEffect(() => {
		if (loggedIn) void loadSources();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loggedIn]);

	useEffect(() => {
		if (!loggedIn) return;
		if (queryParams.type !== 'head' && !('model' in queryParams && queryParams.model)) return;
		setRowsLoading(true);
		setRowsError(null);
		adminResults({ ...queryParams, limit: 100 })
			.then((r) => setRows(r.results))
			.catch((e: any) => {
				if (e?.code === 401) {
					setLoggedIn(false);
					return;
				}
				setRowsError(getUserError(e, '检测记录加载失败，请稍后重试。'));
			})
			.finally(() => setRowsLoading(false));
	}, [loggedIn, queryParams]);

	const orderedRows = useMemo(() => {
		return [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0));
	}, [rows]);
	const pageCount = Math.max(1, Math.ceil(orderedRows.length / PAGE_SIZE));
	const pageRows = orderedRows.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
	useEffect(() => setPage(1), [queryParams]);

	if (loggedIn === null) {
		return (
			<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
				<CircularProgress />
			</Box>
		);
	}

	if (!loggedIn) {
		return (
			<Paper variant="outlined" sx={{ maxWidth: 440, mx: 'auto', mt: { xs: 2, sm: 7 }, p: { xs: 3, sm: 4 } }}>
				<Stack
					component="form"
					spacing={2.5}
					onSubmit={async (event) => {
						event.preventDefault();
						if (busy) return;
						setBusy(true);
						setAuthError(null);
						try {
							await adminLogin(username, password);
							setLoggedIn(true);
							const r = await adminChecks();
							setChecks(r.checks);
							setPassword('');
						} catch (e: any) {
							setAuthError(getUserError(e, '登录失败，请稍后重试。'));
						} finally {
							setBusy(false);
						}
					}}
				>
					<Stack alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
						<Box
							sx={{
								width: 52,
								height: 52,
								display: 'grid',
								placeItems: 'center',
								borderRadius: '16px',
								bgcolor: 'primary.light',
								color: 'primary.main',
								mb: 0.5,
							}}
						>
							<Icon icon={Lock} size={18} />
						</Box>
						<Typography component="h1" variant="h1">
							登录管理控制台
						</Typography>
					</Stack>
					{authError ? <Alert severity="error">{authError}</Alert> : null}
					<TextField
						label="用户名"
						autoComplete="username"
						required
						disabled={busy}
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
					<TextField
						label="密码"
						type="password"
						autoComplete="current-password"
						required
						disabled={busy}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<Button
						type="submit"
						variant="contained"
						size="large"
						disabled={busy}
						startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Icon icon={LogIn} size={16} />}
					>
						{busy ? '正在登录…' : '登录'}
					</Button>
				</Stack>
			</Paper>
		);
	}

	return (
		<Stack spacing={3} sx={{ minWidth: 0 }}>
			<Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
				<Box>
					<Typography component="h1" variant="h1">
						监控管理
					</Typography>
				</Box>
				<Stack direction="row" spacing={1}>
					<Button
						variant="outlined"
						color="inherit"
						size="small"
						disabled={busy}
						startIcon={<Icon icon={LogOut} size={16} />}
						onClick={async () => {
							setBusy(true);
							try {
								await adminLogout();
							} finally {
								setBusy(false);
								setLoggedIn(false);
							}
						}}
					>
						退出登录
					</Button>
				</Stack>
			</Stack>

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<SectionHeader
						icon={<Icon icon={RefreshCw} size={18} />}
						title="数据源状态"
						action={
							<Button
								variant="outlined"
								size="small"
								disabled={busy || syncing || sourcesLoading}
								startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <Icon icon={RefreshCw} size={16} />}
								onClick={async () => {
									setSyncing(true);
									setSourcesError(null);
									try {
										await adminSyncSources();
										await loadSources();
										if (queryParams.type === 'head' || ('model' in queryParams && queryParams.model)) {
											const r = await adminResults({ ...queryParams, limit: 100 });
											setRows(r.results);
										}
									} catch (e: any) {
										setSourcesError(getUserError(e, '同步失败，请稍后重试。'));
									} finally {
										setSyncing(false);
									}
								}}
							>
								{syncing ? '正在同步…' : '立即同步数据源'}
							</Button>
						}
					/>
					{sourcesError ? <Alert severity="error">{sourcesError}</Alert> : null}
					{sourcesLoading && !sources ? <CircularProgress size={20} /> : null}
					{sources ? (
						<Stack spacing={1.25}>
							<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
								<Chip size="small" variant="outlined" label={`模式：${MODE_LABELS[sources.mode] ?? sources.mode}`} />
								<Chip size="small" variant="outlined" label={`地区：${sources.regions.map((region) => region.label).join(' / ')}`} />
								<Chip
									size="small"
									variant="outlined"
									color={
										sources.mode === 'live' &&
										(!sources.sources.cloudprobe?.configured || sources.regions.some((region) => !region.probeUrl))
											? 'warning'
											: 'default'
									}
									label={
										sources.mode !== 'live'
											? '当前模式无需云函数检测'
											: !sources.sources.cloudprobe?.configured
												? '云函数检测未配置'
												: `${sources.regions.filter((region) => region.probeUrl).length}/${sources.regions.length} 个地区已配置`
									}
								/>
							</Stack>
							{Object.entries(sources.sources)
								.filter(([name]) =>
									sources.mode === 'live' ? name === 'globalping' || name === 'cloudprobe' : name === sources.mode,
								)
								.map(([name, source]) => (
									<Stack
										key={name}
										direction={{ xs: 'column', sm: 'row' }}
										spacing={1}
										alignItems={{ sm: 'center' }}
										justifyContent="space-between"
										sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: '10px' }}
									>
										<Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
											<Typography variant="body2" fontWeight={600} sx={{ minWidth: 90 }}>
												{SOURCE_LABELS[name] ?? name}
											</Typography>
											<Chip
												size="small"
												variant="outlined"
												color={source.configured ? 'success' : 'default'}
												label={source.configured ? '已配置' : '未配置'}
												sx={{ fontWeight: 500 }}
											/>
											<Typography variant="caption" color="text.secondary">
												{source.last_sync_at ? `上次同步：${formatAgoShort(source.last_sync_at)}` : '尚未同步'}
											</Typography>
										</Stack>
										<Stack spacing={0.25} sx={{ minWidth: 0 }}>
											{source.last_error ? (
												<Typography variant="caption" color="error.main" sx={{ overflowWrap: 'anywhere' }}>
													错误：{source.last_error.slice(0, 160)}
												</Typography>
											) : null}
											{!source.last_error && source.last_warning ? (
												<Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
													{source.last_warning.slice(0, 160)}
												</Typography>
											) : null}
										</Stack>
									</Stack>
								))}
						</Stack>
					) : null}
				</Stack>
			</Paper>

			<ModelSelector
				checks={checks}
				busy={busy}
				onBusyChange={setBusy}
				onChecksChange={setChecks}
				onUnauthorized={() => setLoggedIn(false)}
				onRunComplete={async () => {
					if (queryParams.type === 'head' || ('model' in queryParams && queryParams.model))
						setRows((await adminResults({ ...queryParams, limit: 100 })).results);
				}}
			/>

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.5}>
					<SectionHeader
						icon={<Icon icon={ListChecks} size={18} />}
						title="模型检查项"
						action={
							checksLoading ? (
								<CircularProgress size={18} aria-label="正在加载检查项" />
							) : (
								<Chip
									size="small"
									variant="outlined"
									label={`${modelChecks.filter((c) => c.enabled).length} / ${modelChecks.length} 已启用`}
								/>
							)
						}
					/>

					{checksError ? <Alert severity="error">{checksError}</Alert> : null}

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						alignItems={{ sm: 'center' }}
						sx={{ p: 2, bgcolor: v('surface2'), borderRadius: '10px' }}
					>
						<FormControl size="small" sx={{ minWidth: 160 }}>
							<InputLabel id="new-check-type-label">检测类型</InputLabel>
							<Select
								labelId="new-check-type-label"
								label="检测类型"
								value={newCheckType}
								onChange={(e) => setNewCheckType(e.target.value as ModelType)}
								disabled={busy}
							>
								<MenuItem value="model">Embedding</MenuItem>
								<MenuItem value="rerank">Reranker</MenuItem>
								<MenuItem value="decisions">Decisions</MenuItem>
								<MenuItem value="systemone">System One</MenuItem>
							</Select>
						</FormControl>
						<TextField
							label="模型名称"
							size="small"
							fullWidth
							value={newModel}
							disabled={busy}
							onChange={(e) => setNewModel(e.target.value)}
							placeholder={newCheckType === 'model' ? '例如 Qwen/Qwen3-Embedding-4B' : newCheckType === 'rerank' ? '例如 Pro/BAAI/bge-reranker-v2-m3' : '例如 typesafe/jev-latest'}
						/>
						<Button
							variant="outlined"
							startIcon={<Icon icon={Plus} size={16} />}
							sx={{ flexShrink: 0, bgcolor: 'background.paper' }}
							disabled={busy || !newModel.trim()}
							onClick={async () => {
								const model = newModel.trim();
								if (!model) return;
								setBusy(true);
								setChecksError(null);
								try {
									await adminCreateCheck(newCheckType, model, true);
									setNewModel('');
									const r = await adminChecks();
									setChecks(r.checks);
								} catch (e: any) {
									setChecksError(getUserError(e, '添加失败，请稍后重试。'));
								} finally {
									setBusy(false);
								}
							}}
						>
							添加模型
						</Button>
					</Stack>

					<TableContainer>
						<Table size="small" aria-label="模型检查项" sx={{ minWidth: modelChecks.length ? 690 : undefined }}>
							<TableHead sx={{ display: modelChecks.length ? undefined : 'none' }}>
								<TableRow>
									<TableCell width={120}>类型</TableCell>
									<TableCell>模型名称</TableCell>
									<TableCell width={160}>启用状态</TableCell>
									<TableCell width={100} align="right">
										操作
									</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{modelChecks.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4}>
											<EmptyState icon={<Icon icon={ListChecks} size={18} />} title={checksLoading ? '正在加载检查项…' : '暂无模型检查项'} />
										</TableCell>
									</TableRow>
								) : (
									modelChecks.map((c: any) => (
										<TableRow key={c.id} hover>
											<TableCell>
												<TypeTag type={c.type as ModelType} />
											</TableCell>
											<TableCell>
												<Stack direction="row" spacing={1.25} alignItems="center">
													<ModelIcon model={c.model} size={22} />
													<Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>
														{c.model}
													</Typography>
												</Stack>
											</TableCell>
											<TableCell>
												<Stack direction="row" spacing={0.5} alignItems="center">
													<Switch
														size="small"
														checked={!!c.enabled}
														inputProps={{ 'aria-label': `启用 ${c.model}` }}
														disabled={busy}
														onChange={async (_e, checked) => {
															setBusy(true);
															setChecksError(null);
															const prev = checks;
															setChecks((cur) => (cur || []).map((x: any) => (x.id === c.id ? { ...x, enabled: checked } : x)));
															try {
																await adminSetCheckEnabled(c.id, checked);
															} catch (e: any) {
																setChecks(prev);
																setChecksError(getUserError(e, '更新失败，请稍后重试。'));
															} finally {
																setBusy(false);
															}
														}}
													/>
													<Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
														{c.enabled ? '已启用' : '已停用'}
													</Typography>
												</Stack>
											</TableCell>
											<TableCell align="right">
												<Button
													size="small"
													color="error"
													startIcon={<Icon icon={Trash2} size={16} />}
													disabled={busy}
													onClick={() => setPendingDelete({ id: c.id, model: c.model })}
												>
													删除
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>
				</Stack>
			</Paper>

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.5}>
					<SectionHeader
						icon={<Icon icon={History} size={18} />}
						title="检测记录"
						action={
							<Button
								variant="contained"
								disabled={busy}
								startIcon={running ? <CircularProgress size={14} color="inherit" /> : <Icon icon={Play} size={16} />}
								title="立即从 Globalping 和云函数拉取一轮检测结果"
								onClick={async () => {
									setBusy(true);
									setRunning(true);
									setRowsError(null);
									try {
										await adminRun();
										await loadSources();
										if (queryParams.type === 'head' || ('model' in queryParams && queryParams.model)) {
											const r = await adminResults({ ...queryParams, limit: 100 });
											setRows(r.results);
										} else {
											setRows([]);
										}
									} catch (e: any) {
										setRowsError(getUserError(e, '同步未完成，请稍后重试。'));
									} finally {
										setBusy(false);
										setRunning(false);
									}
								}}
							>
								{running ? '正在同步…' : '立即同步'}
							</Button>
						}
					/>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap alignItems={{ md: 'center' }}>
						<FormControl size="small" sx={{ minWidth: 170 }}>
							<InputLabel id="type-label">检测类型</InputLabel>
							<Select
								labelId="type-label"
								label="检测类型"
								value={filter.type}
								disabled={busy}
								onChange={(e) => {
									const value = e.target.value as 'head' | ModelType;
									if (value === 'head') setFilter({ type: 'head' });
									else setFilter({ type: value, model: (checksForType(value)[0]?.model as string) || '' });
								}}
							>
								<MenuItem value="head">网关（HEAD /）</MenuItem>
								{MODEL_TYPES.map((type) => (
									<MenuItem key={type} value={type} disabled={!checksForType(type).length}>
										{TYPE_LABELS[type]}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						{filter.type !== 'head' ? (
							<FormControl size="small" sx={{ minWidth: 0, flex: { md: 1 }, maxWidth: { md: 460 } }}>
								<InputLabel id="model-label">模型</InputLabel>
								<Select
									labelId="model-label"
									label="模型"
									value={filter.model}
									disabled={busy}
									onChange={(e) => setFilter({ type: filter.type, model: e.target.value })}
								>
									{checksForType(filter.type).map((c: any) => (
										<MenuItem key={c.model} value={c.model}>
											{c.model}
										</MenuItem>
									))}
								</Select>
							</FormControl>
						) : null}

						<FormControl size="small" sx={{ minWidth: 150 }}>
							<InputLabel id="region-label">地区</InputLabel>
							<Select
								labelId="region-label"
								label="地区"
								value={regionFilter}
								disabled={busy}
								onChange={(e) => setRegionFilter(e.target.value)}
							>
								<MenuItem value="all">全部地区</MenuItem>
								{(sources?.regions ?? []).map((region) => (
									<MenuItem key={region.id} value={region.id}>
										{region.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Stack>

					{rowsError ? <Alert severity="error">{rowsError}</Alert> : null}

					<TableContainer>
						<Table size="small" aria-label="检测记录" sx={{ minWidth: orderedRows.length ? 760 : undefined }}>
							<TableHead sx={{ display: orderedRows.length ? undefined : 'none' }}>
								<TableRow>
									<TableCell>检测时间</TableCell>
									<TableCell>地区</TableCell>
									<TableCell>结果</TableCell>
									<TableCell>状态码</TableCell>
									<TableCell align="right">响应耗时</TableCell>
									<TableCell align="right">错误详情</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{rowsLoading ? (
									<TableRow>
										<TableCell colSpan={6}>
											<Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
												<CircularProgress size={24} aria-label="正在加载检测记录" />
											</Box>
										</TableCell>
									</TableRow>
								) : orderedRows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6}>
											<EmptyState icon={<Icon icon={History} size={18} />} title="暂无检测记录" />
										</TableCell>
									</TableRow>
								) : (
									pageRows.map((r) => (
										<TableRow key={r.id} hover>
											<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(r.ts)}</TableCell>
											<TableCell sx={{ whiteSpace: 'nowrap' }}>
												<Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
													{r.region_id ? (sources?.regions.find((region) => region.id === r.region_id)?.label ?? r.region_id) : '整体'}
												</Typography>
												<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
													{r.source}
												</Typography>
											</TableCell>
											<TableCell>
												<Chip
													size="small"
													variant="outlined"
													icon={Number(r.success) === 1 ? <Icon icon={Check} size={14} /> : <Icon icon={X} size={14} />}
													label={Number(r.success) === 1 ? '成功' : '失败'}
													color={Number(r.success) === 1 ? 'success' : 'error'}
													sx={{ bgcolor: Number(r.success) === 1 ? 'success.light' : 'error.light', borderColor: 'transparent' }}
												/>
											</TableCell>
											<TableCell sx={{ fontFamily: 'var(--font-mono)', color: 'text.secondary' }}>{r.status_code ?? '—'}</TableCell>
											<TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
												{r.latency_ms ?? '—'}
												{r.latency_ms != null && (
													<Box component="span" sx={{ color: 'text.secondary', ml: 0.5 }}>
														ms
													</Box>
												)}
											</TableCell>
											<TableCell align="right">
												{r.error ? (
													<Button size="small" color="error" onClick={() => setErrorDialog({ title: '错误详情', body: r.error })}>
														查看详情
													</Button>
												) : (
													'—'
												)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>
					{orderedRows.length > PAGE_SIZE ? (
						<Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
							<Typography variant="caption" color="text.secondary">
								最近 {orderedRows.length} 条，每页 {PAGE_SIZE} 条
							</Typography>
							<Pagination size="small" count={pageCount} page={Math.min(page, pageCount)} onChange={(_, value) => setPage(value)} />
						</Stack>
					) : null}
				</Stack>
			</Paper>

			<Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
				<DialogTitle>删除这个检查项？</DialogTitle>
				<DialogContent>
					<Typography variant="body2">
						将删除 <Box component="code" sx={{ fontFamily: 'var(--font-mono)' }}>{pendingDelete?.model}</Box> 的检查项和它的全部历史记录，删除后无法恢复。只想暂停检测时，请改用“启用”开关。
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button variant="outlined" color="inherit" onClick={() => setPendingDelete(null)}>
						取消
					</Button>
					<Button
						variant="contained"
						color="error"
						disabled={busy}
						onClick={async () => {
							if (!pendingDelete) return;
							setBusy(true);
							setChecksError(null);
							try {
								await adminDeleteCheck(pendingDelete.id);
								const r = await adminChecks();
								setChecks(r.checks);
								setPendingDelete(null);
							} catch (e: any) {
								setChecksError(getUserError(e, '删除失败，请稍后重试。'));
								setPendingDelete(null);
							} finally {
								setBusy(false);
							}
						}}
					>
						删除检查项
					</Button>
				</DialogActions>
			</Dialog>

			<Dialog open={!!errorDialog} onClose={() => setErrorDialog(null)} maxWidth="md" fullWidth>
				<DialogTitle>{errorDialog?.title}</DialogTitle>
				<DialogContent>
					<Typography
						component="pre"
						variant="body2"
						sx={{
							whiteSpace: 'pre-wrap',
							overflowWrap: 'anywhere',
							fontFamily: 'var(--font-mono)',
							bgcolor: v('surface2'),
							p: 2,
							borderRadius: '10px',
						}}
					>
						{errorDialog?.body}
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button variant="outlined" color="inherit" onClick={() => setErrorDialog(null)}>
						关闭
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
