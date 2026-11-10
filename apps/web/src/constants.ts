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
	operational: '#059669',
	degraded: '#d97706',
	outage: '#dc2626',
	maintenance: '#475569',
	unknown: '#94a3b8',
};

export const STATUS_BACKGROUNDS: Record<HealthStatus, string> = {
	operational: '#ecfdf5',
	degraded: '#fffbeb',
	outage: '#fef2f2',
	maintenance: '#f1f5f9',
	unknown: '#f8fafc',
};

export const STATUS_BORDERS: Record<HealthStatus, string> = {
	operational: 'rgba(16, 185, 129, 0.24)',
	degraded: 'rgba(245, 158, 11, 0.28)',
	outage: 'rgba(239, 68, 68, 0.26)',
	maintenance: 'rgba(100, 116, 139, 0.22)',
	unknown: 'rgba(148, 163, 184, 0.22)',
};

export const TYPE_STYLES: Record<CheckType, { color: string; bg: string; border: string }> = {
	head: { color: '#2563eb', bg: '#eff6ff', border: 'rgba(37, 99, 235, 0.18)' },
	model: { color: '#2563eb', bg: '#eff6ff', border: 'rgba(37, 99, 235, 0.18)' },
	rerank: { color: '#7c3aed', bg: '#f5f3ff', border: 'rgba(124, 58, 237, 0.18)' },
	decisions: { color: '#0891b2', bg: '#ecfeff', border: 'rgba(8, 145, 178, 0.2)' },
	systemone: { color: '#4f46e5', bg: '#eef2ff', border: 'rgba(79, 70, 229, 0.18)' },
};

export const LATENCY_THRESHOLDS = { good: 100, elevated: 300 };

export function latencyColor(value: number | null): string {
	if (value === null) return '#64748b';
	if (value < LATENCY_THRESHOLDS.good) return '#059669';
	if (value < LATENCY_THRESHOLDS.elevated) return '#d97706';
	return '#dc2626';
}

export function availabilityStatus(availability: number | null, total: number): HealthStatus {
	if (total <= 0 || availability === null) return 'unknown';
	if (availability < 0.95) return 'outage';
	if (availability < 0.99) return 'degraded';
	return 'operational';
}
