export type WindowKey = '5h' | '24h' | '7d' | '30d';
export type CheckType = 'head' | 'model' | 'rerank' | 'systemone' | 'decisions';
export type ModelType = Exclude<CheckType, 'head'>;
export type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

export type AvailabilityStats = { success_count: number; total_count: number; availability: number | null };

export type SummaryResponse = {
	generated_at: number;
	checks: Array<{
		id: string;
		type: CheckType;
		target: string;
		model: string | null;
		enabled: boolean;
		provider: string;
		last_checked_at: number | null;
		last_status: 'success' | 'failure' | null;
		stats: Record<WindowKey, AvailabilityStats>;
		stats_by_region: Record<string, Record<WindowKey, AvailabilityStats>>;
		last_by_region: Record<string, { ts: number; success: number; latency_ms: number | null }>;
	}>;
};

export type TimeseriesResponse = {
	check_id: string;
	region?: string;
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

export type SeriesPoint = TimeseriesResponse['series'][number];
export type Series = { from: number; to: number; bucket_ms: number; series: SeriesPoint[] };

export type RegionStats = {
	status: HealthStatus;
	availability: number | null;
	total_count: number;
	success_count: number;
	avg_latency_ms: number | null;
	p95_ms: number | null;
	last_status: 'success' | 'failure' | null;
	last_checked_at: number | null;
	last_latency_ms: number | null;
	series: Series;
};

export type Coordinates = { lat: number; lng: number };
export type RegionInfo = { id: string; label: string; code: string; status: HealthStatus; coordinates: Coordinates | null };

export type GatewayEndpoint = {
	id: string;
	label: string;
	method: 'HEAD' | 'GET';
	path: string;
	status: HealthStatus;
	last_checked_at: number | null;
	stats: Record<WindowKey, AvailabilityStats>;
	regions: Record<string, RegionStats>;
};

export type GatewayRegion = RegionStats & { id: string; label: string; code: string };

export type ModelHealth = {
	id: string;
	type: CheckType;
	model: string;
	enabled: boolean;
	provider: string;
	probe_configured: boolean;
	status: HealthStatus;
	availability: number | null;
	total_count: number;
	success_count: number;
	avg_latency_ms: number | null;
	p95_ms: number | null;
	last_status: 'success' | 'failure' | null;
	last_checked_at: number | null;
	stats: Record<WindowKey, AvailabilityStats>;
	regions: Record<string, RegionStats>;
	series: Series;
};

export type SourceStatus = {
	configured: boolean;
	last_sync_at: number | null;
	last_error: string | null;
	last_warning: string | null;
};

export type OverviewResponse = {
	generated_at: number;
	mode: 'live' | 'mock' | 'direct';
	window: WindowKey;
	regions: RegionInfo[];
	topology: { target: Coordinates & { label: string }; intervals: { network: number; model: number } };
	gateway: {
		status: HealthStatus;
		availability: number | null;
		last_checked_at: number | null;
		endpoints: GatewayEndpoint[];
		regions: GatewayRegion[];
	};
	models: ModelHealth[];
	sources: Record<string, SourceStatus>;
};

export type AdminSourcesResponse = {
	mode: 'live' | 'mock' | 'direct';
	regions: Array<{ id: string; label: string; code: string; globalping: string; probeUrl: string | null }>;
	sources: Record<string, SourceStatus>;
};

export type AdminResultsResponse = {
	check_id: string;
	region?: string;
	results: Array<{
		id: number;
		check_id: string;
		ts: number;
		success: number;
		status_code: number | null;
		latency_ms: number | null;
		error: string | null;
		region_id: string;
		source: string;
	}>;
};

export type AdminChecksResponse = {
	checks: Array<{
		id: string;
		type: CheckType;
		target: string;
		model: string | null;
		enabled: boolean;
		created_at: number;
		provider: string;
	}>;
};

export type ModelCandidate = {
	id: string;
	detected_type: ModelType | null;
	suggested_type: ModelType | null;
	unsupported: boolean;
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

export async function fetchOverview(window: WindowKey, signal?: AbortSignal): Promise<OverviewResponse> {
	const qs = new URLSearchParams({ window });
	const resp = await apiFetch(`/api/public/overview?${qs.toString()}`, { signal, cache: 'no-store' });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export type ProbeDetail = {
	check_id: string; region: string; source: string; window: WindowKey;
	from: number; to: number; bucket_ms: number;
	total_count: number; success_count: number; availability: number | null;
	sample_count: number; p95_ms: number | null; p99_ms: number | null;
	series: Array<{ ts: number; sample_count: number; p95_ms: number | null; p99_ms: number | null }>;
	history: Array<{ ts: number; success: number; status_code: number | null; latency_ms: number | null }>;
};

export async function fetchProbeDetail(checkId: string, region: string, window: WindowKey, signal: AbortSignal): Promise<ProbeDetail> {
	const query = new URLSearchParams({ check_id: checkId, region, window });
	const response = await apiFetch(`/api/public/probe-detail?${query}`, { signal, cache: 'no-store' });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.json();
}

export async function fetchSummary(signal?: AbortSignal): Promise<SummaryResponse> {
	const resp = await apiFetch('/api/public/summary', { signal, cache: 'no-store' });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function fetchTimeseries(
	params: { type?: CheckType; model?: string; checkId?: string; region?: string; window: WindowKey },
	signal?: AbortSignal,
): Promise<TimeseriesResponse> {
	const qs = new URLSearchParams({ window: params.window });
	if (params.checkId) qs.set('check_id', params.checkId);
	if (params.type) qs.set('type', params.type);
	if (params.model) qs.set('model', params.model);
	if (params.region) qs.set('region', params.region);
	const resp = await apiFetch(`/api/public/timeseries?${qs.toString()}`, { signal, cache: 'no-store' });
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
	if (!resp.ok)
		throw Object.assign(new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`), { status: resp.status });
	return resp.json();
}

export async function adminSyncSources() {
	const resp = await apiFetch('/api/admin/sources/sync', { method: 'POST', credentials: 'include' });
	if (!resp.ok)
		throw Object.assign(new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`), { status: resp.status });
	return resp.json();
}

export async function adminSources(): Promise<AdminSourcesResponse> {
	const resp = await apiFetch('/api/admin/sources', { credentials: 'include' });
	if (resp.status === 401) throw Object.assign(new Error('Unauthorized'), { status: 401 });
	if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
	return resp.json();
}

export async function adminModels(): Promise<{ models: ModelCandidate[] }> {
	const resp = await apiFetch('/api/admin/models', { credentials: 'include' });
	if (!resp.ok)
		throw Object.assign(new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`), { status: resp.status });
	return resp.json();
}

export async function adminSaveSelection(checks: Array<{ model: string; type: ModelType }>) {
	const resp = await apiFetch('/api/admin/checks/selection', {
		method: 'PUT',
		credentials: 'include',
		body: JSON.stringify({ checks }),
	});
	if (!resp.ok)
		throw Object.assign(new Error((await resp.json().catch(() => null))?.error || `HTTP ${resp.status}`), { status: resp.status });
	return resp.json();
}

export async function adminResults(params: { type?: CheckType; model?: string; checkId?: string; region?: string; limit?: number }) {
	const qs = new URLSearchParams({ limit: String(params.limit ?? 100) });
	if (params.checkId) qs.set('check_id', params.checkId);
	if (params.type) qs.set('type', params.type);
	if (params.model) qs.set('model', params.model);
	if (params.region) qs.set('region', params.region);
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

export async function adminCreateCheck(type: ModelType, model: string, enabled = true) {
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
