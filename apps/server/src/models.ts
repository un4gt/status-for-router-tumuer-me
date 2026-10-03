import type { Config, ModelType } from './config';

export type ModelCandidate = {
	id: string;
	detected_type: ModelType | null;
	suggested_type: ModelType | null;
	unsupported: boolean;
};
export class ModelSyncError extends Error {
	constructor(
		message: string,
		public status: 502 | 503 | 504,
	) {
		super(message);
	}
}

const EMBEDDING_TYPES = new Set(['embedding', 'embeddings', 'text-embedding', 'feature-extraction', '/embeddings', '/v1/embeddings']);
const RERANK_TYPES = new Set(['rerank', 'reranker', 'reranking', 'text-reranking', '/rerank', '/v1/rerank']);
const OTHER_TYPES = new Set([
	'chat',
	'chat-completion',
	'chat-completions',
	'completion',
	'completions',
	'text-generation',
	'image',
	'audio',
	'video',
	'/chat/completions',
	'/v1/chat/completions',
]);

function metadataValues(value: unknown): string[] {
	if (typeof value === 'string') return [value.toLowerCase().trim().replaceAll('_', '-')];
	if (Array.isArray(value)) return value.flatMap(metadataValues);
	if (value && typeof value === 'object') {
		return Object.entries(value)
			.filter(([, enabled]) => enabled === true)
			.map(([key]) => key.toLowerCase().replaceAll('_', '-'));
	}
	return [];
}

export function classifyModel(model: Record<string, unknown>): ModelCandidate {
	const id = String(model.id);
	const values = ['type', 'model_type', 'task', 'capabilities', 'supported_endpoints', 'supported_endpoint_types'].flatMap((field) =>
		metadataValues(model[field]),
	);
	const embedding = values.some((value) => EMBEDDING_TYPES.has(value));
	const rerank = values.some((value) => RERANK_TYPES.has(value));
	const detected_type = embedding !== rerank ? (embedding ? 'model' : 'rerank') : null;
	const unsupported = !embedding && !rerank && values.some((value) => OTHER_TYPES.has(value));
	const suggested_type = /rerank/i.test(id) ? 'rerank' : /embed|(?:^|\/)bge-m3$/i.test(id) ? 'model' : null;
	return { id, detected_type, suggested_type: unsupported ? null : suggested_type, unsupported };
}

export async function discoverModels(config: Config, request: typeof fetch = fetch, timeoutMs = 15_000): Promise<ModelCandidate[]> {
	if (!config.apiKey) throw new ModelSyncError('请先在 .env 中配置 OPENAI_API_KEY 并重启服务', 503);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await request(`${config.routerBaseUrl}/models`, {
			headers: { authorization: `Bearer ${config.apiKey}` },
			signal: controller.signal,
			redirect: 'error',
		});
		if (!response.ok) throw new ModelSyncError(`上游模型列表请求失败（HTTP ${response.status}），请检查地址、密钥和权限`, 502);
		const body = await response.json();
		if (
			!body ||
			!Array.isArray(body.data) ||
			body.data.some((model: unknown) => !model || typeof model !== 'object' || typeof (model as { id?: unknown }).id !== 'string')
		) {
			throw new ModelSyncError('上游模型列表格式无效，预期为 { data: [{ id: string }] }', 502);
		}
		const models = new Map<string, ModelCandidate>();
		for (const model of body.data) {
			const id = model.id.trim();
			if (!id || id.length > 200) continue;
			models.set(id, classifyModel({ ...model, id }));
		}
		return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
	} catch (error) {
		if (error instanceof ModelSyncError) throw error;
		if (controller.signal.aborted) throw new ModelSyncError('上游模型列表请求超时，请重试', 504);
		throw new ModelSyncError('无法获取上游模型列表，请检查地址和网络连接', 502);
	} finally {
		clearTimeout(timeout);
	}
}
