/**
 * Map a model id (as the router reports it) to the brand whose logo should sit
 * beside it. Ids look like `org/name`, `Pro/org/name`, `name[tag]` or a bare
 * name, so matching runs most-specific first:
 *   1. the model family in the name    (bge → BAAI, qwen → Qwen, voyage → Voyage)
 *   2. the org segment of the id       (BAAI/…, openai/…, deepseek-ai/…)
 *   3. nothing matched                 → null, the UI draws a neutral glyph
 * A family rule wins over the org so that `Pro/BAAI/bge-m3` or a model hosted
 * under a reseller's org still shows the lab that made it.
 */
export type BrandKey =
	| 'openai'
	| 'baai'
	| 'qwen'
	| 'voyage'
	| 'cohere'
	| 'jina'
	| 'gemini'
	| 'gemma'
	| 'google'
	| 'deepseek'
	| 'mistral'
	| 'meta'
	| 'nvidia'
	| 'zhipu'
	| 'kimi'
	| 'moonshot'
	| 'minimax'
	| 'doubao'
	| 'bytedance'
	| 'hunyuan'
	| 'claude'
	| 'grok'
	| 'typesafeai'
	| 'huggingface'
	| 'snowflake'
	| 'microsoft'
	| 'ibm'
	| 'yi'
	| 'wenxin'
	| 'stepfun'
	| 'baichuan'
	| 'internlm'
	| 'alibaba'
	| 'aws'
	| 'nomic'
	| 'mixedbread';

export type Brand = { key: BrandKey; name: string };

const BRAND_NAMES: Record<BrandKey, string> = {
	openai: 'OpenAI',
	baai: 'BAAI',
	qwen: 'Qwen',
	voyage: 'Voyage AI',
	cohere: 'Cohere',
	jina: 'Jina AI',
	gemini: 'Gemini',
	gemma: 'Gemma',
	google: 'Google',
	deepseek: 'DeepSeek',
	mistral: 'Mistral AI',
	meta: 'Meta',
	nvidia: 'NVIDIA',
	zhipu: '智谱 GLM',
	kimi: 'Kimi',
	moonshot: 'Moonshot AI',
	minimax: 'MiniMax',
	doubao: '豆包',
	bytedance: 'ByteDance',
	hunyuan: '腾讯混元',
	claude: 'Claude',
	grok: 'Grok',
	typesafeai: 'TypeSafe AI',
	huggingface: 'Hugging Face',
	snowflake: 'Snowflake',
	microsoft: 'Microsoft',
	ibm: 'IBM',
	yi: '零一万物',
	wenxin: '文心',
	stepfun: '阶跃星辰',
	baichuan: '百川',
	internlm: 'InternLM',
	alibaba: 'Alibaba',
	aws: 'Amazon',
	nomic: 'Nomic AI',
	mixedbread: 'Mixedbread',
};

