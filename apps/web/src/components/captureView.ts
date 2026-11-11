export type FrameCapture = {
	capture: (signal?: AbortSignal) => { canvas: HTMLCanvasElement; image: string } | Promise<{ canvas: HTMLCanvasElement; image: string }>;
	pause: () => void;
	resume: () => void;
};

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';

// Reuse this application's rules instead of reading hundreds of computed properties
// for every chart bucket. Prefer each <style>'s source text: re-serializing parsed rules
// is lossy. Chromium prints longhands as empty when a shorthand holding var() is partly
// overridden later in the same rule (Emotion emits `margin: calc(0 * var(--mui-spacing));
// margin-top: …` for MUI's `m: 0, mt: 0.5`), so the copy loses margins and gaps and the
// whole layout shifts. The Emotion cache runs in non-speedy mode so its tags carry text.
function sheetText(sheet: CSSStyleSheet) {
	const owner = sheet.ownerNode;
	if (owner instanceof HTMLStyleElement && owner.textContent) return owner.textContent;
	try {
		return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
	} catch {
		return ''; // Cross-origin sheet without CORS.
	}
}

function stylesheetText() {
	return [...document.styleSheets].map(sheetText).join('\n');
}

const fontData = new Map<string, Promise<string>>();

function dataUrl(url: string) {
	let pending = fontData.get(url);
	if (!pending) {
		pending = fetch(url)
			.then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${response.status} ${url}`))))
			.then(
				(blob) =>
					new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => resolve(String(reader.result));
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(blob);
					}),
			);
		pending.catch(() => fontData.delete(url));
		fontData.set(url, pending);
	}
	return pending;
}

function fontFaceRules(rules: CSSRuleList, sheet: CSSStyleSheet, out: Array<{ rule: CSSFontFaceRule; base: string }>) {
	for (const rule of rules) {
		if (rule instanceof CSSFontFaceRule) out.push({ rule, base: sheet.href ?? document.baseURI });
		else if ('cssRules' in rule) fontFaceRules((rule as CSSGroupingRule).cssRules, sheet, out);
	}
	return out;
}

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * An SVG image never loads external resources, so web fonts would fall back to a system
 * face and every line of text would change width. Re-declare the faces the page has
 * actually loaded with their files inlined; later declarations win over the originals.
 */
async function inlineFontFaces() {
	const loaded = [...document.fonts].filter((face) => face.status === 'loaded');
	const rules: Array<{ rule: CSSFontFaceRule; base: string }> = [];
	for (const sheet of document.styleSheets) {
		try {
			fontFaceRules(sheet.cssRules, sheet, rules);
		} catch {
			// Cross-origin sheet without CORS.
		}
	}
	const faces = await Promise.all(
		rules.map(async ({ rule, base }) => {
			const family = unquote(rule.style.getPropertyValue('font-family'));
			const range = rule.style.getPropertyValue('unicode-range').trim() || 'U+0-10FFFF';
			const style = rule.style.getPropertyValue('font-style').trim() || 'normal';
			const used = loaded.some((face) => unquote(face.family) === family && face.unicodeRange.toUpperCase() === range.toUpperCase() && face.style === style);
			const match = used ? /url\((['"]?)([^'")]+)\1\)(\s*format\([^)]*\))?/.exec(rule.style.getPropertyValue('src')) : null;
			if (!match) return '';
			try {
				const src = await dataUrl(new URL(match[2], base).href);
				return rule.cssText.replace(/src:[^;]+;/, `src: url("${src}")${match[3] ?? ''};`);
			} catch {
				return '';
			}
		}),
	);
	return faces.filter(Boolean).join('\n');
}

/**
 * The value the stylesheets declare for `property` on `element` (last matching rule wins;
 * fine for <html>/<body>, which carry only a handful of plain rules). Computed values are
 * wrong to copy for properties that inherit as declared: a unitless `line-height: 1.55`
 * computes to px on <body> and would then pin every descendant to the body's line height.
 */
function declaredValue(element: Element, property: string) {
	let value = '';
	const visit = (rules: CSSRuleList) => {
		for (const rule of rules) {
			if (rule instanceof CSSStyleRule) {
				const declared = rule.style.getPropertyValue(property);
				if (declared && element.matches(rule.selectorText)) value = declared;
			} else if (rule instanceof CSSMediaRule) {
				if (window.matchMedia(rule.conditionText).matches) visit(rule.cssRules);
			} else if ('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) {
				visit((rule as CSSGroupingRule).cssRules);
			}
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules);
		} catch {
			// Cross-origin sheet without CORS.
		}
	}
	return (element as HTMLElement).style?.getPropertyValue(property) || value;
}

export async function captureView(root: HTMLElement, captureFrame: FrameCapture | null, signal?: AbortSignal): Promise<HTMLCanvasElement> {
	const width = window.innerWidth;
	const height = window.innerHeight;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const fontsReady = inlineFontFaces();
	const frame = await captureFrame?.capture(signal);
	const fontText = await fontsReady;
	if (signal?.aborted) throw new DOMException('Capture aborted', 'AbortError');
	const clone = root.cloneNode(true) as HTMLElement;
	const originals = [root, ...root.querySelectorAll<HTMLElement>('*')];
	const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
	for (let index = 0; index < originals.length; index++) {
		const original = originals[index];
		const copy = copies[index];
		if (original.matches('[data-status-view][hidden]')) {
			copy.remove();
			index += original.querySelectorAll('*').length;
			continue;
		}
		if (original === frame?.canvas) {
			const image = document.createElement('img');
			image.src = frame.image;
			image.style.cssText = original.style.cssText;
			image.style.width = `${original.clientWidth}px`;
			image.style.height = `${original.clientHeight}px`;
			copy.replaceWith(image);
		} else if (original instanceof HTMLCanvasElement) {
			// A cloned canvas is blank; keep what a 2D canvas (e.g. the hero particles) currently shows.
			const image = document.createElement('img');
			try {
				image.src = original.toDataURL();
			} catch {
				// Tainted canvas: leave the area empty, as before.
			}
			image.className = original.className;
			image.style.cssText = original.style.cssText;
			image.style.width = `${original.clientWidth}px`;
			image.style.height = `${original.clientHeight}px`;
			copy.replaceWith(image);
		} else if (original.scrollTop || original.scrollLeft) {
			// foreignObject does not retain scroll offsets; translate the children
			// inside the same clipped scrollport without changing its layout width.
			const inner = document.createElement('div');
			inner.style.transform = `translate(${-original.scrollLeft}px, ${-original.scrollTop}px)`;
			inner.append(...copy.childNodes);
			copy.append(inner);
		} else if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
			copy.setAttribute('value', original.value);
		}
	}
	clone.querySelectorAll('style, script, link[rel="stylesheet"]').forEach((element) => element.remove());
	const wrapper = document.createElementNS(XHTML, 'div');
	// The clone renders inside <svg><foreignObject>, where <html> and <body> do not exist:
	// :root is the <svg>, nothing inherits from <html>, and attribute selectors on <html>
	// never match. Recreate on the wrapper everything the page inherits from those two
	// elements, or layout drifts (e.g. MUI's inherited border-box sizing makes every
	// padded max-width container 2 × padding wider, pushing content toward the edges).
	const html = document.documentElement;
	const htmlStyle = getComputedStyle(html);
	const bodyStyle = getComputedStyle(document.body);
	for (const attribute of [...html.attributes]) {
		if (attribute.name === 'lang' || attribute.name === 'dir' || attribute.name === 'class' || attribute.name.startsWith('data-'))
			wrapper.setAttribute(attribute.name, attribute.value);
	}
	wrapper.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;margin:0;`;
	// Custom properties resolved on <html> (theme tokens for the current colour scheme).
	for (let index = 0; index < htmlStyle.length; index++) {
		const property = htmlStyle[index];
		if (property.startsWith('--')) wrapper.style.setProperty(property, htmlStyle.getPropertyValue(property));
	}
	wrapper.style.setProperty('box-sizing', htmlStyle.getPropertyValue('box-sizing'));
	wrapper.style.setProperty('color-scheme', htmlStyle.getPropertyValue('color-scheme'));
	for (const property of [
		'font-family',
		'font-size',
		'font-weight',
		'font-style',
		'font-feature-settings',
		'font-variation-settings',
		'font-kerning',
		'font-optical-sizing',
		'line-height',
		'color',
		'letter-spacing',
		'word-spacing',
		'text-rendering',
		'-webkit-text-size-adjust',
		'background-color',
		'background-image',
		'-webkit-font-smoothing',
	]) {
		wrapper.style.setProperty(property, bodyStyle.getPropertyValue(property));
	}
	// Inherited as declared: keep unitless / em values relative to each descendant's font.
	for (const property of ['line-height', 'letter-spacing', 'word-spacing']) {
		const declared = declaredValue(document.body, property) || declaredValue(html, property);
		if (declared && !declared.includes('var(')) wrapper.style.setProperty(property, declared);
	}
	const style = document.createElement('style');
	style.textContent = `${stylesheetText()}\n${fontText}\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
	wrapper.append(style, clone);
	const pixelWidth = Math.max(1, Math.round(width * dpr));
	const pixelHeight = Math.max(1, Math.round(height * dpr));
	const svg = document.createElementNS(SVG, 'svg');
	// Size the image in CSS pixels: media queries inside an SVG image evaluate against the
	// image's own width, so a device-pixel width would match the wrong breakpoints at dpr > 1.
	// drawImage below rasterizes the vector image at the canvas resolution, so it stays sharp.
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	// In the image the <svg> is the root element, so `rem` resolves against it.
	svg.setAttribute('style', `font-size:${htmlStyle.fontSize}`);
	const foreignObject = document.createElementNS(SVG, 'foreignObject');
	foreignObject.setAttribute('width', '100%');
	foreignObject.setAttribute('height', '100%');
	foreignObject.append(wrapper);
	svg.append(foreignObject);
	const source = new XMLSerializer().serializeToString(svg);
	// A data URL avoids Chromium's tainted canvas restriction on blob SVGs
	// with foreignObject. Decode once, then draw straight into the tile faces.
	const image = new Image();
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
	await image.decode();
	const canvas = document.createElement('canvas');
	canvas.width = pixelWidth;
	canvas.height = pixelHeight;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Cannot capture the view without a 2D canvas context');
	context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
	return canvas;
}
