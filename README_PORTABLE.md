# MoonForest portable workspace

This folder contains the editable project, prepared game resources, original source inputs, and its own Git history. It can be moved to another folder or drive. It does not use the former worktrees, a shared `node_modules`, or assets in a user profile.

On Windows x64, **Launch.cmd** starts development and **Package.cmd** creates a new portable archive. The included public Node and Python runtimes are preferred over system installations. No browser is opened automatically. Stop the development server with Ctrl+C.

On the first launch, npm installs dependencies into the physical `ArcherPreview/node_modules` directory. This needs an internet connection to the npm registry. Moving an existing checkout on the same platform keeps that local installation usable; a fresh archive installs it again.

## Commands

Use Node **24** (minimum **22.12**) and its npm. On macOS/Linux, install these normally; packaging also needs Python **3.10+** and Git on PATH. Windows includes Node/Python, but Git must still be installed for packaging or restoring history. No third-party Python packages are required for normal game build/test/archive commands. Optional asset authoring needs separately installed NumPy/Pillow or other documented tools; see [Sources/README.md](Sources/README.md).

```sh
npm run setup             # npm ci inside ArcherPreview; restore archived Git history if needed
npm run dev               # development server; installs missing local dependencies
npm run build:village     # build the current prepared resources into ArcherPreview/dist-village
npm test                  # existing game test suite
npm run portable:verify   # source hashes, local paths, links, and archive inventory when present
npm run portable:duplicates # exact duplicate groups and cautious retention recommendations
npm run portable:test     # small offline packaging/history regression fixtures
npm run package           # create exports/portable/MoonForest-portable.zip
```

MoonForest 0.1 remains the preserved `ArcherPreviewSite/index.html` release at
`a40d4ed`. The separate 0.2 entry is `ArcherPreview/moonforest-0.2.html` in
development and `ArcherPreviewSite/moonforest-0.2.html` when published. Inside
`ArcherPreview`, use `npm run build:moonforest-0.2` and
`npm run sync:moonforest-0.2` for an additive 0.2 deployment. These commands verify
the preserved 0.1 inventory and reuse the same resource graph; they reject
changes to protected 0.1 files. Do not use `sync:village` to publish 0.2.
The 0.2 preferences and progress are written to a separate browser namespace.

If the global Windows Node is older, use Launch.cmd / Package.cmd, or invoke the bundled Node directly:

```powershell
.\Tools\portable\runtime\win-x64\node\node.exe Tools/portable/cli.mjs setup
.\Tools\portable\runtime\win-x64\node\node.exe Tools/portable/cli.mjs build
```

`MOONFOREST_PYTHON` may name a Python executable on other systems. Runtime paths are derived from this folder, never from the original machine. The root build command intentionally uses `build:village`. It does not run the legacy raw-asset repack pipeline. Direct commands also work from `ArcherPreview`: `npm ci`, `npm run dev`, `npm run build:village`, and `npm test`.

## Making and moving an archive

Finish edits and stop other jobs that rewrite project files, then run Package.cmd or `npm run package`. The command verifies `Sources/source-inputs.json`, inventories all physical project files including required untracked raw inputs, and writes a ZIP64 archive. It hashes files again while writing and refuses a changing project. It also writes a `.files.json` inventory and `.zip.sha256` checksum beside the ZIP.

The developer archive omits application `node_modules`, `dist`, `dist-village`, caches, temporary files, exports, credentials, and `.git`. It also omits the duplicate `ArcherPreviewSite` deployment snapshot: build it again with `npm run build:village`, then `npm run sync:village` inside `ArcherPreview`. Canonical deployment files and their Git history are kept. Bundled npm's own internal dependencies are included because they belong to the portable toolchain. No symlinks, junctions, external source directories, or `.git` worktree pointers are accepted as package inputs. Prepared resources and `Assets/Resources/Audio` keep their repository-relative layout.

Historical `Sources/**/exports` directories containing registered Blender/FBX originals are an explicit source-workflow exception: their sibling paths are preserved. The current project's generated exports, including the portable ZIP output itself, are still excluded.

`npm run portable:duplicates` writes exact content-hash groups and byte totals to `exports/portable/duplicates.json`. It distinguishes deployment copies from source-format/workflow and prepared-resource copies. It never deletes raw files. Old app content/bundles remain in the archive unless their absence is separately proved safe for every manifest, catalog, test and source-processing workflow.

Legacy Unity `Assets` outside `Assets/Resources/Audio`, `Packages`, `ProjectSettings`, and any `Tools/Archive` are not required for the normal Babylon game commands. They remain included as optional editable history/workflows rather than being silently discarded. The duplicate audit reports these separately; `Assets/Resources/Audio` is required by current web audio tests and workflows.

The ZIP contains a top-level `MoonForest` directory, `PORTABLE_FILES.json` (SHA-256/size for every other archived file), and `HISTORY.bundle` (standalone Git history for all refs). Entry order, timestamps and permissions are fixed; the same files and Git refs on the same tool versions produce the same archive. The manifest excludes itself from its hash list.

Extract into a **new empty parent directory**, keep the whole `MoonForest` folder together, and run Launch.cmd or `npm run setup`. Setup restores a real local `.git` from the checked history bundle without overwriting extracted files, preserving the original Git text-normalization policy (`core.autocrlf` / `core.eol`), then runs npm ci. No old repository or remote server is required for that history. `npm run portable:verify` checks extraction integrity; after intentional source edits, the original archive inventory will naturally differ. Packaging makes a fresh inventory of the edited tree.

The full restored Git index initially reports intentionally omitted tracked `ArcherPreviewSite` files as deleted. Rebuild+sync recreates the current deployment, or `git restore -- ArcherPreviewSite` restores the historical snapshot from the included history. The restored repository has no configured remote; add the official remote explicitly when you want to fetch or push. Neither operation is needed to run or build the game.

Original source files and their hashes live under `Sources`; use `Sources/resolve-source.mjs` for asset workflows. Historical absolute origins in that registry are audit information, never fallback paths. Asset processing remains an explicit task and may require its own documented Blender/image/audio tools. Running the prepared game and building the site do not require those tools.
