export const DEFAULT_HEAD_CHECK_URL = 'https://router.tumuer.me/';
export const DEFAULT_ROUTER_BASE_URL = 'https://router.tumuer.me/v1';
export const DEFAULT_CHECK_INTERVAL_SECONDS = 300;

export const DEFAULT_MODELS = [
	'BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-0.6B',
	'text-embedding-004',
	'Qwen/Qwen3-Embedding-4B',
	'embedding-001',
	'Pro/BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-8B',
] as const;

export type CheckType = 'head' | 'model';

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

	const intervalSecondsRaw = env.CHECK_INTERVAL_SECONDS?.trim() || '';
	const intervalSeconds = Number.parseInt(intervalSecondsRaw || `${DEFAULT_CHECK_INTERVAL_SECONDS}`, 10);
	const checkIntervalSeconds =
		Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : DEFAULT_CHECK_INTERVAL_SECONDS;

	return {
		headCheckUrl,
		routerBaseUrl,
		checkIntervalSeconds,
	};
}
