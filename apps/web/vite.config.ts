import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { mockApiPlugin } from './vite.mock';

export default defineConfig(({ command, mode }) => {
	const env = loadEnv(mode, process.cwd(), 'VITE_');
	const useMock = command === 'serve' && (env.VITE_MOCK_API === '1' || mode === 'mock');

	if (useMock) {
		// eslint-disable-next-line no-console
		console.log('[mock-api] enabled (vite mode: %s)', mode);
	}

	return {
		plugins: useMock ? [react(), mockApiPlugin()] : [react()],
		server: {
			proxy: useMock
				? undefined
				: {
						'/api': 'http://127.0.0.1:8787',
					},
		},
	};
});
