import { expect, test } from 'bun:test';
import { brandFor } from '../src/modelBrand';

const key = (id: string) => brandFor(id)?.key ?? null;

test('every model currently on status.emrank.tech resolves to its lab', () => {
	const production: Record<string, string> = {
		'BAAI/bge-base-en-v1.5': 'baai',
		'BAAI/bge-large-en-v1.5': 'baai',
		'BAAI/bge-m3': 'baai',
		'BAAI/bge-small-en-v1.5': 'baai',
		'openai/text-embedding-3-large[official]': 'openai',
		'openai/text-embedding-3-small': 'openai',
		'openai/text-embedding-3-small[official]': 'openai',
		'Qwen/Qwen3-Embedding-0.6B': 'qwen',
		'Qwen/Qwen3-Embedding-8B': 'qwen',
		'Qwen/Qwen3-Reranker-8B': 'qwen',
		'voyage/voyage-3-lite': 'voyage',
		'voyage/voyage-4': 'voyage',
		'voyage/voyage-4-large': 'voyage',
		'voyage/voyage-4-lite': 'voyage',
		'voyage/voyage-code-2': 'voyage',
		'voyage/voyage-code-3': 'voyage',
	};
	for (const [id, brand] of Object.entries(production)) expect([id, key(id)]).toEqual([id, brand]);
});

test('the model family beats the hosting org, and nested reseller prefixes are ignored', () => {
	expect(key('Pro/BAAI/bge-reranker-v2-m3')).toBe('baai');
	expect(key('siliconflow/Qwen/Qwen2.5-7B-Instruct')).toBe('qwen');
	expect(key('typesafe/jev-latest')).toBe('typesafeai');
	expect(key('text-embedding-004')).toBe('gemini');
	expect(key('embedding-001')).toBe('gemini');
	expect(key('deepseek-ai/DeepSeek-V3')).toBe('deepseek');
	expect(key('meta-llama/Llama-3.1-8B-Instruct')).toBe('meta');
	expect(key('jinaai/jina-embeddings-v3')).toBe('jina');
	expect(key('Alibaba-NLP/gte-large-en-v1.5')).toBe('alibaba');
	expect(key('Alibaba-NLP/gte-Qwen2-7B-instruct')).toBe('qwen');
	expect(key('intfloat/multilingual-e5-large')).toBe('microsoft');
	expect(key('Snowflake/snowflake-arctic-embed-l')).toBe('snowflake');
	expect(key('embed-multilingual-v3.0')).toBe('cohere');
	expect(key('nomic-ai/nomic-embed-text-v1.5')).toBe('nomic');
	expect(key('mixedbread-ai/mxbai-embed-large-v1')).toBe('mixedbread');
	expect(key('THUDM/glm-4-9b-chat')).toBe('zhipu');
	expect(key('gpt-4o-mini')).toBe('openai');
	expect(key('claude-3-5-sonnet')).toBe('claude');
});

test('unknown ids return null instead of guessing', () => {
	expect(brandFor('acme/super-embed-1')).toBeNull();
	expect(brandFor('')).toBeNull();
	expect(brandFor('my-custom-model')).toBeNull();
});
