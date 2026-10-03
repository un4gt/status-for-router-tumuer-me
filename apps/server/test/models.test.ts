import { describe, expect, test } from 'bun:test';
import { classifyModel, discoverModels } from '../src/models';
import { createCheck, deleteCheck, saveSelection } from '../src/db';
import { runAllChecks } from '../src/checkRunner';
import { fixture, onCleanup } from './helpers';

describe('model discovery and probes', () => {
	test('uses explicit metadata, treats names as suggestions, and preserves uncertainty', () => {
		expect(classifyModel({ id: 'a', type: 'embedding' }).detected_type).toBe('model');
		expect(classifyModel({ id: 'b', capabilities: { rerank: true } }).detected_type).toBe('rerank');
		expect(classifyModel({ id: 'text-embedding-3' })).toMatchObject({ detected_type: null, suggested_type: 'model', unsupported: false });
		expect(classifyModel({ id: 'bge-reranker-v2' }).suggested_type).toBe('rerank');
		expect(classifyModel({ id: 'unknown' }).detected_type).toBeNull();
		expect(classifyModel({ id: 'conflict', type: 'embedding', task: 'rerank' }).detected_type).toBeNull();
		expect(classifyModel({ id: 'chat', type: 'chat' }).unsupported).toBe(true);
		expect(classifyModel({ id: 'multi', supported_endpoints: ['/v1/embeddings', '/v1/chat/completions'] }).detected_type).toBe('model');
	});
	test('fetches models with the configured key, without issuing inference requests', async () => {
		const requests: string[] = [];
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch(request) {
				requests.push(`${request.method} ${new URL(request.url).pathname}`);
				expect(request.headers.get('authorization')).toBe('Bearer test-api-key');
				return Response.json({
					data: [
						{ id: 'a', type: 'embedding' },
						{ id: 'a', type: 'embedding' },
						{ id: 'b', task: 'rerank' },
					],
				});
			},
		});
		onCleanup(() => server.stop(true));
		const services = fixture({ routerBaseUrl: `${server.url}v1` });
		expect((await discoverModels(services.config)).map((model) => model.detected_type)).toEqual(['model', 'rerank']);
		expect(requests).toEqual(['GET /v1/models']);
	});
	test('reports upstream authentication, malformed responses, missing keys and timeouts safely', async () => {
		let mode = 'auth';
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			async fetch() {
				if (mode === 'auth') return new Response('test-api-key must not be exposed', { status: 401 });
				if (mode === 'invalid') return Response.json({ unexpected: [] });
				await Bun.sleep(100);
				return Response.json({ data: [] });
			},
		});
		onCleanup(() => server.stop(true));
		const { config } = fixture({ routerBaseUrl: `${server.url}v1` });
		await expect(discoverModels(config)).rejects.toMatchObject({ status: 502 });
		try {
			await discoverModels(config);
		} catch (error) {
			expect(String(error)).not.toContain('test-api-key');
		}
		mode = 'invalid';
		await expect(discoverModels(config)).rejects.toMatchObject({ status: 502 });
		mode = 'slow';
		await expect(discoverModels(config, fetch, 20)).rejects.toMatchObject({ status: 504 });
		await expect(discoverModels({ ...config, apiKey: '' })).rejects.toMatchObject({ status: 503 });
	});
	test('runs HEAD, embeddings and rerank correctly, skips disabled checks, and redacts errors', async () => {
		const paths: string[] = [];
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			async fetch(request) {
				const path = new URL(request.url).pathname;
				paths.push(path);
				if (request.method === 'HEAD') return new Response(null);
				expect(request.headers.get('authorization')).toBe('Bearer test-api-key');
				const body = await request.json();
				if (path === '/v1/embeddings') {
					expect(body.encoding_format).toBe('float');
					return Response.json(
						{ error: { message: 'upstream echoed test-api-key ' + 'x'.repeat(1959) + 'test-api-key' } },
						{ status: 400 },
					);
				}
				expect(path).toBe('/v1/rerank');
				expect(body.model).toBe('rank');
				expect(body.documents).toEqual(['apple', 'banana', 'fruit', 'vegetable']);
				return Response.json({ results: [{ index: 0, relevance_score: 1 }] });
			},
		});
		onCleanup(() => server.stop(true));
		const services = fixture({ headCheckUrl: String(server.url), routerBaseUrl: `${server.url}v1` });
		saveSelection(services, [
			{ model: 'embed', type: 'model' },
			{ model: 'rank', type: 'rerank' },
		]);
		createCheck(services, { id: 'model:disabled', type: 'model', model: 'disabled', target: services.config.routerBaseUrl, enabled: 0 });
		await runAllChecks(services, { triggeredBy: 'manual' });
		expect(paths).toEqual(['/', '/v1/embeddings', '/v1/rerank']);
		const rows = services.db
			.query<{ check_id: string; success: number; error: string | null }, []>('SELECT check_id, success, error FROM results ORDER BY id')
			.all();
		expect(rows.map((row) => row.success)).toEqual([1, 0, 1]);
		expect(rows[1].error).toContain('[redacted]');
		expect(JSON.stringify(rows)).not.toContain('test-api-key');
		expect(JSON.stringify(rows)).not.toContain('test-api');
	});
	test('deleting a model during an in-flight probe does not restore its history or fail the run', async () => {
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const pending = new Promise<void>((resolve) => {
			started = resolve;
		});
		const server = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			async fetch(request) {
				if (request.method === 'HEAD') return new Response(null);
				started();
				await gate;
				return Response.json({ data: [{ embedding: [0.1, 0.2] }] });
			},
		});
		onCleanup(() => {
			release();
			return server.stop(true);
		});
		const services = fixture({ headCheckUrl: String(server.url), routerBaseUrl: `${server.url}v1` });
		saveSelection(services, [{ model: 'deleted', type: 'model' }]);
		const run = runAllChecks(services);
		await pending;
		deleteCheck(services, 'model:deleted');
		release();
		await run;
		expect(services.db.query('SELECT * FROM results WHERE check_id=?').all('model:deleted')).toEqual([]);
	});
});
