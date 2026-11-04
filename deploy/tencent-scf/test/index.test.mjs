import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';

import { main_handler, resolveTimeout } from '../index.mjs';

const ENV_KEYS = [
	'PROBE_TOKEN',
	'PROBE_ALLOW_HTTP',
	'PROBE_ALLOW_INSECURE',
	'PROBE_TIMEOUT_MS',
	'TENCENTCLOUD_REGION',
];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const servers = [];

async function startUpstream(handler) {
	const server = http.createServer(async (req, res) => {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		let body = null;
		try {
			body = raw ? JSON.parse(raw) : null;
		} catch {
			body = raw;
		}
		const reply = await handler(req, body);
		res.writeHead(reply.status || 200, { 'content-type': 'application/json' });
		res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	servers.push(server);
	const address = server.address();
	return { url: `http://127.0.0.1:${address.port}/v1`, server };
}

function httpEvent(body, headers = {}) {
	return {
		httpMethod: 'POST',
		path: '/',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
		queryString: {},
	};
}

function call(payload, context = { tencentcloud_region: 'ap-shanghai', request_id: 'test-request' }) {
	return main_handler(
		httpEvent(payload, process.env.PROBE_TOKEN ? { 'x-probe-token': process.env.PROBE_TOKEN } : {}),
		context,
	);
}

function parse(response) {
	assert.equal(typeof response.body, 'string');
	return JSON.parse(response.body);
}

afterEach(async () => {
	for (const key of ENV_KEYS) {
		if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
		else process.env[key] = ORIGINAL_ENV[key];
	}
	await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

test('embedding probe returns a Site24x7-compatible current_status payload', async () => {
	process.env.PROBE_TOKEN = 'probe-secret';
	process.env.PROBE_ALLOW_HTTP = '1';

	let seen;
	const { url } = await startUpstream((req, body) => {
		seen = { url: req.url, authorization: req.headers.authorization, body };
		return { body: { data: [{ embedding: [0.1, 0.2, 0.3] }] } };
	});

	const response = await call({
		target: url,
		apiKey: 'upstream-key',
		check: { id: 'model:embed', type: 'model', model: 'embed' },
	});

	assert.equal(response.statusCode, 200);
	const payload = parse(response);
	assert.equal(payload.code, 0);
	assert.equal(payload.data.status, 1);
	assert.equal(payload.data.unit, 'ms');
	assert.equal(payload.data.down_reason, null);
	assert.equal(payload.data.locations.length, 1);
	assert.equal(payload.data.locations[0].location_name, 'ap-shanghai');
	assert.equal(payload.data.locations[0].status, 1);
	assert.equal(typeof payload.data.locations[0].attribute_value, 'number');
	assert.ok(payload.data.locations[0].attribute_value >= 0);
	assert.match(payload.data.last_polled_time, /^\d{4}-\d{2}-\d{2}T/);
	assert.equal(seen.url, '/v1/embeddings');
	assert.equal(seen.authorization, 'Bearer upstream-key');
	assert.deepEqual(seen.body, {
		model: 'embed',
		input: '这是一段需要转换成向量的文本',
		encoding_format: 'float',
	});
});

test('a broken SCF remaining-time method does not prevent the upstream probe', async () => {
	process.env.PROBE_TOKEN = 'probe-secret';
	process.env.PROBE_ALLOW_HTTP = '1';
	let calls = 0;
	const { url } = await startUpstream(() => {
		calls++;
		return { body: { data: [{ embedding: [1] }] } };
	});
	const response = await call(
		{ target: url, apiKey: 'key', check: { type: 'model', model: 'embed' } },
		{
			tencentcloud_region: 'ap-tokyo',
			getRemainingTimeInMillis() {
				throw new TypeError('client.ms_elapsed is not a function');
			},
		},
	);
	assert.equal(response.statusCode, 200);
	assert.equal(parse(response).data.status, 1);
	assert.equal(calls, 1);
});

test('timeout respects valid platform budgets and falls back when the API is broken', () => {
	delete process.env.PROBE_TIMEOUT_MS;
	const brokenContext = {
		getRemainingTimeInMillis() {
			throw new TypeError('client.ms_elapsed is not a function');
		},
	};
	assert.equal(resolveTimeout(undefined, brokenContext), 15000);
	assert.equal(resolveTimeout(2500, brokenContext), 2500);
	assert.equal(resolveTimeout(60000, brokenContext), 30000);
	process.env.PROBE_TIMEOUT_MS = '7000';
	assert.equal(resolveTimeout(undefined, brokenContext), 7000);
	assert.equal(resolveTimeout(undefined, {}), 7000);
	for (const remaining of [NaN, Infinity, undefined]) {
		assert.equal(resolveTimeout(4000, { getRemainingTimeInMillis: () => remaining }), 4000);
	}
	const context = {
		remaining: 3500,
		getRemainingTimeInMillis() {
			return this.remaining;
		},
	};
	assert.equal(resolveTimeout(15000, context), 2500);
	assert.equal(resolveTimeout(2000, context), 2000);
});

test('rerank and decision probes validate their response shapes', async () => {
	process.env.PROBE_TOKEN = 'probe-secret';
	process.env.PROBE_ALLOW_HTTP = '1';
	const tokyo = { tencentcloud_region: 'ap-tokyo', request_id: 'test-request' };

	let decisionNoul = 0.75;
	const { url } = await startUpstream((req) => {
		if (req.url === '/v1/rerank') return { body: { results: [{ index: 0, relevance_score: 0.9 }] } };
		return { body: { answers: { probe: { type: 'noul', noul: decisionNoul } } } };
	});

	const rerank = parse(
		await call(
			{ target: url, apiKey: 'key', locationName: 'ignored', check: { type: 'rerank', model: 'reranker' } },
			tokyo,
		),
	);
	assert.equal(rerank.data.status, 1);
	assert.equal(rerank.data.locations[0].location_name, 'ap-tokyo');

	decisionNoul = 2;
	const decisions = parse(
		await call({ target: url, apiKey: 'key', check: { type: 'decisions', model: 'decider' } }, tokyo),
	);
	assert.equal(decisions.data.status, 0);
	assert.match(decisions.data.down_reason, /answers\.probe\.noul/);
	assert.equal(decisions.data.locations[0].status, 0);

	decisionNoul = 0.5;
	const systemone = parse(
		await call({ target: url, apiKey: 'key', check: { type: 'systemone', model: 'decider' } }, tokyo),
	);
	assert.equal(systemone.data.status, 1);
});

test('rejects an invalid probe token before calling upstream', async () => {
	process.env.PROBE_TOKEN = 'expected';
	process.env.PROBE_ALLOW_HTTP = '1';
	let calls = 0;
	const { url } = await startUpstream(() => {
		calls++;
		return { body: { data: [{ embedding: [1] }] } };
	});

	const response = await main_handler(
		httpEvent({ target: url, apiKey: 'key', check: { type: 'model', model: 'embed' } }, { 'x-probe-token': 'wrong' }),
		{ tencentcloud_region: 'ap-shanghai' },
	);
	assert.equal(response.statusCode, 401);
	assert.equal(calls, 0);
});

test('refuses plain HTTP targets unless explicitly allowed', async () => {
	process.env.PROBE_TOKEN = 'probe-secret';
	const response = await call({
		target: 'http://127.0.0.1:9/v1',
		apiKey: 'key',
		check: { type: 'model', model: 'embed' },
	});
	assert.equal(response.statusCode, 400);
	assert.match(parse(response).message, /HTTPS/);
});

test('supports direct invocation with the event payload and context region', async () => {
	process.env.PROBE_ALLOW_HTTP = '1';
	const { url } = await startUpstream((req, body) => {
		assert.equal(req.headers.authorization, 'Bearer direct-key');
		assert.equal(body.model, 'embed');
		return { body: { data: [{ embedding: [1, 2] }] } };
	});

	// No httpMethod/body wrapper: the event itself is the probe request.
	const response = await main_handler(
		{ target: url, apiKey: 'direct-key', check: { type: 'model', model: 'embed' } },
		{ tencentcloud_region: 'na-siliconvalley', request_id: 'direct' },
	);
	assert.equal(response.statusCode, 200);
	assert.equal(parse(response).data.locations[0].location_name, 'na-siliconvalley');
});

test('requires the API key in the event payload', async () => {
	process.env.PROBE_TOKEN = 'probe-secret';
	process.env.PROBE_ALLOW_HTTP = '1';
	const response = await call({
		target: 'http://127.0.0.1:9/v1',
		check: { type: 'model', model: 'embed' },
	});
	assert.equal(response.statusCode, 400);
	assert.match(parse(response).message, /apiKey/);
});

test('returns readiness metadata for GET requests', async () => {
	const response = await main_handler(
		{ httpMethod: 'GET', headers: {}, path: '/' },
		{ tencentcloud_region: 'ap-shanghai', request_id: 'ready' },
	);
	assert.equal(response.statusCode, 200);
	const payload = parse(response);
	assert.equal(payload.data, null);
	assert.equal(payload.meta.request_id, 'ready');
	assert.equal(payload.meta.region, 'ap-shanghai');
	assert.equal(payload.meta.version, 'fetch-v3');
});
