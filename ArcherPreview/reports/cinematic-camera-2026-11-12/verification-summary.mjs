import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const dir=new URL('./',import.meta.url),app=new URL('../../',dir),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['verification-controls.json','verification-movement.json','verification-scenery.json'];
const reports=files.map(name=>({name,...JSON.parse(readFileSync(new URL(name,dir),'utf8'))}));
const sourceHashes=Object.assign({},...reports.map(report=>report.sourceHashes));
const currentSourceHashes=Object.fromEntries(Object.keys(sourceHashes).map(path=>[path,digest(readFileSync(new URL(path,app)))]));
const sourceUnchanged=Object.entries(sourceHashes).every(([path,value])=>currentSourceHashes[path]===value);
const testPaths=['tests/cinematic-camera-controls.test.js','tests/cinematic-camera-movement.test.js','tests/cinematic-scenery-distance.test.js'];
const summary={
 generatedAt:new Date().toISOString(),passed:sourceUnchanged&&reports.every(report=>report.passed),
 total:reports.reduce((sum,report)=>sum+report.cases.length,0),failed:reports.reduce((sum,report)=>sum+report.cases.filter(row=>!row.passed).length,0),sourceUnchanged,sourceHashes,currentSourceHashes,
 testHashes:Object.fromEntries(testPaths.map(path=>[path,digest(readFileSync(new URL(path,app)))])),
 groups:reports.map(report=>({report:report.name,generatedAt:report.generatedAt,passed:report.passed,cases:report.cases.length,sha256:digest(readFileSync(new URL(report.name,dir)))})),
 evidence:[
  'Real createWorld/replaceWorldMap for village, monster-forest, great-plains, witch-cave;100/170/240% and exact restoration.',
  'Twelve shipped prepared glTF LOD model imports through native readMapContainer, actual production installVillageGeometry, native Mesh.getLOD; unchanged source geometry identity and late far-tier restoration.',
  'Native visibility cell160m, demand cache/finer-tier planning and original high-texture candidate admission. Texture byte and shadow policy caps remain unchanged.',
  'Normal plains240% remains240%; explicit cutscene240% is absolute, not576%. Absent distance preserves inherited defaults and v1 evaluated shape.',
  'Actual cave distance-fog binding uses scale2.4 and matching opaque-cover cutoff; original player-view/reveal state, FoW revision/visible/RGBA buffers remain exact.',
  'Actual ArcRotateCamera and game-tool lease, native DOM canvas events through Babylon SceneInputManager; standard PC keyboard, typing isolation, orbit and pan remain functional.',
  'Parent touch DOM events send authenticated packets to actual default Game/Host/player/lease; real camera moves without child canvas focus and terminal zero stops it.',
  'Stale session/document/map/sequence, Play, pause, detach, blur, replacement and map-generation cancellation cannot revive analog movement.',
  'Parent dynamic stick origin, independent up/down multitouch, all cancellation boundaries and delayed acknowledgements; ready/scope changes checked at each sample.',
  'Actual Studio scenery history field supports100..240 and blank inheritance; imported nonpreset137 remains visible/exact through commit, import and serialization, with no rounding. Joystick sends no document/history mutations and preserves iframe identity; desktop/fullscreen/playing controls hidden.',
  'Actual main relative static-import AST closure reaches only the small scenery state/registration bridge. Cinematic scenery acquisition/restoration, camera UI and scene host remain lazy; unchanged runtime graph guard still rejects a statically reached cinematic implementation. Final emitted build evidence remains the parent build audit responsibility.'
 ],
 discoveredIntegrationBoundariesAddressedBeforeFreeze:[
  'Cave has independent22..48m shader haze and54/50m opaque-cover cutoff, so changing Scene.fogEnd alone was insufficient; implementation scales these while retaining FoW.',
  'Source registry disposal ownership prevents ordinary map loads retaining disposed prior-map meshes.',
  'Gesture identity is captured per session and revalidated on each pointer sample; final zero targets the original gesture, with no asynchronous ACK replay.',
  'Live environment source identity follows scene/map/ground while cinematic owners also follow toolGeneration; retained sources still receive native LOD scaling after the main character loader advances the generation.',
  'Same-map character reload can invalidate the tool generation without rebuilding scenery. Release now restores only the original owner fog pair still present on the same scene/map/ground; foreign fog, replacement owners and newer camera values are preserved. Two durable cases include all four actual map atmospheres.',
  'Initial build guard exposed a regular range import reaching cinematic acquisition code. A small state/registration/getter bridge now separates ordinary runtime dependencies from lazy cutscene-owned mutation; static closure and guard assertions passed with all eleven scenery cases rerun.'
 ],
 verificationCorrectionsOnly:[
  'Initial host-only fixture omitted the required lease.isCurrent method; replaced with actual native game-tool lease.',
  'Numerical assertions treat positive/negative zero as equal on the JSON wire; CSS checks use actual desktop/fullscreen exclusion contract.'
 ],
 limitations:[
  'No browser automation or actual device/touch/rendered-pixel check. Node/NullEngine evidence does not establish GPU frame rate, thermal behavior or screenshot appearance.',
  'Prepared geometry is real; material/texture decoding is bypassed only for the numerical LOD-source test. Texture test covers original candidate admission and unchanged budget, not GPU upload or visual quality.',
  'The joystick belongs to parent Studio DOM outside the iframe/stage and is absent from scene/export data. Its controls can visually overlay the preview workspace; no pixel measurement was performed.',
  'The unrelated known55 prior whole-suite failures are outside this independent gate; no whole-suite pass is claimed.'
 ]
};
writeFileSync(new URL('verification-summary.json',dir),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({passed:summary.passed,total:summary.total,failed:summary.failed,sourceUnchanged}));
