/**
 * Tencent Cloud SCF (Node.js 20.19) probe function — ES Module entry.
 *
 * This file is intentionally `.mjs` and uses `import` / `export`. Do not paste
 * CommonJS (`require` / `module.exports`) code into an `.mjs` file: Node treats
 * it as an ES Module, so `exports`/`require` are undefined and SCF reports
 * "0 code exit unexpected".
 *
 * This is an EVENT FUNCTION (事件函数), not a Web function. Function URL is
 * used only as the HTTP trigger; the platform converts the request into the
 * `event` argument and converts the returned { statusCode, headers, body }
 * object into the HTTP response.
 *
 * Deploy one copy per region and enable a Function URL for it. The status
 * server calls the URL with a single model check; the function performs the
 * real upstream request and returns a Site24x7-compatible current_status
 * payload so the server can reuse its existing parsing/insertion logic.
 *
 * The upstream request uses Node 20's built-in fetch (undici).
 * The optional SCF remaining-time API is guarded separately: a runtime
 * timing failure must not prevent the upstream probe from running.
 */

// SCF's ESM sandbox may not expose every Node global; import explicitly.
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

const DEFAULT_TARGET = 'https://emrank.tech/v1';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODEL_LENGTH = 200;
const FUNCTION_VERSION = 'fetch-v3';
// Tencent Cloud region id is returned as location_name; the status server
// stores by its own region id and uses data/regions.json for display labels.
// Keeping a display-name map here would duplicate that configuration.
const CHECK_TYPES = new Set(['model', 'rerank', 'systemone', 'decisions']);

const EMBEDDING_INPUT = '这是一段需要转换成向量的文本';
const RERANK_QUERY = 'Apple';
const RERANK_DOCUMENTS = ['apple', 'banana', 'fruit', 'vegetable'];
const DECISION_STATE = '商品包装有轻微划痕，内部完好';
const DECISION_QUESTIONS = {
	probe: { type: 'noul', instructions: '商品是否完好？' },
};

class HttpError extends Error {
	constructor(statusCode, message) {
		super(message);
		this.statusCode = statusCode;
	}
}

function isHttpEvent(event) {
	return Boolean(event && (event.httpMethod || event.requestContext || event.headers || event.queryString));
}

function normalizeHeaders(headers) {
	const out = {};
	if (!headers || typeof headers !== 'object') return out;
	for (const [key, value] of Object.entries(headers)) {
		out[String(key).toLowerCase()] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
	}
	return out;
}

function extractToken(headers) {
	const direct = headers['x-probe-token'];
	if (direct) return direct.trim();
	const authorization = headers.authorization || '';
	const match = authorization.match(/^Bearer\s+(.+)$/i);
	return match ? match[1].trim() : '';
}

// Constant-time comparison without loading node:crypto (smaller RSS).
function tokenMatches(provided, expected) {
	if (!provided || !expected) return false;
	const a = Buffer.from(provided, 'utf8');
	const b = Buffer.from(expected, 'utf8');
	const length = Math.max(a.length, b.length);
	let diff = a.length ^ b.length;
	for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	return diff === 0;
}

function assertAuthorized(event, headers) {
	const expected = (process.env.PROBE_TOKEN || '').trim();
	if (expected) {
		if (!tokenMatches(extractToken(headers), expected)) throw new HttpError(401, 'Invalid probe token');
		return;
	}
	// Refuse to expose an unauthenticated URL by default. Direct invocations
	// (local tests / console) are allowed; set PROBE_ALLOW_INSECURE=1 only in
	// throwaway environments.
	if (isHttpEvent(event) && process.env.PROBE_ALLOW_INSECURE !== '1') {
		throw new HttpError(503, 'PROBE_TOKEN is not configured');
	}
}

function readPayload(event) {
	if (!event || typeof event !== 'object') return {};
	if (event.body === undefined || event.body === null || event.body === '') {
		return isHttpEvent(event) ? {} : event;
	}
	if (typeof event.body === 'object') return event.body;
	if (typeof event.body !== 'string') throw new HttpError(400, 'Request body must be JSON');

	let raw = event.body;
	if (event.isBase64Encoded === true) raw = Buffer.from(raw, 'base64').toString('utf8');
	if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large');

	try {
		return JSON.parse(raw);
	} catch {
		throw new HttpError(400, 'Request body must be valid JSON');
	}
}

