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
			host: '0.0.0.0',
			port: 5173,
			strictPort: true,
			proxy: useMock
				? undefined
				: {
						'/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:8787',
					},
		},
		preview: { host: '0.0.0.0' },
		build: {
			// Lab logos must stay separate files so they load only when that lab is on screen.
			assetsInlineLimit: (file: string) => (file.includes('@lobehub/icons-static-svg') ? false : undefined),
			rollupOptions: {
				output: {
					// Long-lived vendor chunks: a UI change no longer invalidates React/MUI in visitors' caches.
					manualChunks(id) {
						if (!id.includes('node_modules') || id.includes('@lobehub/icons-static-svg')) return undefined;
						if (/[\\/](three|three-globe|react-globe\.gl|globe\.gl|kapsule|d3-|h3-js|earcut)/.test(id)) return undefined;
						if (/@mui[\\/]icons-material/.test(id)) return 'icons';
						if (/@mui|@emotion|@popperjs|react-transition-group|stylis/.test(id)) return 'mui';
						if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'react';
						return 'vendor';
					},
				},
			},
		},
	};
});
