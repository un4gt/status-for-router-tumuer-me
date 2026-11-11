export function formatPercent(value: number | null): string {
	if (value === null) return '—';
	return `${(value * 100).toFixed(2)}%`;
}

/** Milliseconds below one second, seconds above — one rule for 2D and 3D. */
export function formatLatency(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return '—';
	if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
	return `${Math.round(value)} ms`;
}

export function formatAgoShort(ts: number | null, nowMs = Date.now()): string {
	if (!ts) return '—';
	const delta = Math.max(0, nowMs - ts);
	if (delta < 60_000) return '不到 1 分钟前';
	const mins = Math.floor(delta / 60_000);
	if (mins < 60) return `${mins} 分钟前`;
	const hours = Math.round(mins / 60);
	if (hours < 48) return `${hours} 小时前`;
	const days = Math.round(hours / 24);
	return `${days} 天前`;
}

const clockFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayClockFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** "14:05" today, "11月10日 14:05" otherwise. */
export function formatClock(ts: number | null, nowMs = Date.now()): string {
	if (!ts) return '—';
	const sameDay = new Date(ts).toDateString() === new Date(nowMs).toDateString();
	return (sameDay ? clockFormat : dayClockFormat).format(ts);
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
