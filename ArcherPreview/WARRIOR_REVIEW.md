# Archer / Warrior web review — 2026-10-21

Warrior uses the supplied native Run_03 for movement and the approved Thrust_Slash for attack. Archer remains the default with its existing asset and gameplay.

- Delivery: `C:/dev/blender-workbench/projects/violet-vanguard-biped-equipped/Violet_Vanguard_Run_Attack.blend`. The approved `Violet_Vanguard_Repaired.blend` is preserved.
- Run source: `C:/Users/ryank/Downloads/Meshy_AI_Violet_Vanguard_biped (1).zip`, Run_03, 25 frames at 30 FPS (0.8 seconds). Export samples at 60 FPS. All 49 sampled native world poses match the source exactly.
- Attack: unchanged approved 181-frame Thrust_Slash at 60 FPS. Ready holds its first pose. Attack completes before movement resumes; holding Attack/J repeats it.
- Sword is rigid, mounted to the right hand in Run; approved attack sword motion remains unchanged. Shield stays on the left forearm with its approved offset and straps. Run checks found no blade/shield contact; sword grip and shield mount errors stay below 0.001 mm.
- WASD/touch runs at up to 4.4371 m/s (estimated from planted toe travel). Analog input scales both travel and gait rate. Only movement/attack are exposed. No Warrior target-hit detector is included.
- Export bakes constant finger grip into geometry and retains all skin influences. Painted unlit materials match Archer. glTF uses linear skinning.
- Reimport comparison across Ready, Run and Attack samples all six body/equipment meshes. Maximum sampled export/reimport error: 0.0265 mm. Reimport renders were inspected.
- 53 automated tests pass: all three actual GLB clips and transitions, body/sword synchronization, movement/attack controller, camera follow, mouse/wheel input and existing Archer coverage.
- Local browser: WASD changes position and enters Run; J enters Attack; release completes the clip and returns to Ready. Browser console has no errors. Left/right mouse drag rotate; middle drag pans; wheel zooms. Touch supports joystick and pinch zoom. Physical-phone testing is not implied.

Evidence: source project's `qa/run_equipment_verification.json`, `qa/movement_web_export.json`, `qa/movement_web_roundtrip.json`, `qa/web_run.png`, `qa/web_attack.png`.
