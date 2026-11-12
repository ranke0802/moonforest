# Approved wolf source and clip contract

Paths below are relative to the active project root. Resolve raw source IDs with `Sources/resolve-source.mjs`; never fall back to historical user-profile folders. This is a reference snapshot dated 2026-11-12; current manifests and code take precedence for actual implementation.

| Purpose | Canonical location |
|---|---|
| Original source ID | `wolf-attack-r8` |
| R8 Blender / GLB | `Sources/actors/tripo-monsters/wolf-attack-r8/blend/wolf-attack-r8.blend` / `models/alpha-wolf-attack-r8.glb` |
| R8 motion and checks | Same source: `actions.json`, `binding.json`, `limb-validation.json`, `export-validation.json`, `motion-continuity.json` |
| Prepared game source ID | `wolf-game-r8` |
| Prepared actor definition | `ArcherPreview/public/assets/alpha-wolf.json` |
| Added animation source ID | `wolf-v02-attacks-r9` |
| R9 authoring, export and checks | `Sources/actors/tripo-monsters/wolf-v02-attacks-r9/{blend,models,scripts,review}`, `clips.json`, `manifest.json`, `deformation-validation.json` |
| R9 preparation | `ArcherPreview/scripts/prepare-wolf-v02-attacks.mjs` |
| Current feral motion source | `wolf-v02-feral-r10` / `Sources/actors/tripo-monsters/wolf-v02-feral-r10` |
| R10 preparation and runtime | `ArcherPreview/scripts/prepare-wolf-v02-feral.mjs` / `src/wolf-v02-feral-clips.json` |
| Runtime added clips | `ArcherPreview/src/wolf-v02-attack-clips.json`, `wolf-v02-authored-clips.js` |
| Sampler / base encounter | `ArcherPreview/src/wolf-animation.js`, `wolf-encounter.js`, `wolf-spec.js` |
| 0.2 encounter / patterns | `ArcherPreview/src/wolf-v02-encounter.js`, `wolf-v02-spec.js` |

R8 is 25,080 triangles, 28 joints, 12 clips, one Breath morph, and the approved 4K colour texture. The game uses scale 2.5 (standing height about 3.75 m). That enlargement is intentional; do not infer that every canine should use it. Preserved 0.1 walk/run speeds are 0.9/4.2 m/s. The later user-authorized 0.2 feral version approaches attacks at 6.6 m/s; read current gait cadence and loop offset in `wolf-v02-spec.js` rather than copying 0.1 speeds.

R8's source clip names keep `_R5` for compatibility:

| Role | Clip |
|---|---|
| Rest / detect / rise | `Rest_Lie_R5`, `Alert_Lie_R5`, `Rise_From_Lie_R5` |
| Watching/circling | `Circle_Watch_R5` |
| Locomotion | `Wolf_Walk_R5`, `Wolf_Run_R5` |
| Dodge → take-off → bite → landing | `Run_Dodge_Lunge_R5` |
| Pin → bite | `Pin_Throat_Bite_R5` |
| Hit / brace | `Hit_Cower_R5`, `Knockback_Brace_R5` |
| Down / get up | `Knockdown_Fall_R5`, `Get_Up_R5` |

Run period is 17/30 seconds at reference review speed 4.2 m/s. The lunge source is 3.1 seconds: original dodge event 0.85, take-off 1.65, original bite event 2.25 seconds. Gameplay's pose-calibrated contact time may differ; read current attack specs. The body's leap translation below root must remain. The watching clip is long (43.4 s); its full duration need not block the AI from selecting the next behaviour.

R9 added `Wolf_Snap_Bite_V02` (0.9 s) and `Wolf_Forepaw_Swipe_V02` (1.0 s). They remain available for history and comparison. R10 adds `Wolf_Driving_Bite_V02` (44/60 s), `Wolf_Driving_Cross_Bite_V02` (0.8 s), and right/left `Wolf_Orbit_Step_V02` / `Wolf_Orbit_Step_Left_V02` (0.9 s). Current 0.2 actors therefore have 18 available clips; the shared template and preserved 0.1 retain 12. Availability is not a claim that all 18 play during every fight. Continuous bites reuse the current driving bite under independent action serials. Death uses down/hold/fade, not an invented separate death animation.

Default wolf presentation: PBR appearance off; cartoon shading; outline on 0.60 px; internal lines on strength 0.25; brightness 1.20. Use the `wolf` expression/settings group, not another boss's saved values. Approved 4K texture, original LOD and other actors' appearance remain unchanged.

The prepare script checks registered authoring/validation hashes and reduces only perfectly constant channels to their endpoint keys. Moving keys retain values and precision. Actor wrappers/targets are independent while their read-only key values can be shared.

Run the registered-source inspection:

```powershell
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-attack-r8 --model models/alpha-wolf-attack-r8.glb
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-v02-attacks-r9 --sidecar clips.json
```

The audit's tiny scale excursions near 1 (R9 floating-point error about 5e-7) are not intentional limb stretching. The helper flags material scale variation, validates finite/order/target contracts and registry hashes; it does not inspect UV appearance, skinned thickness, actual contact, or native-device performance. Use the source deformation evidence and rendered poses for those dimensions.

Existing regression files include `ArcherPreview/tests/wolf-integration.test.js`, `wolf-pattern-size.test.js`, `wolf-v02-authored-attacks.test.js`, `wolf-v02-integration.test.js`, `wolf-v02-patterns.test.js` and `wolf-v02-brain.test.js`. New tests may be added for new stalking/contact behaviour; read their assertions rather than relying on filenames as a pass claim.

The 2026-11-12 stalking/contact iteration adds `wolf-v02-hunt.test.js` and `wolf-v02-hunt-integration.test.js`. It reuses all 14 existing actions without authoring new TRS or changing the original model. Its current contact/AI contracts and autonomous engagement gate are described in [combat-runtime.md](combat-runtime.md); no raw-asset repack is needed for a behaviour-only change.
