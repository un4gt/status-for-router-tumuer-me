import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { lazy, Suspense } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoading } from './components/PageLoading';
import { emotionCache } from './emotionCache';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { theme } from './theme';

// The console is only for operators; keep it out of the public page's bundle.
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

const router = createBrowserRouter([
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <PublicStatusPage /> },
			{
				path: 'admin',
				element: (
					<Suspense fallback={<PageLoading label="正在打开管理控制台…" />}>
						<AdminPage />
					</Suspense>
				),
			},
		],
	},
]);

export function App() {
	return (
		<CacheProvider value={emotionCache}>
			<ThemeProvider theme={theme} defaultMode="system" modeStorageKey="status-color-mode" disableTransitionOnChange>
				<CssBaseline />
				<RouterProvider router={router} />
			</ThemeProvider>
		</CacheProvider>
	);
}
