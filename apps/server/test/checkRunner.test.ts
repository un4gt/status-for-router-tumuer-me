import { expect, test } from 'bun:test';
import { runAllChecks } from '../src/checkRunner';
import { createCheck, setCheckEnabled } from '../src/db';
import { fixture, onCleanup } from './helpers';

test('rerank probe works with an endpoint accepting only portable request fields', async () => {
	const requests: Record<string, unknown>[] = [];
	const upstream = Bun.serve({
		port: 0,
		async fetch(request) {
			if (new URL(request.url).pathname !== '/v1/rerank') return new Response(null, { status: 404 });
			if (request.method !== 'POST' || request.headers.get('authorization') !== 'Bearer test-api-key') {
				return new Response(null, { status: 401 });
			}
			const body = (await request.json()) as Record<string, unknown>;
			requests.push(body);
			const allowed = ['model', 'query', 'documents', 'top_n', 'return_documents'];
			if (Object.keys(body).some((key) => !allowed.includes(key))) {
				return Response.json({ error: 'Unsupported extension' }, { status: 400 });
			}
			return Response.json({ results: [{ index: 0, relevance_score: 0.99 }] });
		},
	});
	onCleanup(() => upstream.stop(true));
	const target = `http://127.0.0.1:${upstream.port}/v1`;
	const services = fixture({ routerBaseUrl: target });
	setCheckEnabled(services, 'head:router', false);
	const model = 'xunfei-maas/Qwen/Qwen3-Reranker-8B';
	const id = `rerank:${model}`;
	createCheck(services, { id, type: 'rerank', target, model });
	await runAllChecks(services);
	expect(requests).toHaveLength(1);
	expect(requests[0]).toMatchObject({ model, query: 'Apple', documents: ['apple', 'banana', 'fruit', 'vegetable'] });
	expect(services.db.query('SELECT success, status_code, error FROM results WHERE check_id=?').get(id)).toEqual({
		success: 1,
		status_code: 200,
		error: null,
	});
});
