# R14 runtime reuse profile

Current integration: `wolf-v02-spec.js`, `wolf-v02-encounter.js`, `wolf-v02-ram.js`, `wolf-v02-air-reaction.js`, `wolf-v02-run-ram.js` and `wolf-v02-locomotion.js`. R8/R13 source clips and the R14 three-joint rotation layer remain immutable shared data; skeleton targets, sample cursors, foot anchors, hit windows and reaction state belong to each actor.

- Keep RUN stride phase continuous through forehead impact and immediate pursuit. Whipping changes the head/contact clock and attack source time, not the physical RUN cadence.
- Use the actual thrown warrior position, supported braking, forepaw brace and genuine prone mouth reach. Native get-up/escape cancels further mauls; no teleporting a victim to meet the mouth.
- Heavy reaction uses one timebase for world impulse, articulated pose and impact-dependent turn; the ending may be diagonal. Preserve supported get-up and separate death/reward ownership.
- `config.motionProfile` can override `alertDropRatio` (default .065 of fore-upper-leg length, capped .04 model units), `diagonalYaw` (.09rad), `diagonalRoll` (.045rad). These are bounded rotation/posture emphasis values, never bone scaling. Lower alert posture runs before fixed-length foot support, with player attention afterwards.
- Hurt capsules group by bone and cache against the current world matrix update flag. No new scene scans, render targets, per-actor frame observers or texture duplicates are required. Identical sampled poses reuse transforms; changed matrices invalidate them.

For another wolf model, first map its node names and bind axes, measure segment lengths and muzzle/forepaw locations, and regenerate the partial RUN layer/contact fit if the rig or proportions differ. The current approved source hash guard must not be bypassed. Matching 28 node names alone does not prove compatible binds, weights or contact height. Keep the same high-level flow and profile, calibrate the physical model-specific values, then share a basic playable review promptly. This is a reuse contract, not a claim that other models are already integrated.
