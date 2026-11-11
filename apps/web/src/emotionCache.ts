import createCache from '@emotion/cache';

/**
 * Emotion in production defaults to "speedy" mode, which inserts rules through the CSSOM
 * and leaves its <style> tags empty. The 2D/3D view transition copies the page's CSS into
 * an SVG snapshot, and the CSSOM re-serialization drops values (see captureView.ts), so keep
 * the source text in the tags instead. The cost is negligible for a page of this size.
 */
export const emotionCache = createCache({ key: 'css', speedy: false });
