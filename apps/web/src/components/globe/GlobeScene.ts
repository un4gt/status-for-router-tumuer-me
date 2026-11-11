import * as THREE from 'three';
import { TIER_COLORS, type Tier } from '../../latency';
import earthDay from './assets/earth-day.webp';
import earthNight from './assets/earth-night.webp';
import earthWater from './assets/earth-water.webp';

export type LayerFilter = 'all' | 'gateway' | 'model';
export type AxisView = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
export type SceneRegion = { id: string; lat: number; lng: number; tier: Tier };
export type SceneLink = {
	id: string;
	regionId: string;
	kind: 'gateway' | 'model';
	/** Position within the region's fan of arcs (0 = lowest). */
	slot: number;
	latency: number | null;
	tier: Tier;
	disconnected?: boolean;
};
export type ViewState = { name: string; ortho: boolean };

export type Viewport = { width: number; height: number; pixelRatio: number };
export type LabelPoint = { id: string; lat: number; lng: number };
export type LabelProjection = { id: string; x: number; y: number; opacity: number };
export type ScenePointer = {
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
	clientX: number;
	clientY: number;
	pointerId: number;
	pointerType: string;
	button: number;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
};

const DEG = Math.PI / 180;
const MAX_REGIONS = 8;
const MIN_DIST = 1.45;
const MAX_DIST = 9;
const FOV = 40;

export const HOME_VIEW = { lat: 30, lng: 176, dist: 3.6 };

