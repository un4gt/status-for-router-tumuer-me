import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { RegionInfo } from '../api';
import { STATUS_COLORS } from '../constants';

export function RegionFilter({
	regions,
	value,
	onChange,
}: {
	regions: RegionInfo[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				minWidth: 0,
				maxWidth: '100%',
				overflowX: 'auto',
				scrollbarWidth: 'none',
				msOverflowStyle: 'none',
				'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
			}}
		>
			<Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontWeight: 600 }}>
				节点视图
			</Typography>
			<ToggleButtonGroup
				exclusive
				size="small"
				value={value}
				onChange={(_, next) => {
					if (next !== null) onChange(next);
				}}
				aria-label="选择地区视图"
				sx={{
					flexWrap: 'nowrap',
					bgcolor: '#f1f5f9',
					p: '3px',
					borderRadius: '10px',
					border: '1px solid #e2e8f0',
					gap: '2px',
					'& .MuiToggleButtonGroup-grouped': {
						border: '0 !important',
						borderRadius: '7px !important',
						m: 0,
					},
					'& .MuiToggleButton-root': {
						px: 1.15,
						py: 0.3,
						height: 26,
						fontSize: '0.75rem',
						fontWeight: 600,
						color: '#475569',
						whiteSpace: 'nowrap',
						transition: 'all 140ms ease',
						'&:hover': { bgcolor: 'rgba(255, 255, 255, 0.55)', color: '#0f172a' },
					},
					'& .MuiToggleButton-root.Mui-selected': {
						bgcolor: '#ffffff !important',
						color: '#0f172a !important',
						fontWeight: 700,
						boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
					},
				}}
			>
				<ToggleButton value="all">全局统一</ToggleButton>
				{regions.map((region) => (
					<ToggleButton key={region.id} value={region.id}>
						<Box
							component="span"
							sx={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								bgcolor: STATUS_COLORS[region.status],
								mr: 0.65,
								display: 'inline-block',
							}}
						/>
						{region.label}
					</ToggleButton>
				))}
			</ToggleButtonGroup>
		</Box>
	);
}
