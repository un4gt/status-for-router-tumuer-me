import { useState } from 'react';
import { Box } from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import type { ModelHealth, RegionInfo, WindowKey } from '../api';
import { ModelHealthRow } from './ModelHealthRow';

export function VirtualModelList({
	models,
	regions,
	regionFilter,
	windowKey,
	now,
	onRegionSelect,
}: {
	models: ModelHealth[];
	regions: RegionInfo[];
	regionFilter: string;
	windowKey: WindowKey;
	now: number;
	onRegionSelect: (region: string) => void;
}) {
	const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	return (
		<Box
			ref={setScrollParent}
			data-model-scroll
			data-status-scroll
			role="region"
			aria-label="模型健康列表"
			tabIndex={0}
			sx={{
				height: '100%',
				minHeight: 0,
				overflowY: 'auto',
				overflowX: 'hidden',
				overscrollBehavior: 'contain',
				scrollbarWidth: 'none',
				'&::-webkit-scrollbar': { display: 'none' },
			}}
		>
			{scrollParent && (
				<Virtuoso
					customScrollParent={scrollParent}
					data={models}
					computeItemKey={(_, model) => model.id}
					increaseViewportBy={240}
					itemContent={(_, model) => (
						<ModelHealthRow
							model={model}
							regions={regions}
							regionFilter={regionFilter}
							windowKey={windowKey}
							now={now}
							onRegionSelect={onRegionSelect}
							expanded={expanded.has(model.id)}
							onExpandedChange={(open) =>
								setExpanded((previous) => {
									const next = new Set(previous);
									if (open) next.add(model.id);
									else next.delete(model.id);
									return next;
								})
							}
						/>
					)}
				/>
			)}
		</Box>
	);
}
