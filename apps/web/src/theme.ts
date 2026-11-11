import { createTheme } from '@mui/material/styles';
import { cssVariables, dark, font, light, motion, radius, size, v, weight } from './design/tokens';

/**
 * Light/dark follow the OS by default and can be overridden from the header;
 * MUI writes `data-color-scheme` on <html>, and every token below keys off it.
 */
export const COLOR_SCHEME_ATTRIBUTE = 'data-color-scheme';

const lightVars = cssVariables(light);
const darkVars = cssVariables(dark);

const palette = (t: typeof light) => ({
	primary: { main: t.brand, dark: t.brandHover, light: t.brandSoft, contrastText: t.onBrand },
	success: { main: t.okFill, dark: t.okText, light: t.okSoft },
	warning: { main: t.warnFill, dark: t.warnText, light: t.warnSoft },
	error: { main: t.critFill, dark: t.critText, light: t.critSoft },
	info: { main: t.infoFill, dark: t.infoText, light: t.infoSoft },
	background: { default: t.bg, paper: t.surface },
	text: { primary: t.text1, secondary: t.text2, disabled: t.text3 },
	divider: t.border,
});

/** Controls sit on a hairline ring + soft drop instead of a heavy outline. */
const controlSurface = {
	backgroundColor: v('surface'),
	boxShadow: v('shadowControl'),
	transition: `box-shadow ${motion.fast} ${motion.ease}, background-color ${motion.fast} ${motion.ease}`,
} as const;

