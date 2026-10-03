type WindowCounter = { startMs: number; count: number };

export function createRateLimiter(windowMs = 60_000, max = 10) {
	const counters = new Map<string, WindowCounter>();
	let nextCleanup = 0;
	return (ip: string, now = Date.now()) => {
		if (now >= nextCleanup) {
			for (const [key, entry] of counters) if (now - entry.startMs >= windowMs) counters.delete(key);
			nextCleanup = now + windowMs;
		}
		const entry = counters.get(ip);
		if (!entry || now - entry.startMs >= windowMs) {
			counters.set(ip, { startMs: now, count: 1 });
			return false;
		}
		return ++entry.count > max;
	};
}
