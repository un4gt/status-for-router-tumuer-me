type WindowCounter = { startMs: number; count: number };

const ipCounters = new Map<string, WindowCounter>();

export function isRateLimited(ip: string, opts: { windowMs: number; max: number }, nowMs = Date.now()): boolean {
	const entry = ipCounters.get(ip);
	if (!entry || nowMs - entry.startMs >= opts.windowMs) {
		ipCounters.set(ip, { startMs: nowMs, count: 1 });
		return false;
	}
	entry.count += 1;
	ipCounters.set(ip, entry);
	return entry.count > opts.max;
}

