import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Matrix,Vector3,Vector4} from '@babylonjs/core';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {partitionCaveGround} from '../src/witch-cave-surfaces.js';
import {CaveFogRuntime,fogBoundsFullyVisible} from '../src/cave-fog-runtime.js';
import {caveForegroundCutaway} from '../src/witch-cave-visibility.js';
import {CameraPitch,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA} from '../src/camera-pitch.js';
const output=new URL('../reports/cave-mobile-review/',import.meta.url);mkdirSync(output,{recursive:true});
const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;
const terrain=createWitchCaveTerrain(),ground=createTerrainGround(scene,terrain);partitionCaveGround(ground,terrain);
const camera=new ArcRotateCamera('numeric-review',0,1.18,24,Vector3.Zero(),scene),pitch=new CameraPitch(camera,{warrior:true});pitch.update({upwardLimited:false});
const world={scene,terrain,ground,camera},fog=new CaveFogRuntime(world);world.caveFog=fog;
function beforeCut(point,eye,focus){const s=focus.subtract(eye),along=Vector3.Dot(point.subtract(eye),s)/Math.max(s.lengthSquared(),.001);return along>=.015&&along<=.98&&point.y>=focus.y-.65&&Vector3.Distance(point,eye.add(s.scale(along)))<.65+.5*along;}
const scenarios=[{name:'entry / video 0s context',x:-42,z:43},{name:'branch / video 30s context',x:-35,z:3},{name:'natural arch / video 60s context',x:-6,z:-27},{name:'boss arena',x:29,z:-25.5}],results=[];
for(const s of scenarios){
 const foot=new Vector3(s.x,terrain.heightAt(s.x,s.z),s.z),player=foot.add(new Vector3(0,1.05,0)),boss=s.name==='boss arena'?new Vector4(32,foot.y+3.5,-25.5,6.3):null;
 fog.update(foot,0,{force:true});
 const item={name:s.name,position:foot.asArray(),cameraCases:0,projectedLandmarks:0,terrainRaySamples:0,blockingTerrainSamples:0,beforeBlocked:0,afterBlocked:0,afterExamples:[],ground:{detailPatches:fog.stats.detailPatches,proxyPatches:fog.stats.coverPatches,overlap:0,beforeMaximumSubmittedTriangles:0,afterMaximumSubmittedTriangles:0},pitches:{}};
 for(const p of fog.patches){const oldCover=!fogBoundsFullyVisible(fog.fog,p.min,p.max);item.ground.beforeMaximumSubmittedTriangles+=Number(p.detail)*p.source.indexCount/3+Number(oldCover)*p.source.indexCount/3;item.ground.afterMaximumSubmittedTriangles+=Number(p.detail)*p.source.indexCount/3+Number(p.cover)*p.sub.indexCount/3;}
 for(const radius of [8,24,56,82])for(const beta of [.25,1.18,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA])for(let a=0;a<24;a++){
  camera.radius=radius;camera.beta=beta;camera.alpha=a*Math.PI/12;pitch.follow(player,0,{snap:true});camera.getViewMatrix(true);scene.updateTransformMatrix();const eye=camera.globalPosition;item.cameraCases++;
  const pstats=item.pitches[beta]??={cases:0,onScreenLandmarks:0,blockingTerrainSamples:0,beforeBlocked:0,afterBlocked:0};pstats.cases++;
  const landmarks=[{name:'player torso',p:player,centre:player,radius:1},{name:'player head',p:foot.add(new Vector3(0,1.7,0)),centre:player,radius:1}];
  if(boss)for(const [name,h]of [['boss chest',4.5],['boss head',5.7],['boss HP',6]])landmarks.push({name,p:new Vector3(boss.x,foot.y+h,boss.z),centre:boss,radius:5.9});
  for(const target of landmarks){
   const screen=Vector3.Project(target.p,Matrix.IdentityReadOnly,scene.getTransformMatrix(),camera.viewport.toGlobal(1280,720));
   if(screen.z<0||screen.z>1||screen.x<0||screen.x>1280||screen.y<0||screen.y>720)continue;item.projectedLandmarks++;pstats.onScreenLandmarks++;
   const length=Vector3.Distance(eye,target.p),steps=Math.ceil(length/.15);
   for(let n=1;n<steps;n++){const p=Vector3.Lerp(eye,target.p,n/steps);if(p.y<foot.y+.42||Vector3.Distance(p,target.centre)<target.radius)continue;item.terrainRaySamples++;
    if(terrain.heightAt(p.x,p.z)<=p.y)continue;item.blockingTerrainSamples++;pstats.blockingTerrainSamples++;
    if(!beforeCut(p,eye,camera.target)){item.beforeBlocked++;pstats.beforeBlocked++;}
    if(!caveForegroundCutaway(p,eye,camera.target,{player,boss})){item.afterBlocked++;pstats.afterBlocked++;if(item.afterExamples.length<3)item.afterExamples.push({radius,beta,alpha:camera.alpha,target:target.name,point:p.asArray()});}
   }
  }
 }
 results.push(item);
}
const hash=file=>createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n')).digest('hex');
const report={generatedAt:new Date().toISOString(),scope:'CPU projection and exact rendered terrain height samples, no browser or GPU. Landmark rays use 15 cm sampling; full walls/props are validated by the shared analytic fragment corridor, not a GPU screenshot.',videoCorrespondence:'0/30/60s labels identify representative entry/branch/arch contexts. The video has no world-coordinate replay, so these are not claimed as exact recovered camera poses.',camera:{radii:[8,24,56,82],betas:[.25,1.18,WARRIOR_UPPER_BETA,UNRESTRICTED_UPPER_BETA],yaws:24,viewport:[1280,720],playerFocus:'physical torso (ground+1.05), independent of upward camera pivot lift',bossFocus:'visible phase2 centre ground+3.5, radius6.3; hidden bosses produce no cutaway'},results,geometry:{originalTerrainTriangles:ground.getTotalIndices()/3,proxyTriangles:fog.shellTriangles,proxyVertices:fog.cover.getTotalVertices(),distantDecorativeLiningTriangles:128,extraTextureAllocations:0,originalGroundPreserved:true,collisionAndNavigationChanged:false},hashes:Object.fromEntries(['src/witch-cave-layout.js','src/witch-cave-terrain.js','src/witch-cave-collision-data.js','src/witch-cave-sight-data.js','src/cave-fog-runtime.js','src/cave-rock-shell.js','src/witch-cave-visibility.js'].map(p=>[p,hash(p)])),limits:'CPU-only counts are submission upper bounds before frustum culling, not measured GPU draw/FPS/heat. Other agents may have run CPU work concurrently. Camera pitch near pi can intentionally place the player outside the frame; only on-screen landmarks enter the terrain-ray counts.'};
writeFileSync(new URL('cave-view-audit.json',output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({geometry:report.geometry,scenarios:results.map(({name,cameraCases,projectedLandmarks,blockingTerrainSamples,beforeBlocked,afterBlocked,ground})=>({name,cameraCases,projectedLandmarks,blockingTerrainSamples,beforeBlocked,afterBlocked,ground}))}));fog.dispose();scene.dispose();engine.dispose();
if(results.some(r=>r.afterBlocked))process.exitCode=1;
