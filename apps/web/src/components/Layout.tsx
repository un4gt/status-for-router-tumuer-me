import { Box, Button, Stack } from '@mui/material';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { DOCS_URL, ROUTER_SITE_URL, SITE_NAME, SITE_SUFFIX } from '../constants';
import { size, v, weight } from '../design/tokens';
import { BrandMark, BrandWordmark } from './BrandMark';
import { ColorModeToggle } from './ColorModeToggle';
import { ViewTransition } from './ViewTransition';
import { Icon, ArrowUpRight } from '../design/icons';

/** Width reserved in the header for the fixed 2D/3D switch (see view-transition.css). */
const MODE_SWITCH_SLOT = 'var(--mode-switch-slot)';

const navButton = {
	color: v('text2'),
	fontWeight: weight.medium,
	minWidth: 0,
	px: 1,
	'&:hover': { color: v('text1'), bgcolor: v('surface2') },
} as const;

export function Layout() {
	const location = useLocation();
	const isAdmin = location.pathname.startsWith('/admin');
	const isGlobe = !isAdmin && new URLSearchParams(location.search).get('mode') === '3d';

	return (
		<ViewTransition>
			<Box
				sx={{
					position: 'relative',
					...(isAdmin ? { minHeight: '100dvh' } : { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }),
					bgcolor: v('bg'),
					color: v('text1'),
				}}
			>
				<Box
					component="header"
					sx={{
						display: isGlobe ? 'none' : 'block',
						// Public page: the header floats over the scroll area so content and
						// the status aura pass beneath the frosted bar.
						position: isAdmin ? 'sticky' : 'absolute',
						top: 0,
						left: 0,
						right: 0,
						zIndex: 20,
						flexShrink: 0,
						bgcolor: v('headerBg'),
						backdropFilter: 'saturate(1.6) blur(14px)',
						WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
						boxShadow: `0 1px 0 ${v('hairline')}`,
					}}
				>
					<Stack
						direction="row"
						alignItems="center"
						spacing={1}
						sx={{
							maxWidth: isAdmin ? 1200 : 1440,
							mx: 'auto',
							height: 56,
							pl: 'max(16px, env(safe-area-inset-left))',
							pr: isAdmin ? 'max(16px, env(safe-area-inset-right))' : `calc(${MODE_SWITCH_SLOT} + max(16px, env(safe-area-inset-right)))`,
							'@media (min-width: 900px)': {
								pl: 'max(32px, env(safe-area-inset-left))',
								pr: isAdmin ? 'max(32px, env(safe-area-inset-right))' : `calc(${MODE_SWITCH_SLOT} + max(32px, env(safe-area-inset-right)))`,
							},
						}}
					>
						<Stack
							component={RouterLink}
							to="/"
							direction="row"
							spacing={1.125}
							alignItems="center"
							aria-label={`${SITE_NAME} ${SITE_SUFFIX}首页`}
							sx={{ color: 'inherit', textDecoration: 'none', minWidth: 0, borderRadius: 1 }}
						>
							<BrandMark size={28} />
							<BrandWordmark />
						</Stack>
						<Box sx={{ flex: 1 }} />
						<Stack component="nav" aria-label="主导航" direction="row" spacing={0.25} alignItems="center">
							<Button
								size="small"
								color="inherit"
								href={ROUTER_SITE_URL}
								target="_blank"
								rel="noreferrer"
								endIcon={<Icon icon={ArrowUpRight} size={14} />}
								sx={{ ...navButton, display: { xs: 'none', sm: 'inline-flex' } }}
							>
								主站
							</Button>
							<Button size="small" color="inherit" href={DOCS_URL} target="_blank" rel="noreferrer" sx={navButton}>
								文档
							</Button>
							<Button size="small" color="inherit" component={RouterLink} to={isAdmin ? '/' : '/admin'} sx={navButton}>
								{isAdmin ? '返回状态页' : '管理'}
							</Button>
							<ColorModeToggle />
						</Stack>
					</Stack>
				</Box>
				<Box
					component="main"
					data-status-main={!isAdmin ? '' : undefined}
					sx={
						isAdmin
							? { maxWidth: 1200, mx: 'auto', px: 'max(16px, env(safe-area-inset-left))', pt: 4, pb: 8, '@media (min-width: 900px)': { px: 'max(32px, env(safe-area-inset-left))' } }
							: { flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }
					}
				>
					<Outlet />
				</Box>
			</Box>
		</ViewTransition>
	);
}
