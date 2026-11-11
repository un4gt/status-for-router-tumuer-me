import { IconButton, Tooltip } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { Icon, Moon, Sun, SunMoon } from '../design/icons';

const NEXT = { system: 'light', light: 'dark', dark: 'system' } as const;
const LABEL = { system: '跟随系统', light: '浅色', dark: '深色' } as const;
const GLYPH = { system: SunMoon, light: Sun, dark: Moon } as const;

export function ColorModeToggle() {
	const { mode, setMode } = useColorScheme();
	const current = (mode ?? 'system') as keyof typeof NEXT;
	return (
		<Tooltip title={`外观：${LABEL[current]}（点击切换为${LABEL[NEXT[current]]}）`}>
			<IconButton size="small" aria-label={`切换外观，当前${LABEL[current]}`} onClick={() => setMode(NEXT[current])} sx={{ width: 32, height: 32 }}>
				<Icon icon={GLYPH[current]} size={16} />
			</IconButton>
		</Tooltip>
	);
}
