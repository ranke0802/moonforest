# Archer / Warrior web review — 2026-10-21

Warrior loads the approved repaired native Meshy model and its single Thrust_Slash animation. Archer remains the default with its existing asset and gameplay.

- Source: `C:/dev/blender-workbench/projects/violet-vanguard-biped-equipped/Violet_Vanguard_Repaired.blend`. The saved source is unchanged by export.
- 181 frames at 60 FPS. Body and sword are sampled together. Shield and straps retain their attachments. Play/pause, frame stepping, seeking, rate and repeat controls are available.
- WASD/touch translates Warrior's stage position only; the UI states that locomotion and target-hit detection are not included.
- Export geometry bakes the constant grip and converts the leather loop to mesh. All source skin influences are retained. Painted unlit materials match Archer. glTF uses linear skinning, without Blender's dual-quaternion option.
- Reimport comparison at frames 1, 20, 40, 67, 90, 120, 160, 181 samples each body/equipment mesh. Maximum sampled error is below 0.03 mm against export geometry. Actual reimport renders were inspected.
- 49 automated tests pass: GLB hierarchy and sword synchronization, seek/pause/end hold, camera-follow regression, mouse buttons and wheel units, and existing Archer coverage.
- Left/right mouse drag rotate; middle mouse drag pans. Touch mode switch supports pan; two fingers zoom. Wheel distance and rotation persist while the camera follows the character.

Local export evidence is in the source project's `qa/web_export.json` and `qa/web_roundtrip.json`. Browser review delivery does not imply Unity/Godot or physical-phone certification.
