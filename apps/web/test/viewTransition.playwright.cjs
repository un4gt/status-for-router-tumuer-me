// Run with playwright-cli run-code --filename apps/web/test/viewTransition.playwright.cjs
async (page) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.addInitScript(() => {
		window.__glDraws = 0;
		for (const method of ['drawArrays', 'drawElements']) {
			const original = WebGL2RenderingContext.prototype[method];
			WebGL2RenderingContext.prototype[method] = function (...args) {
				window.__glDraws++;
				return original.apply(this, args);
			};
		}
	});
	const results = [];
	for (const { viewport, reducedMotion, modes } of [
		{ viewport: { width: 1920, height: 1080 }, reducedMotion: 'no-preference', modes: ['3d', '2d', '3d', '2d'] },
		{ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', modes: ['3d', '2d', '3d', '2d'] },
		// null uses the actual OS setting; Playwright defaults to no-preference.
		{ viewport: { width: 1280, height: 720 }, reducedMotion: null, modes: ['3d', '2d'] },
		{ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', modes: ['3d', '2d'] },
	]) {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion });
		await page.goto('http://127.0.0.1:5173/');
		await page.locator('[data-item-index]').first().waitFor();
		await page.locator('.globe-canvas canvas[data-renderer]').waitFor({ state: 'attached' });
		await page.evaluate(() => {
			window.__modeSwitch = document.querySelector('.view-mode-switch');
			window.__modeButtons = [...window.__modeSwitch.querySelectorAll('button')];
			window.__modeBounds = [window.__modeSwitch, ...window.__modeButtons].flatMap((element) => {
				const { x, y, width, height } = element.getBoundingClientRect();
				return [x, y, width, height];
			});
		});
		const savedScroll = await page.evaluate(() => {
			const main = document.querySelector('[data-status-scroll]');
			main.scrollTop = 400;
			return main.scrollTop;
		});
		for (const mode of modes) {
			await page.evaluate(() => {
				const start = performance.now();
				const stats = (window.__transitionStats = { start, phases: [], frames: [], tasks: [], drift: 0, mixedFaces: false });
				let previous = start;
				const tick = (time) => {
					stats.frames.push({ time: time - start, gap: time - previous });
					const positions = [window.__modeSwitch, ...window.__modeButtons].flatMap((element) => {
						const { x, y, width, height } = element.getBoundingClientRect();
						return [x, y, width, height];
					});
					stats.drift = Math.max(stats.drift, ...positions.map((value, index) => Math.abs(value - window.__modeBounds[index])));
					const cells = [...document.querySelectorAll('.view-transition-cell')];
					if (cells.length && !stats.grid) {
						const first = cells[0].getBoundingClientRect();
						const last = cells.at(-1).getBoundingClientRect();
						stats.grid = {
							count: cells.length,
							size: first.width,
							square: Math.abs(first.width - first.height) < 0.1,
							covered: last.right >= innerWidth - 0.1 && last.bottom >= innerHeight - 0.1,
						};
					}
					const back = document.querySelectorAll('.view-transition-tile[data-face="back"]').length;
					if (back > 0 && back < cells.length) stats.mixedFaces = true;
					previous = time;
					stats.raf = requestAnimationFrame(tick);
				};
				stats.raf = requestAnimationFrame(tick);
				stats.observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) stats.tasks.push(entry.duration);
				});
				stats.observer.observe({ type: 'longtask' });
				let phase = '';
				stats.mutations = new MutationObserver(() => {
					const current =
						document.querySelector('.view-transition')?.dataset.phase ??
						(document.querySelector('.view-transition-content').getAttribute('aria-busy') === 'true' ? 'capture' : 'idle');
					if (current !== phase && (current !== 'idle' || stats.phases.length)) {
						phase = current;
						stats.phases.push({ phase, ms: Math.round(performance.now() - start) });
					}
				});
				stats.mutations.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['aria-busy', 'data-phase'],
				});
			});
			// DOM click keeps the saved scroll position when the top toolbar is offscreen.
			await page
				.getByRole('group', { name: '显示模式' })
				.getByRole('button', { name: mode === '3d' ? '3D 地球' : '2D', exact: true })
				.evaluate((button) => button.click());
			await page.waitForFunction(() => window.__transitionStats.phases.some((p) => p.phase === 'idle'), null, { timeout: 20000 });
			results.push(
				await page.evaluate(
					({ mode, savedScroll, viewport }) => {
						const stats = window.__transitionStats;
						cancelAnimationFrame(stats.raf);
						stats.observer.disconnect();
						stats.mutations.disconnect();
						if (!stats.phases.some((p) => p.phase === 'flip')) throw new Error('Transition skipped the tile animation');
						if (stats.drift > 0.1) throw new Error(`View mode buttons moved by ${stats.drift}px`);
						if (
							document.querySelectorAll('[aria-label="显示模式"]').length !== 1 ||
							document.querySelector('.view-mode-switch') !== window.__modeSwitch
						)
							throw new Error('Mode switch was replaced or duplicated');
						if (!stats.mixedFaces || !stats.grid?.square || !stats.grid.covered || stats.grid.count > 160 || stats.grid.size < 64)
							throw new Error('Incorrect adaptive tile grid');
						if (document.querySelector('.view-transition-content').inert) throw new Error('Page remains inert');
						if (document.querySelector(`[data-status-view="${mode}"]`).hidden) throw new Error('Wrong destination view');
						const main = document.querySelector('[data-status-scroll]');
						if (mode === '2d' && Math.abs(main.scrollTop - savedScroll) > 1) throw new Error('Scroll position was lost');
						if (getComputedStyle(main).scrollbarWidth !== 'none') throw new Error('Scrollbar became visible');
						if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight)
							throw new Error('Viewport overflow');
						const canvas = document.querySelector('.globe-canvas canvas');
						if (window.__globeCanvas && canvas !== window.__globeCanvas) throw new Error('Globe was recreated');
						window.__globeCanvas = canvas;
						const flipAt = stats.phases.find((p) => p.phase === 'flip').ms;
						const frames = stats.frames
							.filter((f) => f.time >= flipAt)
							.map((f) => f.gap)
							.sort((a, b) => a - b);
						return {
							viewport,
							reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
							mode,
							buttonDriftPx: stats.drift,
							grid: stats.grid,
							phases: stats.phases,
							frameP95Ms: Math.round(frames[Math.floor(frames.length * 0.95)]),
							longestTaskMs: Math.round(Math.max(0, ...stats.tasks)),
						};
					},
					{ mode, savedScroll, viewport },
				),
			);
			await page.waitForTimeout(100);
			const drawsBefore = await page.evaluate(() => window.__glDraws);
			await page.waitForTimeout(250);
			const drawsAfter = await page.evaluate(() => window.__glDraws);
			if (mode === '2d' && drawsAfter !== drawsBefore) throw new Error('Hidden globe keeps rendering');
			if (mode === '3d' && drawsAfter === drawsBefore) throw new Error('Visible globe animation did not resume');
		}
	}
	await page.emulateMedia({ reducedMotion: null });
	if (errors.length) throw new Error(errors.join('\n'));
	return results;
}
