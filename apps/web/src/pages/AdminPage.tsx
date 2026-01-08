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
import { adminChecks, adminCreateModel, adminDeleteCheck, adminLogin, adminLogout, adminResults, adminRun, adminSetCheckEnabled } from '../api';
import { formatDateTime } from '../format';

type Filter = { type: 'head' } | { type: 'model'; model: string };

export function AdminPage() {
	const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
	const [username, setUsername] = useState('admin');
	const [password, setPassword] = useState('');
	const [authError, setAuthError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const [filter, setFilter] = useState<Filter>({ type: 'head' });
	const [rows, setRows] = useState<any[]>([]);
	const [rowsError, setRowsError] = useState<string | null>(null);
	const [rowsLoading, setRowsLoading] = useState(false);

	const [errorDialog, setErrorDialog] = useState<{ title: string; body: string } | null>(null);

	const [checks, setChecks] = useState<any[]>([]);
	const [checksError, setChecksError] = useState<string | null>(null);
	const [checksLoading, setChecksLoading] = useState(false);
	const [newModel, setNewModel] = useState('');

	const modelChecks = useMemo(() => {
		return (checks || [])
			.filter((c) => c.type === 'model' && c.model)
			.sort((a: any, b: any) => String(a.model).localeCompare(String(b.model)));
	}, [checks]);

	const queryParams = useMemo(() => {
		return filter.type === 'head' ? { type: 'head' as const } : { type: 'model' as const, model: filter.model };
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
				setChecksError(e?.message || String(e));
			})
			.finally(() => setChecksLoading(false));
	}, [loggedIn]);

	useEffect(() => {
		if (!loggedIn) return;
		if (filter.type === 'model') {
			const exists = modelChecks.some((c: any) => c.model === filter.model);
			if (!exists) {
				const first = modelChecks[0]?.model ?? '';
				if (first) setFilter({ type: 'model', model: first });
			}
		}
	}, [loggedIn, filter, modelChecks]);

	useEffect(() => {
		if (!loggedIn) return;
		if (queryParams.type === 'model' && !queryParams.model) return;
		setRowsLoading(true);
		setRowsError(null);
		adminResults({ ...queryParams, limit: 100 })
			.then((r) => setRows(r.results))
			.catch((e: any) => {
				if (e?.code === 401) {
					setLoggedIn(false);
					return;
				}
				setRowsError(e?.message || String(e));
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
			<Stack spacing={2} sx={{ maxWidth: 420 }}>
				<Typography variant="h4">Admin</Typography>
				{authError ? <Alert severity="error">{authError}</Alert> : null}
				<TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
				<TextField
					label="Password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Button
					variant="contained"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						setAuthError(null);
						try {
							await adminLogin(username, password);
							setLoggedIn(true);
							const r = await adminChecks();
							setChecks(r.checks);
							setPassword('');
						} catch (e: any) {
							setAuthError(e?.message || String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Login
				</Button>
			</Stack>
		);
	}

	return (
		<Stack spacing={3}>
			<Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
				<Typography variant="h4">Admin</Typography>
				<Stack direction="row" spacing={1}>
					<Button
						variant="outlined"
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
						Logout
					</Button>
				</Stack>
			</Stack>

			<Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
				<Stack spacing={2}>
					<Stack direction="row" justifyContent="space-between" alignItems="center">
						<Typography variant="h6">Models</Typography>
						{checksLoading ? <CircularProgress size={18} /> : null}
					</Stack>

					{checksError ? <Alert severity="error">{checksError}</Alert> : null}

					<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
						<TextField
							label="Add model"
							size="small"
							fullWidth
							value={newModel}
							onChange={(e) => setNewModel(e.target.value)}
							placeholder="e.g. Qwen/Qwen3-Embedding-4B"
						/>
						<Button
							variant="contained"
							disabled={busy || !newModel.trim()}
							onClick={async () => {
								const model = newModel.trim();
								if (!model) return;
								setBusy(true);
								setChecksError(null);
								try {
									await adminCreateModel(model, true);
									setNewModel('');
									const r = await adminChecks();
									setChecks(r.checks);
								} catch (e: any) {
									setChecksError(e?.message || String(e));
								} finally {
									setBusy(false);
								}
							}}
						>
							Add
						</Button>
					</Stack>

					<TableContainer variant="outlined" component={Paper}>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell>Model</TableCell>
									<TableCell width={120}>Enabled</TableCell>
									<TableCell width={120}>Actions</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{modelChecks.length === 0 ? (
									<TableRow>
										<TableCell colSpan={3}>
											<Typography variant="body2" color="text.secondary">
												No models yet
											</Typography>
										</TableCell>
									</TableRow>
								) : (
									modelChecks.map((c: any) => (
										<TableRow key={c.id} hover>
											<TableCell>
												<Stack direction="row" spacing={1} alignItems="center">
													<Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
														{c.model}
													</Typography>
													<Chip
														size="small"
														variant="outlined"
														label={c.enabled ? 'Enabled' : 'Disabled'}
														color={c.enabled ? 'success' : 'default'}
													/>
												</Stack>
											</TableCell>
											<TableCell>
												<Switch
													size="small"
													checked={!!c.enabled}
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
															setChecksError(e?.message || String(e));
														} finally {
															setBusy(false);
														}
													}}
												/>
											</TableCell>
											<TableCell>
												<Button
													size="small"
													color="error"
													disabled={busy}
													onClick={async () => {
														if (!confirm(`Delete model check "${c.model}"? This will remove its history.`)) return;
														setBusy(true);
														setChecksError(null);
														try {
															await adminDeleteCheck(c.id);
															const r = await adminChecks();
															setChecks(r.checks);
														} catch (e: any) {
															setChecksError(e?.message || String(e));
														} finally {
															setBusy(false);
														}
													}}
												>
													Delete
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>

					<Typography variant="caption" color="text.secondary">
						Disabled models will not be probed by scheduled/manual runs.
					</Typography>
				</Stack>
			</Paper>

			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
				<Button
					variant="contained"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						setRowsError(null);
						try {
							await adminRun();
							if (queryParams.type === 'head' || (queryParams.type === 'model' && queryParams.model)) {
								const r = await adminResults({ ...queryParams, limit: 100 });
								setRows(r.results);
							} else {
								setRows([]);
							}
						} catch (e: any) {
							setRowsError(e?.message || String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Manual Run
				</Button>

				<FormControl size="small" sx={{ minWidth: 160 }}>
					<InputLabel id="type-label">Type</InputLabel>
					<Select
						labelId="type-label"
						label="Type"
						value={filter.type}
						onChange={(e) =>
							setFilter(
								e.target.value === 'head'
									? { type: 'head' }
									: { type: 'model', model: (modelChecks[0]?.model as string) || '' },
							)
						}
					>
						<MenuItem value="head">HEAD</MenuItem>
						<MenuItem value="model">MODEL</MenuItem>
					</Select>
				</FormControl>

				{filter.type === 'model' ? (
					<FormControl size="small" sx={{ minWidth: 260 }}>
						<InputLabel id="model-label">Model</InputLabel>
						<Select
							labelId="model-label"
							label="Model"
							value={filter.model}
							onChange={(e) => setFilter({ type: 'model', model: e.target.value })}
						>
							{modelChecks.map((c: any) => (
								<MenuItem key={c.model} value={c.model}>
									{c.model}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				) : null}
			</Stack>

			{rowsError ? <Alert severity="error">{rowsError}</Alert> : null}

			<TableContainer component={Paper} variant="outlined">
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell>Time</TableCell>
							<TableCell>Status</TableCell>
							<TableCell>Code</TableCell>
							<TableCell>Latency (ms)</TableCell>
							<TableCell>Error</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{rowsLoading ? (
							<TableRow>
								<TableCell colSpan={5}>
									<Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
										<CircularProgress size={24} />
									</Box>
								</TableCell>
							</TableRow>
						) : orderedRows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5}>
									<Typography variant="body2" color="text.secondary">
										No data yet
									</Typography>
								</TableCell>
							</TableRow>
						) : (
							orderedRows.map((r) => (
								<TableRow key={r.id}>
									<TableCell>{formatDateTime(r.ts)}</TableCell>
									<TableCell>{Number(r.success) === 1 ? 'SUCCESS' : 'FAIL'}</TableCell>
									<TableCell>{r.status_code ?? '—'}</TableCell>
									<TableCell>{r.latency_ms ?? '—'}</TableCell>
									<TableCell>
										{r.error ? (
											<Button size="small" onClick={() => setErrorDialog({ title: 'Error detail', body: r.error })}>
												View
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

			<Dialog open={!!errorDialog} onClose={() => setErrorDialog(null)} maxWidth="md" fullWidth>
				<DialogTitle>{errorDialog?.title}</DialogTitle>
				<DialogContent>
					<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
						{errorDialog?.body}
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setErrorDialog(null)}>Close</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
