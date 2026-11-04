import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';

import { main_handler } from '../index.mjs';

const MB = 1024 * 1024;
const RSS_LIMIT = 64 * MB;
const PROBES = 100;
const servers = [];

after(async () => {
	delete process.env.PROBE_ALLOW_HTTP;
	await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

test(`warm function stays below 64 MB RSS after ${PROBES} probes`, async () => {
	process.env.PROBE_ALLOW_HTTP = '1';
	const server = http.createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	servers.push(server);
	const port = server.address().port;

	const event = {
		target: `http://127.0.0.1:${port}/v1`,
		apiKey: 'memory-test-key',
		check: { id: 'model:embed', type: 'model', model: 'embed' },
	};
	const context = { tencentcloud_region: 'ap-shanghai', request_id: 'memory-test' };

	for (let i = 0; i < PROBES; i++) {
		const response = await main_handler(event, context);
		assert.equal(response.statusCode, 200);
	}

	const rss = process.memoryUsage().rss;
	console.log(`RSS after ${PROBES} probes: ${(rss / MB).toFixed(2)} MB (limit ${RSS_LIMIT / MB} MB)`);
	assert.ok(rss < RSS_LIMIT, `RSS ${(rss / MB).toFixed(2)} MB must stay below ${RSS_LIMIT / MB} MB`);
});
