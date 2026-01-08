import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { DOCS_URL, ROUTER_SITE_URL, SITE_NAME } from '../constants';

export function Layout() {
	const location = useLocation();
	const isAdmin = location.pathname.startsWith('/admin');

	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
			<AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
				<Toolbar>
					<Typography variant="h6" sx={{ flexGrow: 1 }}>
						{SITE_NAME}
					</Typography>
					<Button href={ROUTER_SITE_URL} target="_blank" rel="noreferrer">
						主站
					</Button>
					<Button href={DOCS_URL} target="_blank" rel="noreferrer">
						文档
					</Button>
					<Button component={RouterLink} to={isAdmin ? '/' : '/admin'}>
						{isAdmin ? 'Public' : 'Admin'}
					</Button>
				</Toolbar>
			</AppBar>
			<Container sx={{ py: 3 }}>
				<Outlet />
			</Container>
		</Box>
	);
}

