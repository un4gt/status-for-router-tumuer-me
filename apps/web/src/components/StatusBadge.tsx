import { Box } from '@mui/material';
import type { HealthStatus } from '../api';
import { size, STATUS_META, statusFill, statusSoft, statusText, v, weight } from '../design/tokens';

/**
 * Status is always shape + colour (+ label where there is room), so it reads
 * without colour vision: ✓ 正常 · △ 降级 · ✕ 故障 · — 无数据 · ◇ 维护.
 */
export function StatusGlyph({ status, size: px = 16, title }: { status: HealthStatus; size?: number; title?: string }) {
	const fill = statusFill(status);
	const label = title ?? STATUS_META[status].label;
	const glyph = (() => {
		switch (status) {
			case 'operational':
				return (
					<>
						<circle cx="8" cy="8" r="8" fill={fill} />
						<path d="M4.6 8.3 7 10.6l4.4-4.9" fill="none" stroke={v('surface')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
					</>
				);
			case 'degraded':
				return (
					<>
						<path d="M8 .9a1.6 1.6 0 0 1 1.4.8l6.2 10.9A1.6 1.6 0 0 1 14.2 15H1.8a1.6 1.6 0 0 1-1.4-2.4L6.6 1.7A1.6 1.6 0 0 1 8 .9Z" fill={fill} />
						<path d="M8 5.6v3.9" stroke={v('onWarn')} strokeWidth="1.8" strokeLinecap="round" />
						<circle cx="8" cy="12" r="1.05" fill={v('onWarn')} />
					</>
				);
			case 'outage':
				return (
					<>
						<rect x="0.5" y="0.5" width="15" height="15" rx="4" fill={fill} />
						<path d="m5.3 5.3 5.4 5.4m0-5.4-5.4 5.4" stroke={v('onStatus')} strokeWidth="1.9" strokeLinecap="round" />
					</>
				);
			case 'maintenance':
				return (
					<>
						<path d="M8 .6 15.4 8 8 15.4.6 8Z" fill={fill} />
						<path d="M5.4 8h5.2" stroke={v('onStatus')} strokeWidth="1.8" strokeLinecap="round" />
					</>
				);
			default:
				return (
					<>
						<circle cx="8" cy="8" r="7.1" fill="none" stroke={fill} strokeWidth="1.8" />
						<path d="M5 8h6" stroke={statusText(status)} strokeWidth="1.8" strokeLinecap="round" />
					</>
				);
		}
	})();
	return (
		<Box
			component="svg"
			viewBox="0 0 16 16"
			role="img"
			aria-label={label}
			sx={{ width: px, height: px, flexShrink: 0, display: 'block', overflow: 'visible' }}
		>
			<title>{label}</title>
			{glyph}
		</Box>
	);
}

export function StatusBadge({
	status,
	label,
	compact = false,
}: {
	status: HealthStatus;
	label?: string;
	compact?: boolean;
}) {
	return (
		<Box
			component="span"
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 0.75,
				px: compact ? 0.75 : 1,
				height: compact ? 22 : 26,
				borderRadius: 999,
				bgcolor: statusSoft(status),
				color: statusText(status),
				fontSize: size.xs,
				fontWeight: weight.semibold,
				whiteSpace: 'nowrap',
				lineHeight: 1,
			}}
		>
			<StatusGlyph status={status} size={compact ? 12 : 14} title="" />
			{label ?? STATUS_META[status].label}
		</Box>
	);
}
