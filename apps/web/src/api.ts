export type WindowKey = '5h' | '24h' | '7d' | '30d';

export type SummaryResponse = {
	generated_at: number;
	checks: Array<{
		id: string;
		type: 'head' | 'model' | 'rerank';
		target: string;
		model: string | null;
		enabled: boolean;
		last_checked_at: number | null;
		last_status: 'success' | 'failure' | null;
		stats: Record<
			WindowKey,
			{
				success_count: number;
				total_count: number;
				availability: number | null;
			}
		>;
	}>;
};

export type TimeseriesResponse = {
	check_id: string;
	from: number;
	to: number;
	window: WindowKey;
	bucket_ms: number;
	series: Array<{
		ts: number;
		total_count: number;
		success_count: number;
		availability: number | null;
		avg_latency_ms: number | null;
	}>;
};

export type AdminResultsResponse = {
	check_id: string;
	results: Array<{
		id: number;
		check_id: string;
		ts: number;
		success: number;
		status_code: number | null;
		latency_ms: number | null;
		error: string | null;
	}>;
};

export type AdminChecksResponse = {
	checks: Array<{
		id: string;
		type: 'head' | 'model' | 'rerank';
		target: string;
		model: string | null;
		enabled: boolean;
		created_at: number;
	}>;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

async function apiFetch(path: string, init?: RequestInit) {
	const resp = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			'content-type': 'application/json',
			...(init?.headers || {}),
		},
	});
	return resp;
}

export async function fetchSummary(): Promise<SummaryResponse> {
	const resp = await apiFetch('/api/public/summary');
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function fetchTimeseries(params: {
	type: 'head' | 'model' | 'rerank';
	model?: string;
	window: WindowKey;
}): Promise<TimeseriesResponse> {
	const qs = new URLSearchParams({ type: params.type, window: params.window });
	if ((params.type === 'model' || params.type === 'rerank') && params.model) qs.set('model', params.model);
	const resp = await apiFetch(`/api/public/timeseries?${qs.toString()}`);
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function adminLogin(username: string, password: string) {
	const resp = await apiFetch('/api/admin/login', {
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify({ username, password }),
	});
	if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`);
	return resp.json();
}

export async function adminLogout() {
	const resp = await apiFetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function adminRun() {
	const resp = await apiFetch('/api/admin/run', { method: 'POST', credentials: 'include' });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function adminResults(params: { type: 'head' | 'model' | 'rerank'; model?: string; limit?: number }) {
	const qs = new URLSearchParams({ type: params.type, limit: String(params.limit ?? 100) });
	if ((params.type === 'model' || params.type === 'rerank') && params.model) qs.set('model', params.model);
	const resp = await apiFetch(`/api/admin/results?${qs.toString()}`, { credentials: 'include' });
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return (await resp.json()) as AdminResultsResponse;
}

export async function adminChecks() {
	const resp = await apiFetch('/api/admin/checks', { credentials: 'include' });
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return (await resp.json()) as AdminChecksResponse;
}

export async function adminCreateCheck(type: 'model' | 'rerank', model: string, enabled = true) {
	const resp = await apiFetch('/api/admin/checks', {
		method: 'POST',
		credentials: 'include',
		body: JSON.stringify({ type, model, enabled }),
	});
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 });
	if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`);
	return resp.json();
}

export async function adminSetCheckEnabled(id: string, enabled: boolean) {
	const resp = await apiFetch('/api/admin/checks', {
		method: 'PATCH',
		credentials: 'include',
		body: JSON.stringify({ id, enabled }),
	});
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 });
	if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`);
	return resp.json();
}

export async function adminDeleteCheck(id: string) {
	const resp = await apiFetch('/api/admin/checks', {
		method: 'DELETE',
		credentials: 'include',
		body: JSON.stringify({ id }),
	});
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { code: 401 });
	if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`);
	return resp.json();
}
