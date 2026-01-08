import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { AdminPage } from './pages/AdminPage';

const theme = createTheme({
	palette: {
		mode: 'light',
	},
});

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

