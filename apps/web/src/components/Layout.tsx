import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import ShowChartRounded from '@mui/icons-material/ShowChartRounded';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { DOCS_URL, ROUTER_SITE_URL, SITE_NAME } from '../constants';
import { ViewTransition } from './ViewTransition';

export function Layout() {
	const location = useLocation();
	const isAdmin = location.pathname.startsWith('/admin');
	const isGlobe = !isAdmin && new URLSearchParams(location.search).get('mode') === '3d';

	return (
		<ViewTransition>
			<Box
				sx={{
					...(isAdmin ? { minHeight: '100vh' } : { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }),
					bgcolor: 'background.default',
					color: 'text.primary',
				}}
			>
				<AppBar
					position={isAdmin ? 'sticky' : 'static'}
					color="transparent"
					elevation={0}
					sx={{
						display: isGlobe ? 'none' : undefined,
						borderBottom: '1px solid rgba(226, 232, 240, 0.85)',
						borderRadius: 0,
						bgcolor: 'rgba(255, 255, 255, 0.86)',
						backdropFilter: 'blur(16px)',
					}}
				>
					<Container
						maxWidth={isAdmin ? 'lg' : false}
						sx={isAdmin ? undefined : { maxWidth: 1800, mx: 'auto', px: { xs: 1.5, sm: 2.5, md: 3.5 } }}
					>
						<Toolbar disableGutters sx={{ minHeight: { xs: 48, sm: 50 }, flexWrap: 'wrap', gap: 1, py: 0.5, pr: isAdmin ? 0 : '134px' }}>
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
										width: 32,
										height: 32,
										display: 'grid',
										placeItems: 'center',
										background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
										color: 'white',
										borderRadius: '9px',
										boxShadow: '0 4px 10px rgba(37, 99, 235, 0.22)',
									}}
								>
									<ShowChartRounded fontSize="small" />
								</Box>
								<Typography variant="h6" sx={{ letterSpacing: '-0.025em', fontWeight: 400, color: '#0f172a' }}>
									{SITE_NAME}
								</Typography>
							</Stack>
							<Stack component="nav" aria-label="主导航" direction="row" spacing={0.75} alignItems="center" sx={{ ml: 'auto' }}>
								<Button
									size="small"
									color="inherit"
									href={ROUTER_SITE_URL}
									target="_blank"
									rel="noreferrer"
									endIcon={<OpenInNewRounded sx={{ fontSize: '14px !important' }} />}
									sx={{ color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'text.primary', bgcolor: 'rgba(15, 23, 42, 0.04)' } }}
								>
									主站
								</Button>
								<Button
									size="small"
									color="inherit"
									href={DOCS_URL}
									target="_blank"
									rel="noreferrer"
									sx={{ color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'text.primary', bgcolor: 'rgba(15, 23, 42, 0.04)' } }}
								>
									文档
								</Button>
								<Button
									size="small"
									component={RouterLink}
									to={isAdmin ? '/' : '/admin'}
									sx={{
										bgcolor: '#eff6ff',
										color: 'primary.main',
										border: '1px solid rgba(37, 99, 235, 0.16)',
										px: 1.5,
										py: 0.5,
										borderRadius: '8px',
										fontWeight: 650,
										'&:hover': { bgcolor: '#dbeafe' },
									}}
								>
									{isAdmin ? '状态总览' : '管理控制台'}
								</Button>
							</Stack>
						</Toolbar>
					</Container>
				</AppBar>
				<Container
					component="main"
					data-status-main={!isAdmin ? '' : undefined}
					maxWidth={isAdmin ? 'lg' : false}
					disableGutters={isGlobe}
					sx={
						isAdmin
							? { pt: 3, pb: 6 }
							: {
									flex: 1,
									minHeight: 0,
									maxWidth: isGlobe ? 'none' : 1800,
									mx: 'auto',
									overflowY: 'hidden',
									overflowX: 'hidden',
									overscrollBehavior: 'contain',
									scrollbarWidth: 'none',
									'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
									...(isGlobe ? { p: 0 } : { px: { xs: 1.5, sm: 2.5, md: 3.5 }, py: { xs: 1, md: 1.25 } }),
								}
					}
				>
					<Outlet />
				</Container>
			</Box>
		</ViewTransition>
	);
}
