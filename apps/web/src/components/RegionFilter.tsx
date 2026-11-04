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
		<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, maxWidth: '100%', overflowX: 'auto', py: 0.25 }}>
			<Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mr: 0.25 }}>
				地区视图
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
					'& .MuiToggleButton-root': {
						px: 1.25,
						py: 0.4,
						fontSize: '0.75rem',
						borderColor: 'divider',
						whiteSpace: 'nowrap',
					},
					'& .MuiToggleButton-root.Mui-selected': { bgcolor: 'primary.light', color: 'primary.main', fontWeight: 700 },
				}}
			>
				<ToggleButton value="all">统一</ToggleButton>
				{regions.map((region) => (
					<ToggleButton key={region.id} value={region.id}>
						<Box
							component="span"
							sx={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								bgcolor: STATUS_COLORS[region.status],
								mr: 0.75,
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
