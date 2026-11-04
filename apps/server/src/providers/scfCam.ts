import { createHash, createHmac } from 'node:crypto';

export type ScfCamCredentials = {
	secretId: string;
	secretKey: string;
	uin: string;
	token: string;
};

export function scfCamConfigError(credentials: ScfCamCredentials): string | null {
	const missing = [
		!credentials.secretId && 'TENCENTCLOUD_SECRET_ID',
		!credentials.secretKey && 'TENCENTCLOUD_SECRET_KEY',
		!credentials.uin && 'TENCENTCLOUD_UIN',
	].filter(Boolean);
	if (missing.length) return `云函数 CAM 缺少配置：${missing.join(', ')}`;
	if (!/^\d+$/.test(credentials.uin)) return 'TENCENTCLOUD_UIN 必须是主账户 UIN（数字字符串）';
	return null;
}

/** Sign the exact POST body sent to a Function URL using Tencent's SCF CAM protocol. */
export function signScfCamRequest(
	functionUrl: string,
	payload: string,
	credentials: ScfCamCredentials,
	timestamp = Math.floor(Date.now() / 1000),
): Record<string, string> {
	const configError = scfCamConfigError(credentials);
	if (configError) throw new Error(configError);
	const url = new URL(functionUrl);
	// This integration invokes the Function URL root, as in Tencent's CAM example.
	// Reject unsupported URLs instead of signing a different path or following redirects.
	if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
		throw new Error('CAM 云函数 probe_url 必须为 HTTPS 根地址，不含路径、查询参数或片段');
	}
	if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid CAM timestamp');
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
	const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
	const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value, 'utf8').digest();
	const signedHeaders = 'content-type;host';
	const canonicalHeaders = `content-type:application/json\nhost:${url.host}\n`;
	const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hash(payload)].join('\n');
	const scope = `${date}/scf/tc3_request`;
	const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, hash(canonicalRequest)].join('\n');
	const dateKey = hmac(`TC3${credentials.secretKey}`, date);
	const serviceKey = hmac(dateKey, 'scf');
	const signingKey = hmac(serviceKey, 'tc3_request');
	const signature = hmac(signingKey, stringToSign).toString('hex');
	return {
		'content-type': 'application/json',
		host: url.host,
		authorization: `TC3-HMAC-SHA256 Credential=${credentials.secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
		'x-scf-cam-uin': credentials.uin,
		'x-scf-cam-timestamp': String(timestamp),
		...(credentials.token ? { 'x-scf-cam-token': credentials.token } : {}),
	};
}
