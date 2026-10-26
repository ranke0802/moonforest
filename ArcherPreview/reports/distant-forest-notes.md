# Clear distant forest — 2026-10-26

- Near tree source assets and the 5 / 11 unit LOD geometry remain unchanged.
- At 17 units: 6,120 triangles per verdant tree, 3,781 per oak.
- At 28 units: 2,367 triangles per verdant tree, 1,370 per oak. The previous far models used 15,176 and 8,683 respectively (about 84% fewer triangles in the new background models).
- Reuse the existing painted color textures and mipmaps. Distant materials use interpolated vertex lighting instead of pixel PBR, specular highlights, and received real-time shadows. These materials are shared between instances and between the two distant LODs.
- Preserve the existing 45% tree occlusion coverage on all LODs.
- Gameplay/enemy/grass render bounds remain 32 units. Only static scenery extends to 60 units; the first 52 units are clear, with fog confined to the outer clipping boundary.
- The ground remains one 8,192-triangle mesh. The extended border retains the same world-space texture density.
- All new geometry uses immutable content hashes; unchanged texture and geometry URLs are reused by the persistent resource cache.

## Validation

23 targeted unit tests passed: LOD return/culling, texture reuse, tree occlusion, terrain UVs/heights, lighting and existing mobile frame policy.

An isolated headless WebGL forest fixture compared the previous manifest with the new one at two fixed cameras. It loads no game entry point, controls, audio, or fullscreen code. Final run had no browser or shader errors. PNGs were inspected locally; no browser/game window was shown.

| Fixed camera | Previous active triangles | Updated active triangles | Change |
|---|---:|---:|---:|
| Center | 896,122 | 807,972 | -9.8% |
| Edge facing inward | 577,296 | 325,760 | -43.6% |

These counts are for the isolated forest, not total game frame time or device heat. Galaxy S23 thermal/power consumption was not measured. Higher-detail geometry still switches at the authored thresholds; this is not a dual-render crossfade. Color/lighting comparison used the same distant geometry with original and simplified materials.

Reproduce geometry: `node scripts/pack-tree-lods.mjs`.
Reproduce offscreen comparison: `node scripts/check-distant-forest.mjs` (requires the repository's e151b6b baseline and local Playwright/Edge).
