# Contact, combat behaviour and runtime budgets

## Current 0.2 implementation

The checked-in `ArcherPreview/src/wolf-v02-spec.js` and `wolf-v02-encounter.js` are the implementation source of truth. The current snapshot is R11, dated 2026-11-13. R9/R10 attacks remain historical sources; read current constants rather than treating an old table as an instruction to revert them.

Every new attack bout first consumes a 2–3 second player-centred orbit/observation budget, including when the opponent is far away. Do not skip that budget by immediately choosing a long-range charge. Above 50% HP, the default bout contains one attack; at/below 50%, confirmed close hits may form a finite three-strike bout. An in-bout continuation keeps its short punishable recovery without inserting another observation. Miss, block, interruption and lost reach cancel continuation. Custom sequences remain stored, with a reachable close-action fallback when a requested long attack cannot start safely.

Approach attacks by running at the current calibrated gait speed, not by slowing to the old 0.9 m/s walk near the target. R11 targets 6.6 m/s nearby and 9.2 m/s beyond 12 m, accelerating at 8 m/s². R8's export has an initial duplicate hold; 0.2 samples the actual 1/30-offset, 17/30-length moving loop. Playback rate is current world speed divided by `(4.2 * 2.5)`, so the 9.2 m/s loop takes about 0.646739 seconds. Match actual cadence during acceleration, preserve the source export and 0.1 sampler, and measure the wrap period as well as the formula.

Player-centred stalking now uses new right/left circular step clips, not Circle_Watch's unrelated long arc. Consume authored arc length around the current player centre, bound radial recentering to the available stride, and stop or choose the opposite gait when obstructed. Fixed-length analytic support-foot correction accommodates changed radius and moving centres without scaling bones. Keep pose originals/restoration slots private and preallocated; transitions must capture the unadjusted source pose. A reach limit releases/replans the step, never stretches it.

R8's visible head forward is local +Y, not actor +Z. The old watch clip's head was about 55 degrees sideways while actor-facing tests passed. Observation/orbit attention measures the full 3D direction to the player's body aim height with bounded rotations. R11 attacks marked `authoredAttention` preserve the pelvis/spine/chest/nape/head gesture for the entire action, including preparation; ordinary aim must not cancel their large diagonal swing. A committed charge keeps body/path commitment. Attention is not permission to steer the whole attack after a dodge, and fixed anatomical limits are not an instant 180-degree head turn.

R11 replaces the R10 bites with two torso-led diagonal bites. The live actor prepares 18 clips: original R8 twelve, R10 right/left orbit two, and R11 bite/bite/backward-brace/collapse four. R9 and the two R10 bites remain historical data, not extra live wrappers. Clip count does not prove combat feel: review real-time previews and actual post-runtime skin poses, including attention and support corrections.

Nonlethal heavy hits use the standing `Wolf_Backward_Brace_V02`: 0.90 source seconds and 0.48 model metres backward, or 1.20 game metres at scale 2.5, while facing the opponent. Its translated endpoint is the same standing pose. Tactical retreat uses this support step with an 8 second cooldown; do not substitute a fall or turn away merely to create attack distance. A blocked attack triggers the flash and actual `Hit_Cower_R5` pose, not an added frozen stagger. Lethal damage alone chooses `Wolf_Staggered_Collapse_V02` for 1.65 seconds, then holds the relaxed endpoint for 0.65 seconds before the 5 second fade. Keep reward, hide, cancellation and pooled reset single-owned.

Physical contacts include the actual player capsule radius once, a clipped source-time interval and relative pose sweep, with terminal per-serial deduplication including dodged contacts. Approach bands are calibrated after 3D gaze/pose correction because rotating the head can alter visible muzzle reach. Do not inflate hit volumes to conceal a false start. Shared shield, sight, capture, death and cancellation paths remain active.

R11's calibrated R8 lunge keeps the original flight/body keys, but its 0.2 source-time contact window is 2.54–2.73 seconds with impact at 2.62. Only jaw/head may score the lunge bite; a forepaw from the shared contact array must not create a hit. This runtime timing does not rewrite the historical R8 source event at 2.25 seconds.

Current evidence is in `ArcherPreview/reports/wolf-v02-predator-r11/` and [the R11 review report](../../../../Docs/Reports/2026-11-13/MOONFOREST_0.2_늑대_R11_검토보고서.html). Checks include `wolf-v02-predator-runtime.test.js`, `wolf-v02-predator-integration.test.js` and retained orbit/source checks. Read current results; prior hunt/R10 counts do not certify a later build. Mesh, UV, normals, weights, binds, 28 joints, 4K colour, LOD and original twelve clips remain unchanged.

