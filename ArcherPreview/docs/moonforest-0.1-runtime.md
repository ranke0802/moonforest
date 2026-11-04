# MoonForest 0.1 authoring and runtime

Run commands from `ArcherPreview` using Node 22.12 or newer. These tools reuse the game scene and existing resource/combat paths. They do not add normal-play enemies or automatic cinematic triggers. The bear experiment is not game content.

## Actor definitions

[actor-definition-template.json](actor-definition-template.json) is an exact data copy of the registered `hooded-goblin.standard` definition: asset `hooded-goblin`, version `Hooded Goblin - 12 source motions`, HP 180, collider radius .34, stop distance 1.05, separation radius .42, and the existing movement/animation profile. It is a template, not an automatically imported registration file.

To register a variant, copy the record into [ACTOR_DEFINITIONS](../src/actor-definitions.js) with a new stable `actorDefinitionId`. Keep the asset ID/version unchanged when reusing the current registered resource. The development actor selector reads that registry; it does not require another combat implementation.

For a genuinely new model, first register its distributable runtime manifest and asset version. The adapter checks the manifest's exact `config.version`, required clip names and animation mappings before cloning. Regenerate/check the metadata catalog:

```sh
node scripts/build-asset-catalog.mjs
node scripts/build-asset-catalog.mjs --check
```

Use the existing encounter type whose rig, clips and gameplay behavior the asset supports. Current adapters accept validated HP, collider and animation mappings, while enforcing the existing movement profile. Arbitrary speed/behavior overrides and Mourning clip remaps are rejected. Style/bounds/drop/quest fields describe the registered profile; inventing another profile name does not implement a renderer or behavior. New behavior needs an explicit adapter and tests.

[createActorEncounterFactory](../src/actor-encounter-adapter.js) shares eligible source geometry/materials/textures while creating independent skeletons, morph managers and pose state. `warm()` uses existing preparation, toon, outline/internal-line and shader paths. Warm respawn resets the prepared actor without reparsing its model or duplicating its geometry/outline/material bindings.

[ActorPopulation](../src/actor-population.js) reserves slots before asynchronous work. It enforces total, active, per-definition, per-category and estimated-memory caps. The development hard maximum is 20 slots, with a default 512 MiB **estimate** cap and one concurrent preparation. This is an experiment ceiling, not a device concurrency or 60 FPS guarantee. Explicit overflow fails rather than silently reducing a requested count.

Lifecycle is `preparing → active → dying/corpse → recycle → dormant`, with explicit cancellation/disposal. Death, reward acknowledgment and respawn flags belong to one life. Respawn/idle clocks use unpaused update time; a temporarily occupied spawn retries the same ticket. Map generation changes cancel preparation, hide owned results and reclaim late completions. Idle/pressure eviction releases eligible dormant actors; the final owned source reference releases its library. Retiring asynchronous resources remain charged until cleanup completes.

The existing main loop owns this order: population scheduling/NPC update, **one** `BossBattle.update`, then population observation. Combat adapters do not run a second encounter update. Only distant peaceful NPC `decide()` work is staggered; pose/update, interaction and incoming/projectile/quest-relevant semantics stay live. Spawn validation checks map, navigation, player safety and occupancy before creation.

Rewards are opt-in at the factory (`rewardsEnabled: true` plus the existing `onDefeat` handler). Actor experiments and cinematic visuals keep rewards disabled. Population `onReward` observes an adapter acknowledgment; it must not grant the same gold/quest credit again. Clear, recycle, map exit and cinematic seek grant nothing. The representative `village.guard` uses the existing guard interaction and a peaceful reused visual; it adds no story/dialogue content.

## Catalog and placement overlays

[asset-catalog.js](../src/asset-catalog.js) is generated metadata. Search/import does not load every model. `assetId` identifies a resource; `version` identifies its exact actor manifest version or static glTF content hash. `instanceId` identifies one placement. Preserve all existing base/quest/chest IDs.

The current editable static allowlist is **handcart**, **firewood** and **crate-barrel-cluster**. Other deployed entries are not automatically approved. Base placements are read-only; structures, terrain pads and baked walls need certified derived-data regeneration. Houses, trees, rocks and wooden/structural walls are locked against reduction. No original is deleted or silently replaced.

[placement-document.js](../src/placement-document.js) validates version-1 overlays against the immutable four-map base revision. Coordinates use `RH_Y_UP_METRES`; rotation is normalized quaternion `[x,y,z,w]`; scale is positive and uniform within the catalog range. Position is the support anchor in world metres. Attachment records surface, outward unit normal, offset and immutable support ID. Actual static vertices determine contact; navigation uses conservative transformed bounds.

Ground solids update collision/navigation only on commit. Wall, ceiling and free decorations explicitly require `collision: "none"`; they do not create phantom ground blockers. Supports are terrain or immutable base IDs. New-overlay parenting is unsupported. Preview updates one target, while commit publishes a revision, bounds, visibility/demand/outline/shadow state, navigation and minimap invalidation. Undo/redo preserves IDs and advances revision. Exit/map change removes owned nodes/obstacles and restores the original navigator.

