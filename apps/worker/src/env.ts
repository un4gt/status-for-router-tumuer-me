export const DEFAULT_HEAD_CHECK_URL = 'https://router.tumuer.me/';
export const DEFAULT_ROUTER_BASE_URL = 'https://router.tumuer.me/v1';
export const DEFAULT_CHECK_INTERVAL_SECONDS = 3600;

function parseIntervalSeconds(raw: string | undefined): number | null {
	if (!raw) return null;
	const s = raw.trim().toLowerCase();
	if (!s) return null;

	// Supported formats:
	// - "3600"
	// - "3600s" | "60m" | "1h" | "1d"
	// - "60*60" | "60*60s" | "24*60m"
	const match = s.match(/^(\d+(?:\s*\*\s*\d+)*)\s*([smhd])?$/);
	if (!match) return null;

	const expr = match[1];
	const unit = match[2] ?? 's';

	const parts = expr
		.split('*')
		.map((p) => p.trim())
		.filter(Boolean);

	let value = 1;
	for (const part of parts) {
		const n = Number.parseInt(part, 10);
		if (!Number.isFinite(n)) return null;
		value *= n;
		if (!Number.isFinite(value)) return null;
	}

	const multiplier =
		unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 60 * 60 : unit === 'd' ? 24 * 60 * 60 : 1;

	const seconds = value * multiplier;
	return Number.isFinite(seconds) ? seconds : null;
}

export const DEFAULT_MODELS = [
	'BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-0.6B',
	'text-embedding-004',
	'Qwen/Qwen3-Embedding-4B',
	'embedding-001',
	'Pro/BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-8B',
] as const;

export const DEFAULT_RERANK_MODELS = ['Pro/BAAI/bge-reranker-v2-m3'] as const;

export type CheckType = 'head' | 'model' | 'rerank';

export interface Env {
	DB: D1Database;

	ADMIN_PASSWORD?: string;
	SESSION_SECRET?: string;
	OPENAI_API_KEY?: string;

	ROUTER_BASE_URL?: string;
	HEAD_CHECK_URL?: string;
	CHECK_INTERVAL_SECONDS?: string;
}

export function getConfig(env: Env) {
	const headCheckUrl = env.HEAD_CHECK_URL?.trim() || DEFAULT_HEAD_CHECK_URL;
	const routerBaseUrl = env.ROUTER_BASE_URL?.trim() || DEFAULT_ROUTER_BASE_URL;

	const parsedSeconds = parseIntervalSeconds(env.CHECK_INTERVAL_SECONDS) ?? DEFAULT_CHECK_INTERVAL_SECONDS;
	const checkIntervalSeconds = parsedSeconds > 0 ? parsedSeconds : DEFAULT_CHECK_INTERVAL_SECONDS;

	return {
		headCheckUrl,
		routerBaseUrl,
		checkIntervalSeconds,
	};
}
