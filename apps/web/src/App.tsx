import { CssBaseline, ThemeProvider } from '@mui/material';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { AdminPage } from './pages/AdminPage';
import { theme } from './theme';

const router = createBrowserRouter([
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <PublicStatusPage /> },
			{ path: 'admin', element: <AdminPage /> },
		],
	},
]);

export function App() {
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<RouterProvider router={router} />
		</ThemeProvider>
	);
}
