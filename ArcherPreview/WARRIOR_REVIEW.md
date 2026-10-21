# Archer / Warrior web review — 2026-10-21

Warrior Run_03 now uses a controlled sword/shield carry. Attack, Ready and Archer are preserved.

- Delivery: `C:/dev/blender-workbench/projects/violet-vanguard-biped-equipped/Violet_Vanguard_Controlled_Run.blend`. The previous `Violet_Vanguard_Run_Attack.blend` is preserved.
- Only six Run arm/forearm/hand rotations are authored anew; the sword follows the right hand with its existing grip. The shield keeps its existing left-forearm mount. Arms retain restrained native swing and partial torso counterrotation.
- Run legs, torso, head, cadence and world speed remain unchanged. Attack and Ready animation channel payloads are byte-identical to the prior published GLB. Arm-descendant export roundoff stays below 0.000001.
- Across all 49 run samples, the sword points within -7.83 to +7.91 degrees of forward in plan view. Shield front has positive forward projection throughout (0.518–0.842). Sword grip and shield mount errors stay below 0.001 mm; no blade/shield contacts were found.
- Actual front, side, rear-quarter and five-phase cycle renders were inspected. Reimported body/equipment geometry and all three clips pass verification. The 53 web tests pass, including real GLB clip transitions and existing Archer/input coverage.
- Movement remains WASD/joystick; J/Attack plays Thrust_Slash, finishes before movement resumes and repeats while held. No Warrior target-hit detector is included. Physical-phone and Unity/Godot testing are not implied.

Evidence in the source project's qa folder: controlled_run_verification.json, controlled_web_scope.json, controlled_cycle_sheet.png, movement_web_roundtrip.json.
