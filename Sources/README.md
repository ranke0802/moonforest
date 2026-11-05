# Authoring sources

This folder carries the editable originals and approved repacking inputs used by MoonForest. It is part of the portable project and must stay in every development archive. Runtime models, raw audio and older source models already in `ArcherPreview/assets`, `ArcherPreview/public/assets` and `Assets/Resources/Audio` keep their existing locations.

`source-inputs.json` records each physical input's project-relative path, byte count, SHA-256 and original location. Original locations are provenance only. The resolvers never fall back to another project, a Downloads folder or a private tool installation. Four exact duplicates use logical aliases to one canonical file. Other duplicate texture/buffer files preserve native FBX/glTF sibling paths.

From the project root:

```powershell
node Sources/resolve-source.mjs --check
node Sources/resolve-source.mjs blacksmith-package
node --test Sources/resolve-source.test.mjs
```

Normal game development uses the root launch/build commands. It does not require Blender, KTX or an asset generator. Optional asset processing resolves an explicit `PYTHON_EXE` first, then the bundled Windows Python, then Python on PATH. Blender and KTX-Software are separate authoring prerequisites: install them on PATH, or set `KTX_EXE` for the KTX command. Source processing scripts keep their explicit command-line and environment overrides. Review outputs default to project-local reports.

The bundled Python contains its standard library. Third-party authoring packages such as NumPy and Pillow are **not included** and are unnecessary for normal build/test/archive commands. One optional setup route is to install a full Python 3.12+ from python.org, create a local environment, and select it for asset scripts:

```powershell
py -3 -m venv .cache/authoring-python
.\.cache\authoring-python\Scripts\python.exe -m pip install numpy Pillow
$env:PYTHON_EXE = (Resolve-Path .\.cache\authoring-python\Scripts\python.exe).Path
```

Recreate this optional environment after transfer; it is not a source input or required portable runtime. Some specialized archival scripts require additional tools documented in that script. Blender scripts run through Blender's own Python.

Open native Blender originals through the portable path adapter:

```powershell
blender --factory-startup --python Sources/open-blend.py -- Sources/actors/warrior/Violet_Vanguard_V2.blend
```

The adapter reconnects unpacked images to bundled files in memory. It never saves the source. This is needed for the old shelf and laboratory files whose original image paths were absolute or relative to their former project location. `blend-portability-validation.json` records verification of all 31 native originals. Other images are packed or already relative to bundled siblings; there are no linked Blender libraries.

Village, forest, cave, plains, actor and NPC source directories include current native files, original FBX/texture inputs and approved repack resources. The blacksmith integrated GLB exactly matches the deployed NPC source SHA-256. Current laboratory approval metadata uses local LOD paths. R9 handoff metadata uses source-relative paths; its original file hashes remain intact.

Scripts that replay dated reviews or older Elena revisions are archival workflows. They preserve their source inputs and assertions but are not part of normal build/test/pack commands and may require the matching historical runtime manifest. In particular, `pack-mourning-motion-expansion.mjs` replays R10 and intentionally rejects the current R11 handoff. `sync-monster-update.mjs` is disabled historical deployment machinery. Do not run old version packers over the current runtime merely to verify portability.

Excluded material consists of generated preview renders, browser/vendor snapshots, caches, backup revisions and redundant GLB interchange copies where original FBX plus textures are retained. Current repack GLBs remain bundled. A future intentional edit to a registered original must update its inventory byte count/hash before the archive integrity check; preserve the recorded original hash as provenance.
