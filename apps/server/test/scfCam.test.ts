import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config';
import { scfCamConfigError, signScfCamRequest } from '../src/providers/scfCam';
import { temporaryDirectory } from './helpers';

const credentials = { secretId: 'AKID-test', secretKey: 'test-secret-key', uin: '123456789', token: '' };
const endpoint = 'https://1253970226-example-cq.scf.tencentcs.com/';
const payload = '{"check":{"type":"model","model":"测试/embedding"},"apiKey":"test-api-key"}';
const timestamp = 1551113065;

describe('SCF Function URL CAM signing', () => {
	test('matches an independently calculated TC3 signature for a UTF-8 body', () => {
		const headers = signScfCamRequest(endpoint, payload, credentials, timestamp);
		// Python hashlib/hmac reference using Tencent's published canonical request format.
		expect(headers.authorization).toBe(
			'TC3-HMAC-SHA256 Credential=AKID-test/2019-02-25/scf/tc3_request, SignedHeaders=content-type;host, Signature=94e640d0b440f808543666da140d0cc8200cea35c02d7206bd4c5bb26d022c3c',
		);
		expect(headers['x-scf-cam-uin']).toBe('123456789');
		expect(headers['x-scf-cam-timestamp']).toBe('1551113065');
		expect(headers['x-scf-cam-token']).toBeUndefined();
		expect(headers.host).toBe(new URL(endpoint).host);
		expect(headers['content-type']).toBe('application/json');
	});

	test('binds the signature to the host, exact body bytes, and timestamp', () => {
		const original = signScfCamRequest(endpoint, payload, credentials, timestamp).authorization;
		expect(signScfCamRequest('https://another.tencentscf.com', payload, credentials, timestamp).authorization).not.toBe(original);
		expect(signScfCamRequest(endpoint, payload + ' ', credentials, timestamp).authorization).not.toBe(original);
		expect(signScfCamRequest(endpoint, payload, credentials, timestamp + 1).authorization).not.toBe(original);
	});

	test('uses UTC credential dates and transmits an optional temporary token', () => {
		const midnight = Date.parse('2026-11-05T00:00:00Z') / 1000;
		expect(signScfCamRequest(endpoint, payload, credentials, midnight - 1).authorization).toContain('/2026-11-04/scf/');
		const headers = signScfCamRequest(endpoint, payload, { ...credentials, token: 'sts-token' }, midnight);
		expect(headers.authorization).toContain('/2026-11-05/scf/');
		expect(headers['x-scf-cam-token']).toBe('sts-token');
	});

	test('rejects incomplete credentials and unsupported URLs rather than sending unsigned', () => {
		for (const field of ['secretId', 'secretKey', 'uin'] as const) {
			expect(() => signScfCamRequest(endpoint, payload, { ...credentials, [field]: '' }, timestamp)).toThrow('CAM');
		}
		expect(scfCamConfigError({ ...credentials, uin: 'not-a-uin' })).toContain('UIN');
		for (const url of ['http://probe.test/', 'https://probe.test/path', 'https://probe.test/?a=1', 'https://probe.test/#x', 'https://user:pass@probe.test/']) {
			expect(() => signScfCamRequest(url, payload, credentials, timestamp)).toThrow('HTTPS');
		}
	});

	test('loads CAM environment variables without exposing configured status for partial credentials', () => {
		const regionsPath = join(temporaryDirectory(), 'regions.json');
		writeFileSync(regionsPath, JSON.stringify([{ id: 'tokyo', label: '东京', globalping: 'Tokyo+JP', probe_url: endpoint }]));
		const env = {
			ADMIN_USERNAME: 'operator', ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'test-session',
			OPENAI_API_KEY: 'test-api-key', MONITOR_REGIONS_FILE: regionsPath,
			TENCENTCLOUD_SECRET_ID: credentials.secretId, TENCENTCLOUD_SECRET_KEY: credentials.secretKey,
			TENCENTCLOUD_UIN: credentials.uin, TENCENTCLOUD_TOKEN: 'temporary-token',
		};
		expect(loadConfig(env).cloudProbe.cam).toEqual({ ...credentials, token: 'temporary-token' });
		expect(loadConfig(env).cloudProbe.configured).toBe(true);
		const partial = loadConfig({ ...env, TENCENTCLOUD_SECRET_KEY: '' });
		expect(partial.cloudProbe.configured).toBe(false);
		expect(scfCamConfigError(partial.cloudProbe.cam)).toContain('TENCENTCLOUD_SECRET_KEY');
	});
});
