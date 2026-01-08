export const SITE_NAME = 'Router Status';
export const ROUTER_SITE_URL = 'https://router.tumuer.me';
export const DOCS_URL = 'https://embedding-docs.tumuer.me/';

export const DEFAULT_MODELS = [
	'embedding-001',
	'text-embedding-004',
	'text-embedding-3-large',
	'text-embedding-3-small',
	'text-embedding-ada-002',
];

export const WINDOWS = [
	{ key: '5h', label: '最近 5 小时' },
	{ key: '24h', label: '最近 24 小时' },
	{ key: '7d', label: '最近 7 天' },
	{ key: '30d', label: '最近 30 天' },
] as const;

