---
name: moonforest-canine-unit
description: "Create, retarget, repair or integrate canine quadruped units in MoonForest using the approved alpha-wolf rig, motion, contact and combat patterns. Use for wolf/dog-family actors and their animation or AI; not unrelated bipeds or generic scenery."
---

# MoonForest canine units

Use the approved wolf as a measured reference, not a universal body size or a rig to bind blindly to every animal. Read the active project's `AGENTS.md` and `README_PORTABLE.md` first. Derive its root from the workspace or an explicit argument; `C:/dev/MoonForest` is today's location, not a required installation path.

## Choose the relevant work

- Rigging, retargeting, deformation, contact-height motion fixes or export: read [rig-motion.md](references/rig-motion.md).
- Game AI, attack selection, whipping, collisions, pooling or performance: read [combat-runtime.md](references/combat-runtime.md).
- Finding the actual approved sources, clip roles or reproducible checks: read [wolf-reference.md](references/wolf-reference.md).
- A complete new unit needs all three; a narrow timing fix does not need the historical asset archive.

## Essential contracts

- Preserve approved mesh, UVs, normals, weights, bind pose, textures, LOD and unrelated clips unless the request authorizes a change. Create a new asset/version for authoring changes. Preserve R7/R8 and the high-quality originals.
- Limbs keep fixed lengths and rigid muscle-core thickness. Use stable hinge planes and local joint blends. Do not reach targets by scaling bones, stretching the body, moving the player, broad weight mixing or moving belly/fur with a leg.
- Root planar travel has one owner. Preserve root pitch and the pelvis/chest vertical keys that carry the leap. Do not remove all translation tracks to obtain in-place movement.
- Contact follows the visible mouth/forepaw path and the player's real body capsule. Correct approach position and animation pose before enlarging a hit volume. Fast motion needs a bounded contact interval or sweep; a single sample can miss. Attack direction locks after commitment; escape and shield reactions remain real.
- Use the existing shared cartoon, outline and internal-line implementation. `PBR appearance off` does not mean deleting every `PBRMaterial`. Do not create a private engine, frame loop or per-actor internal-line render target.
- Separate immutable shared geometry/material/texture/key values from actor-owned skeleton targets, sampler cursors, pose, state and cleanup. Retain existing preparation budgets, cancellation generations and population limits.

## Evidence and handoff

Before calling an authoring result ready, inspect actual original-colour front, side and three-quarter renders plus joint closeups at preparation, contact, recoil, landing and loop seams. Add distant views for silhouette changes. Numerical bone/UV checks alone do not establish visual quality. Report joint-band deformation separately from rigid muscle cores.

For integration, test the AI's autonomous approach at the configured minimum/preferred/maximum engagement distances, not just a forced preferred-point attack. Verify actual contact and genuine misses at 30/60 Hz, attack-speed extremes, player movement/dodge/block, interruptions, 50% HP transition, narrow terrain, independent actors, repeated spawn/remove and late cancellation. Calibrate an out-of-reach start by correcting the approach band, not inflating the capsule. Test the affected four-map paths without browser automation. Node/NullEngine and offline Blender results are CPU/asset evidence, not mobile FPS, heat, GPU or touch approval.

Register required physical source files in `Sources/source-inputs.json` and resolve them through `Sources/resolve-source.mjs`. Preserve licenses and hashes. A portable package must contain this skill and every required authoring input; an installed user-skill copy is a convenience, never a runtime/build input.

The read-only audit helper checks registered GLB structure or an animation sidecar; it does not certify skin shape or combat feel:

```powershell
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-attack-r8 --model models/alpha-wolf-attack-r8.glb
```

This skill conveys production criteria, not authorization to replace unrelated actors, publish a release, or bulk-retarget all existing units. Apply it to the units requested by the user.
