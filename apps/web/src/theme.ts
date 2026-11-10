import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
	palette: {
		mode: 'light',
		primary: { main: '#2563eb', dark: '#1d4ed8', light: '#eff6ff' },
		success: { main: '#10b981', light: '#ecfdf5', dark: '#059669' },
		error: { main: '#ef4444', light: '#fef2f2', dark: '#dc2626' },
		warning: { main: '#f59e0b', light: '#fffbeb', dark: '#d97706' },
		background: { default: '#f4f7fb', paper: '#ffffff' },
		text: { primary: '#0f172a', secondary: '#64748b' },
		divider: '#e2e8f0',
	},
	shape: { borderRadius: 10 },
	typography: {
		fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
		h4: { fontSize: '1.75rem', fontWeight: 750, letterSpacing: '-0.035em', lineHeight: 1.3 },
		h5: { fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' },
		h6: { fontSize: '0.975rem', fontWeight: 700, lineHeight: 1.5 },
		subtitle1: { fontSize: '0.9rem', fontWeight: 600 },
		body1: { fontSize: '0.9rem' },
		body2: { fontSize: '0.84rem', lineHeight: 1.6 },
		button: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none' },
	},
	components: {
		MuiCssBaseline: {
			styleOverrides: {
				':root': {
					'--status-sans': 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
					'--status-mono': '"JetBrains Mono", Consolas, ui-monospace, monospace',
				},
				'html, body, *': {
					scrollbarWidth: 'none',
					msOverflowStyle: 'none',
					'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
				},
				body: {
					WebkitFontSmoothing: 'antialiased',
					MozOsxFontSmoothing: 'grayscale',
					backgroundColor: '#f4f7fb',
					backgroundImage:
						'radial-gradient(1200px 440px at 50% -110px, rgba(37, 99, 235, 0.065), transparent 70%), radial-gradient(900px 360px at 85% 0%, rgba(16, 185, 129, 0.035), transparent 65%)',
					backgroundAttachment: 'fixed',
				},
				'::selection': { backgroundColor: '#dbeafe' },
			},
		},
		MuiPaper: {
			styleOverrides: {
				root: { backgroundImage: 'none', borderRadius: 16 },
				outlined: {
					borderColor: 'rgba(226, 232, 240, 0.9)',
					boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.035), 0 2px 6px -1px rgba(15, 23, 42, 0.02)',
				},
			},
		},
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: {
					borderRadius: 9,
					padding: '7px 14px',
					whiteSpace: 'nowrap',
					'&.Mui-focusVisible': { outline: '3px solid #bfdbfe', outlineOffset: 2 },
				},
				sizeSmall: { padding: '4px 10px' },
				outlinedInherit: { borderColor: '#dbe3ef' },
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					backgroundColor: '#fff',
					fontSize: '0.8125rem',
					'& .MuiOutlinedInput-notchedOutline': { borderColor: '#dbe3ef' },
					'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94a3b8' },
				},
			},
		},
		MuiTableContainer: {
			styleOverrides: {
				root: {
					border: '1px solid #e2e8f0',
					borderRadius: 12,
					scrollbarWidth: 'none',
					'&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
				},
			},
		},
		MuiTableCell: {
			styleOverrides: {
				root: { borderColor: '#eef2f6', fontSize: '0.8125rem' },
				head: { backgroundColor: '#f8fafc', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' },
				sizeSmall: { padding: '9px 14px' },
			},
		},
		MuiTableRow: {
			styleOverrides: {
				root: { '&:last-child td': { borderBottom: 0 }, '&.MuiTableRow-hover:hover': { backgroundColor: '#f8fafc' } },
			},
		},
		MuiChip: {
			styleOverrides: { root: { fontWeight: 600, borderRadius: 6 }, sizeSmall: { height: 24, fontSize: '0.75rem' } },
		},
		MuiAlert: { styleOverrides: { root: { borderRadius: 10 }, message: { lineHeight: 1.6 } } },
		MuiDialogActions: { styleOverrides: { root: { padding: '12px 24px 20px' } } },
		MuiTooltip: {
			defaultProps: { arrow: true },
			styleOverrides: {
				tooltip: {
					backgroundColor: 'rgba(15, 23, 42, 0.94)',
					backdropFilter: 'blur(8px)',
					fontSize: '0.75rem',
					fontWeight: 500,
					padding: '6px 10px',
					borderRadius: 8,
				},
				arrow: { color: 'rgba(15, 23, 42, 0.94)' },
			},
		},
	},
});
