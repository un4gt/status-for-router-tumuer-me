import { GlobeScene, type LabelPoint, type LabelProjection, type ScenePointer } from './GlobeScene';

type Label = LabelPoint & { el: HTMLElement };
type CapturedFrame = { canvas: HTMLCanvasElement; image: string };

/** The mounted globe owns one main-thread scene/context across every view switch. */
export class GlobeRenderer extends GlobeScene {
	onError?: (reason: string) => void;
	private surface: HTMLCanvasElement;
	private host: HTMLDivElement;
	private observer: ResizeObserver;
	private labelElements = new Map<string, HTMLElement>();
	private unbind = () => {};
	private released = false;
	private cancelCaptures = new Set<() => void>();

	constructor(host: HTMLDivElement) {
		const canvas = document.createElement('canvas');
		// Hidden prewarming uses the viewport until the visible host can be measured.
		super(canvas, {
			width: host.clientWidth || window.innerWidth,
			height: host.clientHeight || window.innerHeight,
			pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
		});
		this.host = host;
		this.surface = canvas;
		canvas.tabIndex = 0;
		canvas.setAttribute('aria-label', '全球检测链路 3D 地球；拖动旋转，双指或滚轮缩放');
		canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
		host.replaceChildren(canvas);
		this.onLabels = (labels) => this.applyLabels(labels);
		this.bindInput(canvas);
		this.observer = new ResizeObserver(this.syncSize);
		this.observer.observe(host);
		window.addEventListener('resize', this.syncSize);
		void this.ready.then(
			() => {
				if (!this.released) canvas.dataset.renderer = 'main';
			},
			() => {},
		);
	}

	private syncSize = () => {
		if (this.host.clientWidth && this.host.clientHeight)
			this.resize({ width: this.host.clientWidth, height: this.host.clientHeight, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
	};

	bindLabels(labels: Label[]) {
		this.labelElements = new Map(labels.map((label) => [label.id, label.el]));
		this.setLabelPoints(labels.map(({ id, lat, lng }) => ({ id, lat, lng })));
	}
	private applyLabels(projections: LabelProjection[]) {
		for (const label of projections) {
			const el = this.labelElements.get(label.id);
			if (!el) continue;
			el.style.transform = `translate3d(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px, 0)`;
			el.style.opacity = label.opacity.toFixed(3);
			const shown = label.opacity > 0.5;
			if (el.inert === shown || !el.hasAttribute('aria-hidden')) {
				el.inert = !shown;
				el.style.pointerEvents = shown ? 'auto' : 'none';
				el.setAttribute('aria-hidden', String(!shown));
			}
		}
	}
	private bindInput(canvas: HTMLCanvasElement) {
		const pointer = (event: PointerEvent) => {
			if (event.type === 'pointerdown') {
				if (![0, 1, 2].includes(event.button)) return;
				event.preventDefault();
				canvas.focus({ preventScroll: true });
				canvas.setPointerCapture(event.pointerId);
				canvas.style.cursor = event.button === 2 || event.shiftKey ? 'move' : 'grabbing';
			} else if (event.type === 'pointerup' || event.type === 'pointercancel') {
				if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
				canvas.style.cursor = '';
			}
			const bounds = canvas.getBoundingClientRect();
			this.handlePointer({
				type: event.type as ScenePointer['type'],
				clientX: event.clientX - bounds.left,
				clientY: event.clientY - bounds.top,
				pointerId: event.pointerId,
				pointerType: event.pointerType,
				button: event.button,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
			});
		};
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			this.zoom(Math.exp(event.deltaY * 0.0012));
		};
		const contextmenu = (event: Event) => event.preventDefault();
		const lost = (event: Event) => {
			event.preventDefault();
			if (!this.released) {
				this.setRunning(false);
				this.onError?.('WebGL 上下文已丢失，已恢复 2D。');
			}
		};
		const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;
		for (const type of types) canvas.addEventListener(type, pointer);
		canvas.addEventListener('wheel', wheel, { passive: false });
		canvas.addEventListener('contextmenu', contextmenu);
		canvas.addEventListener('webglcontextlost', lost);
		this.unbind = () => {
			for (const type of types) canvas.removeEventListener(type, pointer);
			canvas.removeEventListener('wheel', wheel);
			canvas.removeEventListener('contextmenu', contextmenu);
			canvas.removeEventListener('webglcontextlost', lost);
		};
	}

	async capture(signal?: AbortSignal): Promise<CapturedFrame> {
		await this.ready;
		if (this.released || signal?.aborted) throw new DOMException('Capture aborted', 'AbortError');
		return new Promise((resolve, reject) => {
			let settled = false;
			let reader: FileReader | undefined;
			const finish = (error?: unknown, image?: string) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal?.removeEventListener('abort', cancel);
				this.cancelCaptures.delete(cancel);
				if (reader?.readyState === FileReader.LOADING) reader.abort();
				if (error) reject(error);
				else resolve({ canvas: this.surface, image: image! });
			};
			const cancel = () => finish(new DOMException('Capture aborted', 'AbortError'));
			const timer = window.setTimeout(() => finish(new Error('Globe capture timed out')), 3000);
			signal?.addEventListener('abort', cancel, { once: true });
			this.cancelCaptures.add(cancel);
			void this.captureBlob()
				.then((blob) => {
					if (settled) return;
					reader = new FileReader();
					reader.onload = () => finish(undefined, reader!.result as string);
					reader.onerror = () => finish(reader!.error ?? new Error('Cannot read globe frame'));
					reader.readAsDataURL(blob);
				})
				.catch((error) => finish(error));
		});
	}

	override dispose() {
		if (this.released) return;
		this.released = true;
		for (const cancel of [...this.cancelCaptures]) cancel();
		this.observer.disconnect();
		window.removeEventListener('resize', this.syncSize);
		this.unbind();
		super.dispose();
		this.surface.remove();
	}
}
