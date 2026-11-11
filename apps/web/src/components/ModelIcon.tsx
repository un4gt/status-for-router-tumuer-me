import { Box, Tooltip } from '@mui/material';
import { useEffect, useState } from 'react';
import { radius, size as typeSize, v, weight } from '../design/tokens';
import { BRANDS_WITHOUT_LOGO, brandFor, type BrandKey } from '../modelBrand';

/**
 * Lab logos from LobeHub Icons (MIT). Each SVG is its own asset, fetched only
 * when a model from that lab is on screen. The colour variant is preferred;
 * single-colour marks use currentColor so they follow the theme's ink.
 */
// Only the labs modelBrand.ts maps; each logo is its own lazily fetched asset.
const ICON_URLS = import.meta.glob(
	[
	'/node_modules/@lobehub/icons-static-svg/icons/openai.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/baai.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/qwen-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/voyage-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/cohere-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/jina.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/gemini-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/gemma-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/google-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/deepseek-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/mistral-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/meta-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/nvidia-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/zhipu-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/kimi-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/moonshot.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/minimax-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/doubao-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/bytedance-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/hunyuan-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/claude-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/grok.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/typesafeai.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/huggingface-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/snowflake-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/microsoft-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/ibm.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/yi-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/wenxin-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/stepfun-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/baichuan-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/internlm-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/alibaba-color.svg',
	'/node_modules/@lobehub/icons-static-svg/icons/aws-color.svg',
	],
	{ query: '?url', import: 'default' },
) as Record<string, () => Promise<string>>;
const ICON_DIR = '/node_modules/@lobehub/icons-static-svg/icons/';

const markupCache = new Map<BrandKey, Promise<string | null>>();

function sanitize(svg: string) {
	// Our own static assets, but keep only drawing markup all the same.
	return svg
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/\son\w+="[^"]*"/gi, '')
		.replace(/<title>[\s\S]*?<\/title>/i, '')
		.replace(/\s(width|height)="1em"/g, '')
		.replace(/\sstyle="[^"]*"/, '');
}

function loadMarkup(key: BrandKey): Promise<string | null> {
	let pending = markupCache.get(key);
	if (!pending) {
		const loader = ICON_URLS[`${ICON_DIR}${key}-color.svg`] ?? ICON_URLS[`${ICON_DIR}${key}.svg`];
		pending = loader
			? loader()
					.then((url) => fetch(url))
					.then((response) => (response.ok ? response.text() : null))
					.then((text) => (text && text.includes('<svg') ? sanitize(text) : null))
					.catch(() => null)
			: Promise.resolve(null);
		markupCache.set(key, pending);
	}
	return pending;
}

/** A neutral lettered tile for unknown labs (and labs with no published logo). */
function Monogram({ label, px }: { label: string; px: number }) {
	const letter = (label.match(/[A-Za-z0-9一-鿿]/)?.[0] ?? '?').toUpperCase();
	return (
		<Box
			component="span"
			aria-hidden
			sx={{
				width: px,
				height: px,
				display: 'grid',
				placeItems: 'center',
				borderRadius: `${Math.round(px * 0.28)}px`,
				bgcolor: v('surface2'),
				boxShadow: `inset 0 0 0 1px ${v('hairline')}`,
				color: v('text3'),
				fontSize: px <= 16 ? 9 : typeSize.xs,
				fontWeight: weight.semibold,
				fontFamily: 'var(--font-sans)',
				lineHeight: 1,
			}}
		>
			{letter}
		</Box>
	);
}

export function ModelIcon({ model, size = 20, withTooltip = true }: { model: string; size?: number; withTooltip?: boolean }) {
	const brand = brandFor(model);
	const [markup, setMarkup] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		setMarkup(null);
		if (brand && !BRANDS_WITHOUT_LOGO.has(brand.key)) void loadMarkup(brand.key).then((svg) => alive && setMarkup(svg));
		return () => {
			alive = false;
		};
	}, [brand?.key]);

	const glyphSize = Math.round(size * 0.72);
	const tile = (
		<Box
			component="span"
			role="img"
			aria-label={brand ? brand.name : '未知厂商'}
			sx={{
				width: size,
				height: size,
				flexShrink: 0,
				display: 'grid',
				placeItems: 'center',
				borderRadius: `${Math.min(radius.control + 1, Math.round(size * 0.3))}px`,
				// Logos keep their own brand colours, so the tile is light in both themes
				// (like an app icon) and single-colour marks draw in a fixed ink.
				bgcolor: markup ? v('logoTile') : 'transparent',
				boxShadow: markup ? `0 0 0 1px ${v('hairline')}` : 'none',
				color: v('logoInk'),
				'& svg': { width: glyphSize, height: glyphSize, display: 'block' },
			}}
		>
			{markup ? <Box component="span" sx={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: markup }} /> : <Monogram label={brand?.name ?? model.split('/').at(-1) ?? model} px={size} />}
		</Box>
	);
	if (!withTooltip) return tile;
	return (
		<Tooltip title={brand ? brand.name : '未识别的厂商'} disableInteractive placement="top">
			{tile}
		</Tooltip>
	);
}
