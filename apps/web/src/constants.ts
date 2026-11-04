import type { CheckType, HealthStatus, ModelType } from './api';

export const SITE_NAME = 'EMRank Status';
export const ROUTER_SITE_URL = 'https://emrank.tech';
export const DOCS_URL = 'https://docs.emrank.tech/';

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

export const TYPE_LABELS: Record<CheckType, string> = {
	head: 'Gateway',
	model: 'Embedding',
	rerank: 'Reranker',
	systemone: 'System One',
	decisions: 'Decisions',
};

export const MODEL_TYPES: ModelType[] = ['model', 'rerank', 'decisions', 'systemone'];

export const STATUS_LABELS: Record<HealthStatus, string> = {
	operational: '正常',
	degraded: '降级',
	outage: '故障',
	maintenance: '维护',
	unknown: '无数据',
};

export const STATUS_COLORS: Record<HealthStatus, string> = {
	operational: '#19845e',
	degraded: '#b77712',
	outage: '#d04444',
	maintenance: '#66758c',
	unknown: '#aab6c8',
};

export const STATUS_BACKGROUNDS: Record<HealthStatus, string> = {
	operational: '#edf8f2',
	degraded: '#fff8e8',
	outage: '#fff1f1',
	maintenance: '#f1f4f8',
	unknown: '#f5f7fb',
};

export const LATENCY_THRESHOLDS = { good: 100, elevated: 300 };

export function latencyColor(value: number | null): string {
	if (value === null) return '#66758c';
	if (value < LATENCY_THRESHOLDS.good) return '#19845e';
	if (value < LATENCY_THRESHOLDS.elevated) return '#b77712';
	return '#d04444';
}

export function availabilityStatus(availability: number | null, total: number): HealthStatus {
	if (total <= 0 || availability === null) return 'unknown';
	if (availability < 0.95) return 'outage';
	if (availability < 0.99) return 'degraded';
	return 'operational';
}
