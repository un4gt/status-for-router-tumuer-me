import { isAbsolute, join, relative, resolve } from 'node:path';

// Start the mock Vite server on 5173 and build the frontend before this harness.
const projectRoot = resolve(import.meta.dir, '../../..');
const dist = join(projectRoot, 'apps/web/dist');
const reports = join(projectRoot, 'artifacts/browser-tests');
const apiOrigin = new URL(process.env.STATUS_TEST_API_ORIGIN || 'http://127.0.0.1:5173');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(apiOrigin.hostname)) throw new Error('Browser tests require a local mock API');
if (!(await Bun.file(join(dist, 'index.html')).exists())) throw new Error('Run bun run build:web before the browser harness');

const frontend = Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.STATUS_TEST_PORT || 4176),
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname.startsWith('/api/')) return fetch(new URL(url.pathname + url.search, apiOrigin), request);
		let pathname: string;
		try { pathname = decodeURIComponent(url.pathname); }
		catch { return new Response('Invalid path', { status: 400 }); }
		const path = resolve(dist, `.${['/', '/admin', '/admin/'].includes(pathname) ? '/index.html' : pathname}`);
		const offset = relative(dist, path);
		if (offset.startsWith('..') || isAbsolute(offset)) return new Response('Not Found', { status: 404 });
		const file = Bun.file(path);
		return (await file.exists()) ? new Response(file) : new Response('Not Found', { status: 404 });
	},
});
const collector = Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.STATUS_TEST_REPORT_PORT || 4174),
	async fetch(request) {
		const url = new URL(request.url);
		if (request.method !== 'POST' || url.pathname !== '/__report') return new Response('Not Found', { status: 404 });
		const name = url.searchParams.get('name') || '';
		if (!/^[a-z0-9-]+\.json$/.test(name)) return new Response('Invalid report name', { status: 400 });
		await Bun.write(join(reports, name), await request.text());
		return Response.json({ saved: name });
	},
});
console.log(`Browser test frontend: ${frontend.url}; report collector: ${collector.url}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
	frontend.stop(true);
	collector.stop(true);
	process.exit(0);
});
