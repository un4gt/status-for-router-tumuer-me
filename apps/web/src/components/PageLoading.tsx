import { Box, CircularProgress, Typography } from '@mui/material';
import { v } from '../design/tokens';

export function PageLoading({ label = '正在加载…' }: { label?: string }) {
	return (
		<Box role="status" sx={{ display: 'grid', placeItems: 'center', gap: 1.5, py: 8, color: v('text2') }}>
			<CircularProgress size={24} thickness={5} />
			<Typography variant="body2">{label}</Typography>
		</Box>
	);
}
