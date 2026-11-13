# Approved wolf source and clip contract

Paths below are relative to the active project root. Resolve raw source IDs with `Sources/resolve-source.mjs`; never fall back to historical user-profile folders. This is an R11 reference snapshot dated 2026-11-13; current manifests and code take precedence for actual implementation.

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
| Preserved R10 motion / active orbit source | `wolf-v02-feral-r10` / `Sources/actors/tripo-monsters/wolf-v02-feral-r10` |
| R10 preparation and runtime | `ArcherPreview/scripts/prepare-wolf-v02-feral.mjs` / `src/wolf-v02-feral-clips.json` |
| Current R11 source | `wolf-v02-predator-r11` / `Sources/actors/tripo-monsters/wolf-v02-predator-r11` |
| R11 authoring and checks | Same source: `{blend,models,scripts,review}`, `clips.json`, `actions.json`, `manifest.json`, `deformation-validation.json` |
| R11 preparation and runtime | `ArcherPreview/scripts/prepare-wolf-v02-predator.mjs` / `src/wolf-v02-predator-clips.json` |
| Runtime authored clip selection | `ArcherPreview/src/wolf-v02-authored-clips.js` (`WOLF_V02_ACTIVE_CLIPS`) |
| Sampler / base encounter | `ArcherPreview/src/wolf-animation.js`, `wolf-encounter.js`, `wolf-spec.js` |
| 0.2 encounter / patterns | `ArcherPreview/src/wolf-v02-encounter.js`, `wolf-v02-spec.js` |

R8 is 25,080 triangles, 28 joints, 12 clips, one Breath morph, and the approved 4K colour texture. The game uses scale 2.5 (standing height about 3.75 m). That enlargement is intentional; do not infer that every canine should use it. Preserved 0.1 walk/run speeds are 0.9/4.2 m/s. Current 0.2 approaches at 6.6 m/s nearby and targets 9.2 m/s beyond 12 m; cadence follows actual speed via `speed / (4.2 * 2.5)`. The preserved 1/30-offset, 17/30-length run loop therefore takes about 0.646739 seconds at 9.2 m/s. Read current constants rather than copying 0.1 speeds.

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

Run period is 17/30 seconds at reference review speed 4.2 m/s. The lunge source is 3.1 seconds: original dodge event 0.85, take-off 1.65, original bite event 2.25 seconds. R11's calibrated 0.2 contact window is source 2.54–2.73 seconds, impact 2.62, with jaw/head only; forepaws cannot score this bite. Runtime contact calibration does not rewrite the source event or remove the body's leap translation below root. The watch clip is long (43.4 s); current new bouts use a separate 2–3 second observation budget even at far distance, not its full duration.

R9 added `Wolf_Snap_Bite_V02` (0.9 s) and `Wolf_Forepaw_Swipe_V02` (1.0 s). R10 added `Wolf_Driving_Bite_V02` (44/60 s), `Wolf_Driving_Cross_Bite_V02` (0.8 s), and right/left `Wolf_Orbit_Step_V02` / `Wolf_Orbit_Step_Left_V02` (0.9 s). R9 and both R10 bites are retained historical data. The two R10 orbit clips remain active.

| Active R11 role | Clip / source contract |
|---|---|
| Torso-led diagonal bite | `Wolf_Predator_Diagonal_Bite_V02`, 0.800 s, impact 20/60, +0.40 model metres |
| Opposite diagonal bite | `Wolf_Predator_Reverse_Bite_V02`, 52/60 s, impact 22/60, +0.44 model metres |
| Standing backward support | `Wolf_Backward_Brace_V02`, 0.90 s, -0.48 model metres / 1.20 game metres, facing forward |
| Articulated lethal collapse | `Wolf_Staggered_Collapse_V02`, 1.65 s, settled source hold 1.42–1.65 |

The live 0.2 actor has **18 active clips: original twelve + R10 orbit two + R11 four**. The shared model template and preserved 0.1 retain twelve. Historical source arrays are not extra live wrappers. Above 50% HP, the default bout is one attack; at/below 50%, confirmed in-reach hits may continue to at most three. Each new bout first observes for 2–3 seconds, including at far distance; in-bout continuations preserve the finite combo rather than restarting observation. Authored R11 attack attention preserves the complete torso/nape/head swing. Nonlethal heavy hits use the standing backward brace; a block uses flash plus `Hit_Cower_R5`. Lethal damage alone uses the new collapse, then an additional 0.65 second endpoint hold and 5 second fade.

Default wolf presentation: PBR appearance off; cartoon shading; outline on 0.60 px; internal lines on strength 0.25; brightness 1.20. Use the `wolf` expression/settings group, not another boss's saved values. Approved 4K texture, original LOD and other actors' appearance remain unchanged.

The prepare script checks registered authoring/validation hashes and reduces only perfectly constant channels to their endpoint keys. Moving keys retain values and precision. Actor wrappers/targets are independent while their read-only key values can be shared.

Run the registered-source inspection:

```powershell
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-attack-r8 --model models/alpha-wolf-attack-r8.glb
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-v02-attacks-r9 --sidecar clips.json
& '<project>/Tools/portable/runtime/win-x64/node/node.exe' '<skill>/scripts/inspect-canine.mjs' --project '<project>' --source-id wolf-v02-predator-r11 --sidecar clips.json
```

The audit's tiny scale excursions near 1 (R9 floating-point error about 5e-7) are not intentional limb stretching. The helper flags material scale variation, validates finite/order/target contracts and registry hashes; it does not inspect UV appearance, skinned thickness, actual contact, or native-device performance. Use the source deformation evidence and rendered poses for those dimensions.

Existing regression files include `ArcherPreview/tests/wolf-integration.test.js`, `wolf-pattern-size.test.js`, `wolf-v02-authored-attacks.test.js`, `wolf-v02-integration.test.js`, `wolf-v02-patterns.test.js` and `wolf-v02-brain.test.js`. New tests may be added for new stalking/contact behaviour; read their assertions rather than relying on filenames as a pass claim.

The historical 2026-11-12 stalking/contact iteration added `wolf-v02-hunt.test.js` and `wolf-v02-hunt-integration.test.js` while reusing its then-current fourteen actions. R11 checks include `wolf-v02-predator-runtime.test.js` and `wolf-v02-predator-integration.test.js`; review current results in `ArcherPreview/reports/wolf-v02-predator-r11` and [the R11 report](../../../../Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.html). Current contact/AI contracts and autonomous reach gates are in [combat-runtime.md](combat-runtime.md). A behaviour-only change still does not require repacking the original raw model.
