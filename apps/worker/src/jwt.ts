function base64UrlEncode(data: ArrayBuffer | string): string {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	const b64 = btoa(binary);
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(b64url: string): string {
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
	const binary = atob(b64 + pad);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return base64UrlEncode(sig);
}

export type JwtPayload = {
	sub: string;
	iat: number;
	exp: number;
};

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
	const header = { alg: 'HS256', typ: 'JWT' };
	const headerB64 = base64UrlEncode(JSON.stringify(header));
	const payloadB64 = base64UrlEncode(JSON.stringify(payload));
	const signingInput = `${headerB64}.${payloadB64}`;
	const sigB64 = await hmacSha256Base64Url(secret, signingInput);
	return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [headerB64, payloadB64, sigB64] = parts;
	const signingInput = `${headerB64}.${payloadB64}`;
	const expected = await hmacSha256Base64Url(secret, signingInput);
	if (!timingSafeEqual(sigB64, expected)) return null;

	let payload: unknown;
	try {
		payload = JSON.parse(base64UrlDecodeToString(payloadB64));
	} catch {
		return null;
	}

	if (
		!payload ||
		typeof payload !== 'object' ||
		typeof (payload as any).sub !== 'string' ||
		typeof (payload as any).iat !== 'number' ||
		typeof (payload as any).exp !== 'number'
	) {
		return null;
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	if ((payload as any).exp <= nowSeconds) return null;
	return payload as JwtPayload;
}

