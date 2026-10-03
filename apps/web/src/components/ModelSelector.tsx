import { useEffect, useMemo, useState } from 'react';
import {
	Alert,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	InputAdornment,
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
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined';
import CloudDownloadOutlined from '@mui/icons-material/CloudDownloadOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import DoneRounded from '@mui/icons-material/DoneRounded';
import { EmptyState } from './EmptyState';
import { SectionHeader } from './SectionHeader';
import { getUserError } from '../messages';
import {
	adminChecks,
	adminModels,
	adminRun,
	adminSaveSelection,
	type AdminChecksResponse,
	type ModelCandidate,
	type ModelType,
} from '../api';

type Check = AdminChecksResponse['checks'][number];
type Row = { key: string; model: string; type: ModelType | ''; selected: boolean; candidate?: ModelCandidate; existing: boolean };

function makeRows(checks: Check[], candidates: ModelCandidate[]): Row[] {
	const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const existingModels = new Set<string>();
	const rows: Row[] = [];
	for (const check of checks) {
		if (check.type === 'head' || !check.model) continue;
		existingModels.add(check.model);
		rows.push({
			key: check.id,
			model: check.model,
			type: check.type,
			selected: check.enabled,
			candidate: byId.get(check.model),
			existing: true,
		});
	}
	for (const candidate of candidates) {
		if (existingModels.has(candidate.id)) continue;
		rows.push({
			key: `candidate:${candidate.id}`,
			model: candidate.id,
			type: candidate.detected_type || '',
			selected: false,
			candidate,
			existing: false,
		});
	}
	return rows.sort((a, b) => a.model.localeCompare(b.model));
}

export function ModelSelector({
	checks,
	busy,
	onBusyChange,
	onChecksChange,
	onRunComplete,
	onUnauthorized,
}: {
	checks: Check[];
	busy: boolean;
	onBusyChange: (busy: boolean) => void;
	onChecksChange: (checks: Check[]) => void;
	onRunComplete: () => Promise<void>;
	onUnauthorized: () => void;
}) {
	const [candidates, setCandidates] = useState<ModelCandidate[]>([]);
	const [rows, setRows] = useState<Row[]>(() => makeRows(checks, []));
	const [synced, setSynced] = useState(false);
	const [search, setSearch] = useState('');
	const [working, setWorking] = useState<'sync' | 'save' | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		setRows(makeRows(checks, candidates));
	}, [checks, candidates]);
	const visible = useMemo(() => rows.filter((row) => row.model.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
	const selected = rows.filter((row) => row.selected);
	const update = (key: string, patch: Partial<Row>) =>
		setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
	const handleError = (e: unknown) => {
		if ((e as { status?: number })?.status === 401 || (e as { code?: number })?.code === 401) onUnauthorized();
		setError(getUserError(e));
	};

	async function sync() {
		onBusyChange(true);
		setWorking('sync');
		setError(null);
		setNotice(null);
		try {
			const [catalog, current] = await Promise.all([adminModels(), adminChecks()]);
			setCandidates(catalog.models);
			onChecksChange(current.checks);
			setSynced(true);
			setNotice(`已同步 ${catalog.models.length} 个模型。`);
		} catch (e) {
			handleError(e);
		} finally {
			onBusyChange(false);
			setWorking(null);
		}
	}

	async function save() {
		onBusyChange(true);
		setWorking('save');
		setError(null);
		setNotice(null);
		let saved = false;
		try {
			await adminSaveSelection(selected.map((row) => ({ model: row.model, type: row.type as ModelType })));
			saved = true;
			onChecksChange((await adminChecks()).checks);
			await adminRun();
			setNotice('已保存，探测完成。');
			await onRunComplete();
		} catch (e) {
			if (saved && (e as { status?: number })?.status === 409) {
				setNotice('已保存，将在下一轮探测时生效。');
			} else {
				if (saved) setNotice('选择已保存。');
				handleError(e);
			}
		} finally {
			onBusyChange(false);
			setWorking(null);
		}
	}

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2.5}>
				<SectionHeader
					icon={<CloudSyncOutlined fontSize="small" />}
					title="同步模型"
					action={
						<Button
							variant="outlined"
							disabled={busy}
							onClick={sync}
							startIcon={working === 'sync' ? <CircularProgress size={18} color="inherit" /> : <SyncRounded />}
						>
							{working === 'sync' ? '正在同步…' : '同步模型列表'}
						</Button>
					}
				/>
				{error && <Alert severity="error">{error}</Alert>}
				{notice && <Alert severity="info">{notice}</Alert>}
				{rows.length === 0 ? (
					<Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: '12px', bgcolor: '#fafbfd' }}>
						<EmptyState icon={<CloudDownloadOutlined />} title={synced ? '暂无可用模型' : '尚未同步模型'} />
					</Box>
				) : (
					<>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
							<TextField
								size="small"
								label="搜索模型"
								placeholder="输入模型名称筛选"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								sx={{ flex: 1, maxWidth: { sm: 440 } }}
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<SearchRounded fontSize="small" sx={{ color: 'text.secondary' }} />
											</InputAdornment>
										),
									},
								}}
							/>
							<Typography variant="caption" color="text.secondary">
								显示 {visible.length} / {rows.length} 个模型
							</Typography>
						</Stack>
						<TableContainer sx={{ maxHeight: 380 }}>
							<Table size="small" stickyHeader aria-label="选择要探测的模型" sx={{ minWidth: visible.length ? 520 : undefined }}>
								<TableHead sx={{ display: visible.length ? undefined : 'none' }}>
									<TableRow>
										<TableCell padding="checkbox" sx={{ px: 2 }}>
											选择
										</TableCell>
										<TableCell>模型</TableCell>
										<TableCell sx={{ minWidth: 180 }}>探测类型</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{visible.map((row) => (
										<TableRow key={row.key} selected={row.selected} hover>
											<TableCell padding="checkbox">
												<Checkbox
													checked={row.selected}
													disabled={busy || !row.type || (!!row.candidate?.unsupported && !row.selected)}
													onChange={(_, checked) => update(row.key, { selected: checked })}
													inputProps={{ 'aria-label': `探测 ${row.model}` }}
												/>
											</TableCell>
											<TableCell sx={{ overflowWrap: 'anywhere' }}>
												<Stack spacing={0.5} alignItems="flex-start">
													<Typography
														variant="body2"
														sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.8125rem' }}
													>
														{row.model}
													</Typography>
													{row.candidate?.unsupported ? (
														<Chip size="small" label="暂不支持此类型" />
													) : !row.type ? (
														<Chip
															size="small"
															color="warning"
															variant="outlined"
															label={
																row.candidate?.suggested_type
																	? `建议 ${row.candidate.suggested_type === 'model' ? 'Embedding' : 'Reranker'}，待确认`
																	: '类型待确认'
															}
														/>
													) : null}
													{synced && row.existing && !row.candidate && (
														<Typography variant="caption" color="text.secondary">
															本次同步未找到
														</Typography>
													)}
												</Stack>
											</TableCell>
											<TableCell>
												<Select
													fullWidth
													size="small"
													displayEmpty
													value={row.type}
													disabled={busy || row.candidate?.unsupported}
													inputProps={{ 'aria-label': `${row.model} 的探测类型` }}
													onChange={(event) => update(row.key, { type: event.target.value as ModelType })}
												>
													<MenuItem value="" disabled>
														请选择类型
													</MenuItem>
													<MenuItem value="model">Embedding</MenuItem>
													<MenuItem value="rerank">Reranker</MenuItem>
												</Select>
											</TableCell>
										</TableRow>
									))}
									{visible.length === 0 && (
										<TableRow>
											<TableCell colSpan={3}>
												<EmptyState icon={<SearchRounded />} title="没有匹配的模型" />
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TableContainer>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
							<Box>
								<Typography variant="body2" fontWeight={600}>
									已选择{' '}
									<Box component="span" sx={{ color: 'primary.main' }}>
										{selected.length}
									</Box>{' '}
									个模型
								</Typography>
							</Box>
							<Button
								variant="contained"
								disabled={busy || selected.some((row) => !row.type)}
								onClick={save}
								startIcon={working === 'save' ? <CircularProgress size={18} color="inherit" /> : <DoneRounded />}
							>
								{working === 'save' ? '保存并探测中…' : '保存并开始探测'}
							</Button>
						</Stack>
					</>
				)}
			</Stack>
		</Paper>
	);
}
