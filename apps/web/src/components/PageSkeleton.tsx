import { Box, Skeleton, Stack } from '@mui/material';
import { radius, v } from '../design/tokens';
import { HeroArtSpace, heroGrid } from './hero/HeroArt';

/** The page's real shape while the first overview loads — no layout jump when data lands. */
export function PageSkeleton() {
	return (
		<Box role="status" aria-label="正在读取最新状态" sx={{ pt: { xs: 3, md: 5 } }}>
			<Box sx={heroGrid}>
				<Box sx={{ minWidth: 0 }}>
					<Skeleton variant="rounded" width={148} height={26} sx={{ borderRadius: 999 }} />
					<Skeleton variant="text" sx={{ mt: 2, fontSize: '2.5rem', width: 'min(420px, 80%)' }} />
					<Skeleton variant="text" sx={{ fontSize: '1rem', width: 'min(520px, 90%)' }} />
				</Box>
				<HeroArtSpace />
			</Box>
			<Box sx={{ mt: 4, mb: 1.25, height: 28 }} />
			<Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, bgcolor: v('surface'), borderRadius: `${radius.section}px`, boxShadow: v('shadow'), overflow: 'hidden' }}>
				{Array.from({ length: 5 }, (_, index) => (
					<Stack key={index} spacing={1.25} sx={{ p: 2, borderLeft: index ? `1px solid ${v('border')}` : 0, display: { xs: index > 1 ? 'none' : 'flex', md: 'flex' } }}>
						<Skeleton variant="text" width="45%" />
						<Skeleton variant="text" width="70%" sx={{ fontSize: '1.25rem' }} />
						<Skeleton variant="rounded" height={28} />
					</Stack>
				))}
			</Box>
			<Box sx={{ mt: 2.5, bgcolor: v('surface'), borderRadius: `${radius.section}px`, boxShadow: v('shadow'), overflow: 'hidden' }}>
				<Box sx={{ px: 2.5, py: 2 }}>
					<Skeleton variant="text" width={80} sx={{ fontSize: '1rem' }} />
				</Box>
				{Array.from({ length: 6 }, (_, index) => (
					<Stack key={index} direction="row" spacing={2.5} alignItems="center" sx={{ px: 2.5, py: 1.75, borderTop: `1px solid ${v('border')}` }}>
						<Skeleton variant="text" width="22%" />
						<Skeleton variant="text" width={64} />
						<Skeleton variant="rounded" height={12} sx={{ flex: 1 }} />
					</Stack>
				))}
			</Box>
		</Box>
	);
}
