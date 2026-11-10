import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { captureView, type FrameCapture } from './captureView';
import { transitionGrid } from './transitionGrid';
import { createViewUpdateGate } from './viewUpdateGate';
import './view-transition.css';

type Mode = '2d' | '3d';
type TransitionContext = {
	changeView: (mode: Mode, commit: () => void) => void;
	viewReady: () => void;
	registerFrame: (capture: FrameCapture) => () => void;
	transitioning: boolean;
	publishViewUpdate: (update: () => void) => void;
};
const Context = createContext<TransitionContext>({
	changeView: (_, commit) => commit(),
	viewReady: () => {},
	registerFrame: () => () => {},
	transitioning: false,
	publishViewUpdate: (update) => update(),
});
export const useViewTransition = () => useContext(Context);
type Flip = {
	width: number;
	height: number;
	dpr: number;
	columns: number;
	rows: number;
	size: number;
	front: HTMLCanvasElement;
	back?: HTMLCanvasElement;
};

const LEAD_MS = 75;
const STEP_MS = 50;
const FLIP_MS = 200;
const BLEED = 0.35;

function FrameTile({
	frame,
	x = 0,
	y = 0,
	width,
	height,
	dpr,
	className,
}: {
	frame: HTMLCanvasElement;
	x?: number;
	y?: number;
	width: number;
	height: number;
	dpr: number;
	className: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const sx = Math.round(x * dpr);
	const sy = Math.round(y * dpr);
	const sw = Math.max(1, Math.round((x + width) * dpr) - sx);
	const sh = Math.max(1, Math.round((y + height) * dpr) - sy);
	useLayoutEffect(() => {
		const ctx = canvas.current!.getContext('2d')!;
		ctx.clearRect(0, 0, sw, sh);
		ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
	}, [frame, sx, sy, sw, sh]);
	return <canvas ref={canvas} width={sw} height={sh} className={className} />;
}

export function ViewTransition({ children }: { children: ReactNode }) {
	const content = useRef<HTMLDivElement>(null);
	const curtain = useRef<HTMLDivElement>(null);
	const busy = useRef(false);
	const savedScroll = useRef(0);
	const ready = useRef<(() => void) | null>(null);
	const frame = useRef<FrameCapture | null>(null);
	const abort = useRef<AbortController | null>(null);
	const [preparing, setPreparing] = useState(false);
	const [flip, setFlip] = useState<Flip | null>(null);
	const [updates] = useState(createViewUpdateGate);
	const viewReady = useCallback(() => ready.current?.(), []);
	const registerFrame = useCallback((capture: FrameCapture) => {
		frame.current = capture;
		return () => {
			if (frame.current === capture) frame.current = null;
		};
	}, []);
	useEffect(
		() => () => {
			updates.clear();
			abort.current?.abort();
		},
		[updates],
	);

	const changeView = useCallback(
		async (mode: Mode, commit: () => void) => {
			if (busy.current) return;
			// Keep visual feedback for deliberate mode switches even when the OS
			// disables incidental motion.
			busy.current = true;
			updates.hold();
			setPreparing(true);
			const controller = new AbortController();
			abort.current = controller;
			const root = content.current!;
			let animationFrame = 0;
			let finishAnimation: (() => void) | undefined;
			let committed = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const cancel = () => {
				cancelAnimationFrame(animationFrame);
				finishAnimation?.();
				ready.current?.();
			};
			const interrupt = () => controller.abort();
			controller.signal.addEventListener('abort', cancel, { once: true });
			window.addEventListener('resize', interrupt);
			try {
				root.inert = true;
				if (mode === '3d') savedScroll.current = root.querySelector('[data-status-scroll]')?.scrollTop ?? 0;
				frame.current?.pause();
				const front = await captureView(root, frame.current, controller.signal);
				if (controller.signal.aborted) return;
				const width = window.innerWidth;
				const height = window.innerHeight;
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				const { columns, rows, size } = transitionGrid(width, height);
				const next: Flip = { width, height, dpr, columns, rows, size, front };
				// Hold the outgoing picture while the destination prepares below it.
				flushSync(() => setFlip(next));
				const destinationReady = new Promise<void>((resolve) => {
					ready.current = resolve;
					timer = setTimeout(resolve, 5000);
				});
				flushSync(commit);
				committed = true;
				await destinationReady;
				clearTimeout(timer);
				if (controller.signal.aborted) return;
				// The virtual list first measures a row, then establishes its full height.
				await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				const scroller = root.querySelector<HTMLElement>('[data-status-scroll]');
				if (scroller) scroller.scrollTop = mode === '2d' ? savedScroll.current : 0;
				// Let virtual rows and SVG charts lay out after restoring scroll.
				for (let attempt = 0; attempt < 6; attempt++) {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
					if (mode !== '2d' || !scroller || root.querySelector('[data-item-index]')) break;
				}
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				frame.current?.pause();
				const back = await captureView(root, frame.current, controller.signal);
				if (controller.signal.aborted) return;
				flushSync(() => {
					setFlip({ ...next, back });
					setPreparing(false);
				});
				const tiles = [...curtain.current!.querySelectorAll<HTMLElement>('.view-transition-tile')];
				// Upload each small face before starting the diagonal wave.
				await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				if (controller.signal.aborted) return;
				const hold = curtain.current?.querySelector<HTMLElement>('.view-transition-hold');
				if (hold) hold.style.display = 'none';
				const span = columns + rows - 2;
				const step = Math.min(STEP_MS, 1000 / Math.max(1, span));
				const duration = LEAD_MS + span * step + FLIP_MS;
				const wave = tiles.map((tile, index) => {
					const diagonal = (index % columns) + Math.floor(index / columns);
					return { tile, start: LEAD_MS + (mode === '2d' ? span - diagonal : diagonal) * step, done: false };
				});
				await new Promise<void>((resolve) => {
					finishAnimation = resolve;
					let elapsed = 0;
					let previous: number | undefined;
					const tick = (now: number) => {
						if (!document.hidden) {
							elapsed += previous === undefined ? 0 : Math.min(now - previous, 80);
							for (const item of wave) {
								if (item.done || elapsed <= item.start) continue;
								const { tile } = item;
								const progress = Math.min(1, (elapsed - item.start) / FLIP_MS);
								const eased = progress * progress * (3 - 2 * progress);
								const face = eased < 0.5 ? 'front' : 'back';
								if (tile.dataset.face !== face) tile.dataset.face = face;
								tile.style.transform = `rotateY(${(mode === '2d' ? 180 : -180) * eased}deg)`;
								tile.style.setProperty('--shade', String(1 - Math.sin(eased * Math.PI) * 0.68));
								item.done = progress === 1;
							}
						}
						previous = document.hidden ? undefined : now;
						if (elapsed >= duration) resolve();
						else animationFrame = requestAnimationFrame(tick);
					};
					animationFrame = requestAnimationFrame(tick);
				});
			} catch (error) {
				if (!controller.signal.aborted) {
					console.error('View capture/transition failed', error);
					if (!committed) commit();
				}
			} finally {
				clearTimeout(timer);
				ready.current = null;
				root.inert = false;
				frame.current?.resume();
				busy.current = false;
				cancelAnimationFrame(animationFrame);
				controller.signal.removeEventListener('abort', cancel);
				window.removeEventListener('resize', interrupt);
				if (abort.current === controller) abort.current = null;
				flushSync(() => {
					setFlip(null);
					setPreparing(false);
					updates.release();
				});
				if (!controller.signal.aborted)
					document.querySelector<HTMLElement>('.view-mode-switch [aria-pressed="true"]')?.focus({ preventScroll: true });
			}
		},
		[updates],
	);
	const transitioning = preparing || flip !== null;
	const value = useMemo(
		() => ({ changeView, viewReady, registerFrame, transitioning, publishViewUpdate: updates.publish }),
		[changeView, viewReady, registerFrame, transitioning, updates],
	);
	return (
		<Context.Provider value={value}>
			<div ref={content} className="view-transition-content" aria-busy={preparing || flip !== null}>
				{children}
			</div>
			{flip &&
				createPortal(
					<div ref={curtain} className="view-transition" data-phase={flip.back ? 'flip' : 'prepare'} aria-hidden="true">
						<FrameTile className="view-transition-hold" frame={flip.front} width={flip.width} height={flip.height} dpr={flip.dpr} />
						{flip.back && (
							<div
								className="view-transition-grid"
								style={{ '--tile-size': `${flip.size}px`, '--perspective': `${flip.width * 0.8}px` } as CSSProperties}
							>
								{Array.from({ length: flip.columns * flip.rows }, (_, index) => {
									const col = index % flip.columns;
									const row = Math.floor(index / flip.columns);
									const crop = {
										x: col * flip.size - BLEED,
										y: row * flip.size - BLEED,
										width: flip.size + BLEED * 2,
										height: flip.size + BLEED * 2,
										dpr: flip.dpr,
									};
									return (
										<div key={index} className="view-transition-cell" style={{ left: col * flip.size, top: row * flip.size }}>
											<div className="view-transition-tile" data-face="front">
												<div className="view-transition-face">
													<FrameTile className="view-transition-image" frame={flip.front} {...crop} />
												</div>
												<div className="view-transition-face view-transition-back">
													<FrameTile className="view-transition-image" frame={flip.back!} {...crop} />
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>,
					document.body,
				)}
		</Context.Provider>
	);
}
