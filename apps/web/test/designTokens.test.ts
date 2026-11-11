import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dark, light, STATUS_META } from '../src/design/tokens';

const SRC = join(import.meta.dir, '../src');
// Literal colours are allowed only where tokens are defined, and in the always-dark
// WebGL scene, which cannot read CSS variables.
const ALLOWED_COLOR_FILES = new Set(['design/tokens.ts', 'theme.ts', 'components/globe/globe.css', 'components/globe/GlobeScene.ts', 'components/view-transition.css', 'pages/PublicStatusPage.tsx']);

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'assets' ? [] : files(path);
		return /\.(tsx?|css)$/.test(name) ? [path] : [];
	});
}

test('components take colour from tokens, never from hex literals', () => {
	const offenders: string[] = [];
	for (const path of files(SRC)) {
		const rel = relative(SRC, path);
		if (ALLOWED_COLOR_FILES.has(rel)) continue;
		const text = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
		for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${rel}: ${match[0]}`);
	}
	expect(offenders).toEqual([]);
});

test('font sizes stay on the type scale', () => {
	const offenders: string[] = [];
	for (const path of files(SRC)) {
		const rel = relative(SRC, path);
		const text = readFileSync(path, 'utf8');
		for (const match of text.matchAll(/fontSize:\s*['"]?([0-9.]+)(rem|px)?['"]?/g)) {
			const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
			if (px < 11 || ![11, 12, 13, 14, 15, 16, 18, 20, 28, 40].includes(px)) offenders.push(`${rel}: ${match[0]}`);
		}
		for (const match of text.matchAll(/font-size:\s*([0-9.]+)px/g)) if (Number(match[1]) < 12) offenders.push(`${rel}: ${match[0]}`);
	}
	expect(offenders).toEqual([]);
});

test('icons are SVG, not Unicode glyphs that some systems cannot draw', () => {
	const offenders: string[] = [];
	for (const path of files(SRC)) {
		const rel = relative(SRC, path);
		if (!rel.endsWith('.tsx')) continue;
		const text = readFileSync(path, 'utf8');
		for (const match of text.matchAll(/>\s*([⌖Ⅱ▷↻×←→✓✕△◇])\s*</g)) offenders.push(`${rel}: ${match[1]}`);
	}
	expect(offenders).toEqual([]);
});

test('one icon set: Lucide through design/icons, never Material icons', () => {
	const offenders: string[] = [];
	for (const path of files(SRC)) {
		const rel = relative(SRC, path);
		const text = readFileSync(path, 'utf8');
		if (text.includes('@mui/icons-material')) offenders.push(`${rel}: @mui/icons-material`);
		if (rel !== 'design/icons.tsx' && /from 'lucide-react'/.test(text)) offenders.push(`${rel}: import Lucide via design/icons`);
	}
	expect(offenders).toEqual([]);
});

test('both themes define every token and every status has a label', () => {
	expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
	for (const meta of Object.values(STATUS_META)) {
		expect(meta.label.length).toBeGreaterThan(0);
		expect(light[meta.fill]).toMatch(/^#/);
		expect(dark[meta.text]).toMatch(/^#/);
	}
});