function validateCheck(input) {
	if (!input || typeof input !== 'object') throw new HttpError(400, 'Missing check');
	const type = String(input.type || '').trim();
	if (!CHECK_TYPES.has(type)) throw new HttpError(400, 'Unsupported check type');
	const model = String(input.model || '').trim();
	if (!model || model.length > MAX_MODEL_LENGTH) throw new HttpError(400, 'Model must contain 1-200 characters');
	const id = typeof input.id === 'string' ? input.id.slice(0, 300) : undefined;
	return { id, type, model };
}

function resolveTarget(raw) {
	const value = String(raw || DEFAULT_TARGET).trim();
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new HttpError(400, 'target must be a valid URL');
	}
	if (url.username || url.password) throw new HttpError(400, 'target must not contain credentials');
	const allowHttp = process.env.PROBE_ALLOW_HTTP === '1';
	if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
		throw new HttpError(400, 'target must use HTTPS');
	}
	const path = url.pathname.replace(/\/+$/, '');
	return `${url.origin}${path}`;
}

function contextRegion(context) {
	return String(
		context?.tencentcloud_region ||
			context?.environ?.TENCENTCLOUD_REGION ||
			context?.environment?.['TENCENTCLOUD_REGION'] ||
			process.env.TENCENTCLOUD_REGION ||
			'',
	).trim();
}

function resolveLocation(context, override) {
	const region = contextRegion(context);
	if (region) return region;
	// Only used for direct local invocation without a SCF context.
	const explicit = typeof override === 'string' ? override.trim() : '';
	return explicit || 'unknown';
}

function resolveTimeout(payloadTimeoutMs, context) {
	const configured = Number(payloadTimeoutMs ?? process.env.PROBE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
	const requested = Number.isFinite(configured) ? Math.round(configured) : DEFAULT_TIMEOUT_MS;
	const clamped = Math.min(Math.max(requested, 500), MAX_TIMEOUT_MS);
	let remaining = Infinity;
	try {
		if (typeof context?.getRemainingTimeInMillis === 'function') remaining = context.getRemainingTimeInMillis();
	} catch {
		// Some SCF runtimes fail here with "client.ms_elapsed is not a function".
		// This optional budget hint must not abort the probe before fetch runs.
		return clamped;
	}
	if (!Number.isFinite(remaining)) return clamped;
	// Keep a second for response serialization and platform cleanup.
	return Math.max(500, Math.min(clamped, remaining - 1000));
}

function buildRequest(check, target) {
	if (check.type === 'model') {
		return {
			url: `${target}/embeddings`,
			body: { model: check.model, input: EMBEDDING_INPUT, encoding_format: 'float' },
		};
	}
	if (check.type === 'rerank') {
		return {
			url: `${target}/rerank`,
			body: {
				model: check.model,
				query: RERANK_QUERY,
				documents: RERANK_DOCUMENTS,
				top_n: Math.min(4, RERANK_DOCUMENTS.length),
				return_documents: true,
			},
		};
	}
	return {
		url: `${target}/${check.type === 'systemone' ? 'systemone' : 'decisions'}`,
		body: { model: check.model, state: DECISION_STATE, questions: DECISION_QUESTIONS },
	};
}

function validateResponse(type, body) {
	if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON response' };
	if (type === 'model') {
		const embedding = body?.data?.[0]?.embedding;
		return Array.isArray(embedding) && embedding.length > 0
			? { ok: true, error: null }
			: { ok: false, error: 'Missing embedding data' };
	}
	if (type === 'rerank') {
		const items = Array.isArray(body?.results) ? body.results : Array.isArray(body?.data) ? body.data : null;
		return items && items.length > 0 ? { ok: true, error: null } : { ok: false, error: 'Missing rerank results' };
	}
	const answer = body?.answers?.probe;
	const valid =
		answer?.type === 'noul' &&
		typeof answer.noul === 'number' &&
		Number.isFinite(answer.noul) &&
		answer.noul >= 0 &&
		answer.noul <= 1;
	return valid
		? { ok: true, error: null }
		: { ok: false, error: 'Invalid decision response: expected answers.probe.noul in [0, 1]' };
}

function describeError(error, apiKey) {
	let message = error instanceof Error ? error.message : String(error);
	if (error?.cause && typeof error.cause.message === 'string' && error.cause.message) {
		message += `: ${error.cause.message}`;
	}
	if (apiKey) message = message.replaceAll(apiKey, '[redacted]');
	return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

/**
 * JSON-over-fetch using Node's built-in client, with a request timeout and
 * response size checks.
 */
async function requestJson(targetUrl, payload, apiKey, timeoutMs, checkType) {
	const encoded = JSON.stringify(payload);
	const started = Date.now();
	try {
		const response = await fetch(targetUrl, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
				accept: 'application/json',
				'user-agent': 'emrank-status-scf/1.0',
			},
			body: encoded,
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'follow',
		});
		const statusCode = response.status;
		if (statusCode < 200 || statusCode >= 300) {
			if (response.body) {
				try {
					await response.body.cancel();
				} catch {
					// ignore
				}
			}
			return { success: 0, statusCode, latencyMs: Date.now() - started, error: `HTTP ${statusCode}` };
		}
		const declaredLength = Number(response.headers.get('content-length') || 0);
		if (declaredLength > MAX_RESPONSE_BYTES) {
			if (response.body) {
				try {
					await response.body.cancel();
				} catch {
					// ignore
				}
			}
			return { success: 0, statusCode, latencyMs: Date.now() - started, error: 'Response body is too large' };
		}
		const raw = await response.text();
		if (raw.length > MAX_RESPONSE_BYTES) {
			return { success: 0, statusCode, latencyMs: Date.now() - started, error: 'Response body is too large' };
		}
		let body = null;
		try {
			body = raw ? JSON.parse(raw) : null;
		} catch {
			body = null;
		}
		const verdict = validateResponse(checkType, body);
		return {
			success: verdict.ok ? 1 : 0,
			statusCode,
			latencyMs: Date.now() - started,
			error: verdict.error,
		};
	} catch (error) {
		const message = error?.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : describeError(error, apiKey);
		return { success: 0, statusCode: null, latencyMs: Date.now() - started, error: message };
	}
}

