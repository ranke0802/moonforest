# Rig, retarget and motion

## Start from proportions and ownership

Measure the candidate's shoulder/hip centres, upper/lower segments, digitigrade hock/metatarsal segment, feet, neck and jaw hinge in model metres. Record forward/up axes and the intended game scale. Fit these landmarks to the new unit; R8's 28 joints and game scale 2.5 are a reference contract, not a mandatory rig/scale for every dog.

For an existing approved rig, retain its topology, rest transforms, inverse binds, normals and weights. For a new mesh, transfer motion by joint roles and measured rest-space transforms, not matching names alone. New weights require independent pose/colour review. A copied weight table is valid only for proven identical vertex order/topology and bind configuration.

## Fixed limb construction

- A forelimb uses scapula/shoulder, elbow, wrist and paw; a hindlimb includes hip, knee, hock/metatarsal and paw. The hock is not a backwards knee.
- Keep segment lengths fixed. Clamp unreachable IK goals to the reachable envelope; change body placement or the step, not bone scale. Retain a small, stable pre-bend/pole plane and continuous quaternion signs.
- Paw support phases are world-stable while the torso moves over them. Lift, flight, landing and push-off must be distinct. Sideways avoidance is not a forward run translated sideways with planted feet.
- Keep shaft/muscle cores nearly rigid. Blend narrowly around joints. Check belly, chest, fur and tail-base vertices for accidental leg influence. Do not hide bad weights by making the entire joint soft.
- Check both articulated bone length and evaluated skin: fixed bones can still yield a visibly rubbery thigh. Core thickness, joint collar compression, connection gaps, intersections and local edge strain are separate measurements.

## Motion structure

Keep the authored root's horizontal travel and yaw available for extraction. The game applies that travel once and cancels the sampled planar transform in its carrier. Preserve root pitch plus pelvis/chest height. The R8 dodge-lunge's airborne height is below the root: stripping torso translation flattens the jump.

Use a short clear preparation, rapid contact, deceleration and recovery. Runtime whipping remaps source time monotonically; it must not skip the contact interval, reverse time or alter bone length. Document source contact time separately from the wall-clock time after whipping and attack-speed settings.

For a visible head nip, restrain jaw opening to what the weighted muzzle supports. R9's 0.20 radian opening is a wolf-specific measured limit; larger gaps deformed the muzzle and were rejected. Retargeting to a different jaw requires a new deformation check, not an unconditional 0.20 limit.

Do not author a wide, high forepaw sweep merely to make a wolf look aggressive. R9's `Wolf_Forepaw_Swipe_V02` is a historical low supporting step, and the R10 bites are preserved historical sources. Current R11's compatibility action ID `paw-swipe` uses `Wolf_Predator_Reverse_Bite_V02`. Use rear-leg propulsion, forward torso weight, a planted support and a clear diagonal upper-body trajectory. Restrained jaw opening or an isolated head nod does not make a forceful whole-body attack.

The R10 right/left orbit clips follow a real circular path, with planted foot targets on the original fixed-length rig. Left reuses the motion idea, not opposite-side bind offsets: the model is slightly asymmetric. Reflecting opposite local translations changed joint lengths and was rejected. Solve each side against its own bind lengths and mirror all relevant step phases/rotations rather than root alone.

## R11 authored attack and reaction contracts

The two R11 bites drive the pelvis, spine, chest and nape through a large counterwindup, centred bite and opposite diagonal follow-through. The head inherits the chain and adds a small local snap. Preserve those authored rotations through the entire runtime attack: a global head aim or attention pass must not cancel the torso-led gesture. Compare source and post-sampler upper-body excursions, not actor yaw or jaw opening alone. Apply jaw/ear hinge axes relative to the rotating head; R11 retains the measured 0.20 radian muzzle limit.

`Wolf_Backward_Brace_V02` is a separate 0.90 second standing support step, travelling -0.48 model metres in glTF forward Z while facing the opponent. At the current 2.5 scale that is about 1.20 game metres. Named support windows and a matching translated standing endpoint permit retreat/re-entry without falling. R11's original brace-only nonlethal rule was explicitly superseded by the user's R13 request: current heavy/shield knockdown reuses the approved collapse and adds supported get-up, while death/reward states remain separate.