/** Model-family keywords, matched against the name part (after the last `/`). Order matters. */
const FAMILY_RULES: Array<[RegExp, BrandKey]> = [
	// OpenAI embeddings are `text-embedding-3-*` / `-ada-002`; Google uses `text-embedding-00N`, so be exact.
	[/^(text-embedding-3-|text-embedding-ada|text-similarity-|gpt-|o[1-9](-|$)|chatgpt|davinci|babbage|whisper|dall-e|tts-)/, 'openai'],
	[/^bge|^bce-|^aquila/, 'baai'],
	[/^qwen|^qwq|^gte-qwen/, 'qwen'],
	[/^gte-|^text-embedding-v\d/, 'alibaba'],
	[/^voyage/, 'voyage'],
	[/^embed-(english|multilingual|v\d)|^rerank-(english|multilingual|v\d)|^command|^aya/, 'cohere'],
	[/^jina/, 'jina'],
	[/^gemini|^text-embedding-00\d|^embedding-001|^text-multilingual-embedding/, 'gemini'],
	[/^gemma|^embeddinggemma/, 'gemma'],
	[/^deepseek/, 'deepseek'],
	[/^(mistral|mixtral|codestral|ministral|pixtral|magistral|devstral)/, 'mistral'],
	[/^(llama|meta-llama|code-llama)/, 'meta'],
	[/^(nv-|nvidia|llama-\d.*-nemotron|nemotron)/, 'nvidia'],
	[/^(glm|chatglm|cogview|cogvideo|embedding-[23]$)/, 'zhipu'],
	[/^kimi/, 'kimi'],
	[/^moonshot/, 'moonshot'],
	[/^(minimax|abab)/, 'minimax'],
	[/^doubao/, 'doubao'],
	[/^hunyuan/, 'hunyuan'],
	[/^claude/, 'claude'],
	[/^grok/, 'grok'],
	[/^jev-|^typesafe/, 'typesafeai'],
	[/^arctic-embed|^snowflake/, 'snowflake'],
	[/^(phi-|e5-|multilingual-e5)/, 'microsoft'],
	[/^granite/, 'ibm'],
	[/^yi-/, 'yi'],
	[/^(ernie|wenxin)/, 'wenxin'],
	[/^step-/, 'stepfun'],
	[/^baichuan/, 'baichuan'],
	[/^internlm|^internvl/, 'internlm'],
	[/^(titan|amazon\.|nova-)/, 'aws'],
	[/^nomic-/, 'nomic'],
	[/^mxbai-/, 'mixedbread'],
];

/** Organisation segments (any `/`-separated part before the name). */
const ORG_RULES: Record<string, BrandKey> = {
	openai: 'openai',
	baai: 'baai',
	qwen: 'qwen',
	alibaba: 'alibaba',
	'alibaba-nlp': 'alibaba',
	voyage: 'voyage',
	voyageai: 'voyage',
	cohere: 'cohere',
	jinaai: 'jina',
	jina: 'jina',
	google: 'gemini',
	'google-ai': 'gemini',
	deepseek: 'deepseek',
	'deepseek-ai': 'deepseek',
	mistral: 'mistral',
	mistralai: 'mistral',
	'meta-llama': 'meta',
	meta: 'meta',
	nvidia: 'nvidia',
	thudm: 'zhipu',
	zhipuai: 'zhipu',
	'zai-org': 'zhipu',
	moonshotai: 'kimi',
	minimaxai: 'minimax',
	bytedance: 'bytedance',
	tencent: 'hunyuan',
	anthropic: 'claude',
	xai: 'grok',
	typesafe: 'typesafeai',
	snowflake: 'snowflake',
	microsoft: 'microsoft',
	'intfloat': 'microsoft',
	ibm: 'ibm',
	'ibm-granite': 'ibm',
	'01-ai': 'yi',
	baidu: 'wenxin',
	stepfun: 'stepfun',
	'stepfun-ai': 'stepfun',
	'baichuan-inc': 'baichuan',
	'internlm': 'internlm',
	'shanghai_ai_laboratory': 'internlm',
	amazon: 'aws',
	'nomic-ai': 'nomic',
	'mixedbread-ai': 'mixedbread',
	'sentence-transformers': 'huggingface',
	huggingface: 'huggingface',
};

/** Brands the icon set has no logo for: we still name them, and draw a lettered tile. */
export const BRANDS_WITHOUT_LOGO: ReadonlySet<BrandKey> = new Set(['nomic', 'mixedbread']);

const cache = new Map<string, Brand | null>();

export function brandFor(modelId: string): Brand | null {
	const cached = cache.get(modelId);
	if (cached !== undefined) return cached;
	const clean = modelId.trim().replace(/\[[^\]]*\]$/, '').toLowerCase();
	const parts = clean.split('/').filter(Boolean);
	const name = parts.at(-1) ?? '';
	const orgs = parts.slice(0, -1);
	let key: BrandKey | null = null;
	for (const [pattern, brand] of FAMILY_RULES) {
		if (pattern.test(name)) {
			key = brand;
			break;
		}
	}
	if (!key) for (const org of [...orgs].reverse()) if (ORG_RULES[org]) {
		key = ORG_RULES[org];
		break;
	}
	const result = key ? { key, name: BRAND_NAMES[key] } : null;
	cache.set(modelId, result);
	return result;
}
