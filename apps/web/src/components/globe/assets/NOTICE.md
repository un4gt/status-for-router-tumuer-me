Globe rendering adapted from Vasco Asturiano's react-globe.gl airline-routes example:
https://github.com/vasturiano/react-globe.gl/blob/6dbcf2113880d6fa0c68d6e8932e2bb4fb2df0ba/example/airline-routes/us-international-outbound.html

The upstream repository was cloned and this source read before the redesign.
The example's full-viewport globe, earth-night texture, thin line arcs,
staggered phases, gradient transparency and disabled arc transitions are
retained. A continuous faint route is overlaid with brighter moving dashes
(length 0.16, gap 0.48); only failed routes are broken. Probe data replaces airline data;
latency controls animation time, status controls colors, and stable heights
separate co-located checks. Every enabled model is displayed simultaneously.

Code: Copyright (c) 2019 Vasco Asturiano, MIT (see react-globe.gl-LICENSE).
Night texture: the same earth-night.jpg distributed by three-globe's example,
downloaded from https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg
and served locally so visitors do not need to contact a third-party CDN.

2026-11-09 Figma Make integration:
GlobeScene.ts and latency.ts are adapted from the user's Figma Make project:
https://www.figma.com/make/iO1ad5wy1hFhojTQ2dRyet/Polish-2D-and-3D-Status-Views
The current renderer uses its Three.js shaders, camera controls and latency styling.
Local API data, probe details and the original tile-flip transition are retained.

The MCP texture resources were incomplete (about 35 KB each, invalid WebGL uploads).
Working local textures were restored from three-globe example assets:
- earth-day.jpg: https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg
- earth-water.png: https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png
- figma-earth-night.jpg: identical to the existing earth-night.jpg above.
These replacements are not claimed to be byte-identical to Figma's textures.
