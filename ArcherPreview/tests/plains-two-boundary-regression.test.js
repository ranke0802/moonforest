import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FOREST_PLACEMENTS,FOREST_ROUTES,forestObstacles} from '../src/monster-forest-layout.js';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,plainsObstacles} from '../src/great-plains-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {obstacleClearance} from '../src/village-collision.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {MAP_PORTALS,PLAINS_FOREST_PORTAL,portalHeadingTurn} from '../src/map-route.js';
import {captureRoadHandoff} from '../src/village-plains-handoff.js';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {createWorld} from '../src/world.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {villageOutskirtsSkirtHeight} from '../src/village-outskirts-skirt.js';
import {boundaryContracts,firstTriggerPose,makeBoundaryCases} from '../reports/plains-boundary-followup-2026-11-03/boundary-cases.mjs';
import {originalInputText} from './helpers/mobile-profile-contract.js';

const hash=x=>createHash('sha256').update(x).digest('hex'),near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`),facts=[];
test('the complete native forest layout, terrain, material/LOD graph and ground remain the approved original',()=>{
 const expected={
  'src/monster-forest-layout.js':'2363b275e550d7d4301ad0360f73031fa4758237716273b6818c0b11a44a635a',
  'src/monster-forest-terrain.js':'6289b3c621d7694660311fbe530305c42689bdbc1bc081be4097902e006238e9',
  'public/assets/monster-forest.json':'144e8fda49d94b47b4a7c75864c3a70af1f5d2289027da2d6ad071dcf84c4ded',
  'public/assets/monster-forest-ground.json':'6203bf6673aee63c908fc76098aec0cf7230f3b7bea382e5ee9c5f62fa8fcd94',
 };
 for(const[file,sha]of Object.entries(expected))assert.equal(hash(originalInputText(file,readFileSync(new URL('../'+file,import.meta.url),'utf8'))),sha,file+' original inputs');
 assert.equal(FOREST_PLACEMENTS.length,891);assert.equal(hash(JSON.stringify(FOREST_PLACEMENTS)),'5634f528e23e1d1f70c2b133edd8ea94189febc38f7c119671f213ee15fab818');
 const terrain=createMonsterForestTerrain();assert.equal(hash(Buffer.from(terrain.heights.buffer)),'014606f03dd9c5ad69f4378b20bbe3ab1eac8113d91c9f6c7d726801b8731ed3');
 const ground=JSON.parse(readFileSync(new URL('../public/assets/monster-forest-ground.json',import.meta.url)));
 for(const role of['color','detail']){const p=new URL(ground[role].url,new URL('../public/assets/',import.meta.url));assert.equal(hash(readFileSync(p)),p.pathname.split('/').at(-1).split('.')[0]);}
 facts.push({case:'native-forest-preserved',baseline:'547b3a4',protectedFiles:Object.keys(expected).length,placements:891,terrainHeights:terrain.heights.length,groundImageHashVerified:true});
});

test('both road handoff transforms match the actual portal heading and preserve scale on either side of the trigger',()=>{
 let comparisons=0;
 for(const c of boundaryContracts){
  const p=c.id==='village'?MAP_PORTALS.village:MAP_PORTALS['monster-forest'],q=c.id==='village'?MAP_PORTALS['great-plains']:PLAINS_FOREST_PORTAL;
  assert.deepEqual(c.portal,{x:p.x,z:p.z});assert.deepEqual(c.plainsPortal,{x:q.x,z:q.z});near(c.yaw,portalHeadingTurn(c.character,'warrior-plains'));
  for(const dx of[-8,-2,0,1.7,10])for(const dz of[-12,-3,0,2.999,8]){
   const v={x:p.x+dx,z:p.z+dz},mapped=c.toPlains(v),back=c.fromPlains(mapped);near(back.x,v.x);near(back.z,v.z);near(Math.hypot(mapped.x-q.x,mapped.z-q.z),Math.hypot(dx,dz));comparisons++;
  }
  for(const reverse of[false,true]){const pose=firstTriggerPose(c,reverse),origin=reverse?q:p;assert.ok(Math.hypot(pose.position.x-origin.x,pose.position.z-origin.z)<3);assert.ok(Math.hypot(pose.position.x-origin.x,pose.position.z-origin.z)>2.9999);}
 }
 assert.equal(FOREST_ROUTES[0].width,4.8);facts.push({case:'physical-first-trigger-rigid-scale',pointComparisons:comparisons,directions:4});
});

test('actual camera focus and terrain placement keep horizontal pose while exposing vertical seam error in all four directions',()=>{
 const terrains={village:createVillageTerrain(),'monster-forest':createMonsterForestTerrain(),'great-plains':createGreatPlainsTerrain()},review=makeBoundaryCases(terrains),measurements=[];
 assert.equal(review.cases.length,4);
 for(const entry of review.cases){
  const c=boundaryContracts.find(x=>x.id===entry.boundary),map=entry.reverse?c.fromPlains:c.toPlains,before=entry.before,after=entry.after;
  const expected=map({x:before.actor.position[0],z:before.actor.position[2]});near(after.actor.position[0],expected.x);near(after.actor.position[2],expected.z);
  const eye=map({x:before.camera.position[0],z:before.camera.position[2]}),target=map({x:before.camera.target[0],z:before.camera.target[2]});near(after.camera.position[0],eye.x,3e-5);near(after.camera.position[2],eye.z,3e-5);near(after.camera.target[0],target.x,3e-5);near(after.camera.target[2],target.z,3e-5);
  near(after.actor.yaw+after.camera.alpha,before.actor.yaw+before.camera.alpha);assert.equal(after.camera.beta,before.camera.beta);assert.equal(after.camera.radius,before.camera.radius);assert.equal(after.camera.fov,.65);
  const deltaY=after.actor.position[1]-before.actor.position[1];near(after.camera.position[1]-before.camera.position[1],deltaY,3e-5);near(after.camera.target[1]-before.camera.target[1],deltaY,3e-5);
  // Report the real sampled-height jump; do not hide it by setting the two
  // actor heights equal or replacing the production sampled mesh by analytics.
  assert.ok(Math.abs(deltaY)<.12,entry.id+' actual floor step exceeds12cm: '+deltaY);
  measurements.push({direction:entry.id,actualHeightStepMetres:deltaY,sourceActor:before.actor.position,destinationActor:after.actor.position});
 }
 facts.push({case:'actual-sdk-first-trigger-camera',...review,measurements,gpuMeasured:false});
});

test('captured road pose is independent of subsequent source mutation and rejects disconnected travel',()=>{
 for(const c of boundaryContracts)for(const reverse of[false,true]){
  const pose=firstTriggerPose(c,reverse),from=reverse?'warrior-plains':c.character,to=reverse?c.character:'warrior-plains',actor={position:{...pose.position},rotation:{y:.71}},camera={alpha:-2.1},pan={x:1,y:.2,z:-.8},captured=captureRoadHandoff(from,to,actor,camera,pan),saved=structuredClone(captured);
  actor.position.x+=90;actor.rotation.y=17;camera.alpha=9;pan.x=600;assert.deepEqual(captured,saved,'retry context must not retain mutable pose references');
 }
 assert.equal(captureRoadHandoff('warrior-v3','warrior-v5',{position:{x:1,z:2},rotation:{y:0}},{alpha:0},null),null);
 assert.equal(captureRoadHandoff('warrior-v4','warrior-plains',{position:{x:NaN,z:2},rotation:{y:0}},{alpha:0},null),null);
 facts.push({case:'retry-snapshot-isolation',directions:4});
});

test('the forest road retains original spline samples and walkable shoulders in the actual playable portal approach',()=>{
 const c=boundaryContracts.find(x=>x.id==='forest'),road=PLAINS_ROUTES.find(r=>r.id==='forest-road');assert.ok(road);assert.equal(road.width,FOREST_ROUTES[0].width);
 const source=FOREST_ROUTES[0].samples.filter(([x,z])=>z>=24);let missing=0;
 for(const[x,z]of source){const p=c.toPlains({x,z});if(!road.samples.some(([x,z])=>Math.hypot(x-p.x,z-p.z)<1e-9))missing++;}
 assert.equal(missing,0,'copy complete original samples; a truncated spline changes the visible road centre');
 const a=new VillageNavigation(forestObstacles()),b=new VillageNavigation(plainsObstacles()),ta=createMonsterForestTerrain(),tb=createGreatPlainsTerrain();let samples=0,maxHeightGap=0;
 const shoulder=road.width/2-WARRIOR_DIMENSIONS.moveRadius-.05;
 for(const[x,z]of FOREST_ROUTES[0].samples.filter(p=>p[1]>=45&&p[1]<=55))for(const side of[-shoulder,0,shoulder]){
  const p={x:x+side,z},q=c.toPlains(p);assert.ok(a.free(p,WARRIOR_DIMENSIONS.moveRadius,78),'original forest shoulder unexpectedly blocked');assert.ok(b.free(q,WARRIOR_DIMENSIONS.moveRadius,106),'copied portal shoulder blocked: '+JSON.stringify(q));
  maxHeightGap=Math.max(maxHeightGap,Math.abs(ta.heightAt(p.x,p.z)-tb.heightAt(q.x,q.z)));samples++;
 }
 assert.ok(maxHeightGap<.012,'sampled terrain differs by more than12mm at the actual portal shoulder: '+maxHeightGap);
 facts.push({case:'actual-spline-portal-shoulders',exactSourceSamples:source.length,walkableSamples:samples,shoulderOffsetMetres:shoulder,maximumSampledHeightGapMetres:maxHeightGap,range:'original forest z45..55; unlike the visual vista, all these samples are within both maps playable radius'});
});

test('the copied forest scenery retains source model/LOD graph, metre scale, facing and physical tree/rock positions',()=>{
 const sourceManifest=JSON.parse(readFileSync(new URL('../public/assets/monster-forest.json',import.meta.url))),destinationManifest=JSON.parse(readFileSync(new URL('../public/assets/great-plains.json',import.meta.url))),c=boundaryContracts.find(x=>x.id==='forest'),copies=PLAINS_PLACEMENTS.filter(p=>p.forestBoundary),obstacles=plainsObstacles(),sourceObstacles=forestObstacles();
 assert.ok(copies.length>100,'the shared forest entry must include its real surrounding scenery');assert.equal(new Set(copies.map(p=>p.sourcePlacement)).size,copies.length);let physical=0,maxRootHeightGap=0;
 const terrain=createMonsterForestTerrain();
 for(const p of copies){
  const original=FOREST_PLACEMENTS.find(q=>q.id===p.sourcePlacement);assert.ok(original,p.id);const expected=c.toPlains(original);near(p.x,expected.x);near(p.z,expected.z);near(p.scale,original.scale);near(p.yaw,original.yaw+c.yaw);assert.equal(p.asset,original.asset);
  assert.deepEqual(destinationManifest.assets[p.asset],sourceManifest.assets[p.asset],'shared source material/LOD graph changed: '+p.asset);
  maxRootHeightGap=Math.max(maxRootHeightGap,Math.abs(p.elevation-terrain.heightAt(original.x,original.z)));
  const src=sourceObstacles.find(o=>o.id===original.id),dst=obstacles.find(o=>o.id===p.id);
  if(src){assert.ok(dst,'solid trunk or rock lost its collision');const at=c.toPlains(src);near(dst.x,at.x);near(dst.z,at.z);near(dst.radius,src.radius);physical++;}else assert.equal(dst,undefined,'soft foliage must remain walk-through');
 }
 assert.ok(maxRootHeightGap<1e-9,'copied roots differ from actual source sampled foundation: '+maxRootHeightGap);
 facts.push({case:'native-source-scenery-graph',copiedPlacements:copies.length,physicalObstacles:physical,maximumSourceRootHeightGapMetres:maxRootHeightGap,totalPlainsPlacements:PLAINS_PLACEMENTS.length,newRuntimeModelSourceKinds:0});
});

test('the entire plains approach stays walkable through its centre and both shoulders until the real forest trigger',()=>{
 const c=boundaryContracts.find(x=>x.id==='forest'),route=PLAINS_ROUTES.find(r=>r.id==='forest-road'),obstacles=plainsObstacles(),nav=new VillageNavigation(obstacles),shoulder=route.width/2-WARRIOR_DIMENSIONS.moveRadius-.05,blocked=[],fullWidthBlocked=[];let samples=0,reached=false,previous=null,continuousSegments=0;
 outer:for(let i=1;i<route.samples.length;i++){
  const a=route.samples[i-1],b=route.samples[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-9)continue;const steps=Math.max(1,Math.ceil(length/.15));
  for(let step=0;step<=steps;step++){
   const t=step/steps,at={x:a[0]+dx*t,z:a[1]+dz*t};if(Math.hypot(at.x-c.plainsPortal.x,at.z-c.plainsPortal.z)<3){reached=true;break outer;}
   // A centre/edge-only test can miss a trunk between those three paths. Sweep
   // the complete usable width continuously, including the player's radius.
   if(previous){continuousSegments++;if(!nav.segmentClear(previous,at,route.width/2-.05))fullWidthBlocked.push({from:previous,to:at,obstacles:obstacles.filter(o=>obstacleClearance(at,o)<route.width/2-.05+.002).map(o=>o.id)});}previous=at;
   for(const side of[0,-shoulder,shoulder]){
    const p={x:at.x-dz/length*side,z:at.z+dx/length*side};samples++;
    if(!nav.free(p,WARRIOR_DIMENSIONS.moveRadius,106))blocked.push({position:p,forestCoordinate:c.fromPlains(p),side,obstacles:obstacles.filter(o=>obstacleClearance(p,o)<WARRIOR_DIMENSIONS.moveRadius+.002).map(o=>({id:o.id,radius:o.radius,sourcePlacement:PLAINS_PLACEMENTS.find(p=>p.id===o.id)?.sourcePlacement??null}))});
   }
  }
 }
 const out=new URL('../reports/plains-boundary-followup-2026-11-03/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('approach-clearance.json',out),JSON.stringify({samples,reached,shoulderOffsetMetres:shoulder,blocked,continuousSegments,continuousSweepRadiusMetres:route.width/2-.05,fullWidthBlocked,scope:'Actual current plains navigation, full junction-to-forest-trigger road; original forest untouched'},null,2)+'\n');
 assert.equal(reached,true,'must test all the way to actual radius3 trigger');assert.equal(blocked.length,0,'approach blocks: '+JSON.stringify(blocked.slice(0,3)));assert.equal(fullWidthBlocked.length,0,'trunk or rock remains inside the full road width: '+JSON.stringify(fullWidthBlocked.slice(0,3)));
 facts.push({case:'full-plains-forest-approach',samples,shoulderOffsetMetres:shoulder,blocked:blocked.length,continuousSegments,continuousSweepRadiusMetres:route.width/2-.05,fullWidthBlocked:fullWidthBlocked.length});
});

test('town background skirt adjustment preserves every walking triangle and leaves the actual forest world mesh untouched',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;let forestWorld;
 try{
  const terrain=createVillageTerrain(),old=createTerrainGround(scene,terrain,{borderExtension:105}),current=createTerrainGround(scene,terrain,{borderExtension:105,borderHeight:villageOutskirtsSkirtHeight}),before=old.getVerticesData(VertexBuffer.PositionKind),after=current.getVerticesData(VertexBuffer.PositionKind);let changed=0;
  assert.deepEqual(current.getIndices(),old.getIndices());assert.deepEqual(current.getVerticesData(VertexBuffer.UVKind),old.getVerticesData(VertexBuffer.UVKind));
  for(let i=0;i<before.length;i+=3){assert.equal(after[i],before[i]);assert.equal(after[i+2],before[i+2]);if(after[i+1]!==before[i+1]){assert.equal(before[i+2],185);assert.ok(Math.abs(before[i])<=41);assert.equal(after[i+1],-.5);changed++;}else if(Math.abs(before[i])<=80&&Math.abs(before[i+2])<=80)assert.equal(after[i+1],before[i+1]);}
  assert.equal(changed,83,'only the83 north far-row vertices in the patch window move');
  forestWorld=createWorld(engine,{forest:true,touchDevice:true});const originalForest=createTerrainGround(scene,createMonsterForestTerrain(),{borderExtension:105});
  assert.deepEqual(forestWorld.ground.getVerticesData(VertexBuffer.PositionKind),originalForest.getVerticesData(VertexBuffer.PositionKind));assert.deepEqual(forestWorld.ground.getVerticesData(VertexBuffer.NormalKind),originalForest.getVerticesData(VertexBuffer.NormalKind));assert.deepEqual(forestWorld.ground.getVerticesData(VertexBuffer.UVKind),originalForest.getVerticesData(VertexBuffer.UVKind));assert.deepEqual(forestWorld.ground.getIndices(),originalForest.getIndices());
  facts.push({case:'actual-native-floor-and-forest-isolation',townFarRowVerticesLowered:changed,originalTownWalkingVertices:terrain.heights.length,trianglesPreserved:true,uvsPreserved:true,actualForestWorldPositionsNormalsUvsAndIndicesUnchanged:true});
 }finally{forestWorld?.scene.dispose();scene.dispose();engine.dispose();}
});

test.after(()=>{const out=new URL('../reports/plains-boundary-followup-2026-11-03/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('independent-validation.json',out),JSON.stringify({scope:'Node/actual SDK deterministic boundary poses and resource invariants; no browser/GPU visual evidence',facts},null,2)+'\n');});
