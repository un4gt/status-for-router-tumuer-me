import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export type CheckType = 'head' | 'model' | 'rerank';
export type ModelType = Exclude<CheckType, 'head'>;

export function parseIntervalSeconds(raw: string | undefined): number | null {
	const match = raw
		?.trim()
		.toLowerCase()
		.match(/^(\d+(?:\s*\*\s*\d+)*)\s*([smhd])?$/);
	if (!match) return null;
	const value = match[1].split('*').reduce((total, part) => total * Number(part.trim()), 1);
	const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
	const seconds = value * units[match[2] || 's'];
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function httpUrl(value: string, name: string): string {
	try {
		const url = new URL(value);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
		return value;
	} catch {
		throw new Error(`${name} must be an HTTP(S) URL without embedded credentials`);
	}
}

export function loadConfig(env: Record<string, string | undefined> = process.env) {
	const required = (name: string) => {
		const value = env[name];
		if (!value?.trim()) throw new Error(`${name} must be configured in .env`);
		return value;
	};
	const port = Number(env.PORT || 8787);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
	if (env.TRUST_PROXY && !['true', 'false'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be true or false');
	return {
		adminUsername: required('ADMIN_USERNAME').trim(),
		adminPassword: required('ADMIN_PASSWORD'),
		sessionSecret: required('SESSION_SECRET'),
		apiKey: env.OPENAI_API_KEY?.trim() || '',
		routerBaseUrl: httpUrl(env.ROUTER_BASE_URL?.trim() || 'https://router.tumuer.me/v1', 'ROUTER_BASE_URL').replace(/\/+$/, ''),
		headCheckUrl: httpUrl(env.HEAD_CHECK_URL?.trim() || 'https://router.tumuer.me/', 'HEAD_CHECK_URL'),
		checkIntervalSeconds: parseIntervalSeconds(env.CHECK_INTERVAL_SECONDS) ?? 3600,
		databasePath: resolve(PROJECT_ROOT, env.DATABASE_PATH || './data/status.sqlite'),
		host: env.HOST?.trim() || '127.0.0.1',
		port,
		trustProxy: env.TRUST_PROXY === 'true',
	};
}

export type Config = ReturnType<typeof loadConfig>;
