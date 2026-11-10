export type FrameCapture = {
	capture: (signal?: AbortSignal) => { canvas: HTMLCanvasElement; image: string } | Promise<{ canvas: HTMLCanvasElement; image: string }>;
	pause: () => void;
	resume: () => void;
};

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';

// Reuse this application's rules, including Emotion's CSSOM-inserted rules,
// instead of reading hundreds of computed properties for every chart bucket.
function stylesheetText() {
	return [...document.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n')).join('\n');
}

export async function captureView(root: HTMLElement, captureFrame: FrameCapture | null, signal?: AbortSignal): Promise<HTMLCanvasElement> {
	const width = window.innerWidth;
	const height = window.innerHeight;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const frame = await captureFrame?.capture(signal);
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
	const bodyStyle = getComputedStyle(document.body);
	wrapper.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;`;
	for (const property of [
		'font-family',
		'font-size',
		'font-weight',
		'line-height',
		'color',
		'letter-spacing',
		'background-color',
		'background-image',
		'-webkit-font-smoothing',
	]) {
		wrapper.style.setProperty(property, bodyStyle.getPropertyValue(property));
	}
	const style = document.createElement('style');
	style.textContent = `${stylesheetText()}\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
	wrapper.append(style, clone);
	const pixelWidth = Math.max(1, Math.round(width * dpr));
	const pixelHeight = Math.max(1, Math.round(height * dpr));
	const svg = document.createElementNS(SVG, 'svg');
	svg.setAttribute('width', String(pixelWidth));
	svg.setAttribute('height', String(pixelHeight));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
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
