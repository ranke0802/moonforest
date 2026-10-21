# Moonforest Character Preview

Mobile browser review of Azure Elf (Archer) and Violet Vanguard (Warrior). Use the character selector on the same page; only the selected model is loaded.

- Play: https://ranke0802.github.io/moonforest/ArcherPreviewSite/
- Warrior direct selection: append `?character=warrior`. The default remains Archer.
- Warrior: approved native Thrust_Slash (181 frames, 60 FPS). Play/pause, restart (J), frame stepping, seeking, speed and repeat controls. WASD/joystick moves stage position only; walking/running and target hits are not included. H / K / R apply to Archer only.
- Left lower touch area: dynamic joystick.
- Run toggle, Attack, Hit, Death / Revive buttons.
- One finger outside the joystick: orbit (or pan in camera Move mode). Two camera fingers: pinch zoom only; the joystick finger stays separate.
- Three training dummies: attack automatically locks the nearest target within 14 m for that shot. A ring indicates the target, and arrow impact updates its hit count.
- Hold Attack or J for continuous fire; release to finish the current shot without starting another. Hit and Death cancel the held attack.
- Attack speed slider: 0.5–2x, applied immediately without restarting a shot. The 1x button resets it; the browser remembers the setting. Arrow release and repeat intervals share the animation clock. At 1x the cycle is about 2.16 seconds, at 2x about 1.08 seconds.
- Desktop: WASD, Shift, J attack, H hit, K death, R revive (Archer). Left or right mouse drag rotates, middle drag pans, wheel zooms. The mode switch controls touch orbit/pan.
- Quality: High (default, up to DPR3), Balanced (up to DPR2), Battery (DPR1). The choice is remembered on this browser.
- Fullscreen button requests landscape lock when supported. On browsers without orientation lock, rotate the phone manually. Unsupported fullscreen displays an explanation.

Seven embedded clips: Idle, Walk, Run, Attack_Bow_Standing, Attack_Bow_Walking, Hit_Reaction, Death. The current Walk wrist posture and Death hair/prop issues are preserved for review; this is not a final animation approval.

Attack playback speed affects the authored full-body moving attack, including its legs. World movement speed stays under the joystick's control, so non-default attack speeds can cause foot sliding until the upper/lower-body animation is separated. Walk, Run, Hit and Death playback speeds are unchanged.

## Development

Requires Node >=22.12. Run `npm ci`, `npm test`, `npm run build` in this folder. Copy the built `dist/` contents into `../ArcherPreviewSite/`. GitHub Pages publishes the `archer` branch root; the root index redirects into the published build. `.nojekyll` disables Jekyll. Do not commit node_modules.

The Archer GLB is about 48 MB; Warrior is about 53 MB. All exported skin influences are retained. First load depends on connection and mobile GPU. No account is needed to play. Source assets remain under public/assets. See public/NOTICE.txt for source credits and terms.

Warrior uses Violet_Vanguard_Repaired.blend and its original Meshy skeleton and body action. The approved grip is baked into export geometry. Sword and body animation share one clip; shield and straps retain their attachments. Time starts at zero without changing poses or timing. Painted unlit materials match the Archer viewer convention. Web skinning uses linear blending, not Blender's dual-quaternion option. Blender roundtrip and Babylon playback are checked; Unity/Godot playback and physical-phone certification are not implied.