`Wolf_Staggered_Collapse_V02` is a 1.65 second articulated lethal fall with a settled source hold from 1.42–1.65. Shoulder, pelvis, flexed knees/hocks, head and loose tail release/settle sequentially rather than rotating four rigid standing legs as a unit. R11's generated relaxed-pose concept was inspected before collapse authoring; it supplied composition, not authoritative anatomy. Keep the actual stocky mesh, asymmetric bind lengths and firm muscle cores. The researched wildlife impact was nonfatal; the final death is an authored artistic extrapolation. Runtime then adds a 0.65 second endpoint hold and 5 second fade.

Check cheek/muzzle, shoulder/chest, hip/thigh, paws and tail on the evaluated skin. A fur-covered flank can conceal deeply buried joints even when the visible face appears grounded. Use the opposite limb side, low quarter and full-tail top views plus per-region floor minima and settled-vertex motion. Report residual joint-collar folds separately from unchanged rigid cores; do not expose a hidden limb by stretching or reweighting the original. See [the R11 review report](../../../../Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.html).

## Historical R12 charge-only composite

This section preserves the R12 source contract. Current R13 selects a compact grounded derivative and actual-prone runtime staging; do not apply R12's long approach distance or whole-suffix 1x wall clock to it.

`Wolf_Ram_Ground_Maul_V02` is one 5.20 second/60 Hz derivative; keep the approved R11 bites, brace and collapse unchanged. Preserve the shipped R8 root dodge/leap trajectory through source 2.75, including its exported first-key hold. Near source 2.62, author a closed-jaw cranium brace at the actual standing player's body height. Raw R8 head height was too high when ordinary runtime aim was removed: do not merely reuse that raw pose and mark it `authoredAttention`.

Decelerate/land, then lower and move the solid torso forward over fixed-length support legs. Root advances 0.20 model metres using staggered steps from 2.75–3.35; all four paw anchors hold during both low bites. The actual muzzle/teeth must meet the real prone torso skin at the game's 2.5 scale, rather than floating above it while a generous bone capsule passes. R12's final source muzzle centroid at both bite centres is about 0.1045 model metres high (0.2613 game metres). This is a measured result for this mesh, not a universal target height. Genuine forward chest/neck articulation corrected an initially short skin contact; no limb scaling, core deformation, target teleport or new weights were used. The restrained jaw limit remains 0.20 radians and the two low bites have opposite diagonal body/nape tugs.

The native player's fall is only low enough after about 0.833 real seconds. Contact centres 3.65/4.20 occur 1.03/1.58 seconds after the 2.62 ram. Post-ram playback is fixed 1x real time, while prefix whipping and user speed remain configurable. Do not shorten that real settling interval by speeding the entire composite, or extend the player's native fall with a capture/hold. Exact runtime contact windows and range calibration are in [combat-runtime.md](combat-runtime.md); broad source authoring envelopes are not the accepted tooth-contact windows.

After bite two, root retreats 0.23 model metres over 4.32–5.10. Solve support goals against each side's actual bind lengths: fore.R/hind.L step 4.34–4.72, then fore.L/hind.R 4.69–5.05. The final 5.10–5.20 hold matches the actual original `Circle_Watch_R5` first exported pose after cancelling only root planar travel/yaw, including root height/pitch, pelvis, knee planes and asymmetric paw positions. Its fore.L is intentionally slightly raised and unweighted, while the other three paws support. A neutral-bind endpoint caused about 0.38 game metres of foot displacement during the watch blend and was replaced with these real recovery step goals.

Measure inherited R8 prefix floor/attachment noise separately from the newly authored post-landing section. Review original-colour front/side/quarter and joint views plus the full paced sequence and post-sampler wolf/warrior skins. Keep exact bone lengths, muscle-core thickness and joint-collar folds distinct in the proof. See [the R12 charge report](../../../../Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R12_돌진_검토보고서.html).

## Current R13 support and compact charge

