# Contact, combat behaviour and runtime budgets

## Current 0.2 implementation

The checked-in `ArcherPreview/src/wolf-v02-spec.js` and `wolf-v02-encounter.js` are the implementation source of truth. R9 established five attack choices from four attack clips; their exact timing and contact envelopes may change after this document. Read the current constants rather than treating an old table as an instruction to revert them.

The current R10 version follows the user's later feral-wolf review. Above 50% HP, one attack is followed by a player-centred orbit; at/below 50%, successful close hits may form a bounded three-strike bout. Miss, block, interruption and lost reach cancel the continuation. Custom sequences remain stored, with a reachable close-action fallback when a requested long attack cannot start safely.

Approach attacks by running at the current calibrated gait speed, not by slowing to the old 0.9 m/s walk near the target. R8's run export has an initial duplicate hold; 0.2 samples its actual 1/30-offset, 17/30-length moving loop and matches cadence to stride and world travel. Preserve the source export and 0.1 sampler. Measure actual wrap period as well as a formula.

Player-centred stalking now uses new right/left circular step clips, not Circle_Watch's unrelated long arc. Consume authored arc length around the current player centre, bound radial recentering to the available stride, and stop or choose the opposite gait when obstructed. Fixed-length analytic support-foot correction accommodates changed radius and moving centres without scaling bones. Keep pose originals/restoration slots private and preallocated; transitions must capture the unadjusted source pose. A reach limit releases/replans the step, never stretches it.

R8's visible head forward is local +Y, not actor +Z. The old watch clip's head was about 55 degrees sideways while actor-facing tests passed. Current attention measures the actual full 3D head direction to the player's body aim height, using bounded neck/head rotations and preserving authored roll. A committed charge keeps body/path commitment; head attention is not permission to steer the whole attack after a dodge. Fixed anatomical limits are not an instant 180-degree head turn.

R10 replaces the current snap/pressure attack choices with two driving diagonal bites while retaining the original R9 clips for comparison. Do not present a count of animation clips as proof of combat feel. Review real-time previews and actual post-runtime skin poses (including gaze and foot correction), not only authored stills or numerical core thickness.

Physical contacts include the actual player capsule radius once, a clipped source-time interval and relative pose sweep, with terminal per-serial deduplication including dodged contacts. Approach bands are calibrated after 3D gaze/pose correction because rotating the head can alter visible muzzle reach. Do not inflate hit volumes to conceal a false start. Shared shield, sight, capture, death and cancellation paths remain active.

Current evidence is in `ArcherPreview/reports/wolf-v02-feral-r10/`, and checks include `wolf-v02-feral-integration.test.js`, `wolf-v02-orbit-navigation.test.js` and strict R9/R10 data checks. Read their current results; prior hunt-stage counts do not certify a later build. Mesh, UV, weights, binds, 28 joints, 4K colour, LOD and original twelve clips remain unchanged.

## Threatening movement

Do not run away with the back exposed merely to reach the preferred distance of an authored leap. Choose a close attack if already close; use the long lunge only when the distance naturally permits it. A pin also needs its actual authored approach distance.

Stalking uses short safe arcs and brief observation, with the head/attention directed at the opponent. Distinguish actor travel direction from facing and the pose's available turn range. Do not make a forward gait moonwalk sideways. When the current clip cannot make a natural side step, create a separate small-step clip on the preserved rig and validate its support phases. At walls or blocked arcs, stop/reselect a near attack; do not teleport or insist on an impossible route.

Use visible player movement/guard and completed attack outcomes rather than reading pending input. A hit can permit a follow-up at the right distance; a miss or successful defense should leave an opening. Continuous aggression must still have finite bouts, telegraphs, commitment and punishable recovery. Keep the full legacy 0.1 behaviour and stored progress separate from 0.2.

## Contact calibration

1. Measure the authored attacking part's world trajectory at the actual game scale, including root extraction and nav correction. Record source time, local/world XYZ, player capsule and separation distance.
2. Place the actor at the correct approach distance and yaw before commitment. Preserve limb lengths and original mesh dimensions. Do not teleport the player to a review pose.
3. Use mouth/jaw/head for a bite, the leading forepaw for a paw pressure action and only appropriate authored parts for a lunge/pin. A spare foot behind the player must not score a bite.
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
