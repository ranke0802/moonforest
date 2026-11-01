import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const app=resolve(import.meta.dirname,'../..'),repo=resolve(app,'..');
const source=`README.md
scripts/audit-elena-clearance.mjs
scripts/bake-cave-collision.mjs
scripts/bake-mourning-cave-clearance.mjs
scripts/bake-laboratory-collision.mjs
scripts/cave-collision-geometry.mjs
scripts/cave-source-fingerprint.mjs
scripts/measure-player-height.mjs
scripts/pack-cave-laboratory.mjs
src/action-audio.js
src/audio-beds.js
src/boss-encounter.js
src/boss-music.js
src/camera-follow.js
src/camera-pitch.js
src/cave-fog-of-war.js
src/cave-fog-runtime.js
src/cave-laboratory-collision-data.js
src/cave-laboratory-collision.js
src/cave-laboratory-geometry.js
src/cave-laboratory-terrain-data.js
src/cave-laboratory-terrain.js
src/cave-rock-shell.js
src/cave-story-inspection.js
src/dodge-collision.js
src/elena-encounter.js
src/enemy-collision.js
src/game-audio.js
src/main.js
src/mourning-cave-clearance-data.js
src/mourning-elena-encounter.js
src/player-combat.js
src/player-dimensions.js
src/player-health-bar.js
src/player-strikes.js
src/terrain-mesh.js
src/tree-occlusion.js
src/village-outlines.js
src/village-shadow-fade.js
src/village-streamed-environment.js
src/village-texture-streaming.js
src/witch-cave-atmosphere.js
src/witch-cave-camera-data.js
src/witch-cave-camera.js
src/witch-cave-collision-data.js
src/witch-cave-layout.js
src/witch-cave-navigation.js
src/witch-cave-sight-data.js
src/witch-cave-surfaces.js
src/witch-cave-terrain.js
tests/boss-music.test.js
tests/cave-laboratory-collision.test.js
tests/cave-laboratory-geometry.test.js
tests/cave-laboratory-legacy-clip.test.js
tests/cave-laboratory-lifecycle.test.js
tests/cave-laboratory-packing.test.js
tests/cave-open-surfaces.test.js
tests/cave-painted-light.test.js
tests/elena-real-combat.test.js
tests/goblin-contacts.test.js
tests/helpers/skin-sweep.js
tests/ios-playback-recovery.test.js
tests/player-dimensions.test.js
tests/startup-frame-failure.test.js
tests/village-initial-cancel.test.js
tests/witch-cave-art-layout.test.js
tests/witch-cave-camera.test.js
tests/witch-cave-enclosure.test.js
tests/witch-cave-improvements.test.js
tests/witch-cave-resources.test.js
tests/witch-cave.test.js
public/assets/resource-sizes.json
public/assets/witch-cave.json
reports/player-160cm/height-measurement.json
reports/player-160cm/resource-delta.json
reports/player-160cm/validation-summary.json
reports/player-160cm/stage-owned.mjs
reports/player-160-dimensions-audit/validation-summary.json
reports/player-160-dimensions-audit/contact-cpu-sample.json
reports/player-160-dimensions-audit/held-slash-skin-validation.json
reports/elena-boss-music-2026-11-01/integration-validation.json
reports/cave-lab-joints-plan-2026-11-01/final-readonly-audit.json
reports/cave-lab-joints-plan-2026-11-01/native-runtime-validation.json
reports/cave-lab-joints-plan-2026-11-01/painted-native-receiver-probe.json
reports/cave-r3-final-qa-2026-11-01/final-summary.json
reports/cave-r3-final-qa-2026-11-01/cohort-and-floor.json
reports/cave-r3-final-qa-2026-11-01/native-distance-bake.json
reports/cave-r3-final-qa-2026-11-01/resource-preservation.json
reports/cave-r3-final-qa-2026-11-01/routes-and-boss.json
reports/cave-r3-final-qa-2026-11-01/transient-camera-real-mesh.json`;
const paths=new Set(source.trim().split('\n').map(p=>'ArcherPreview/'+p));
const published=readFileSync(resolve(app,'reports/publish-village-paths.txt'),'utf8').trim().split(/\r?\n/);
const inventory=JSON.parse(readFileSync(resolve(repo,'ArcherPreviewSite/deployment-files.json'))),allowed=new Set(inventory.files.map(f=>'ArcherPreviewSite/'+f.path));allowed.add('ArcherPreviewSite/deployment-files.json');
for(const path of published){
 if(!allowed.has(path))throw Error('Unexpected publish path: '+path);
 paths.add(path);
 if(path.startsWith('ArcherPreviewSite/assets/content/'))paths.add(path.replace('ArcherPreviewSite/','ArcherPreview/public/'));
}
for(const path of paths)if(!existsSync(resolve(repo,path)))throw Error('Missing owned path: '+path);
writeFileSync(resolve(app,'reports/player-160cm/staged-paths.json'),JSON.stringify([...paths],null,2));
execFileSync('git',['add','--',...paths],{cwd:repo,stdio:'pipe'});
console.log(JSON.stringify({explicitOwnedPaths:paths.size,unrelatedDeletionsExcluded:true}));
