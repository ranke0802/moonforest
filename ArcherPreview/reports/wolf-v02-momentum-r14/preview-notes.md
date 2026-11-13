# R14 playable review candidate

User review takes priority; no browser automation or broad test matrix was run for this preview.

- Continuous RUN through forehead ram, accepted native player fall and scoped throw, immediate pursuit, forepaw brace and prone-only maul.
- Articulated wolf airborne fall, impact-dependent bounded turn and natural diagonal side landing; supported get-up and lethal reward lifecycles remain separate.
- Attack whipping for head ram, pin/bite and diagonal bite; slight leg-length-relative alert crouch with fixed-length support and player-directed gaze.
- Reuse profile: `.agents/skills/moonforest-canine-unit/references/runtime-r14-profile.md`. Other wolf rigs require bind-axis/length and muzzle/paw calibration before sharing this layer.
- Optimization: unchanged-pose hurt volume transforms are cached by bone world-matrix revision; same-bone volumes share matrix reads. Repeated identical RUN samples and motion-spec allocations are avoided. Existing geometry, textures, LOD and shared rendering paths remain.

Basic native-warrior contact/guard/fall/reset checks are recorded by the preview smoke. The collision-cache check preserves all18capsule shapes/radii and verifies parent/bone invalidation. Its10identical-pose-query example reduces point transforms360→36; this is not a measured game FPS percentage. The user will review visual timing, naturalness and device performance.
