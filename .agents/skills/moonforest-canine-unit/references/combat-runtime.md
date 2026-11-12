# Contact, combat behaviour and runtime budgets

## Current 0.2 implementation

The checked-in `ArcherPreview/src/wolf-v02-spec.js` and `wolf-v02-encounter.js` are the implementation source of truth. R9 established five attack choices from four attack clips; their exact timing and contact envelopes may change after this document. Read the current constants rather than treating an old table as an instruction to revert them.

As implemented on 2026-11-12, above 50% HP the default brain attacks once, recovers and stalks for about 1.35-1.65 seconds. At/below 50%, actual successful hits can start follow-ups, up to three strikes per bout, then about 0.55 seconds of stalking. A miss, block, interruption or lost reach cancels the follow-up; final recovery remains punishable. Explicit custom sequences retain their saved order, with a temporary close-action fallback when a requested lunge/pin cannot start at the current distance.

Stalking reuses the approved `Circle_Watch_R5` gait and its own root travel; it does not mirror the root or translate a forward-running clip sideways. Each actual step checks the navigation segment, bounded outward distance (0.65 m) and player-facing angle (60 degrees). A blocked/over-limit step freezes rather than retreating with its back exposed. Observe/recovery samples hold this long clip at time zero so a standing wait does not drift or cycle its gait. The flank clock only advances with a permitted authored step. No mesh, UV, weight, bind or authored TRS changes were needed for this iteration.

The contact update adds the actual player capsule radius once to the physical jaw/head (0.60 m) or paw (0.75 m) envelope. A bounded source-time window and relative previous/current pose sweep cover fast motion, while broadphase reach follows the actual posed attack part/root. Terminal resolution is deduplicated per strike serial, including an evaded contact; the shared shield, line-of-sight, capture and death paths remain in force. These wolf-specific envelope values are not universal canine defaults.

Current behavioural test sources are `ArcherPreview/tests/wolf-v02-hunt.test.js` and `wolf-v02-hunt-integration.test.js`. Additional fixed-pose/contact and autonomous engagement evidence is under `ArcherPreview/reports/wolf-v02-hunt/`, including `independent-gameplay.json` and `engagement-matrix.json`. A matrix counts its stated sampled positions, not real-player hit rate or device performance. Check the latest file results before asserting a pass; changed code invalidates old evidence.

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

The application keeps one engine/scene/frame loop. Use the existing preparation queue, bounds, cancellation generation and GPU-ready path. No per-actor RAF, permanent timer, private scene, synchronous GPU readback or separate internal-line render target. Do not repeatedly scan `scene.meshes`, clone keys, create bindings or allocate contact vectors inside a steady-state hot loop.

Use bounded decision/navigation work, then reuse the decision between updates; contacts and essential combat timing remain correct every simulation update. Do not lower all actor animation frequency or change hit timing simply to conceal a hot path. Future 10k-50k triangle creatures need an explicit population/memory budget: the manual summon menu's 20 limit is not mobile performance certification.

## Relevant regression evidence

Cover autonomous minimum/preferred/maximum engagement bounds at 30/60 Hz and 0.5/1/2x attack settings, one-hit-per-serial, contact negatives, dodge/block, down/recover, 50% transition mid-action, custom pattern ordering, blocked movement, four maps, repeated 1/5/10/20 actor spawn/remove, cancellation/retry and pooled independent poses. Inspect current mesh/skeleton/observer/binding counts rather than labelling cumulative created counters a leak.

Use Node/NullEngine and offline asset renders without browser automation. They establish logic/asset/resource-lifetime properties, not actual mobile GPU costs, FPS, heat or physical touch feel. Preserve that distinction in reports and future skill updates.
