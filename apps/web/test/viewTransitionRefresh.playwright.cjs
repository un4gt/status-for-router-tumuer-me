// Start with bun apps/web/test/browserHarness.ts (mock Vite on 5173, production build required).
// Invoke via playwright-cli run-code --filename=apps/web/test/viewTransitionRefresh.playwright.cjs
async (page) => {
	const origin = 'http://127.0.0.1:4176';
	const base = await (await page.request.get(origin + '/api/public/overview?window=5h')).json();
	const plans = [];
	const requests = [];
	let revision = 10000;
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const state = (window.__refreshTest = { updates: [], draws: 0, tick: null, intervalCount: 0 });
		const original = window.setInterval;
		window.setInterval = function (callback, delay, ...args) {
			if (delay === 60000) {
				state.tick = callback;
				state.intervalCount++;
			}
			return original.call(this, callback, delay, ...args);
		};
		for (const name of ['drawArrays', 'drawElements']) {
			const draw = WebGL2RenderingContext.prototype[name];
			WebGL2RenderingContext.prototype[name] = function (...args) {
				state.draws++;
				return draw.apply(this, args);
			};
		}
		let previous = '';
		new MutationObserver(() => {
			const model = document.querySelector('[data-item-index="0"]')?.textContent?.match(/boundary-revision-(\d+)/)?.[1];
			if (model && model !== previous) {
				previous = model;
				state.updates.push({ revision: Number(model), busy: document.querySelector('.view-transition-content')?.getAttribute('aria-busy') === 'true' });
			}
		}).observe(document, { subtree: true, childList: true, characterData: true });
	});
	await page.route('**/api/public/overview*', async (route) => {
		const plan = plans.shift() ?? {};
		const request = { window: route.request().url().match(/[?&]window=([^&]*)/)?.[1], revision: ++revision };
		requests.push(request);
		plan.request = request;
		if (plan.deferred) await new Promise((resolve) => (plan.release = resolve));
		const body = JSON.parse(JSON.stringify(base));
		body.generated_at = Date.now();
		body.models[0].model = 'boundary-revision-' + request.revision;
		body.models[0].last_checked_at = body.generated_at;
		await route.fulfill({ status: plan.fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body) });
		plan.done = true;
	});
	await page.setViewportSize({ width: 1920, height: 1080 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto(origin + '/');
	await page.locator('[data-item-index]').first().waitFor();
	const assert = (condition, message) => { if (!condition) throw new Error(message); };
	const until = async (condition) => {
		const deadline = Date.now() + 10000;
		while (!condition()) {
			if (Date.now() > deadline) throw new Error('Timed out waiting for controlled response');
			await page.waitForTimeout(10);
		}
	};
	const displayed = () => page.evaluate(() => Number(document.querySelector('[data-item-index="0"]')?.textContent?.match(/boundary-revision-(\d+)/)?.[1]));
	const poll = () => page.evaluate(() => window.__refreshTest.tick());
	const switchTo = (mode) => page.getByRole('button', { name: mode === '3d' ? '3D 地球' : '2D', exact: true }).click();
	const idle = () => page.waitForFunction(() => document.querySelector('.view-transition-content').getAttribute('aria-busy') === 'false' && !document.querySelector('.view-transition'));
	const flip = () => page.waitForSelector('.view-transition[data-phase=flip]');
	const scenarios = [];
	for (const stage of ['capture', 'prepare', 'flip', 'after']) {
		const before = await displayed();
		const mode = await page.evaluate(() => document.querySelector('.view-mode-switch').dataset.mode === '2d' ? '3d' : '2d');
		const plan = { deferred: true };
		plans.push(plan);
		if (stage === 'capture') {
			await poll();
			await until(() => plan.release);
		}
		await switchTo(mode);
		if (stage !== 'after') {
			await page.waitForFunction((stage) => stage === 'capture' ? document.querySelector('.view-transition-content').getAttribute('aria-busy') === 'true' : document.querySelector('.view-transition')?.dataset.phase === stage, stage);
			if (stage !== 'capture') { await poll(); await until(() => plan.release); }
			plan.release();
			await until(() => plan.done);
			assert(await displayed() === before, 'Result changed before transition finished: ' + stage);
			await idle();
		} else {
			await idle();
			await poll();
			await until(() => plan.release);
			plan.release();
			await until(() => plan.done);
		}
		await page.waitForFunction((expected) => document.querySelector('[data-item-index="0"]')?.textContent?.includes('boundary-revision-' + expected), plan.request.revision);
		scenarios.push({ stage, latestRevision: plan.request.revision, passed: true });
	}
	// A success followed by another in-flight request and failure must keep the new success.
	await switchTo('3d');
	await flip();
	const success = {};
	plans.push(success);
	await poll();
	await until(() => success.done);
	await page.waitForTimeout(30);
	const failure = { deferred: true, fail: true };
	plans.push(failure);
	await poll();
	await until(() => failure.release);
	failure.release();
	await until(() => failure.done);
	await idle();
	await page.getByRole('alert').filter({ hasText: '状态暂时无法更新' }).waitFor();
	assert(await displayed() === success.request.revision, 'A failure discarded a newer successful snapshot');
	scenarios.push({ stage: 'success-then-failure-in-one-transition', latestRevision: success.request.revision, passed: true });
	const recovered = {};
	plans.push(recovered);
	await poll();
	await until(() => recovered.done);
	await page.waitForFunction(() => !document.querySelector('.globe-error'));
	assert(await displayed() === recovered.request.revision, 'Failed to recover from refresh error');
	// A second interval/visibility signal while one request is pending must not duplicate it.
	const pending = { deferred: true };
	plans.push(pending);
	const countBefore = requests.length;
	await poll();
	await until(() => pending.release);
	await poll();
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForTimeout(40);
	assert(requests.length === countBefore + 1, 'Concurrent refreshes escaped the in-flight guard');
	pending.release();
	await until(() => pending.done);
	await page.waitForTimeout(30);
	scenarios.push({ stage: 'in-flight-deduplication', passed: true });
	// Visibility changes cannot resume a globe whose image is frozen for the flip.
	await switchTo('2d');
	await flip();
	await page.waitForTimeout(50);
	const frozen = await page.evaluate(() => window.__refreshTest.draws);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForTimeout(100);
	assert(await page.evaluate(() => window.__refreshTest.draws) === frozen, 'Visibility resumed the frozen globe');
	await idle();
	const hidden = await page.evaluate(() => window.__refreshTest.draws);
	await poll();
	await page.waitForTimeout(150);
	assert(await page.evaluate(() => window.__refreshTest.draws) === hidden, 'Hidden data refresh rendered the globe');
	scenarios.push({ stage: 'frozen-and-hidden-globe', passed: true });
	// Resizing aborts the visual effect and still publishes a completed response.
	await switchTo('3d');
	await flip();
	await page.waitForTimeout(50);
	const incomingFrozen = await page.evaluate(() => window.__refreshTest.draws);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await page.waitForTimeout(100);
	assert(await page.evaluate(() => window.__refreshTest.draws) === incomingFrozen, 'Visibility resumed the incoming frozen globe');
	const resized = {};
	plans.push(resized);
	await poll();
	await until(() => resized.done);
	await page.setViewportSize({ width: 1600, height: 900 });
	await idle();
	assert(await displayed() === resized.request.revision, 'Resize lost pending result');
	assert(!(await page.locator('.view-transition-content').evaluate((el) => el.inert)), 'Resize left page inert');
	scenarios.push({ stage: 'resize-releases-latest-result', passed: true });
	const state = await page.evaluate(() => ({ updates: window.__refreshTest.updates, intervalCount: window.__refreshTest.intervalCount }));
	assert(state.intervalCount === 1, 'Switching modes restarted the polling interval');
	assert(state.updates.every((update) => !update.busy), 'A model result was committed during transition');
	assert(errors.length === 0, errors.join('\n'));
	const result = { scenarios, requests, updates: state.updates, pollIntervalInstallations: state.intervalCount, errors };
	await page.request.post('http://127.0.0.1:4174/__report?name=refresh-boundaries.json', { data: JSON.stringify(result) });
	await page.unroute('**/api/public/overview*');
	return result;
}