export function latLngToVec3(lat: number, lng: number, r = 1, out = new THREE.Vector3()) {
	const phi = (90 - lat) * DEG;
	const theta = (lng + 180) * DEG;
	return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function hexToVec3(hex: string) {
	const n = parseInt(hex.slice(1), 16);
	return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Bright segments travel slower as latency grows. */
function flowSpeed(latency: number | null) {
	if (latency === null) return 0.07;
	return 0.1 + 0.48 * Math.exp(-latency / 1400);
}

const earthVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
	vUv = uv;
	vPos = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const earthFragment = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uWater;
uniform float uHasTex;
uniform float uTime;
uniform vec3 uViewDir;
uniform vec3 uRegionPos[${MAX_REGIONS}];
uniform vec3 uRegionColor[${MAX_REGIONS}];
uniform float uRegionStrength[${MAX_REGIONS}];
uniform float uRegionPulse[${MAX_REGIONS}];
varying vec2 vUv;
varying vec3 vPos;

void main() {
	vec3 n = normalize(vPos);
	vec3 day = texture2D(uDay, vUv).rgb * uHasTex;
	vec3 night = texture2D(uNight, vUv).rgb * uHasTex;
	float land = 1.0 - texture2D(uWater, vUv).r * uHasTex;
	float lum = dot(day, vec3(0.299, 0.587, 0.114));

	vec3 col = mix(vec3(0.018, 0.04, 0.078), vec3(0.05, 0.092, 0.14), land);
	col += day * vec3(0.09, 0.16, 0.23);
	col += vec3(0.42, 0.56, 0.68) * smoothstep(0.6, 0.92, lum) * 0.55;
	col += pow(night, vec3(1.35)) * vec3(1.0, 0.78, 0.5) * 1.05 * land;

	for (int i = 0; i < ${MAX_REGIONS}; i++) {
		float s = uRegionStrength[i];
		if (s <= 0.001) continue;
		float d = acos(clamp(dot(n, uRegionPos[i]), -1.0, 1.0));
		float radius = 0.12;
		float core = 1.0 - smoothstep(0.0, radius, d);
		float area = core * core * (0.28 + 0.62 * land);
		float edge = (1.0 - smoothstep(0.0, 0.006, abs(d - radius * 0.82))) * 0.35;
		float wave = fract(uTime * 0.32 + float(i) * 0.19);
		float ring = (1.0 - smoothstep(0.0, 0.01, abs(d - radius * 1.25 * wave))) * (1.0 - wave);
		col += uRegionColor[i] * s * (area + edge * core + ring * 0.55 * uRegionPulse[i]);
	}

	float fres = pow(1.0 - max(dot(uViewDir, n), 0.0), 2.6);
	col += vec3(0.16, 0.38, 0.86) * fres * 0.6;
	gl_FragColor = vec4(col, 1.0);
}`;

const atmosphereVertex = /* glsl */ `
varying vec3 vN;
void main() {
	vN = normalize(normalMatrix * normal);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const atmosphereFragment = /* glsl */ `
varying vec3 vN;
void main() {
	float i = pow(clamp(0.66 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 4.0);
	gl_FragColor = vec4(vec3(0.2, 0.42, 0.95), 1.0) * i * 0.55;
}`;

const arcVertex = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const arcFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uPhase;
uniform float uOpacity;
uniform float uLen;
uniform float uDisconnected;
uniform float uFlowing;
varying vec2 vUv;
void main() {
	float t = vUv.x;
	float d = uPhase - t;
	d -= floor(d);
	float trail = 1.0 - smoothstep(0.0, uLen, d);
	trail *= trail;
	trail *= uFlowing;
	float ends = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.95, 1.0, t));
	float a = (0.17 + 0.95 * trail) * ends * uOpacity;
	if (uDisconnected > 0.5) a *= step(0.45, fract(t * 24.0));
	vec3 c = uColor * (0.7 + 0.55 * trail) + vec3(0.3) * trail * trail;
	gl_FragColor = vec4(c, a);
}`;

type Arc = {
	link: SceneLink;
	mesh: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
	phase: number;
	speed: number;
	opacity: number;
	color: THREE.Vector3;
	targetColor: THREE.Vector3;
	geometryKey: string;
};

type CamState = { lat: number; lng: number; dist: number };

export class GlobeScene {
	readonly ready: Promise<void>;
	onViewChange?: (v: ViewState) => void;
	onLinkSelect?: (id: string) => void;
	onLinkHover?: (id: string | null) => void;

	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private persp = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);
	private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
	private useOrtho = false;
	private canvas: HTMLCanvasElement;
	onLabels?: (labels: LabelProjection[]) => void;
	private textureImages: ImageBitmap[] = [];
	private textureAbort = new AbortController();
	private textures = new Set<THREE.Texture>();
	private width = 1;
	private height = 1;

	private cur: CamState = { ...HOME_VIEW };
	private tgt: CamState = { ...HOME_VIEW };
	private pan = new THREE.Vector3();
	private panTgt = new THREE.Vector3();
	private velocity = { lat: 0, lng: 0 };
	private drag: { mode: 'orbit' | 'pan' | 'zoom'; x: number; y: number; t: number; id: number } | null = null;
	private viewName = '全景视图';

	private earthMat: THREE.ShaderMaterial;
	private regionColors: THREE.Vector3[] = [];
	private regionTargets: THREE.Vector3[] = [];
	private regionStrengthTgt: number[] = [];
	private regions: SceneRegion[] = [];
	private target = { lat: HOME_VIEW.lat, lng: -122 };
	private arcs = new Map<string, Arc>();
	private arcGroup = new THREE.Group();
	private labels: Array<{ id: string; pos: THREE.Vector3 }> = [];
	private labelsVisible = true;

	private layer: LayerFilter = 'all';
	private selected: string | null = null;
	private isolate = false;
	private paused = false;
	private running = false;
	private raf = 0;
	private last = 0;
	private time = 0;
	private disposed = false;
	private tmp = new THREE.Vector3();
	private tmp2 = new THREE.Vector3();

	constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(viewport.pixelRatio);
		this.renderer.setClearColor(0x05060f, 1);
		this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

		const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
		blank.needsUpdate = true;
		this.textures.add(blank);
		for (let i = 0; i < MAX_REGIONS; i++) {
			this.regionColors.push(new THREE.Vector3());
			this.regionTargets.push(new THREE.Vector3());
			this.regionStrengthTgt.push(0);
		}
		this.earthMat = new THREE.ShaderMaterial({
			vertexShader: earthVertex,
			fragmentShader: earthFragment,
			uniforms: {
				uDay: { value: blank },
				uNight: { value: blank },
				uWater: { value: blank },
				uHasTex: { value: 0 },
				uTime: { value: 0 },
				uViewDir: { value: new THREE.Vector3(0, 0, 1) },
				uRegionPos: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector3(0, 1, 0)) },
				uRegionColor: { value: this.regionColors },
				uRegionStrength: { value: new Array(MAX_REGIONS).fill(0) },
				uRegionPulse: { value: new Array(MAX_REGIONS).fill(0) },
			},
		});
		this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.earthMat));

		const atmosphere = new THREE.Mesh(
			new THREE.SphereGeometry(1.12, 96, 64),
			new THREE.ShaderMaterial({
				vertexShader: atmosphereVertex,
				fragmentShader: atmosphereFragment,
				side: THREE.BackSide,
				blending: THREE.AdditiveBlending,
				transparent: true,
				depthWrite: false,
			}),
		);
		this.scene.add(atmosphere);
		this.scene.add(this.createStars());
		this.scene.add(this.arcGroup);

		this.resize(viewport);
		this.bindPointer();

		this.ready = this.loadTextures().then(() => {
			if (this.disposed) return;
			this.renderer.compile(this.scene, this.persp);
			this.renderFrame(0);
		});
	}

	// ---------------------------------------------------------------- lifecycle

	setRunning(on: boolean) {
		if (on === this.running || this.disposed) return;
		this.running = on;
		if (on) {
			this.last = performance.now();
			this.raf = requestAnimationFrame(this.loop);
		} else {
			cancelAnimationFrame(this.raf);
		}
	}

	/** Camera eases in from further out while the transition reveals the globe. */
	intro() {
		this.cur.dist = this.tgt.dist * 1.32;
		this.cur.lat = this.tgt.lat - 9;
		this.cur.lng = this.tgt.lng + 14;
		this.velocity.lat = this.velocity.lng = 0;
	}

	/** Gentle pull-back while the 2D page covers the globe. */
	outro() {
		this.exitRestore = this.tgt.dist;
		this.tgt.dist = Math.min(MAX_DIST, this.tgt.dist * 1.18);
	}
	private exitRestore: number | null = null;

	afterExit() {
		if (this.exitRestore !== null) {
			this.tgt.dist = this.cur.dist = this.exitRestore;
			this.exitRestore = null;
		}
		this.setRunning(false);
	}

	dispose() {
		this.setRunning(false);
		this.disposed = true;
		this.textureAbort.abort();
		for (const texture of this.textures) texture.dispose();
		for (const image of this.textureImages) image.close();
		this.textureImages = [];
		this.scene.traverse((o) => {
			const m = o as THREE.Mesh;
			m.geometry?.dispose();
			const mat = m.material as THREE.Material | undefined;
			mat?.dispose?.();
		});
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}

	// ---------------------------------------------------------------- data

	setData(regions: SceneRegion[], target: { lat: number; lng: number }, links: SceneLink[]) {
		this.regions = regions;
		this.target = target;
		const posU = this.earthMat.uniforms.uRegionPos.value as THREE.Vector3[];
		this.regions.slice(0, MAX_REGIONS).forEach((r, i) => {
			latLngToVec3(r.lat, r.lng, 1, posU[i]);
			this.regionTargets[i].copy(hexToVec3(TIER_COLORS[r.tier]));
			if (this.regionStrengthTgt[i] === 0) this.regionColors[i].copy(this.regionTargets[i]);
		});
		for (let i = this.regions.length; i < MAX_REGIONS; i++) this.regionStrengthTgt[i] = 0;
		this.updateRegionStrengthTargets();

		const seen = new Set<string>();
		const targetVec = latLngToVec3(target.lat, target.lng);
		for (const link of links) {
			const region = this.regions.find((r) => r.id === link.regionId);
			if (!region) continue;
			const start = latLngToVec3(region.lat, region.lng);
			const angle = start.angleTo(targetVec);
			if (angle < 0.015) continue; // Preserve the local co-location threshold.
			seen.add(link.id);
			const geometryKey = `${region.lat},${region.lng},${target.lat},${target.lng},${link.slot},${link.kind}`;
			let arc = this.arcs.get(link.id);
			if (!arc || arc.geometryKey !== geometryKey) {
				if (arc) this.removeArc(arc);
				arc = this.createArc(link, start, targetVec, angle, geometryKey);
				this.arcs.set(link.id, arc);
			}
			arc.link = link;
			arc.speed = link.disconnected || link.latency === null ? 0 : flowSpeed(link.latency);
			arc.targetColor.copy(hexToVec3(TIER_COLORS[link.tier]));
		}
		for (const [id, arc] of this.arcs) {
			if (!seen.has(id)) {
				this.removeArc(arc);
				this.arcs.delete(id);
			}
		}
	}

	setLabelPoints(labels: LabelPoint[]) {
		this.labels = labels.map((l) => ({ id: l.id, pos: latLngToVec3(l.lat, l.lng, 1.012) }));
	}

	setLayer(layer: LayerFilter) {
		this.layer = layer;
	}

	setSelected(id: string | null) {
		this.selected = id;
		if (!id) this.isolate = false;
		this.updateRegionStrengthTargets();
	}

	toggleIsolate() {
		if (!this.selected) return false;
		this.isolate = !this.isolate;
		this.updateRegionStrengthTargets();
		return this.isolate;
	}

	setPaused(p: boolean) {
		this.paused = p;
	}

	setLabelsVisible(v: boolean) {
		this.labelsVisible = v;
	}

	// ---------------------------------------------------------------- camera commands

	viewAxis(axis: AxisView) {
		const map: Record<AxisView, [number, number, string]> = {
			front: [0, 0, '前视图'],
			back: [0, 180, '后视图'],
			right: [0, 90, '右视图'],
			left: [0, -90, '左视图'],
			top: [89.5, this.tgt.lng, '顶视图'],
			bottom: [-89.5, this.tgt.lng, '底视图'],
		};
		const [lat, lng, name] = map[axis];
		this.goto(lat, lng, undefined, name);
	}

	orbit(dLat: number, dLng: number) {
		this.goto(clamp(this.tgt.lat + dLat, -89.5, 89.5), this.tgt.lng + dLng, undefined, this.userName());
	}

	opposite() {
		this.goto(-this.tgt.lat, this.tgt.lng + 180, undefined, this.viewName.startsWith('用户') ? this.userName() : '反向视图');
	}

	zoom(factor: number) {
		this.tgt.dist = clamp(this.tgt.dist * factor, MIN_DIST, MAX_DIST);
	}

	toggleOrtho() {
		this.useOrtho = !this.useOrtho;
		this.viewName = this.viewName.startsWith('用户') ? this.userName() : this.viewName;
		this.emitView();
		return this.useOrtho;
	}

	home() {
		this.panTgt.set(0, 0, 0);
		this.goto(HOME_VIEW.lat, HOME_VIEW.lng, HOME_VIEW.dist, '全景视图');
	}

	focusRegion(id: string) {
		const r = this.regions.find((x) => x.id === id);
		if (!r) return false;
		this.panTgt.set(0, 0, 0);
		this.goto(clamp(r.lat - 4, -89.5, 89.5), r.lng, 2.6, '聚焦视图');
		return true;
	}

	getView(): ViewState {
		return { name: this.viewName, ortho: this.useOrtho };
	}

	async captureBlob(): Promise<Blob> {
		this.renderFrame(0);
		return new Promise((resolve, reject) => {
			this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Empty WebGL frame'))), 'image/png');
		});
	}

	private pickLink(event: ScenePointer): string | null {
		const ray = new THREE.Raycaster();
		ray.setFromCamera(
			new THREE.Vector2((event.clientX / this.width) * 2 - 1, 1 - (event.clientY / this.height) * 2),
			this.useOrtho ? this.ortho : this.persp,
		);
		const visible = [...this.arcs.values()].filter((a) => a.opacity > 0.05);
		const hit = ray.intersectObjects(
			visible.map((a) => a.mesh),
			false,
		)[0];
		if (!hit) return null;
		const earthHit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
		if (earthHit && ray.ray.origin.distanceTo(earthHit) < hit.distance - 0.01) return null;
		return visible.find((a) => a.mesh === hit.object)?.link.id ?? null;
	}

	private goto(lat: number, lng: number, dist: number | undefined, name: string) {
		this.velocity.lat = this.velocity.lng = 0;
		this.tgt.lat = lat;
		// keep longitude continuous so the camera takes the short way round
		this.tgt.lng = this.cur.lng + wrapDeg(lng - this.cur.lng);
		if (dist !== undefined) this.tgt.dist = dist;
		this.viewName = name;
		this.emitView();
	}

	private userName() {
		return '用户视图';
	}

	private emitView() {
		this.onViewChange?.(this.getView());
	}

	// ---------------------------------------------------------------- internals

	private async loadTextures() {
		const timer = setTimeout(() => this.textureAbort.abort(), 8000);
		try {
			const textures = await Promise.all(
				[earthDay, earthNight, earthWater].map(async (url) => {
					const response = await fetch(url, { signal: this.textureAbort.signal });
					if (!response.ok) throw new Error('Texture unavailable');
					const blob = await response.blob();
					let texture: THREE.Texture;
					if (typeof createImageBitmap === 'function') {
						// Texture.flipY is ignored for ImageBitmap: flip while decoding instead.
						const image = await createImageBitmap(blob, {
							imageOrientation: 'flipY',
							premultiplyAlpha: 'none',
							colorSpaceConversion: 'none',
						});
						if (this.disposed || this.textureAbort.signal.aborted) {
							image.close();
							throw new Error('Texture load aborted');
						}
						this.textureImages.push(image);
						texture = new THREE.Texture(image);
					} else {
						// Older main-thread browsers can decode textures through an HTML image.
						const url = URL.createObjectURL(blob);
						const image = new Image();
						try {
							image.src = url;
							await image.decode();
						} finally {
							URL.revokeObjectURL(url);
						}
						if (this.disposed || this.textureAbort.signal.aborted) throw new Error('Texture load aborted');
						texture = new THREE.Texture(image);
					}

					texture.needsUpdate = true;
					texture.colorSpace = THREE.NoColorSpace;
					texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
					this.textures.add(texture);
					return texture;
				}),
			);
			if (this.disposed) return;
			const u = this.earthMat.uniforms;
			[u.uDay.value, u.uNight.value, u.uWater.value] = textures;
			u.uHasTex.value = 1;
			for (const texture of textures) this.renderer.initTexture(texture);
		} catch {
			// A missing decoder, failed download or timeout still leaves a usable flat globe.
			this.textureAbort.abort();
		} finally {
			clearTimeout(timer);
		}
	}

	private createStars() {
		const count = 900;
		const pos = new Float32Array(count * 3);
		const v = new THREE.Vector3();
		for (let i = 0; i < count; i++) {
			v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
				.normalize()
				.multiplyScalar(40 + Math.random() * 20);
			pos.set([v.x, v.y, v.z], i * 3);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return new THREE.Points(
			g,
			new THREE.PointsMaterial({ color: 0x8aa0c8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }),
		);
	}

	private createArc(link: SceneLink, a: THREE.Vector3, b: THREE.Vector3, angle: number, geometryKey: string): Arc {
		const segments = 120;
		const base = 0.05 + angle * 0.13;
		const alt = base * (link.kind === 'gateway' ? 0.8 + link.slot * 0.055 : 1 + link.slot * 0.045);
		const pts: THREE.Vector3[] = [];
		const sinA = Math.sin(angle);
		for (let i = 0; i <= segments; i++) {
			const t = i / segments;
			const wa = Math.sin((1 - t) * angle) / sinA;
			const wb = Math.sin(t * angle) / sinA;
			const p = new THREE.Vector3().addScaledVector(a, wa).addScaledVector(b, wb);
			p.multiplyScalar(1.003 + alt * Math.sin(Math.PI * t));
			pts.push(p);
		}
		const curve = new THREE.CatmullRomCurve3(pts);
		const radius = link.kind === 'gateway' ? 0.0034 : 0.0022;
		const geometry = new THREE.TubeGeometry(curve, segments, radius, 4, false);
		const color = hexToVec3(TIER_COLORS[link.tier]);
		const material = new THREE.ShaderMaterial({
			vertexShader: arcVertex,
			fragmentShader: arcFragment,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			uniforms: {
				uColor: { value: color.clone() },
				uPhase: { value: 0 },
				uOpacity: { value: 0 },
				uLen: { value: link.kind === 'gateway' ? 0.26 : 0.18 },
				uDisconnected: { value: 0 },
				uFlowing: { value: 1 },
			},
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.renderOrder = 2;
		this.arcGroup.add(mesh);
		return {
			link,
			mesh,
			phase: Math.random(),
			speed: flowSpeed(link.latency),
			opacity: 0,
			color: color.clone(),
			targetColor: color.clone(),
			geometryKey,
		};
	}

	private removeArc(arc: Arc) {
		this.arcGroup.remove(arc.mesh);
		arc.mesh.geometry.dispose();
		arc.mesh.material.dispose();
	}

	private updateRegionStrengthTargets() {
		this.regions.slice(0, MAX_REGIONS).forEach((r, i) => {
			const base = r.tier === 'fast' ? 0.5 : 1;
			const dim = this.selected && this.selected !== r.id ? (this.isolate ? 0.15 : 0.55) : 1;
			const boost = this.selected === r.id ? 1.25 : 1;
			this.regionStrengthTgt[i] = base * dim * boost;
			(this.earthMat.uniforms.uRegionPulse.value as number[])[i] = r.tier === 'fast' ? 0 : 1;
		});
	}

	private arcTargetOpacity(arc: Arc) {
		const { link } = arc;
		if (this.layer !== 'all' && this.layer !== link.kind) return 0;
		if (this.selected && link.regionId !== this.selected) return this.isolate ? 0 : 0.22;
		return link.tier === 'timeout' ? 0.6 : 1;
	}

	resize({ width, height, pixelRatio }: Viewport) {
		const w = Math.max(1, width),
			h = Math.max(1, height);
		if (w === this.width && h === this.height && this.renderer.getPixelRatio() === pixelRatio) return;
		this.width = w;
		this.height = h;
		this.renderer.setPixelRatio(pixelRatio);
		this.renderer.setSize(w, h, false);
		this.persp.aspect = w / h;
		this.persp.updateProjectionMatrix();
	}

	private loop = (now: number) => {
		if (!this.running) return;
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;
		this.renderFrame(dt);
		this.raf = requestAnimationFrame(this.loop);
	};

	private renderFrame(dt: number) {
		// inertia after drag release
		if (!this.drag && (Math.abs(this.velocity.lat) > 0.01 || Math.abs(this.velocity.lng) > 0.01)) {
			this.tgt.lat = clamp(this.tgt.lat + this.velocity.lat * dt, -89.5, 89.5);
			this.tgt.lng += this.velocity.lng * dt;
			const decay = Math.exp(-dt * 4.2);
			this.velocity.lat *= decay;
			this.velocity.lng *= decay;
		}

		const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 6.5);
		this.cur.lat += (this.tgt.lat - this.cur.lat) * k;
		this.cur.lng += (this.tgt.lng - this.cur.lng) * k;
		this.cur.dist += (this.tgt.dist - this.cur.dist) * k;
		this.pan.lerp(this.panTgt, k);

		const cam = this.useOrtho ? this.ortho : this.persp;
		latLngToVec3(this.cur.lat, this.cur.lng, this.cur.dist, cam.position).add(this.pan);
		cam.up.set(0, 1, 0);
		cam.lookAt(this.pan);
		if (this.useOrtho) {
			const halfH = this.cur.dist * Math.tan((FOV / 2) * DEG);
			const aspect = this.width / this.height;
			this.ortho.left = -halfH * aspect;
			this.ortho.right = halfH * aspect;
			this.ortho.top = halfH;
			this.ortho.bottom = -halfH;
			this.ortho.updateProjectionMatrix();
		}
		cam.updateMatrixWorld();

		if (!this.paused) this.time += dt;
		const u = this.earthMat.uniforms;
		u.uTime.value = this.time;
		(u.uViewDir.value as THREE.Vector3).copy(cam.position).sub(this.pan).normalize();
		const strength = u.uRegionStrength.value as number[];
		for (let i = 0; i < MAX_REGIONS; i++) {
			strength[i] += (this.regionStrengthTgt[i] - strength[i]) * (dt === 0 ? 1 : 1 - Math.exp(-dt * 5));
			this.regionColors[i].lerp(this.regionTargets[i], dt === 0 ? 1 : 1 - Math.exp(-dt * 4));
		}

		const fade = dt === 0 ? 1 : 1 - Math.exp(-dt * 7);
		for (const arc of this.arcs.values()) {
			if (!this.paused) arc.phase = (arc.phase + dt * arc.speed) % 1;
			arc.opacity += (this.arcTargetOpacity(arc) - arc.opacity) * fade;
			arc.color.lerp(arc.targetColor, dt === 0 ? 1 : 1 - Math.exp(-dt * 4));
			const mu = arc.mesh.material.uniforms;
			mu.uPhase.value = arc.phase;
			mu.uOpacity.value = arc.opacity;
			mu.uDisconnected.value = arc.link.disconnected ? 1 : 0;
			mu.uFlowing.value = arc.speed > 0 ? 1 : 0;
			(mu.uColor.value as THREE.Vector3).copy(arc.color);
			arc.mesh.visible = arc.opacity > 0.004;
		}

		this.renderer.render(this.scene, cam);
		this.updateLabels(cam);
	}

	private updateLabels(cam: THREE.Camera) {
		const viewDir = this.tmp2.copy(cam.position).sub(this.pan).normalize();
		const projections = this.labels.map((l) => {
			const p = this.tmp.copy(l.pos).project(cam);
			const x = ((p.x + 1) / 2) * this.width,
				y = ((1 - p.y) / 2) * this.height;
			const facing = this.useOrtho
				? l.pos.dot(viewDir) / l.pos.length()
				: this.tmp.copy(cam.position).sub(l.pos).normalize().dot(l.pos) / l.pos.length();
			return { id: l.id, x, y, opacity: this.labelsVisible ? clamp((facing - 0.04) / 0.18, 0, 1) : 0 };
		});
		this.onLabels?.(projections);
	}

	// ---------------------------------------------------------------- pointer

	private pointer!: { down: (e: ScenePointer) => void; move: (e: ScenePointer) => void; up: (e: ScenePointer) => void };
	handlePointer(event: ScenePointer) {
		if (event.type === 'pointerdown') this.pointer.down(event);
		else if (event.type === 'pointermove') this.pointer.move(event);
		else this.pointer.up(event);
	}

	private bindPointer() {
		const touches = new Map<number, { x: number; y: number }>();
		const span = () => {
			const [a, b] = [...touches.values()];
			return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
		};
		let start: { x: number; y: number } | null = null;
		const down = (e: ScenePointer) => {
			if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
			if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
			start = { x: e.clientX, y: e.clientY };
			let mode: 'orbit' | 'pan' | 'zoom' = 'orbit';
			if (e.button === 2 || e.shiftKey) mode = 'pan';
			else if (e.ctrlKey || e.metaKey) mode = 'zoom';
			this.drag = { mode, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
			this.velocity.lat = this.velocity.lng = 0;
		};
		const move = (e: ScenePointer) => {
			if (touches.has(e.pointerId)) {
				const before = span();
				touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
				if (touches.size > 1) {
					const after = span();
					if (before > 0 && after > 0) this.zoom(before / after);
					start = null;
					this.velocity.lat = this.velocity.lng = 0;
					if (this.drag) {
						this.drag.x = e.clientX;
						this.drag.y = e.clientY;
					}
					return;
				}
			}
			const d = this.drag;
			if (!d) this.onLinkHover?.(this.pickLink(e));
			if (!d || d.id !== e.pointerId) return;
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;
			const now = performance.now();
			const dtS = Math.max(0.001, (now - d.t) / 1000);
			d.x = e.clientX;
			d.y = e.clientY;
			d.t = now;
			if (d.mode === 'orbit') {
				const degPerPx = (0.24 * this.tgt.dist) / HOME_VIEW.dist;
				const dLat = dy * degPerPx;
				const dLng = -dx * degPerPx;
				this.tgt.lat = clamp(this.tgt.lat + dLat, -89.5, 89.5);
				this.tgt.lng += dLng;
				this.velocity.lat = this.velocity.lat * 0.6 + (dLat / dtS) * 0.4;
				this.velocity.lng = this.velocity.lng * 0.6 + (dLng / dtS) * 0.4;
				if (!this.viewName.startsWith('用户')) {
					this.viewName = this.userName();
					this.emitView();
				}
			} else if (d.mode === 'pan') {
				const cam = this.useOrtho ? this.ortho : this.persp;
				const unitsPerPx = (2 * this.cur.dist * Math.tan((FOV / 2) * DEG)) / this.height;
				const right = this.tmp.setFromMatrixColumn(cam.matrixWorld, 0);
				this.panTgt.addScaledVector(right, -dx * unitsPerPx);
				const up = this.tmp.setFromMatrixColumn(cam.matrixWorld, 1);
				this.panTgt.addScaledVector(up, dy * unitsPerPx);
				this.panTgt.clampLength(0, 1.4);
			} else {
				this.zoom(Math.exp(dy * 0.006));
			}
		};
		const up = (e: ScenePointer) => {
			touches.delete(e.pointerId);
			if (!this.drag || this.drag.id !== e.pointerId) return;
			if (e.type === 'pointerup' && e.button === 0 && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
				const id = this.pickLink(e);
				if (id) this.onLinkSelect?.(id);
			}
			start = null;
			if (e.type === 'pointercancel' || performance.now() - this.drag.t > 80) this.velocity.lat = this.velocity.lng = 0;
			this.drag = null;
		};
		this.pointer = { down, move, up };
	}
}
