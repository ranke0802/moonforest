# Archer / Warrior review, 2026-10-20 — motion v4

The existing `ArcherPreviewSite/` address offers an Archer / Warrior selector. Archer remains the default and its GLB and controller behavior are preserved. Switching disposes the previous character, clears held input/projectiles, and creates a fresh controller. Warrior uses stationary shield defense and three alternating sword attacks, with short-range target contacts.

## Asset checks

- Nine Warrior clips, native Rigify editing rig, original rigid armor surfaces, a right-hand sword seated near the crossguard, and a shield fixed to the left forearm with a cuff and separate handgrip.
- Six packed 2D working reference sheets. The shield hangs sideways during walking, rises with the bent arm during charging/guard, and follows the relaxed arm during cuts rather than independently facing the camera.
- Actual native Blender renders include multiple walking/running phases, attack extremes, grip views, recoil, and fall transitions. The fall's entire 91-frame evaluated geometry was checked against the ground, including body, armor, equipment, and baked cape.
- Rigify B-Bone segments converted to explicit runtime joints, with at most eight skin influences. The native rig remains in a separate review `.blend`.
- Dedicated runtime mount joints reproduce the native forearm attachment. All-frame native grip errors stay below 1 mm; export checks reject rigid mount drift above 0.1 mm. GLB reimport covers 45 body samples plus corresponding sword/shield samples.
- Browser rendering and shield stance were checked. This update preserves the existing Archer assets and controls. This is not a physical-phone performance certification.
- 45 existing/controller tests plus two actual-Warrior-GLB hierarchy/playback tests passed. The latter cover all nine clips and death/revive.

## Scope of delivery

This is a user inspection build. Source mesh topology was a fused surface; plate boundaries were separated from that original surface, retaining UVs and texture design. The web mesh is a reduced-density copy, while the native review file retains the editing rig and higher geometry density. Cape motion is baked per clip, not runtime cloth simulation. No Unity or Godot runtime test is claimed. The user's final visual approval remains pending.

Native review: `C:/dev/blender-workbench/output/violet-vanguard-animation-v4/Violet_Warrior_ImageMotion_v4.blend`.
Runtime export and detailed local QA: `C:/dev/blender-workbench/output/violet-vanguard-animation-v4/`.
Reference sheets: `C:/dev/blender-workbench/output/violet-vanguard-pose-review-v9/`.