`Wolf_Supported_Get_Up_V02` is 2.20 source seconds at 60 Hz. It begins at the unchanged R11 collapse's actual relaxed endpoint, rather than a generic supine pose or reverse whole-body roll. The head lifts, a forepaw draws under the sternum, the chest unrolls into support, hind paws tuck asymmetrically, and the torso rises. Named tuck/landing and final stance-adjustment phases lead into the original WATCH0 root height/pitch and all joint/foot orientations. Fore.L is deliberately raised and unweighted at the final watch pose; do not label it planted. R13 nonlethal playback is collapse 1.65 s +0.30 s floor hold +2.20 s get-up; the lethal endpoint hold/fade/reward lifecycle remains separate.

`Wolf_Backward_Run_V02` is a real 0.60 s loop with -0.80 model metres of glTF forward-Z travel, 3.333 game m/s at scale 2.5. Fore.L/hind.R support the first half, fore.R/hind.L the second. Preserve full-pose loop-relative position, phase and fixed muscle cores while root accumulates across cycles. Check entry/exit with actual world anchors as well as the wrap seam: WATCH starts in a different stance, so loop-only numerical checks do not prove a slip-free transition. Do not turn the old brace into a backward run through a large speed multiplier.

`Wolf_Close_Ram_Ground_Maul_V02` is 200/60 seconds. A compact grounded diagonal support drive enters the approved R12 closed-head brace geometry; there is no eight-metre airborne shortcut. The source ram centre is 0.753333 s. A whole-84-channel retime makes the +0.20 model metre pursuit step quick, with source jaw centres 1.783333/2.333333 and a stepped -0.23 model metre recovery into the preserved watch-foot pose. From original R12 3.37 s onward, the 60 Hz contact/recovery poses retain their values apart from floating-point export error and constant planar/time rebasing. The earlier pursuit is deliberately retimed and must not be described as an identical R12 suffix.

Current gameplay first waits for actual native prone geometry, then plays the entire pursuit over about 0.24 real seconds and settles/lowers for about 0.22 seconds. Typical jaw centres are around 1.33/1.88 real seconds after ram, although their source offsets remain 1.03/1.58. Preserve this distinction in tooling, clips metadata and previews. It is a monotone full-pose mapping, without a player hold/capture or root-only acceleration. Real actual-skin/body contact and get-up/escape cancellation remain necessary. The raw source films are marked RAW SOURCE 1x because they do not show this gameplay staging.

The original mesh, 28 bind joints, asymmetric lengths, 4K atlas, weights and rigid muscle cores are unchanged. A low body posture can bury the tail while every foot passes; R13's tail arc was corrected through rotations while maintaining attachment/length. Review the full source-colour surface from front/side/quarter plus knee/elbow/hock closeups, floor minima and source versus post-runtime skins. Existing angular collar folds remain separate from rigid shaft/core preservation. Current integration contracts and evolving verification scope are in [combat-runtime.md](combat-runtime.md) and [the R13 report](../../../../Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R13_전투_검토보고서.html).

## Validation and export

Sample full actions and loop seams; include fast playback. Measure maximum segment-length error, bone-scale excursion, attachment gaps, paw support drift, ground penetration, rigid-core thickness and joint-band deformation. Use thresholds relative to the new unit's dimensions and record them; do not copy the wolf's measured maximum as a universal pass threshold.

Render with the actual colour texture at front, side and three-quarter angles; enlarge shoulder/elbow/wrist, hip/knee/hock and muzzle. Include preparation/contact/recovery and take-off/landing. Review colour and a neutral/matcap view because skin colour can hide collapsed geometry. Inspect the exported GLB in the game sampler as well as the Blender source.

New exports must retain intended clips, root/yaw metadata, morphs and texture mappings. Register the authoring source, animation export and validation/render evidence under a new version. A matching texture hash or unchanged vertex UV bytes alone does not prove that the deforming surface preserves the pattern.

When Blender tooling is available, follow the installed Blender rigging/expert instructions for that version. If unavailable, retain the approved deformation/skin data and state the narrower verification scope; do not claim unrendered motion quality.