async function runProbe(check, target, apiKey, timeoutMs) {
	const request = buildRequest(check, target);
	return requestJson(request.url, request.body, apiKey, timeoutMs, check.type);
}

function functionMeta(context) {
	return {
		region: contextRegion(context) || null,
		function: (process.env.SCF_FUNCTIONNAME || '').trim() || null,
		request_id: context?.request_id || null,
		version: FUNCTION_VERSION,
	};
}

function httpResponse(statusCode, payload) {
	return {
		statusCode,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
		},
		body: JSON.stringify(payload),
	};
}

async function main_handler(event, context) {
	const headers = normalizeHeaders(event?.headers);
	const method = String(event?.httpMethod || event?.requestContext?.http?.method || 'POST').toUpperCase();

	if (method === 'OPTIONS') return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
	if (method === 'GET' || method === 'HEAD') {
		return httpResponse(200, { code: 0, message: 'probe function ready', data: null, meta: functionMeta(context) });
	}

	try {
		assertAuthorized(event, headers);
		const payload = readPayload(event);
		const check = validateCheck(payload.check);
		const apiKey = String(payload.apiKey || '').trim();
		if (!apiKey) throw new HttpError(400, 'apiKey is required in the event payload');
		const target = resolveTarget(payload.target ?? DEFAULT_TARGET);
		const location = resolveLocation(context, payload.locationName);
		const timeoutMs = resolveTimeout(payload.timeoutMs, context);

		const result = await runProbe(check, target, apiKey, timeoutMs);
		const polledAt = new Date().toISOString();
		// Site24x7 current_status-compatible shape. One function invocation is
		// one region, so locations always contains exactly one entry.
		const data = {
			status: result.success,
			last_polled_time: polledAt,
			attribute_value: result.latencyMs,
			unit: 'ms',
			down_reason: result.success === 1 ? null : result.error,
			locations: [
				{
					location_name: location,
					status: result.success,
					last_polled_time: polledAt,
					attribute_value: result.latencyMs,
				},
			],
		};

		console.log(
			JSON.stringify({
				level: 'info',
				event: 'probe',
				request_id: context?.request_id || null,
				check_id: check.id || null,
				type: check.type,
				model: check.model,
				location,
				success: result.success,
				status_code: result.statusCode,
				latency_ms: result.latencyMs,
				error: result.error,
			}),
		);

		return httpResponse(200, {
			code: 0,
			message: 'success',
			data,
			meta: { ...functionMeta(context), location },
		});
	} catch (error) {
		if (error instanceof HttpError) {
			return httpResponse(error.statusCode, { code: 1, message: error.message, data: null });
		}
		const message = error instanceof Error ? error.message : String(error);
		const detail = message.slice(0, 300);
		console.error(JSON.stringify({ level: 'error', event: 'probe_failed', version: FUNCTION_VERSION, message: detail }));
		return httpResponse(500, { code: 1, message: 'Probe function failed', detail, version: FUNCTION_VERSION, data: null });
	}
}

export {
	HttpError,
	buildRequest,
	normalizeHeaders,
	resolveLocation,
	resolveTarget,
	resolveTimeout,
	validateCheck,
	validateResponse,
	main_handler,
};
