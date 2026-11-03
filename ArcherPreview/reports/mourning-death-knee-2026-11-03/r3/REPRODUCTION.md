Run from `ArcherPreview` with the repository dependencies installed. No historical `geometry.bin` or external character model is required. These commands do not write runtime source.

1. `node reports/mourning-death-knee-2026-11-03/r3/reproduce.mjs --write`
2. `node reports/mourning-death-knee-2026-11-03/r3/runtime-final/export-review.mjs`
3. `node reports/mourning-death-knee-2026-11-03/r3/runtime-final/validate-runtime.mjs`
4. Set `PARTIAL_REVIEW_DIR` to the absolute `r3/runtime-final` folder, then run Blender in background with `--factory-startup --python-exit-code 1 --python reports/mourning-death-knee-2026-11-03/r3/render-final.py`.

Step 1 reads the original packed glTF/buffers and the three shipped death curves, reconstructs the approved local sculpt, reproduces the intermediate Float32 morph/skin round trip, and inverse-skins the final sparse correction. The reproduced correction currently equals every shipped sparse value exactly (maximum error 0). It writes only small derived references and a candidate data module under this report folder. Step 2 calls the actual `MourningElenaEncounter.prepareAsset` before exporting runtime CPU skin. Step 3 compares that result to the freshly reconstructed shape.

The optional upstream rotation-curve provenance can be reproduced with `node reports/mourning-death-knee-2026-11-03/bake-curves.mjs`. It reads `solve-knee.mjs` and `original-front-right-tracks.json` alongside it, and writes `kneel-death-data.js` to the report folder. The JSON contains only the original r9 right-leg animation tracks, so the old external r9 model is unnecessary. No `--write` flag is needed for this verification.

The existing `tests/helpers/read-runtime-gltf.js` and `scripts/meshopt-lossless.js` decode the packed buffers. All other JavaScript imports are current repository runtime modules and Babylon packages. The Blender script uses NumPy bundled with Blender. If the workspace review JPEG is absent, it extracts the referenced packed KTX2 image with KTX-Software (`KTX_EXE`, default `C:/Program Files/KTX-Software/bin/ktx.exe`), so the JPEG need not be staged. This texture is only for the offline source-paint review; game material lighting is not reproduced.

Do not stage generated `geometry.bin`, `.blend` or derived PNG texture files. The runtime data modules, test files, the scripts listed above, this document and small verification JSON files are sufficient.