## Threatening movement

Do not run away with the back exposed merely to reach the preferred distance of an authored leap. Choose a close attack if already close; use the long lunge only when the distance naturally permits it. A pin also needs its actual authored approach distance.

Stalking uses short safe arcs and brief observation, with the head/attention directed at the opponent. Distinguish actor travel direction from facing and the pose's available turn range. Do not make a forward gait moonwalk sideways. When the current clip cannot make a natural side step, create a separate small-step clip on the preserved rig and validate its support phases. At walls or blocked arcs, stop/reselect a near attack; do not teleport or insist on an impossible route.

Use visible player movement/guard and completed attack outcomes rather than reading pending input. A hit can permit a follow-up at the right distance; a miss or successful defense should leave an opening. Continuous aggression must still have finite bouts, telegraphs, commitment and punishable recovery. Keep the full legacy 0.1 behaviour and stored progress separate from 0.2.

## Contact calibration

1. Measure the authored attacking part's world trajectory at the actual game scale, including root extraction and nav correction. Record source time, local/world XYZ, player capsule and separation distance.
2. Place the actor at the correct approach distance and yaw before commitment. Preserve limb lengths and original mesh dimensions. Do not teleport the player to a review pose.
3. Use mouth/jaw/head for a bite. Current 0.2 lunge and pin bite contacts are jaw/head only; a spare or trailing forepaw must not score them. A genuinely authored paw attack requires its own appropriate part contract.
4. Test the full visible contact interval or a bounded swept volume so 30 Hz or fast whipping cannot jump over the hit. At most one damage resolution per attack serial; a second bite needs a new action/serial. Clear history on reset, interrupted action, teleport, pool reuse and map change.
5. Radius accounts for the visible attacking volume plus the player's body, not all the empty space between their actor origins. An overly small point sphere can miss a valid pose; an enormous radial sphere can hit through a visually clean dodge. Sweep tests need genuine outside-volume negatives and height separation.
6. Check front/side/elevation, moving player, exact range edges, shield contact, dodge, invulnerability, simultaneous attackers and interruption. Keep source-contact time, wall-clock whip time and damage application time distinct in evidence.

### Autonomous reach is a separate gate

Do not validate only a forced attack at its preferred point. Run the AI's real approach/selection path at each attack's configured minimum and maximum engagement distance, at 30/60 Hz and 0.5/1/2x settings, then include lateral offsets and moving-player negatives. One iteration restored the body-radius/sweep omissions but still let the AI start a paw pressure or lunge outside its physical reach at the upper approach bound. Correct the approach/selection band to the measured motion; do not inflate the capsule to conceal a false start. Read current `minDistance`, `maxDistance` and `preferredDistance` from the spec after this calibration.

## Runtime ownership

Reuse `WolfAnimator` (`wolf-animation.js`) and the existing shared actor/model preparation rather than playing a second native AnimationGroup loop. Precompute target/channel tables once. Share immutable geometry, materials, textures and animation key values; each actor owns its nodes, skeleton targets, morph influences, sampler cursor, blended pose and AI state. No mutable singleton actor or cursor is shared across wolves.

The application keeps one engine/scene/frame loop. Use the existing preparation queue, bounds, cancellation generation and GPU-ready path. No per-actor RAF, permanent timer, private scene, synchronous GPU readback or separate internal-line render target. Do not repeatedly scan `scene.meshes`, clone keys, create bindings or allocate contact vectors inside a steady-state hot loop. Joint attention/IK corrections cache their affected descendants once, then refresh only that branch; test the complete resulting pose against the full-refresh reference and count dirty-node work rather than adding a whole-rig refresh after every quaternion change.

Use bounded decision/navigation work, then reuse the decision between updates; contacts and essential combat timing remain correct every simulation update. Do not lower all actor animation frequency or change hit timing simply to conceal a hot path. Future 10k-50k triangle creatures need an explicit population/memory budget: the manual summon menu's 20 limit is not mobile performance certification.

## Relevant regression evidence

Cover autonomous minimum/preferred/maximum engagement bounds at 30/60 Hz and 0.5/1/2x attack settings, one-hit-per-serial, contact negatives, dodge/block, down/recover, 50% transition mid-action, custom pattern ordering, blocked movement, four maps, repeated 1/5/10/20 actor spawn/remove, cancellation/retry and pooled independent poses. Inspect current mesh/skeleton/observer/binding counts rather than labelling cumulative created counters a leak.

Use Node/NullEngine and offline asset renders without browser automation. They establish logic/asset/resource-lifetime properties, not actual mobile GPU costs, FPS, heat or physical touch feel. Preserve that distinction in reports and future skill updates.
