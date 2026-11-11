import { Box } from '@mui/material';
import { useEffect, useRef } from 'react';
import type { HealthStatus } from '../../api';
import { statusShares } from '../../status';
import { cssVarName, STATUS_META, type TokenName } from '../../design/tokens';

/**
 * The hero's right column: a drifting particle field. Three depth layers move
 * at different speeds along a slow flow field; nearby particles are joined by
 * hairlines, and small pulses run along the links between the accent particles.
 * Every particle takes a status colour, in proportion to how many checked subjects (the
 * gateway and each model) are in that status: all healthy is a green field, a few degraded
 * models turn a matching share amber, an outage adds red. The pointer gently parts the field.
 *
 * Decorative only (aria-hidden): the headline already says the status in words.
 * Pauses when off screen, in a background tab, or hidden behind the 3D view;
 * draws one still frame when the visitor prefers reduced motion.
 */

/** Two columns from md up: the status copy on the left (wide enough for the figures row), the particle field on the right. */
export const heroGrid = {
	display: 'grid',
	gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(440px, 1fr) minmax(0, 1.75fr)' },
	columnGap: { md: 4, lg: 5 },
	alignItems: 'center',
} as const;

const frame = {
	display: { xs: 'none', md: 'block' },
	position: 'relative',
	alignSelf: 'stretch',
	minHeight: 260,
	// Feather every edge so the field has no visible box. The mask reads alpha only.
	WebkitMaskImage: 'radial-gradient(closest-side, black 72%, transparent 100%)',
	maskImage: 'radial-gradient(closest-side, black 72%, transparent 100%)',
} as const;

/** Reserves the field's box while the first overview loads. */
export function HeroArtSpace() {
	return <Box aria-hidden sx={frame} />;
}

type RGB = [number, number, number];
/** `hue` is a stable position in [0, 1); the status band it falls in picks the colour. */
type Particle = { x: number; y: number; vx: number; vy: number; layer: number; r: number; accent: boolean; seed: number; hue: number; tone: number };
type Pulse = { a: Particle; b: Particle; t: number };

/** Depth layers, far to near: opacity, size and speed all grow with depth. */
const LAYERS = [
	{ depth: 0.45, share: 0.4 },
	{ depth: 0.72, share: 0.35 },
	{ depth: 1, share: 0.25 },
];
const LINK = 104; // px between particles for a hairline, at full depth
const POINTER_RADIUS = 150;
const ACCENT_SHARE = 0.16; // particles that glow
const PULSE_EVERY = 0.45; // s
const FADE_IN = 0.9; // s

function readToken(name: TokenName) {
	return getComputedStyle(document.documentElement).getPropertyValue(cssVarName(name)).trim();
}

function parseColor(color: string): RGB {
	const hex = color.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = Number.parseInt(hex[1], 16);
		return [n >> 16, (n >> 8) & 255, n & 255];
	}
	const parts = color.match(/\d+(\.\d+)?/g);
	return parts && parts.length >= 3 ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : [128, 128, 128];
}

const rgba = ([r, g, b]: RGB, alpha: number) => `rgba(${r},${g},${b},${alpha.toFixed(3)})`;

/** A soft round glow, drawn once per colour and stamped with drawImage. */
function glowSprite(color: RGB) {
	const sprite = document.createElement('canvas');
	sprite.width = sprite.height = 64;
	const ctx = sprite.getContext('2d')!;
	const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, rgba(color, 0.55));
	gradient.addColorStop(0.35, rgba(color, 0.18));
	gradient.addColorStop(1, rgba(color, 0));
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	return sprite;
}

