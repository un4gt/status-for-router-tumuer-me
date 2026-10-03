import OpenAI from 'openai';
import { getCheckById, insertResult, listChecks, type Services } from './db';

const EMBEDDING_INPUT = '这是一段需要转换成向量的文本';
const MODEL_CONCURRENCY = 3;
const RERANK_QUERY = 'Apple';
const RERANK_DOCUMENTS = ['apple', 'banana', 'fruit', 'vegetable'];

function errorMessage(err: unknown): string {
	const msg = (() => {
		if (!err) return 'Unknown error';
		if (typeof err === 'string') return err;
		if (err instanceof Error) return err.message;
		try {
			return JSON.stringify(err);
		} catch {
			return String(err);
		}
	})();
	return msg;
}

function safeError(message: string | null, apiKey: string): string | null {
	if (message === null) return null;
	const redacted = apiKey ? message.replaceAll(apiKey, '[redacted]') : message;
	return redacted.length > 2000 ? `${redacted.slice(0, 2000)}…` : redacted;
}

function getErrorStatusCode(err: unknown): number | null {
	const e = err as any;
	const status = e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.cause?.status;
	return typeof status === 'number' ? status : null;
}

async function headCheck(url: string, timeoutMs: number) {
	const start = performance.now();
	let statusCode: number | null = null;
	let success: 0 | 1 = 0;
	let error: string | null = null;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
	try {
		const resp = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
		statusCode = resp.status;
		success = resp.status >= 200 && resp.status < 400 ? 1 : 0;
		if (!success) error = `HTTP ${resp.status}`;
	} catch (err) {
		error = errorMessage(err);
	} finally {
		clearTimeout(timeout);
	}

	return { success, statusCode, latencyMs: Math.round(performance.now() - start), error };
}

async function modelEmbeddingCheck(
	client: OpenAI,
	model: string,
	timeoutMs: number,
): Promise<{ success: 0 | 1; latencyMs: number; error: string | null; statusCode: number | null }> {
	const start = performance.now();
	let success: 0 | 1 = 0;
	let error: string | null = null;
	let statusCode: number | null = null;

	try {
		// openai SDK supports `timeout` at client level; still wrap to reliably enforce upper bound.
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
		try {
			const resp = await client.embeddings.create(
				{
					model,
					input: EMBEDDING_INPUT,
					encoding_format: 'float',
				},
				{ signal: controller.signal } as any,
			);

			const embedding = (resp as any)?.data?.[0]?.embedding;
			success = Array.isArray(embedding) && embedding.length > 0 ? 1 : 0;
			if (!success) error = 'Missing embedding data';
		} finally {
			clearTimeout(timeout);
		}
	} catch (err) {
		error = errorMessage(err);
		statusCode = getErrorStatusCode(err);
	}

	return { success, latencyMs: Math.round(performance.now() - start), error, statusCode };
}

async function modelRerankCheck(
	routerBaseUrl: string,
	apiKey: string,
	model: string,
	timeoutMs: number,
): Promise<{ success: 0 | 1; latencyMs: number; error: string | null; statusCode: number | null }> {
	const start = performance.now();
	let success: 0 | 1 = 0;
	let error: string | null = null;
	let statusCode: number | null = null;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
	try {
		const base = routerBaseUrl.replace(/\/+$/, '');
		const resp = await fetch(`${base}/rerank`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				query: RERANK_QUERY,
				documents: RERANK_DOCUMENTS,
				top_n: Math.min(4, RERANK_DOCUMENTS.length),
				return_documents: true,
				max_chunks_per_doc: 1024,
				overlap_tokens: 80,
			}),
			signal: controller.signal,
		});

		statusCode = resp.status;
		if (!resp.ok) {
			error = `HTTP ${resp.status}`;
			success = 0;
			return { success, latencyMs: Math.round(performance.now() - start), error, statusCode };
		}

		const json = await resp.json().catch(() => null);
		const items = Array.isArray((json as any)?.results)
			? (json as any).results
			: Array.isArray((json as any)?.data)
				? (json as any).data
				: null;

		success = Array.isArray(items) && items.length > 0 ? 1 : 0;
		if (!success) error = 'Missing rerank results';
	} catch (err) {
		error = errorMessage(err);
	} finally {
		clearTimeout(timeout);
	}

	return { success, latencyMs: Math.round(performance.now() - start), error, statusCode };
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
	let index = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const current = index++;
			if (current >= items.length) return;
			await fn(items[current]);
		}
	});
	const outcomes = await Promise.allSettled(workers);
	const failure = outcomes.find((result) => result.status === 'rejected');
	if (failure?.status === 'rejected') throw failure.reason;
}

export async function runAllChecks(services: Services, opts?: { triggeredBy: 'scheduled' | 'manual' }) {
	const { headCheckUrl, routerBaseUrl } = services.config;

	const checks = listChecks(services);
	const enabled = checks.filter((c) => c.enabled === 1);

	// HEAD check
	const head = enabled.find((c) => c.id === 'head:router');
	if (head) {
		const ts = Date.now();
		const res = await headCheck(headCheckUrl, 15_000);
		insertResult(services, {
			check_id: head.id,
			ts,
			success: res.success,
			status_code: res.statusCode,
			latency_ms: res.latencyMs,
			error: safeError(res.error, services.config.apiKey),
		});
	}

	// MODEL checks
	const apiKey = services.config.apiKey;
	if (!apiKey) {
		for (const check of enabled.filter((c) => (c.type === 'model' || c.type === 'rerank') && c.model)) {
			const ts = Date.now();
			insertResult(services, {
				check_id: check.id,
				ts,
				success: 0,
				status_code: null,
				latency_ms: null,
				error: 'OPENAI_API_KEY not set',
			});
		}
		return { ok: true, ts: Date.now(), triggeredBy: opts?.triggeredBy ?? 'manual' };
	}

	const client = new OpenAI({ apiKey, baseURL: routerBaseUrl, timeout: 15_000 });
	const modelChecks = enabled.filter((c) => c.type === 'model' && c.model);
	await mapWithConcurrency(modelChecks, MODEL_CONCURRENCY, async (check) => {
		if (!getCheckById(services, check.id)?.enabled) return;
		const ts = Date.now();
		const res = await modelEmbeddingCheck(client, check.model!, 15_000);
		insertResult(services, {
			check_id: check.id,
			ts,
			success: res.success,
			status_code: res.statusCode,
			latency_ms: res.latencyMs,
			error: safeError(res.error, services.config.apiKey),
		});
	});

	const rerankChecks = enabled.filter((c) => c.type === 'rerank' && c.model);
	await mapWithConcurrency(rerankChecks, MODEL_CONCURRENCY, async (check) => {
		if (!getCheckById(services, check.id)?.enabled) return;
		const ts = Date.now();
		const res = await modelRerankCheck(routerBaseUrl, apiKey, check.model!, 15_000);
		insertResult(services, {
			check_id: check.id,
			ts,
			success: res.success,
			status_code: res.statusCode,
			latency_ms: res.latencyMs,
			error: safeError(res.error, services.config.apiKey),
		});
	});

	return { ok: true, ts: Date.now(), triggeredBy: opts?.triggeredBy ?? 'manual' };
}
