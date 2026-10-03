import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
	palette: {
		mode: 'light',
		primary: { main: '#3563e9', dark: '#254cc0', light: '#eef3ff' },
		success: { main: '#19845e', light: '#edf8f2', dark: '#116343' },
		error: { main: '#d04444', light: '#fff1f1' },
		warning: { main: '#b77712' },
		background: { default: '#f5f7fb', paper: '#ffffff' },
		text: { primary: '#1d2b43', secondary: '#66758c' },
		divider: '#e7ecf3',
	},
	shape: { borderRadius: 10 },
	typography: {
		fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
		h4: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.35 },
		h5: { fontSize: '1.15rem', fontWeight: 650, letterSpacing: '-0.02em' },
		h6: { fontSize: '1rem', fontWeight: 650, lineHeight: 1.6 },
		subtitle1: { fontSize: '0.9375rem', fontWeight: 600 },
		body1: { fontSize: '0.9375rem' },
		body2: { fontSize: '0.875rem', lineHeight: 1.7 },
		button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' },
	},
	components: {
		MuiCssBaseline: {
			styleOverrides: {
				body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
				'::selection': { backgroundColor: '#dbe6ff' },
			},
		},
		MuiPaper: {
			styleOverrides: {
				root: { backgroundImage: 'none', borderRadius: 16 },
				outlined: { boxShadow: '0 2px 6px rgba(29, 43, 67, 0.025)' },
			},
		},
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: {
					borderRadius: 9,
					padding: '8px 16px',
					whiteSpace: 'nowrap',
					'&.Mui-focusVisible': { outline: '3px solid #b7c9ff', outlineOffset: 2 },
				},
				sizeSmall: { padding: '4px 10px' },
				outlinedInherit: { borderColor: '#dbe2ee' },
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					backgroundColor: '#fff',
					fontSize: '0.875rem',
					'& .MuiOutlinedInput-notchedOutline': { borderColor: '#dbe2ee' },
					'&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#a9b7cc' },
				},
			},
		},
		MuiTableContainer: {
			styleOverrides: { root: { border: '1px solid #e7ecf3', borderRadius: 12 } },
		},
		MuiTableCell: {
			styleOverrides: {
				root: { borderColor: '#e7ecf3', fontSize: '0.8125rem' },
				head: { backgroundColor: '#f8fafc', color: '#66758c', fontWeight: 600, whiteSpace: 'nowrap' },
				sizeSmall: { padding: '11px 16px' },
			},
		},
		MuiTableRow: {
			styleOverrides: {
				root: { '&:last-child td': { borderBottom: 0 }, '&.MuiTableRow-hover:hover': { backgroundColor: '#f8faff' } },
			},
		},
		MuiChip: {
			styleOverrides: { root: { fontWeight: 600, borderRadius: 6 }, sizeSmall: { height: 25, fontSize: '0.75rem' } },
		},
		MuiAlert: { styleOverrides: { root: { borderRadius: 10 }, message: { lineHeight: 1.7 } } },
		MuiDialogActions: { styleOverrides: { root: { padding: '12px 24px 20px' } } },
		MuiTooltip: { defaultProps: { arrow: true } },
	},
});
