import type { CheckType, ModelType } from './api';

export const SITE_NAME = 'emrank.tech';
export const SITE_SUFFIX = '服务状态';
export const ROUTER_SITE_URL = 'https://emrank.tech';
export const DOCS_URL = 'https://docs.emrank.tech/';

export const WINDOWS = [
	{ key: '5h', label: '最近 5 小时', short: '5 小时' },
	{ key: '24h', label: '最近 24 小时', short: '24 小时' },
	{ key: '7d', label: '最近 7 天', short: '7 天' },
	{ key: '30d', label: '最近 30 天', short: '30 天' },
] as const;

/** Product names users recognise; the raw API value never reaches the UI. */
export const TYPE_LABELS: Record<CheckType, string> = {
	head: '网关',
	model: 'Embedding',
	rerank: 'Reranker',
	systemone: 'System One',
	decisions: 'Decisions',
};

export const MODEL_TYPES: ModelType[] = ['model', 'rerank', 'decisions', 'systemone'];

/** Data-source names as a visitor would understand them. */
export const SOURCE_LABELS: Record<string, string> = {
	globalping: '网关检测（Globalping）',
	cloudprobe: '模型检测（云函数）',
	mock: '模拟数据',
	direct: '本站直连',
};

/** Thresholds behind the uptime colours; must match the legend copy. */
export const AVAILABILITY_THRESHOLDS = { degraded: 0.99, outage: 0.95 } as const;
