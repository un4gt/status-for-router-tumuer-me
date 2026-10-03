import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import ShowChartRounded from '@mui/icons-material/ShowChartRounded';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { DOCS_URL, ROUTER_SITE_URL, SITE_NAME } from '../constants';

export function Layout() {
	const location = useLocation();
	const isAdmin = location.pathname.startsWith('/admin');

	return (
		<Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
			<AppBar
				position="sticky"
				color="transparent"
				elevation={0}
				sx={{ borderBottom: 1, borderColor: 'divider', borderRadius: 0, bgcolor: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(12px)' }}
			>
				<Container maxWidth="lg">
					<Toolbar disableGutters sx={{ minHeight: { xs: 68, sm: 76 }, flexWrap: 'wrap', gap: 1, py: 1.5 }}>
						<Stack
							component={RouterLink}
							to="/"
							direction="row"
							spacing={1.25}
							alignItems="center"
							sx={{ color: 'inherit', textDecoration: 'none', mr: 'auto' }}
						>
							<Box
								sx={{
									width: 34,
									height: 34,
									display: 'grid',
									placeItems: 'center',
									bgcolor: 'primary.main',
									color: 'white',
									borderRadius: '10px',
									boxShadow: '0 3px 8px rgba(53,99,233,0.16)',
								}}
							>
								<ShowChartRounded fontSize="small" />
							</Box>
							<Typography variant="h6" sx={{ letterSpacing: '-0.025em' }}>
								{SITE_NAME}
							</Typography>
						</Stack>
						<Stack component="nav" aria-label="主导航" direction="row" spacing={0.5} sx={{ ml: 'auto' }}>
							<Button
								size="small"
								color="inherit"
								href={ROUTER_SITE_URL}
								target="_blank"
								rel="noreferrer"
								endIcon={<OpenInNewRounded fontSize="inherit" />}
								sx={{ color: 'text.secondary' }}
							>
								主站
							</Button>
							<Button size="small" color="inherit" href={DOCS_URL} target="_blank" rel="noreferrer" sx={{ color: 'text.secondary' }}>
								文档
							</Button>
							<Button size="small" component={RouterLink} to={isAdmin ? '/' : '/admin'} sx={{ bgcolor: 'primary.light', px: 1.5 }}>
								{isAdmin ? '状态总览' : '管理控制台'}
							</Button>
						</Stack>
					</Toolbar>
				</Container>
			</AppBar>
			<Container component="main" maxWidth="lg" sx={{ pt: { xs: 3, sm: 4.5 }, pb: 6 }}>
				<Outlet />
			</Container>
		</Box>
	);
}