Saving has separate meanings: browser draft, exported JSON, browser-applied overlay, local project application and deployment. Validate and apply an exported file through the actual game loader contract:

```sh
node scripts/apply-authored-map.mjs "C:/exports/village.overlay.json"
node scripts/apply-authored-map.mjs "C:/exports/village.overlay.json" --apply
```

The first command is a dry run. `--apply` writes `public/authored/maps/<mapId>.json` and [authored-map-index.json](../src/authored-map-index.json). [authored-map-loader.js](../src/authored-map-loader.js) verifies the registered hash/revision and rechecks the placement/surface contract. It lazily loads only selected resources through the existing static instancing, LOD and texture policies. Browser storage does not write repository files or deploy GitHub Pages.

## Cinematic files

[cinematic-document.js](../src/cinematic-document.js) is the shared validator and absolute-time evaluator for studio and game. The JSON format is `moonforest-cinematic`, version 1, with `cutsceneId`, `mapId`, `catalogRevision`, duration, anchor, actors, shots and tracks. Geometry, textures, embedded game source, arbitrary JS/URLs and unregistered references are not accepted.

- Times, clip ranges and duration use seconds; duration is .1–600 seconds. Files are at most 512 KiB and reference at most 20 actors.
- Coordinates are right-handed Y-up world metres. The anchor transforms file-local positions/quaternions into map space exactly once. Scale is a positive uniform multiplier.
- Camera position/target use metres; FOV uses **radians**, .1–2.8. Target must differ from position. Shots are ordered and contiguous from 0 through duration.
- Interpolation is `step`, `linear` or `smooth`. Actor transform keys increase strictly. Clips use actual registered group names, validated clip start/end times, loop and blend-in/out. At most two segments blend per actor.
- Subtitles are text. Audio references existing allowlisted IDs. The only event is a diagnostic `marker`; there are no reward/quest events.

Use the dedicated studio to select existing maps/resources/clips, edit shots and transforms, preview, seek, undo/redo and import/export JSON. The AI prompt-copy/JSON-import workflow calls no paid API and does not claim automatic generation. Unregistered local assets need a distributable asset ID/version before project registration.

[CinematicPlayer](../src/cinematic-player.js) advances from the existing paused game delta, not wall clock. Hidden/settings pause does not fast-forward on return. Seek samples camera/actor/skin/morph state immediately without emitting audio or events. Empty animation segments restore prepared idle at 0. Cues fire once per playback cycle; loop clears that cycle's cue set, while seeking alone does not reissue cues already fired.

[cinematic-scene-host.js](../src/cinematic-scene-host.js) uses the existing scene/engine/FrameLoop and [game-tool-lease.js](../src/game-tool-lease.js). It does not start another engine/RAF. Animated visuals use existing factory `warm()` preparation without summon, AI, contact or rewards. Native clip sampling refreshes skin palettes even between seeks in one render ID. Mourning retains the existing corrective morph/knee/halo/cloth paths with deterministic absolute clocks. New static visuals share the placement renderer in nonpublishing mode, leaving game collision and placement metadata intact. Existing bound static instances are read-only and enforce asset identity/transform checks.

Completion, skip, replacement, errors, death, map change and context loss share idempotent ownership cleanup. Owned audio/input are cleared; old-map actors/camera are never restored. Warm actor caches are bounded by count/definition/estimated-memory limits, with pressure/idle eviction and explicit disposal. Physical-device GPU residency/FPS remains unmeasured.

Register the same exported file without rewriting it:

```sh
node scripts/register-cinematic.mjs --input "C:/exports/neutral-shot.json"
node scripts/register-cinematic.mjs --input "C:/exports/neutral-shot.json" --apply
```

The first command validates only. `--apply` writes the content-addressed JSON under `public/authored/cinematics/` and updates [cinematic-registry.json](../src/cinematic-registry.json), with SHA256/byte-count checks and guarded registration. [cinematic-registry.js](../src/cinematic-registry.js) loads and validates that exact file. A browser registration is a separate local list; project registration adds a replayable entry, **not** a normal-play trigger. Then use the existing build/deployment workflow:

```sh
npm run build:village
```

Do not register the bear experiment or a test-generated scene as production content. Neutral development examples remain explicitly selected.

## Verification scope

See [population evidence](../reports/phase2-population.json), [placement evidence](../reports/phase3-placement.json), [cinematic host evidence](../reports/phase4-host.json), and the independent [placement](../reports/moonforest-0.1-2026-11-04/phase3-verification-summary.json) and [actual-host](../reports/moonforest-0.1-2026-11-04/phase4-verification-host.json) reports. They cover actual packed assets/native CPU submissions, IDs, collision, poses, cancellation and resource plateaus. They do not establish browser pixels, actual GPU timing, device FPS or thermal performance.
