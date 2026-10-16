# Moonforest Archer Preview

Mobile browser review of the current Azure Elf Blender WIP.

- Play: https://ranke0802.github.io/moonforest/
- Left lower touch area: dynamic joystick.
- Run toggle, Attack, Hit, Death / Revive buttons.
- Two fingers outside the joystick: orbit and pinch zoom; camera Move mode pans.
- Desktop: WASD, Shift, J attack, H hit, K death, R revive; mouse drag and wheel.

Seven embedded clips: Idle, Walk, Run, Attack_Bow_Standing, Attack_Bow_Walking, Hit_Reaction, Death. The current Walk wrist posture and Death hair/prop issues are preserved for review; this is not a final animation approval.

## Development

Requires Node >=22.12. Run `npm ci`, `npm test`, `npm run build` in this folder. Copy the built `dist/` contents into `../ArcherPreviewSite/`. GitHub Pages publishes the `archer` branch root; the root index redirects into the published build. `.nojekyll` disables Jekyll. Do not commit node_modules.

The GLB is about48MB and uses up to8bone influences; first load depends on connection and mobile GPU. No account is needed to play. Source assets remain under public/assets. See public/NOTICE.txt for source credits and terms.
