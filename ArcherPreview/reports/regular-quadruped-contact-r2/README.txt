Focused incoming-contact regression, regular quadrupeds R2

The native warrior currently aims actor yaw toward a target. An unadjusted
authored upright weapon path can remain physically above/alongside a short
animal even when planar separation is visibly within reach. Fitted monster
anatomy volumes do not move the warrior's weapon.

Actual rejection path:
 - boss-encounter.js poseAndContacts: sample, clear sight, live/noncaptured
   player and living enemy are required before reading fitted hurt capsules.
 - wolf-v02-hurt.js WolfV02ContactGate.collect forces rangeContact=false.
   The biped/downed convenience range does not award quadruped radial hits.
 - melee-collision.js MeleeContactGate.check retains strike-window dedup,
   then bladeTouchesCapsule checks an actual 3D clipped sweep against anatomy.
 - player-strikes.js keeps slash .38-.80, judgment .94-1.12, and released
   shield 1.10-1.15 source-second windows. Shield hold/pending is not a push.
 - wolf-v02-shield.js samples 13 rows of the actual visible shield-face hull;
   it does not expand sword height or change strike timing.

Initial baseline at three stationary genuine WATCH receiving poses, using then-current
manifest routes and actual controller short press/charged hold/shield release:
   Fox 1.05m, side stance 1.116m: slash gap .183m, heavy .559m, shield .367m.
   Boar 1.00m, side stance 1.235m: slash hits; heavy gap .167m, shield .014m.
   Gray wolf 1.575m, side stance 1.199m: slash hits; heavy .145m, shield .169m.
The baseline.json report contains exact current distances rather than these
rounded labels. All three outside normal swings miss with >2.20m clearance.
At the fox's closest heavy frame, blade lower endpoint is 1.305m while the
neck anatomy envelope ends at .921m: vertical gap .335m after blade margin.

Root-owned PlayerMeleeAim physically rotates the weapon-bearing arm after
native animation. This fixture restores it before the next native sample and
applies it before PlayerStrikeSampler. It never fabricates collision samples,
damage or rangeContact; the normal gate decides every hit.

probe.mjs exports runContactProbe({createAim,ids,actions,manifestPaths,label}).
with-aim.mjs adapts the production PlayerMeleeAim API. Environment variables
CONTACT_PROBE_IDS, CONTACT_PROBE_ACTIONS and CONTACT_PROBE_LABEL optionally
restrict one essential case. Each species uses an isolated real NullEngine
fixture to avoid unrelated cross-scene shader readiness. The preparation frame
renders normally; no production readiness or combat gate is bypassed.

Only normal/heavy/released-shield at one real stance and outside normal are
covered. This is CPU contact evidence, not animation visual approval or GPU,
mobile heat/FPS evidence. Preserve separate direct user review of arm poses.

Final result (with-aim-final.json, baseline-final.json): all five requested
forms have three real near hits and one outside miss: 15 hits / 5 misses.
Shield stances use the shorter actual weapon reach (roughly .94m fox, 1.06m
boar, 1.02m gray, 1.04m stylized, .91m wolf-3), established before input. The
root-owned physical standing clearance allows natural close approach without
teleporting either actor. The old farther fox shield stance remains a genuine
miss and is preserved in fox-natural-elbow.json rather than hidden.

The final aiming module uses three cached visible shield-face spans to choose
a bounded shoulder pitch/yaw plus native-plane elbow extension. The real
collision gate retains all 13 face rows. Shoulder pitch <=67 degrees, yaw
<=60 degrees, elbow extension <=60 degrees and at least seven degrees native
pre-bend; no bone translation or scale is changed. Six native shoulder/elbow/
wrist local offsets and scales remain exact, and rotations restore exactly.
The module rejects targets behind the action's intended forward hemisphere.

Performance follow-up: the full bounded grid is now a warm/recovery fit. Each
following frame evaluates at most 3x3x3 neighbours around the prior winner.
Failed local fits may retry the full grid only near the real contact window
and at least .15 game seconds apart. The current native elbow bend always
clamps the smoothed extension, so a quickly straightening source pose cannot
temporarily lose its pre-bend. The same 20 cases still pass; measured actual
extended elbow angles remain >=.55 radians in those cases. Fox shield apply
cost in the existing native case is about .18ms mean across all calls and
.23ms across active calls, with occasional warm work up to 3.54ms here. These
are local CPU observations, not mobile/GPU performance certification.

verify.mjs checks the 20 final native cases, unchanged anatomy and runtime
collision-source hashes, joint invariants, restoration, all actual contacts/outside
misses, and the forward-hemisphere guard. Run it with the project's Node.
The baseline records the pre-optimization aim module hash; collision sources,
weapon windows, manifests and anatomy hashes are compared unchanged.

Final boar refresh: the user's subsequent 2.5x enlargement is now covered by
four fresh actual native cases against boar-r2.json, height2.5m, manifest SHA256
5791ff39f3119f9c742bc191d3717c26483c4c34cfa07ae0cd498ff86e64f340.
Normal25, heavy first contact25 and released shield10 damage succeed; outside
normal remains0 with2.358m physical clearance. Only those four boar rows were
replaced in baseline-final/with-aim-final; the other16 rows remain unchanged.
The merged20-case verifier still passes. Earlier1m boar figures above are
historical diagnostics, not the current actor size or final boar stance.
