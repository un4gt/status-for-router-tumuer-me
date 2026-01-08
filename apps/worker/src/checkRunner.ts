import OpenAI from 'openai';
import { DEFAULT_MODELS, type Env, getConfig } from './env';
import { insertResult, listChecks, upsertCheck } from './db';

const EMBEDDING_INPUT = '这是一段需要转换成向量的文本';
const MODEL_CONCURRENCY = 3;

function clampErrorMessage(err: unknown, maxLen = 2000): string {
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
	return msg.length > maxLen ? `${msg.slice(0, maxLen)}…` : msg;
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
		error = clampErrorMessage(err);
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
		error = clampErrorMessage(err);
		statusCode = getErrorStatusCode(err);
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
	await Promise.all(workers);
}

export async function ensureDefaultChecks(env: Env) {
	const { headCheckUrl, routerBaseUrl } = getConfig(env);
	await upsertCheck(env, { id: 'head:router', type: 'head', target: headCheckUrl, model: null });
	for (const model of DEFAULT_MODELS) {
		await upsertCheck(env, { id: `model:${model}`, type: 'model', target: routerBaseUrl, model });
	}
}

export async function runAllChecks(env: Env, opts?: { triggeredBy: 'scheduled' | 'manual' }) {
	const { headCheckUrl, routerBaseUrl } = getConfig(env);

	await ensureDefaultChecks(env);

	const checks = await listChecks(env);
	const enabled = checks.filter((c) => c.enabled === 1);

	// HEAD check
	const head = enabled.find((c) => c.id === 'head:router');
	if (head) {
		const ts = Date.now();
		const res = await headCheck(headCheckUrl, 15_000);
		await insertResult(env, {
			check_id: head.id,
			ts,
			success: res.success,
			status_code: res.statusCode,
			latency_ms: res.latencyMs,
			error: res.error,
		});
	}

	// MODEL checks
	const apiKey = env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		for (const check of enabled.filter((c) => c.type === 'model' && c.model)) {
			const ts = Date.now();
			await insertResult(env, {
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
		const ts = Date.now();
		const res = await modelEmbeddingCheck(client, check.model!, 15_000);
		await insertResult(env, {
			check_id: check.id,
			ts,
			success: res.success,
			status_code: res.statusCode,
			latency_ms: res.latencyMs,
			error: res.error,
		});
	});

	return { ok: true, ts: Date.now(), triggeredBy: opts?.triggeredBy ?? 'manual' };
}
