export function formatPercent(value: number | null): string {
	if (value === null) return 'No data yet';
	return `${(value * 100).toFixed(2)}%`;
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

