import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Vector3,VertexBuffer,Frustum,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {CAVE_PLACEMENTS,CAVE_ROUTES,CAVE_ENTRY,caveObstacles,CAVE_WATERFALLS} from '../src/witch-cave-layout.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {CAVE_RADIUS} from '../src/map-route.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {applyVillageToon} from '../src/village-toon.js';
import {VillageGroundShade} from '../src/village-toon.js';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';

for(const [webgl,ubo]of [[1,false],[2,false],[2,true]])test(`cave tint composes after toon/shadows with WebGL ${webgl}, UBO ${ubo}`,async()=>{
 const engine=new NullEngine();
 if(webgl===2){engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=!ubo;}
 const world=createWorld(engine,{cave:true,touchDevice:true});
 try{
  const rock=MeshBuilder.CreateBox('shader-rock',{},world.scene);rock.material=new PBRMaterial('rock',world.scene);
  applyVillageToon([rock],world.lighting);new VillageGroundShade(world.floorMaterial,world.lighting);world.scene.render();
  for(const mesh of [rock,world.ground]){
   await mesh.material.forceCompilationAsync(mesh,{useInstances:true});world.scene.render();
   const effect=mesh.subMeshes.find(sub=>sub.effect)?.effect;assert.ok(effect,'visible cave surface has a prepared shader');
   const source=effect.fragmentSourceCode;
   assert.equal((source.match(/(?:uniform\s+)?float caveMoodActive;/g)??[]).length,1,'exactly one declaration in either UBO mode');
   assert.match(source,/if\(caveMoodActive>\.5\)/);
   const shadow=source.indexOf(mesh===rock?'finalDiffuse = surfaceAlbedo':'color.rgb *= mix(0.60');
   const tint=source.indexOf(mesh===rock?'finalDiffuse *= caveTint':'color.rgb *= caveTint');
   assert.ok(shadow>=0&&tint>shadow,'colour pools must retain the toon/shadow output');
  }
 }finally{engine.dispose();}
});