export function HeroArt({ counts }: { counts: Record<HealthStatus, number> }) {
	const host = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const countsRef = useRef(counts);
	const recolor = useRef<() => void>(() => {});
	countsRef.current = counts;
	const countsKey = Object.values(counts).join(',');

	useEffect(() => recolor.current(), [countsKey]);

	useEffect(() => {
		const box = host.current;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!box || !canvas || !ctx) return;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

		let width = 0;
		let height = 0;
		let particles: Particle[] = [];
		let pulses: Pulse[] = [];
		/** Colour index per status band, worst first; `end` is the band's upper bound in [0, 1). */
		let bands: Array<{ end: number; color: RGB; sprite: HTMLCanvasElement }> = [];
		let frameId = 0;
		let running = false;
		let visible = false;
		let last = 0;
		let age = 0;
		let untilPulse = PULSE_EVERY;
		const pointer = { x: 0, y: 0, active: false };

		const sprites = new Map<string, HTMLCanvasElement>();
		function readColors() {
			bands = statusShares(countsRef.current).map(({ status, end }) => {
				const css = readToken(STATUS_META[status].fill);
				let sprite = sprites.get(css);
				if (!sprite) sprites.set(css, (sprite = glowSprite(parseColor(css))));
				return { end, color: parseColor(css), sprite };
			});
			for (const p of particles) assignTone(p);
		}

		function assignTone(p: Particle) {
			const index = bands.findIndex((band) => p.hue < band.end);
			p.tone = index < 0 ? bands.length - 1 : index;
		}

		function spawn(layer: number): Particle {
			return {
				x: Math.random() * width,
				y: Math.random() * height,
				vx: (Math.random() - 0.5) * 8,
				vy: (Math.random() - 0.5) * 8,
				layer,
				r: 1.1 + Math.random() * 1.1,
				accent: Math.random() < ACCENT_SHARE,
				seed: Math.random() * Math.PI * 2,
				hue: Math.random(),
				tone: 0,
			};
		}

		function populate() {
			const target = Math.max(80, Math.min(240, Math.round((width * height) / 1500)));
			if (particles.length === target) return;
			if (particles.length > target) {
				particles = particles.slice(0, target);
				return;
			}
			while (particles.length < target) {
				const roll = Math.random();
				const layer = roll < LAYERS[0].share ? 0 : roll < LAYERS[0].share + LAYERS[1].share ? 1 : 2;
				const particle = spawn(layer);
				assignTone(particle);
				particles.push(particle);
			}
		}

		function resize() {
			const rect = box!.getBoundingClientRect();
			if (!rect.width || !rect.height) return;
			const scaleX = width ? rect.width / width : 1;
			const scaleY = height ? rect.height / height : 1;
			width = rect.width;
			height = rect.height;
			for (const p of particles) {
				p.x *= scaleX;
				p.y *= scaleY;
			}
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas!.width = Math.round(width * dpr);
			canvas!.height = Math.round(height * dpr);
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			populate();
		}

		function step(dt: number, time: number) {
			const margin = 24;
			for (const p of particles) {
				// A slow, smooth flow field keeps the drift organic without random jitter.
				const angle = 1.7 * (Math.sin(p.x * 0.006 + time * 0.35 + p.seed) + Math.cos(p.y * 0.007 - time * 0.27));
				p.vx += Math.cos(angle) * 9 * dt;
				p.vy += Math.sin(angle) * 9 * dt;
				if (pointer.active) {
					const dx = p.x - pointer.x;
					const dy = p.y - pointer.y;
					const distance = Math.hypot(dx, dy);
					if (distance > 0.5 && distance < POINTER_RADIUS) {
						const push = (1 - distance / POINTER_RADIUS) * 180 * dt;
						p.vx += (dx / distance) * push;
						p.vy += (dy / distance) * push;
					}
				}
				const damping = 1 - Math.min(1, 0.9 * dt);
				p.vx *= damping;
				p.vy *= damping;
				const speed = 0.5 + 0.5 * LAYERS[p.layer].depth;
				p.x += p.vx * speed * dt;
				p.y += p.vy * speed * dt;
				if (p.x < -margin) p.x = width + margin;
				else if (p.x > width + margin) p.x = -margin;
				if (p.y < -margin) p.y = height + margin;
				else if (p.y > height + margin) p.y = -margin;
			}

			untilPulse -= dt;
			if (untilPulse <= 0) {
				untilPulse = PULSE_EVERY * (0.6 + Math.random() * 0.8);
				const sources = particles.filter((p) => p.accent && p.layer > 0);
				const a = sources[Math.floor(Math.random() * sources.length)];
				if (a && pulses.length < 6) {
					const reach = LINK * LAYERS[a.layer].depth;
					const near = particles.filter((b) => b !== a && b.layer === a.layer && Math.hypot(b.x - a.x, b.y - a.y) < reach);
					const b = near[Math.floor(Math.random() * near.length)];
					if (b) pulses.push({ a, b, t: 0 });
				}
			}
			for (const pulse of pulses) pulse.t += dt / 0.9;
			pulses = pulses.filter((pulse) => pulse.t < 1);
		}

		function draw() {
			ctx!.clearRect(0, 0, width, height);
			const fade = Math.min(1, age / FADE_IN);
			ctx!.lineWidth = 1;

			// Hairlines between neighbours on the same layer, fading with distance.
			for (let i = 0; i < particles.length; i++) {
				const a = particles[i];
				const depth = LAYERS[a.layer].depth;
				const reach = LINK * depth;
				for (let j = i + 1; j < particles.length; j++) {
					const b = particles[j];
					if (b.layer !== a.layer) continue;
					const dx = b.x - a.x;
					if (dx > reach || dx < -reach) continue;
					const dy = b.y - a.y;
					if (dy > reach || dy < -reach) continue;
					const distance = Math.hypot(dx, dy);
					if (distance >= reach) continue;
					const strength = (1 - distance / reach) * depth * fade;
					const both = a.accent && b.accent;
					// A link between two colours is drawn in the calmer (later) band's colour.
					ctx!.strokeStyle = rgba(bands[Math.max(a.tone, b.tone)].color, (both ? 0.7 : 0.4) * strength);
					ctx!.beginPath();
					ctx!.moveTo(a.x, a.y);
					ctx!.lineTo(b.x, b.y);
					ctx!.stroke();
				}
			}

			if (pointer.active) {
				for (const p of particles) {
					const distance = Math.hypot(p.x - pointer.x, p.y - pointer.y);
					if (p.layer < 2 || distance >= POINTER_RADIUS) continue;
					ctx!.strokeStyle = rgba(bands[p.tone].color, 0.32 * (1 - distance / POINTER_RADIUS) * fade);
					ctx!.beginPath();
					ctx!.moveTo(pointer.x, pointer.y);
					ctx!.lineTo(p.x, p.y);
					ctx!.stroke();
				}
			}

			// Dots: one path per layer and colour for the plain ones; accents get a glow.
			LAYERS.forEach((layer, index) => {
				bands.forEach((band, tone) => {
					ctx!.fillStyle = rgba(band.color, (0.4 + 0.55 * layer.depth) * fade);
					ctx!.beginPath();
					for (const p of particles) {
						if (p.layer !== index || p.tone !== tone || p.accent) continue;
						const r = p.r * (0.55 + 0.6 * layer.depth);
						ctx!.moveTo(p.x + r, p.y);
						ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
					}
					ctx!.fill();
				});
			});
			for (const p of particles) {
				if (!p.accent) continue;
				const depth = LAYERS[p.layer].depth;
				const r = p.r * (0.8 + 0.8 * depth);
				const band = bands[p.tone];
				ctx!.globalAlpha = fade * depth;
				ctx!.drawImage(band.sprite, p.x - r * 5, p.y - r * 5, r * 10, r * 10);
				ctx!.globalAlpha = 1;
				ctx!.fillStyle = rgba(band.color, (0.65 + 0.35 * depth) * fade);
				ctx!.beginPath();
				ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
				ctx!.fill();
			}

			for (const pulse of pulses) {
				const t = pulse.t;
				const x = pulse.a.x + (pulse.b.x - pulse.a.x) * t;
				const y = pulse.a.y + (pulse.b.y - pulse.a.y) * t;
				const strength = Math.sin(Math.PI * t) * fade;
				const band = bands[pulse.a.tone];
				ctx!.globalAlpha = strength;
				ctx!.drawImage(band.sprite, x - 12, y - 12, 24, 24);
				ctx!.globalAlpha = 1;
				ctx!.fillStyle = rgba(band.color, 0.95 * strength);
				ctx!.beginPath();
				ctx!.arc(x, y, 1.6, 0, Math.PI * 2);
				ctx!.fill();
			}
		}

		function tick(now: number) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			age += dt;
			step(dt, now / 1000);
			draw();
			frameId = requestAnimationFrame(tick);
		}

		function start() {
			if (running || !visible || document.hidden || reduceMotion.matches || !width) return;
			running = true;
			last = performance.now();
			frameId = requestAnimationFrame(tick);
		}

		function stop() {
			running = false;
			cancelAnimationFrame(frameId);
		}

		/** Reduced motion: a settled, fully faded-in still. */
		function still() {
			if (!width) return;
			age = FADE_IN;
			draw();
		}

		const sync = () => {
			if (reduceMotion.matches) {
				stop();
				still();
			} else if (visible && !document.hidden) start();
			else stop();
		};

		recolor.current = () => {
			readColors();
			if (!running) still();
		};

		readColors();
		resize();
		if (reduceMotion.matches) still();

		const resizeObserver = new ResizeObserver(() => {
			resize();
			if (!running) still();
			sync();
		});
		resizeObserver.observe(box);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			sync();
		});
		intersection.observe(box);
		// MUI switches light/dark by rewriting this attribute; canvas colours are literal.
		const scheme = new MutationObserver(() => recolor.current());
		scheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
		document.addEventListener('visibilitychange', sync);
		reduceMotion.addEventListener('change', sync);

		const move = (event: PointerEvent) => {
			const rect = box.getBoundingClientRect();
			pointer.x = event.clientX - rect.left;
			pointer.y = event.clientY - rect.top;
			pointer.active = true;
		};
		const leave = () => {
			pointer.active = false;
		};
		box.addEventListener('pointermove', move);
		box.addEventListener('pointerleave', leave);

		return () => {
			stop();
			resizeObserver.disconnect();
			intersection.disconnect();
			scheme.disconnect();
			document.removeEventListener('visibilitychange', sync);
			reduceMotion.removeEventListener('change', sync);
			box.removeEventListener('pointermove', move);
			box.removeEventListener('pointerleave', leave);
			recolor.current = () => {};
		};
	}, []);

	return (
		<Box ref={host} aria-hidden data-hero-particles sx={frame}>
			<Box component="canvas" ref={canvasRef} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
		</Box>
	);
}
