# Archer / Warrior review, 2026-10-19

The existing `ArcherPreviewSite/` address offers an Archer / Warrior selector. Archer remains the default and its GLB and controller behavior are preserved. Switching disposes the previous character, clears held input/projectiles, and creates a fresh controller. Warrior uses stationary shield defense and three alternating sword attacks, with short-range target contacts.

## Asset checks

- Nine Warrior clips, native Rigify editing rig, original rigid armor surfaces, right-hand sword and left-hand shield, and a cape baked from motion with gravity and collision constraints.
- 54 actual native Blender renders: beginning/intermediate/end and side/back samples across all nine clips, inspected for shoulder/wrist deformation, equipment and cloth behavior.
- Rigify B-Bone segments converted to explicit runtime joints, with at most eight skin influences. The native rig remains in a separate review `.blend`.
- Source LBS versus segmented skin: sampled maximum error below 0.008 mm. GLB export/reimport: 45 pose samples, maximum sampled body error below 0.018 mm.
- Browser rendering checked for Archer and Warrior, shield stance, death persistence, and switching from a dead Warrior back to a fresh Archer. Responsive layout checked in phone-sized CSS viewports; this is not a physical-phone performance certification.
- 45 existing/controller tests plus two actual-Warrior-GLB hierarchy/playback tests passed. The latter cover all nine clips and death/revive.

## Scope of delivery

This is a user inspection build. Source mesh topology was a fused surface; plate boundaries were separated from that original surface, retaining UVs and texture design. The web mesh is a reduced-density copy, while the native review file retains the editing rig and higher geometry density. Cape motion is baked per clip, not runtime cloth simulation. No Unity or Godot runtime test is claimed. The user's final visual approval remains pending.

Native review: `C:/dev/blender-workbench/output/violet-vanguard-animation-v1/Violet_Warrior_Review.blend`.
Runtime export and detailed local QA: `C:/dev/blender-workbench/output/violet-vanguard-animation-v1/`.