test('collision bake is tied to current layout and terrain, uses only original asset types',()=>{
 const hash=createHash('sha256');
 for(const file of ['witch-cave-layout.js','witch-cave-terrain.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
 assert.equal(CAVE_COLLISION_DATA.fingerprint,hash.digest('hex'),'rebake collisions after moving rocks or changing heights');
 assert.ok(JSON.stringify(CAVE_COLLISION_DATA).length<16000,'small collision metadata, no render models downloaded');
 assert.equal(new Set(CAVE_PLACEMENTS.map(p=>p.asset)).size,29,'22 approved cave assets, six original props and one frozen Joachim reuse');
 assert.ok(CAVE_PLACEMENTS.filter(p=>p.asset==='cave-01-eroded-wall').length<150);
});

test('all four authored routes can be followed without getting stuck or vertical jumps',()=>{
 const terrain=createWitchCaveTerrain(),nav=new CaveNavigation(caveObstacles());
 let steps=0,maxHeightStep=0;
 for(const route of CAVE_ROUTES){
  let at={x:route[0][0],z:route[0][1]};
  for(const [x,z]of route.slice(1)){
   for(let step=0;Math.hypot(x-at.x,z-at.z)>.12;step++){
    assert.ok(step<4000,'route must terminate');const d=Math.hypot(x-at.x,z-at.z),s=Math.min(.12,d);
    const to=nav.move(at,{x:at.x+(x-at.x)/d*s,z:at.z+(z-at.z)/d*s},.32,CAVE_RADIUS);
    assert.ok(Math.hypot(to.x-at.x,to.z-at.z)>.001,`stuck at ${at.x},${at.z}`);
    const jump=Math.abs(terrain.heightAt(to.x,to.z)-terrain.heightAt(at.x,at.z));maxHeightStep=Math.max(maxHeightStep,jump);
    assert.ok(jump<.1,`vertical jump ${jump}`);at=to;steps++;
   }
  }
 }
 assert.ok(steps>2500);assert.ok(maxHeightStep<.1);
});

test('legal corridor edges have no abrupt height step over a ten-centimetre move',t=>{
 const terrain=createWitchCaveTerrain(),nav=new CaveNavigation(caveObstacles());let maximum=0,samples=0;
 for(let x=-50;x<=50;x+=.5)for(let z=-45;z<=50;z+=.5){
  if(!nav.free({x,z},.32,CAVE_RADIUS))continue;
  for(const [dx,dz]of [[.1,0],[0,.1]]){
   if(!nav.segmentClear({x,z},{x:x+dx,z:z+dz},.32))continue;
   const delta=Math.abs(terrain.heightAt(x,z)-terrain.heightAt(x+dx,z+dz));maximum=Math.max(maximum,delta);samples++;
   assert.ok(delta<.12,`height seam ${x},${z}: ${delta}`);
  }
 }
 assert.ok(samples>10000);t.diagnostic(JSON.stringify({heightSamples:samples,maxHeightChangePer10cm:maximum}));
});

test('ground patches retain every triangle and conservatively enclose their vertices',t=>{
 const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{cave:true,touchDevice:true});
 try{
  const ground=world.ground,indices=ground.getIndices(),positions=ground.getVerticesData(VertexBuffer.PositionKind),n=world.terrain.subdivisions;
  assert.equal(ground.receiveShadows,true);assert.ok(world.lighting.receivers.has(ground));
  assert.equal(indices.length,n*n*6);assert.equal(ground.subMeshes.length,36);
  let count=0;const used=new Set();
  for(const sub of ground.subMeshes){
   const {minimum,maximum}=sub.getBoundingInfo().boundingBox;count+=sub.indexCount;
   for(let k=sub.indexStart;k<sub.indexStart+sub.indexCount;k+=3){
    const triangle=indices.slice(k,k+3);used.add(triangle.join(','));
    for(const index of triangle)for(const [axis,offset]of [['x',0],['y',1],['z',2]])assert.ok(positions[index*3+offset]>=minimum[axis]-.001&&positions[index*3+offset]<=maximum[axis]+.001);
   }
  }
  assert.equal(count,indices.length);assert.equal(used.size,n*n*2);
  const counts=[];
  for(const route of CAVE_ROUTES)for(const [x,z]of route){
   // Gameplay moves the target without rebuilding the orbit radius. setTarget
   // defaults to preserving the old camera position and would zoom far out.
   world.camera.target.set(x,world.terrain.heightAt(x,z)+1.1,z);world.camera.radius=4.8;world.camera.alpha+=.4;world.camera.getViewMatrix(true);
   world.scene.updateTransformMatrix(true);
   const current=Frustum.GetPlanes(world.scene.getTransformMatrix());
   counts.push(ground.subMeshes.filter(s=>s.isInFrustum(current)).reduce((sum,s)=>sum+s.indexCount/3,0));
  }
  assert.ok(counts.every(n=>n>0));assert.ok(Math.max(...counts)<n*n*2*.65,'near views do not submit the whole terrain');
  t.diagnostic(JSON.stringify({patches:36,totalTriangles:n*n*2,maxVisibleTerrainTriangles:Math.max(...counts),meanVisibleTerrainTriangles:counts.reduce((a,b)=>a+b,0)/counts.length}));
 }finally{engine.dispose();}
});

test('cave colour pools affect environment only and water stays opaque and bounded',async()=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});
 // NullEngine has no GPU upload completion for RawTexture. Model the ready
 // visibility upload so forceCompilation can inspect the water shader.
 const fogTexture=world.caveFog?.texture.getInternalTexture();if(fogTexture)fogTexture.isReady=true;
 try{
  const environment=MeshBuilder.CreateBox('test-rock',{},world.scene),player=MeshBuilder.CreateBox('test-player',{},world.scene);
  environment.material=new PBRMaterial('rock',world.scene);player.material=new PBRMaterial('unchanged-player',world.scene);
  applyVillageToon([environment],world.lighting);world.scene.render();
  assert.ok(environment.material.pluginManager.getPlugin('CaveRockMood'));
  assert.equal(player.material.pluginManager?.getPlugin('CaveRockMood')??null,null);
  await environment.material.forceCompilationAsync(environment,{useInstances:true});
  const water=world.scene.meshes.filter(m=>m.name.startsWith('cave-water')||m.name==='cave-still-water');
  assert.equal(water.length,4+CAVE_WATERFALLS.length);
  assert.ok(water.reduce((sum,m)=>sum+m.getTotalIndices()/3,0)<=300);
  for(const mesh of water){assert.equal(mesh.material.needAlphaBlending(),false);await mesh.material.forceCompilationAsync(mesh);}
  const mood=environment.material.pluginManager.getPlugin('CaveRockMood'),playerColor=player.material.albedoColor.clone();
  for(let trip=0;trip<4;trip++){
   replaceWorldMap(world,'warrior-v4');world.scene.render();
   assert.ok(water.every(m=>m.isDisposed()));
   assert.equal(world.ground.subMeshes.length,1,'village/forest ground unchanged');
   assert.equal(mood.active,false);
   replaceWorldMap(world,'warrior-v5');world.scene.render();
   assert.equal(environment.material.pluginManager.getPlugin('CaveRockMood'),mood,'reactivate rather than accumulate tint plugins');
   assert.equal(mood.active,true);assert.equal(world.ground.subMeshes.length,36);assert.equal(world.ground.receiveShadows,true);
   assert.ok(player.material.albedoColor.equals(playerColor));assert.equal(player.material.pluginManager?.getPlugin('CaveRockMood')??null,null);
  }
 }finally{engine.dispose();}
});
