export function formatPercent(value: number | null): string {
	if (value === null) return '—';
	return `${(value * 100).toFixed(2)}%`;
}

export function formatPercentShort(value: number | null): string {
	if (value === null) return '—';
	return `${(value * 100).toFixed(1)}%`;
}

export function formatLatency(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return '—';
	return `${Math.round(value)}ms`;
}

export function formatAgoShort(ts: number | null, nowMs = Date.now()): string {
	if (!ts) return '—';
	const delta = Math.max(0, nowMs - ts);
	if (delta < 60_000) return '刚刚';
	const mins = Math.floor(delta / 60_000);
	if (mins < 60) return `${mins} 分钟前`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours} 小时前`;
	const days = Math.round(hours / 24);
	return `${days} 天前`;
}

export function formatDateTime(ts: number | null): string {
	if (!ts) return '—';
	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).format(new Date(ts));
}
