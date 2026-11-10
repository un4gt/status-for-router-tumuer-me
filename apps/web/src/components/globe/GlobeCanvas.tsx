import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../api';
import { latencyTier, TIER_COLORS, worstTier } from '../../latency';
import { useViewTransition } from '../ViewTransition';
import type { SceneLink, ViewState } from './GlobeScene';
import { GlobeRenderer } from './GlobeRenderer';
import { latencyLabel, type GlobeArc, type GlobeNode } from './globeData';

type Props = {
	active: boolean;
	nodes: GlobeNode[];
	arcs: GlobeArc[];
	target: Coordinates & { label: string };
	selected: string | null;
	focusTick: number;
	paused: boolean;
	onSelect: (id: string) => void;
	onArcSelect: (arc: GlobeArc) => void;
	onFallback: (reason: string) => void;
	onTogglePause: () => void;
	onRefresh: () => void;
	onExit: () => void;
	onHelp: () => void;
};
export default function GlobeCanvas(props: Props) {
	const { active, nodes, arcs, target, selected, focusTick, paused } = props;
	const latest = useRef(props);
	latest.current = props;
	const { viewReady, registerFrame } = useViewTransition();
	const canvasHost = useRef<HTMLDivElement>(null);
	const scene = useRef<GlobeRenderer | null>(null);
	const capturePaused = useRef(false);
	const labels = useRef(new Map<string, HTMLElement>());
	const [ready, setReady] = useState(false);
	const [view, setView] = useState<ViewState>({ name: '全景视图', ortho: false });
	const [hovered, setHovered] = useState<string | null>(null);
	const [labelsVisible, setLabelsVisible] = useState(true);
	const [isolated, setIsolated] = useState(false);
	const tierFor = (signal: GlobeArc['signal']) =>
		signal.stale || signal.status === 'unknown' ? ('timeout' as const) : latencyTier(signal.latency, signal.status === 'outage');

	useEffect(() => {
		let instance: GlobeRenderer;
		try {
			instance = new GlobeRenderer(canvasHost.current!);
		} catch {
			latest.current.onFallback('无法创建 3D 渲染器，已返回 2D。');
			return;
		}
		scene.current = instance;
		instance.onViewChange = setView;
		instance.onError = (reason) => latest.current.onFallback(reason);
		instance.onLinkHover = setHovered;
		instance.onLinkSelect = (id) => {
			const arc = latest.current.arcs.find((a) => a.node.id + ':' + a.checkId === id);
			if (arc) latest.current.onArcSelect(arc);
		};
		let disposed = false;
		void instance.ready
			.then(() => {
				if (!disposed) setReady(true);
			})
			.catch(() => {
				if (!disposed) latest.current.onFallback('3D 场景初始化失败，已返回 2D。');
			});

		return () => {
			disposed = true;
			instance.dispose();
			scene.current = null;
		};
	}, []);

	useEffect(() => {
		const instance = scene.current;
		if (!instance || (!active && ready)) return;
		const links: SceneLink[] = arcs.map((a) => ({
			id: a.node.id + ':' + a.checkId,
			regionId: a.node.id,
			kind: a.layer === 'network' ? 'gateway' : 'model',
			slot: a.node.checks.filter((c) => c.layer === a.layer).findIndex((c) => c.checkId === a.checkId),
			latency: a.signal.latency,
			tier: tierFor(a.signal),
			disconnected: a.signal.status === 'outage' || a.signal.stale,
		}));
		instance.setData(
			nodes.map((n) => ({ ...n, tier: worstTier(n.checks.map((c) => tierFor(c.signal))) })),
			target,
			links,
		);
		instance.bindLabels([
			...nodes.flatMap((n) => {
				const el = labels.current.get(n.id);
				return el ? [{ id: n.id, el, lat: n.lat, lng: n.lng }] : [];
			}),
			...(labels.current.get('__target')
				? [{ id: '__target', el: labels.current.get('__target')!, lat: target.lat, lng: target.lng }]
				: []),
		]);
	}, [nodes, arcs, target, ready, active]);

	useEffect(() => {
		const instance = scene.current;
		if (!instance || !ready) return;
		if (!active) capturePaused.current = false;
		const sync = () => instance.setRunning(active && !document.hidden && !capturePaused.current);
		sync();
		document.addEventListener('visibilitychange', sync);
		let raf = 0;
		if (active)
			raf = requestAnimationFrame(() => {
				raf = requestAnimationFrame(viewReady);
			});
		return () => {
			document.removeEventListener('visibilitychange', sync);
			cancelAnimationFrame(raf);
			instance.setRunning(false);
		};
	}, [active, ready, viewReady]);
	useEffect(() => {
		const instance = scene.current;
		if (!instance || !ready || !active) return;
		return registerFrame({
			capture: (signal) => instance.capture(signal),
			pause: () => {
				capturePaused.current = true;
				instance.setRunning(false);
			},
			resume: () => {
				capturePaused.current = false;
				instance.setRunning(!document.hidden);
			},
		});
	}, [active, ready, registerFrame]);
	useEffect(() => {
		scene.current?.setPaused(paused);
	}, [paused, ready]);
	useEffect(() => {
		const s = scene.current;
		if (!s) return;
		s.setSelected(selected);
		setIsolated(false);
		if (selected) s.focusRegion(selected);
		else s.home();
	}, [selected, focusTick, ready]);

	useEffect(() => {
		if (!active) return;
		const keydown = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (
				t.closest('input,textarea,select,button,a,[contenteditable=true]') ||
				t.closest('[inert]') ||
				document.querySelector('.view-transition')
			)
				return;
			const s = scene.current;
			if (!s) return;
			if (e.metaKey || e.altKey) return;
			const key = e.code.replace(/^Numpad|^Digit/, '');
			if (e.ctrlKey && !['1', '3', '7'].includes(key)) return;
			let handled = true;
			switch (key) {
				case '1':
					s.viewAxis(e.ctrlKey ? 'back' : 'front');
					break;
				case '3':
					s.viewAxis(e.ctrlKey ? 'left' : 'right');
					break;
				case '7':
					s.viewAxis(e.ctrlKey ? 'bottom' : 'top');
					break;
				case '9':
					s.opposite();
					break;
				case '5':
					s.toggleOrtho();
					break;
				case '2':
				case 'ArrowDown':
					s.orbit(-15, 0);
					break;
				case '8':
				case 'ArrowUp':
					s.orbit(15, 0);
					break;
				case '4':
				case 'ArrowLeft':
					s.orbit(0, -15);
					break;
				case '6':
				case 'ArrowRight':
					s.orbit(0, 15);
					break;
				case '0':
				case 'Home':
					s.home();
					break;
				case 'Add':
				case 'Equal':
					s.zoom(0.82);
					break;
				case 'Subtract':
				case 'Minus':
					s.zoom(1.22);
					break;
				case 'Decimal':
				case 'Period':
					if (selected) s.focusRegion(selected);
					break;
				case 'Divide':
				case 'Slash':
					if (e.shiftKey) latest.current.onHelp();
					else setIsolated(s.toggleIsolate());
					break;
				case 'KeyH':
					setLabelsVisible((v) => {
						s.setLabelsVisible(!v);
						return !v;
					});
					break;
				case 'Space':
					latest.current.onTogglePause();
					break;
				case 'KeyR':
					latest.current.onRefresh();
					break;
				case 'F1':
					latest.current.onHelp();
					break;
				case 'BracketLeft':
				case 'BracketRight': {
					const i = nodes.findIndex((n) => n.id === selected),
						d = key === 'BracketLeft' ? -1 : 1;
					if (nodes.length) latest.current.onSelect(nodes[(i + d + nodes.length) % nodes.length].id);
					break;
				}
				default:
					handled = false;
			}
			if (handled) e.preventDefault();
		};
		window.addEventListener('keydown', keydown);
		return () => window.removeEventListener('keydown', keydown);
	}, [active, selected, nodes]);

	const hoveredArc = arcs.find((a) => a.node.id + ':' + a.checkId === hovered);
	const colocated = nodes.find((n) => Math.abs(n.lat - target.lat) < 1 && Math.abs(n.lng - target.lng) < 1);
	return (
		<div className="globe-canvas">
			<div ref={canvasHost} style={{ width: '100%', height: '100%' }} />
			<div className="globe-scene-labels" aria-hidden={!labelsVisible}>
				{nodes.map((n) => (
					<button
						key={n.id}
						ref={(el) => {
							if (el) labels.current.set(n.id, el);
							else labels.current.delete(n.id);
						}}
						className="globe-scene-label"
						onClick={() => props.onSelect(n.id)}
						tabIndex={labelsVisible ? 0 : -1}
					>
						<i style={{ background: TIER_COLORS[worstTier(n.checks.map((c) => tierFor(c.signal)))] }} />
						{n.label}
						{colocated?.id === n.id ? ' · 服务目标' : ''}
					</button>
				))}
				{!colocated && (
					<span
						className="globe-scene-label"
						ref={(el) => {
							if (el) labels.current.set('__target', el);
							else labels.current.delete('__target');
						}}
					>
						{target.label} · 服务目标
					</span>
				)}
			</div>
			<div className="globe-view-state">
				{view.name} · {view.ortho ? '正交' : '透视'}
				{isolated ? ' · 局部' : ''}
			</div>
			{hoveredArc && (
				<div className="globe-link-tooltip" role="tooltip">
					{hoveredArc.label} · {latencyLabel(hoveredArc.signal.latency)}
				</div>
			)}
		</div>
	);
}
