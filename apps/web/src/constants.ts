export const SITE_NAME = 'Router Status';
export const ROUTER_SITE_URL = 'https://router.tumuer.me';
export const DOCS_URL = 'https://embedding-docs.tumuer.me/';

export const DEFAULT_MODELS = [
	'BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-0.6B',
	'text-embedding-004',
	'Qwen/Qwen3-Embedding-4B',
	'embedding-001',
	'Pro/BAAI/bge-m3',
	'Qwen/Qwen3-Embedding-8B',
];

export const WINDOWS = [
	{ key: '5h', label: '最近 5 小时' },
	{ key: '24h', label: '最近 24 小时' },
	{ key: '7d', label: '最近 7 天' },
	{ key: '30d', label: '最近 30 天' },
] as const;
