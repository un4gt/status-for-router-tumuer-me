import {
	Alert,
	Box,
	Button,
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
import { adminLogin, adminLogout, adminResults, adminRun } from '../api';
import { DEFAULT_MODELS } from '../constants';
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

	const queryParams = useMemo(() => {
		return filter.type === 'head' ? { type: 'head' as const } : { type: 'model' as const, model: filter.model };
	}, [filter]);

	useEffect(() => {
		// Probe auth by calling an admin endpoint.
		adminResults({ ...queryParams, limit: 1 })
			.then(() => setLoggedIn(true))
			.catch((e: any) => {
				if (e?.code === 401) setLoggedIn(false);
				else setLoggedIn(false);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!loggedIn) return;
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

			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
				<Button
					variant="contained"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						setRowsError(null);
						try {
							await adminRun();
							const r = await adminResults({ ...queryParams, limit: 100 });
							setRows(r.results);
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
						onChange={(e) => setFilter(e.target.value === 'head' ? { type: 'head' } : { type: 'model', model: DEFAULT_MODELS[0] })}
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
							{DEFAULT_MODELS.map((m) => (
								<MenuItem key={m} value={m}>
									{m}
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
