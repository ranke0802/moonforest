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

Do not author a wide, high forepaw sweep merely to make a wolf look aggressive. The current R9 compatibility name `Wolf_Forepaw_Swipe_V02` describes a low supporting forepaw step and forward body pressure. Preserve that meaning unless a new action is explicitly requested.

## Validation and export

Sample full actions and loop seams; include fast playback. Measure maximum segment-length error, bone-scale excursion, attachment gaps, paw support drift, ground penetration, rigid-core thickness and joint-band deformation. Use thresholds relative to the new unit's dimensions and record them; do not copy the wolf's measured maximum as a universal pass threshold.

Render with the actual colour texture at front, side and three-quarter angles; enlarge shoulder/elbow/wrist, hip/knee/hock and muzzle. Include preparation/contact/recovery and take-off/landing. Review colour and a neutral/matcap view because skin colour can hide collapsed geometry. Inspect the exported GLB in the game sampler as well as the Blender source.

New exports must retain intended clips, root/yaw metadata, morphs and texture mappings. Register the authoring source, animation export and validation/render evidence under a new version. A matching texture hash or unchanged vertex UV bytes alone does not prove that the deforming surface preserves the pattern.

When Blender tooling is available, follow the installed Blender rigging/expert instructions for that version. If unavailable, retain the approved deformation/skin data and state the narrower verification scope; do not claim unrendered motion quality.
