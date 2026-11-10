// Keep the captured picture stable without delaying network requests or probes.
export function createViewUpdateGate() {
	let held = false;
	let pending: (() => void) | null = null;
	return {
		hold() {
			held = true;
		},
		publish(update: () => void) {
			if (held) pending = update;
			else update();
		},
		release() {
			held = false;
			const update = pending;
			pending = null;
			update?.();
		},
		clear() {
			pending = null;
		},
	};
}
