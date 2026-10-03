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
import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LoginRounded from '@mui/icons-material/LoginRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { useEffect, useMemo, useState } from 'react';
import {
	adminChecks,
	adminCreateCheck,
	adminDeleteCheck,
	adminLogin,
	adminLogout,
	adminResults,
	adminRun,
	adminSetCheckEnabled,
} from '../api';
import { formatDateTime } from '../format';
import { getUserError } from '../messages';
import { ModelSelector } from '../components/ModelSelector';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';

type Filter = { type: 'head' } | { type: 'model'; model: string } | { type: 'rerank'; model: string };

export function AdminPage() {
	const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
	const [username, setUsername] = useState('admin');
	const [password, setPassword] = useState('');
	const [authError, setAuthError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [running, setRunning] = useState(false);

	const [filter, setFilter] = useState<Filter>({ type: 'head' });
	const [rows, setRows] = useState<any[]>([]);
	const [rowsError, setRowsError] = useState<string | null>(null);
	const [rowsLoading, setRowsLoading] = useState(false);

	const [errorDialog, setErrorDialog] = useState<{ title: string; body: string } | null>(null);

	const [checks, setChecks] = useState<any[]>([]);
	const [checksError, setChecksError] = useState<string | null>(null);
	const [checksLoading, setChecksLoading] = useState(false);
	const [newModel, setNewModel] = useState('');
	const [newCheckType, setNewCheckType] = useState<'model' | 'rerank'>('model');

	const embeddingChecks = useMemo(() => {
		return (checks || [])
			.filter((c) => c.type === 'model' && c.model)
			.sort((a: any, b: any) => String(a.model).localeCompare(String(b.model)));
	}, [checks]);

	const rerankChecks = useMemo(() => {
		return (checks || [])
			.filter((c) => c.type === 'rerank' && c.model)
			.sort((a: any, b: any) => String(a.model).localeCompare(String(b.model)));
	}, [checks]);

	const modelLikeChecks = useMemo(() => {
		return (checks || [])
			.filter((c) => (c.type === 'model' || c.type === 'rerank') && c.model)
			.sort((a: any, b: any) => {
				const ta = String(a.type);
				const tb = String(b.type);
				if (ta !== tb) return ta.localeCompare(tb);
				return String(a.model).localeCompare(String(b.model));
			});
	}, [checks]);

	const queryParams = useMemo(() => {
		if (filter.type === 'head') return { type: 'head' as const };
		return { type: filter.type as 'model' | 'rerank', model: filter.model };
	}, [filter]);

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
		if (filter.type === 'model') {
			const exists = embeddingChecks.some((c: any) => c.model === filter.model);
			if (!exists) {
				const first = embeddingChecks[0]?.model ?? '';
				if (first) setFilter({ type: 'model', model: first });
			}
		} else if (filter.type === 'rerank') {
			const exists = rerankChecks.some((c: any) => c.model === filter.model);
			if (!exists) {
				const first = rerankChecks[0]?.model ?? '';
				if (first) setFilter({ type: 'rerank', model: first });
			}
		}
	}, [loggedIn, filter, embeddingChecks, rerankChecks]);

	useEffect(() => {
		if (!loggedIn) return;
		if ((queryParams.type === 'model' || queryParams.type === 'rerank') && !queryParams.model) return;
		setRowsLoading(true);
		setRowsError(null);
		adminResults({ ...queryParams, limit: 100 })
			.then((r) => setRows(r.results))
			.catch((e: any) => {
				if (e?.code === 401) {
					setLoggedIn(false);
					return;
				}
				setRowsError(getUserError(e, '探测记录加载失败，请稍后重试。'));
			})
			.finally(() => setRowsLoading(false));
	}, [loggedIn, queryParams]);

	const orderedRows = useMemo(() => {
		return [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0));
	}, [rows]);

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
							<LockOutlined />
						</Box>
						<Typography component="h1" variant="h5" sx={{ fontSize: '1.4rem' }}>
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
						startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <LoginRounded />}
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
					<Typography component="h1" variant="h4">
						监控管理
					</Typography>
				</Box>
				<Stack direction="row" spacing={1}>
					<Button
						variant="outlined"
						color="inherit"
						size="small"
						disabled={busy}
						startIcon={<LogoutRounded />}
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

			<ModelSelector
				checks={checks}
				busy={busy}
				onBusyChange={setBusy}
				onChecksChange={setChecks}
				onUnauthorized={() => setLoggedIn(false)}
				onRunComplete={async () => {
					if (queryParams.type === 'head' || queryParams.model) setRows((await adminResults({ ...queryParams, limit: 100 })).results);
				}}
			/>

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.5}>
					<SectionHeader
						icon={<PlaylistAddCheckRounded fontSize="small" />}
						title="模型检查项"
						action={
							checksLoading ? (
								<CircularProgress size={18} aria-label="正在加载检查项" />
							) : (
								<Chip
									size="small"
									variant="outlined"
									label={`${modelLikeChecks.filter((c) => c.enabled).length} / ${modelLikeChecks.length} 已启用`}
								/>
							)
						}
					/>

					{checksError ? <Alert severity="error">{checksError}</Alert> : null}

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						alignItems={{ sm: 'center' }}
						sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: '12px' }}
					>
						<FormControl size="small" sx={{ minWidth: 160 }}>
							<InputLabel id="new-check-type-label">探测类型</InputLabel>
							<Select
								labelId="new-check-type-label"
								label="探测类型"
								value={newCheckType}
								onChange={(e) => setNewCheckType(e.target.value as any)}
								disabled={busy}
							>
								<MenuItem value="model">Embedding</MenuItem>
								<MenuItem value="rerank">Reranker</MenuItem>
							</Select>
						</FormControl>
						<TextField
							label="模型名称"
							size="small"
							fullWidth
							value={newModel}
							disabled={busy}
							onChange={(e) => setNewModel(e.target.value)}
							placeholder={newCheckType === 'model' ? '例如 Qwen/Qwen3-Embedding-4B' : '例如 Pro/BAAI/bge-reranker-v2-m3'}
						/>
						<Button
							variant="outlined"
							startIcon={<AddRounded />}
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
						<Table size="small" aria-label="模型检查项" sx={{ minWidth: modelLikeChecks.length ? 640 : undefined }}>
							<TableHead sx={{ display: modelLikeChecks.length ? undefined : 'none' }}>
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
								{modelLikeChecks.length === 0 ? (
									<TableRow>
										<TableCell colSpan={4}>
											<EmptyState icon={<PlaylistAddCheckRounded />} title={checksLoading ? '正在加载检查项…' : '暂无模型检查项'} />
										</TableCell>
									</TableRow>
								) : (
									modelLikeChecks.map((c: any) => (
										<TableRow key={c.id} hover>
											<TableCell>
												<Chip
													size="small"
													variant="outlined"
													label={c.type === 'rerank' ? 'Reranker' : 'Embedding'}
													sx={{
														bgcolor: c.type === 'rerank' ? '#f7f2ff' : 'primary.light',
														color: c.type === 'rerank' ? '#8056b3' : 'primary.main',
														borderColor: 'transparent',
													}}
												/>
											</TableCell>
											<TableCell>
												<Stack spacing={0.75} alignItems="flex-start">
													<Typography
														variant="body2"
														sx={{
															fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
															fontSize: '0.8125rem',
															overflowWrap: 'anywhere',
														}}
													>
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
													startIcon={<DeleteOutlineRounded />}
													disabled={busy}
													onClick={async () => {
														if (!confirm(`确定删除模型「${c.model}」的检查项吗？该检查项的历史记录也会一并删除。`)) return;
														setBusy(true);
														setChecksError(null);
														try {
															await adminDeleteCheck(c.id);
															const r = await adminChecks();
															setChecks(r.checks);
														} catch (e: any) {
															setChecksError(getUserError(e, '删除失败，请稍后重试。'));
														} finally {
															setBusy(false);
														}
													}}
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
						icon={<HistoryRounded fontSize="small" />}
						title="探测记录"
						action={
							<Button
								variant="contained"
								disabled={busy}
								startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowRounded />}
								title="对所有已启用的检查项执行一次探测"
								onClick={async () => {
									setBusy(true);
									setRunning(true);
									setRowsError(null);
									try {
										await adminRun();
										if (
											queryParams.type === 'head' ||
											((queryParams.type === 'model' || queryParams.type === 'rerank') && queryParams.model)
										) {
											const r = await adminResults({ ...queryParams, limit: 100 });
											setRows(r.results);
										} else {
											setRows([]);
										}
									} catch (e: any) {
										setRowsError(getUserError(e, '探测未完成，请稍后重试。'));
									} finally {
										setBusy(false);
										setRunning(false);
									}
								}}
							>
								{running ? '正在探测…' : '立即探测'}
							</Button>
						}
					/>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap alignItems={{ md: 'center' }}>
						<FormControl size="small" sx={{ minWidth: 160 }}>
							<InputLabel id="type-label">探测类型</InputLabel>
							<Select
								labelId="type-label"
								label="探测类型"
								value={filter.type}
								disabled={busy}
								onChange={(e) => {
									const v = e.target.value as any;
									if (v === 'head') setFilter({ type: 'head' });
									else if (v === 'model') setFilter({ type: 'model', model: (embeddingChecks[0]?.model as string) || '' });
									else if (v === 'rerank') setFilter({ type: 'rerank', model: (rerankChecks[0]?.model as string) || '' });
								}}
							>
								<MenuItem value="head">HEAD · 主站</MenuItem>
								<MenuItem value="model" disabled={!embeddingChecks.length}>
									Embedding
								</MenuItem>
								<MenuItem value="rerank" disabled={!rerankChecks.length}>
									Reranker
								</MenuItem>
							</Select>
						</FormControl>

						{filter.type === 'model' || filter.type === 'rerank' ? (
							<FormControl size="small" sx={{ minWidth: 0, flex: { md: 1 }, maxWidth: { md: 460 } }}>
								<InputLabel id="model-label">模型</InputLabel>
								<Select
									labelId="model-label"
									label="模型"
									value={filter.model}
									disabled={busy}
									onChange={(e) =>
										setFilter(
											filter.type === 'model' ? { type: 'model', model: e.target.value } : { type: 'rerank', model: e.target.value },
										)
									}
								>
									{(filter.type === 'model' ? embeddingChecks : rerankChecks).map((c: any) => (
										<MenuItem key={c.model} value={c.model}>
											{c.model}
										</MenuItem>
									))}
								</Select>
							</FormControl>
						) : null}
					</Stack>

					{rowsError ? <Alert severity="error">{rowsError}</Alert> : null}

					<TableContainer>
						<Table size="small" aria-label="探测记录" sx={{ minWidth: orderedRows.length ? 600 : undefined }}>
							<TableHead sx={{ display: orderedRows.length ? undefined : 'none' }}>
								<TableRow>
									<TableCell>探测时间</TableCell>
									<TableCell>结果</TableCell>
									<TableCell>状态码</TableCell>
									<TableCell align="right">响应耗时</TableCell>
									<TableCell align="right">错误详情</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{rowsLoading ? (
									<TableRow>
										<TableCell colSpan={5}>
											<Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
												<CircularProgress size={24} aria-label="正在加载探测记录" />
											</Box>
										</TableCell>
									</TableRow>
								) : orderedRows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5}>
											<EmptyState icon={<HistoryRounded />} title="暂无探测记录" />
										</TableCell>
									</TableRow>
								) : (
									orderedRows.map((r) => (
										<TableRow key={r.id} hover>
											<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(r.ts)}</TableCell>
											<TableCell>
												<Chip
													size="small"
													variant="outlined"
													icon={Number(r.success) === 1 ? <CheckCircleRounded /> : <ErrorOutlineRounded />}
													label={Number(r.success) === 1 ? '成功' : '失败'}
													color={Number(r.success) === 1 ? 'success' : 'error'}
													sx={{ bgcolor: Number(r.success) === 1 ? 'success.light' : 'error.light', borderColor: 'transparent' }}
												/>
											</TableCell>
											<TableCell sx={{ fontFamily: 'ui-monospace, monospace', color: 'text.secondary' }}>{r.status_code ?? '—'}</TableCell>
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
				</Stack>
			</Paper>

			<Dialog open={!!errorDialog} onClose={() => setErrorDialog(null)} maxWidth="md" fullWidth>
				<DialogTitle>{errorDialog?.title}</DialogTitle>
				<DialogContent>
					<Typography
						component="pre"
						variant="body2"
						sx={{
							whiteSpace: 'pre-wrap',
							overflowWrap: 'anywhere',
							fontFamily: 'ui-monospace, monospace',
							bgcolor: '#f8fafc',
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
