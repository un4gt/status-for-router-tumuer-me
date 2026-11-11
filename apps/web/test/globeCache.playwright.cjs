// Use playwright-cli run-code --filename apps/web/test/globeCache.playwright.cjs
// Start with bun apps/web/test/browserHarness.ts (mock Vite on 5173, production build required).
async (page) => {
	const results = [];
	for (const scenario of ['desktop-reuse', 'early-entry', 'mobile-touch', 'legacy-apis', 'capture-timeout', 'capture-abort', 'context-loss', 'no-webgl']) {
		const mobile = scenario === 'mobile-touch' || scenario === 'legacy-apis';
		const context = await page.context().browser().newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
		const tab = await context.newPage();
		const errors = [];
		tab.on('pageerror', (error) => errors.push(error.message));
		await context.addInitScript(({ scenario }) => {
			const stats = window.__cacheTest = { contexts: [], draws: 0, waiting: [], stalled: false, timeoutShort: false };
			const getContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (type, ...args) {
				if (/^webgl/.test(type) && scenario === 'no-webgl') return null;
				const gl = getContext.call(this, type, ...args);
				if (/^webgl/.test(type) && gl && !stats.contexts.includes(gl)) stats.contexts.push(gl);
				return gl;
			};
			for (const method of ['drawArrays', 'drawElements']) {
				const original = WebGL2RenderingContext.prototype[method];
				WebGL2RenderingContext.prototype[method] = function (...args) { stats.draws++; return original.apply(this, args); };
			}
			const toBlob = HTMLCanvasElement.prototype.toBlob;
			HTMLCanvasElement.prototype.toBlob = function (...args) {
				if (stats.stalled && this === window.__cachedCanvas) { stats.waiting.push(() => toBlob.apply(this, args)); return; }
				return toBlob.apply(this, args);
			};
			if (scenario === 'legacy-apis') {
				window.createImageBitmap = undefined;
				AbortSignal.any = undefined;
				AbortSignal.timeout = undefined;
				const timeout = window.setTimeout;
				window.setTimeout = (callback, ms, ...args) => timeout(callback, stats.timeoutShort && ms === 15000 ? 25 : ms, ...args);
			}
		}, { scenario });
		try {
			await tab.goto('http://127.0.0.1:4176/');
			await tab.locator('[data-item-index]').first().waitFor();
			const idle = () => tab.waitForFunction(() => document.querySelector('.view-transition-content').getAttribute('aria-busy') === 'false' && !document.querySelector('.view-transition'));
			const switchTo = async (mode) => {
				await tab.getByRole('button', { name: mode === '3d' ? '3D 地球' : '2D', exact: true }).click();
				await idle();
			};
			// Phones do not prewarm the globe (it costs ~1 MB); they load it on first entry.
			const enterFirst = scenario === 'early-entry' || mobile;
			if (enterFirst) await switchTo('3d');
			if (scenario === 'no-webgl') {
				await tab.waitForTimeout(1200);
				if (await tab.locator('[role=alert]').count()) throw new Error('Background warmup disturbed 2D');
				await switchTo('3d');
				await tab.waitForFunction(() => document.querySelector('.view-mode-switch').dataset.mode === '2d' && document.querySelector('[role=alert]'));
			} else {
				await tab.locator('.globe-canvas canvas[data-renderer=main]').waitFor({ state: 'attached' });
				await tab.evaluate(() => { window.__cachedCanvas = document.querySelector('.globe-canvas canvas'); });
				if (!enterFirst) await switchTo('3d');
				if (scenario === 'desktop-reuse') {
					for (let index = 0; index < 11; index++) {
						await switchTo(index % 2 ? '3d' : '2d');
						if (await tab.evaluate(() => document.querySelector('.globe-canvas canvas') !== window.__cachedCanvas || window.__cacheTest.contexts.length !== 1)) throw new Error('Switch recreated the WebGL context/canvas');
					}
					await switchTo('3d');
				} else if (scenario === 'mobile-touch') {
					const cdp = await context.newCDPSession(tab);
					const positions = () => tab.evaluate(() => [...document.querySelectorAll('.globe-scene-label')].map((el) => el.style.transform).join('|'));
					const before = await positions();
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 380, id: 1 }] });
					for (let x = 180; x < 260; x += 10) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 390, id: 1 }] }); await tab.waitForTimeout(20); }
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
					await tab.waitForTimeout(150);
					if (await positions() === before) throw new Error('Touch rotation failed');
					const beforeZoom = await positions();
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 400, id: 1 }, { x: 240, y: 400, id: 2 }] });
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 400, id: 1 }, { x: 280, y: 400, id: 2 }] });
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
					await tab.waitForTimeout(200);
					if (await positions() === beforeZoom) throw new Error('Pinch zoom failed');
					await tab.setViewportSize({ width: 844, height: 390 });
					await tab.waitForTimeout(200);
					const size = await tab.locator('.globe-canvas canvas').evaluate((el) => ({ width: el.width, height: el.height, cssWidth: el.clientWidth, cssHeight: el.clientHeight }));
					if (size.width !== size.cssWidth * 2 || size.height !== size.cssHeight * 2) throw new Error('Rotation/DPR handling failed');
					await cdp.detach();
				} else if (scenario === 'legacy-apis') {
					const region = await tab.getByRole('combobox', { name: '定位地区' }).evaluate((el) => el.options[1].value);
					await tab.getByRole('combobox', { name: '定位地区' }).selectOption(region);
					await tab.locator('.globe-check-list button').first().click();
					await tab.locator('.probe-panel').waitFor();
					await tab.locator('.globe-back').click();
					await context.route('**/api/public/probe-detail*', () => {});
					await tab.evaluate(() => { window.__cacheTest.timeoutShort = true; });
					await tab.locator('.globe-check-list button').first().click();
					await tab.getByText('这个地区的检测明细暂时无法读取。').waitFor();
				} else if (scenario === 'context-loss') {
					await tab.evaluate(() => window.__cacheTest.contexts[0].getExtension('WEBGL_lose_context').loseContext());
					await tab.waitForFunction(() => document.querySelector('.view-mode-switch').dataset.mode === '2d' && document.querySelector('[role=alert]'));
					await switchTo('3d');
					await tab.locator('.globe-canvas canvas[data-renderer=main]').waitFor();
					if (await tab.evaluate(() => window.__cacheTest.contexts.length !== 2 || document.querySelector('.globe-canvas canvas') === window.__cachedCanvas)) throw new Error('Lost context was not rebuilt after explicit retry');
					await tab.evaluate(() => { window.__cachedCanvas = document.querySelector('.globe-canvas canvas'); });
				} else if (scenario === 'capture-timeout' || scenario === 'capture-abort') {
					await tab.evaluate(() => { window.__cacheTest.stalled = true; });
					await tab.getByRole('button', { name: '2D', exact: true }).click();
					await tab.waitForFunction(() => window.__cacheTest.waiting.length > 0);
					if (scenario === 'capture-abort') await tab.setViewportSize({ width: 1100, height: 800 });
					await idle();
					await tab.evaluate(() => { window.__cacheTest.stalled = false; });
					if (scenario === 'capture-abort') await switchTo('2d');
					await switchTo('3d');
					await tab.evaluate(() => { for (const late of window.__cacheTest.waiting.splice(0)) late(); });
				}
				await switchTo('2d');
				await tab.waitForTimeout(100);
				const draws = await tab.evaluate(() => window.__cacheTest.draws);
				await tab.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
				await tab.waitForTimeout(200);
				if (draws !== await tab.evaluate(() => window.__cacheTest.draws)) throw new Error('Hidden globe kept drawing');
				if (await tab.evaluate(() => document.querySelector('.globe-canvas canvas') !== window.__cachedCanvas)) throw new Error('Switch replaced the cached canvas');
				const expectedContexts = scenario === 'context-loss' ? 2 : 1;
				if (await tab.evaluate(() => window.__cacheTest.contexts.length) !== expectedContexts) throw new Error('Unexpected context count');
			}
			if (tab.workers().length) throw new Error('Unexpected background renderer');
			if (await tab.evaluate(() => document.querySelector('.view-transition-content').inert)) throw new Error('Page remains inert');
			if (errors.length) throw new Error(errors.join('\n'));
			results.push({ scenario, passed: true, ...await tab.evaluate(() => ({ contexts: window.__cacheTest.contexts.length, renderer: document.querySelector('.globe-canvas canvas')?.dataset.renderer ?? '2d' })) });
		} finally { await context.close(); }
	}
	await page.request.post('http://127.0.0.1:4174/__report?name=globe-cache.json', { data: JSON.stringify(results) });
	return results;
}