export const theme = createTheme({
	cssVariables: { colorSchemeSelector: `[${COLOR_SCHEME_ATTRIBUTE}="%s"]` },
	colorSchemes: { light: { palette: palette(light) }, dark: { palette: palette(dark) } },
	shape: { borderRadius: radius.control },
	typography: {
		fontFamily: font.sans,
		fontWeightRegular: weight.regular,
		fontWeightMedium: weight.medium,
		fontWeightBold: weight.semibold,
		h1: { fontSize: size.xl, fontWeight: weight.semibold, lineHeight: 1.3, letterSpacing: '-0.015em' },
		h2: { fontSize: size.lg, fontWeight: weight.semibold, lineHeight: 1.4, letterSpacing: '-0.01em' },
		h3: { fontSize: size.md, fontWeight: weight.semibold, lineHeight: 1.45 },
		h4: { fontSize: size.xl, fontWeight: weight.semibold, lineHeight: 1.3 },
		h5: { fontSize: size.lg, fontWeight: weight.semibold, lineHeight: 1.4 },
		h6: { fontSize: size.md, fontWeight: weight.semibold, lineHeight: 1.45 },
		subtitle1: { fontSize: size.md, fontWeight: weight.medium },
		subtitle2: { fontSize: size.sm, fontWeight: weight.medium },
		body1: { fontSize: size.md, lineHeight: 1.55 },
		body2: { fontSize: size.sm, lineHeight: 1.55 },
		caption: { fontSize: size.xs, lineHeight: 1.5 },
		button: { fontSize: size.sm, fontWeight: weight.medium, textTransform: 'none', letterSpacing: 0 },
	},
	components: {
		MuiCssBaseline: {
			styleOverrides: {
				':root': { ...lightVars, '--font-sans': font.sans, '--font-mono': font.mono, '--ease': motion.ease },
				[`:root[${COLOR_SCHEME_ATTRIBUTE}="dark"]`]: darkVars,
				body: {
					backgroundColor: v('bg'),
					color: v('text1'),
					// Inter: open digits, single-storey a off, tabular-friendly figures.
					fontFeatureSettings: '"cv01", "cv11", "ss03"',
					WebkitFontSmoothing: 'antialiased',
					MozOsxFontSmoothing: 'grayscale',
					textRendering: 'optimizeLegibility',
				},
				'::selection': { backgroundColor: v('brandSoft'), color: v('text1') },
				':focus-visible': { outline: `2px solid ${v('focus')}`, outlineOffset: 2 },
				'.num': { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum", "zero" 0' },
				'@keyframes fadeUp': {
					from: { opacity: 0, transform: 'translateY(6px)' },
					to: { opacity: 1, transform: 'none' },
				},
				'@keyframes pulseRing': {
					'0%': { transform: 'scale(1)', opacity: 0.55 },
					'80%, 100%': { transform: 'scale(2.4)', opacity: 0 },
				},
				'@keyframes shimmer': {
					from: { backgroundPosition: '-200% 0' },
					to: { backgroundPosition: '200% 0' },
				},
				'@media (prefers-reduced-motion: reduce)': {
					'*, *::before, *::after': { animationDuration: '0.01ms !important', animationIterationCount: '1 !important', transitionDuration: '0.01ms !important' },
				},
			},
		},
		MuiPaper: {
			defaultProps: { elevation: 0 },
			styleOverrides: {
				root: { backgroundImage: 'none' },
				outlined: { border: 0, boxShadow: v('shadow'), borderRadius: radius.section },
			},
		},
		MuiButtonBase: { defaultProps: { disableRipple: true } },
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: {
					borderRadius: radius.control + 2,
					padding: '6px 12px',
					whiteSpace: 'nowrap',
					minHeight: 32,
					transition: `background-color ${motion.fast} ${motion.ease}, box-shadow ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}`,
					'&:active': { transform: 'translateY(0.5px)' },
				},
				sizeSmall: { padding: '4px 10px', minHeight: 28, fontSize: size.xs },
				contained: { boxShadow: `${v('highlight')}, 0 1px 2px rgba(20, 22, 43, 0.2)` },
				outlined: { border: 0, ...controlSurface, '&:hover': { border: 0, backgroundColor: v('surface2') } },
				outlinedInherit: { border: 0, ...controlSurface, color: v('text1'), '&:hover': { border: 0, backgroundColor: v('surface2') } },
				textInherit: { color: v('text2'), '&:hover': { backgroundColor: v('surface2'), color: v('text1') } },
			},
		},
		MuiIconButton: {
			styleOverrides: {
				root: {
					borderRadius: radius.control + 2,
					color: v('text2'),
					transition: `background-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}`,
					'&:hover': { backgroundColor: v('surface2'), color: v('text1') },
				},
			},
		},
		MuiOutlinedInput: {
			styleOverrides: {
				root: {
					...controlSurface,
					borderRadius: radius.control + 2,
					fontSize: size.sm,
					'& .MuiOutlinedInput-notchedOutline': { border: 0 },
					'&:hover': { boxShadow: `0 0 0 1px ${v('borderStrong')}, 0 1px 2px rgba(20, 22, 43, 0.06)` },
					'&.Mui-focused': { boxShadow: `0 0 0 1px ${v('brand')}, 0 0 0 4px ${v('brandSoft')}` },
				},
				input: { '&::placeholder': { color: v('text3'), opacity: 1 } },
			},
		},
		MuiSelect: { styleOverrides: { icon: { color: v('text3'), fontSize: 18, right: 8 } } },
		MuiMenu: {
			styleOverrides: {
				paper: { marginTop: 4, borderRadius: radius.block, boxShadow: v('shadowRaised'), backgroundColor: v('surface') },
				list: { padding: 4 },
			},
		},
		MuiMenuItem: {
			styleOverrides: {
				root: {
					fontSize: size.sm,
					borderRadius: radius.control,
					minHeight: 32,
					'&.Mui-selected': { backgroundColor: v('brandSoft'), color: v('brandText'), fontWeight: weight.medium },
					'&.Mui-selected:hover': { backgroundColor: v('brandSoft') },
				},
			},
		},
		MuiToggleButtonGroup: {
			styleOverrides: {
				root: { backgroundColor: v('surface2'), borderRadius: radius.control + 2, padding: 2, gap: 2, boxShadow: `inset 0 0 0 1px ${v('hairline')}` },
				grouped: { border: 0, borderRadius: `${radius.control}px !important`, margin: 0 },
			},
		},
		MuiToggleButton: {
			styleOverrides: {
				root: {
					border: 0,
					color: v('text2'),
					fontSize: size.xs,
					fontWeight: weight.medium,
					textTransform: 'none',
					padding: '4px 10px',
					transition: `background-color ${motion.fast} ${motion.ease}, color ${motion.fast} ${motion.ease}, box-shadow ${motion.fast} ${motion.ease}`,
					'&:hover': { backgroundColor: 'transparent', color: v('text1') },
					'&.Mui-selected, &.Mui-selected:hover': { backgroundColor: v('surface'), color: v('text1'), boxShadow: v('shadowControl') },
				},
			},
		},
		MuiTableContainer: { styleOverrides: { root: { borderRadius: radius.block, boxShadow: `0 0 0 1px ${v('hairline')}` } } },
		MuiTableCell: {
			styleOverrides: {
				root: { borderColor: v('border'), fontSize: size.sm },
				head: { backgroundColor: v('surface2'), color: v('text3'), fontWeight: weight.medium, whiteSpace: 'nowrap', fontSize: size.xs, letterSpacing: '0.02em' },
				sizeSmall: { padding: '9px 12px' },
			},
		},
		MuiTableRow: {
			styleOverrides: { root: { '&:last-child td': { borderBottom: 0 }, '&.MuiTableRow-hover:hover': { backgroundColor: v('rowHover') } } },
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: weight.medium, borderRadius: radius.control },
				sizeSmall: { height: 22, fontSize: size.xs },
				outlined: { border: 0, boxShadow: `inset 0 0 0 1px ${v('border')}` },
			},
		},
		MuiAlert: {
			styleOverrides: {
				root: { borderRadius: radius.block, fontSize: size.sm, alignItems: 'center' },
				outlined: { border: 0, boxShadow: `inset 0 0 0 1px ${v('border')}`, backgroundColor: v('surface') },
				message: { lineHeight: 1.6, padding: '6px 0' },
			},
		},
		MuiDialog: { styleOverrides: { paper: { borderRadius: radius.section + 2, boxShadow: v('shadowRaised'), backgroundImage: 'none' } } },
		MuiDialogTitle: { styleOverrides: { root: { fontSize: size.lg, fontWeight: weight.semibold, paddingBottom: 8 } } },
		MuiDialogActions: { styleOverrides: { root: { padding: '12px 24px 20px', gap: 8 } } },
		MuiBackdrop: { styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: v('scrim') } } } },
		MuiDrawer: { styleOverrides: { paper: { boxShadow: v('shadowRaised'), border: 0 } } },
		MuiSwitch: { defaultProps: { size: 'small' } },
		MuiSkeleton: { defaultProps: { animation: 'wave' }, styleOverrides: { root: { backgroundColor: v('surface2') } } },
		MuiTooltip: {
			defaultProps: { arrow: false, enterDelay: 200, enterNextDelay: 80 },
			styleOverrides: {
				tooltip: {
					backgroundColor: v('tooltipBg'),
					color: v('tooltipFg'),
					fontSize: size.xs,
					fontWeight: weight.regular,
					lineHeight: 1.5,
					padding: '6px 10px',
					borderRadius: radius.control + 2,
					maxWidth: 360,
					boxShadow: '0 8px 24px -8px rgba(0, 0, 0, 0.35)',
				},
			},
		},
	},
});
