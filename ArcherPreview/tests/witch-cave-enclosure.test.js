import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {caveForegroundCutaway,CAVE_VIEW_GLSL,CAVE_FOG_START,CAVE_FOG_END} from '../src/witch-cave-visibility.js';
import {CAVE_ROOMS,caveObstacles} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain,caveClearance} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createWorld} from '../src/world.js';
import {applyVillageToon} from '../src/village-toon.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {CAVE_SIGHT_DATA} from '../src/witch-cave-sight-data.js';
import {caveRockOccludes} from '../src/witch-cave-sight.js';

test('local cave cutaway protects the player while keeping floors, side walls and rear rooms opaque',()=>{
 const eye={x:0,y:6,z:10},focus={x:0,y:1.1,z:0};
 assert.equal(caveForegroundCutaway({x:0,y:3.55,z:5},eye,focus),true,'rock between eye and actor is locally cut');
 assert.equal(caveForegroundCutaway({x:1.5,y:3.55,z:5},eye,focus),false,'nearby wall outside narrow tunnel remains solid');
 assert.equal(caveForegroundCutaway({x:0,y:1.1,z:-2},eye,focus),false,'geometry behind actor does not reveal rear room');
 assert.equal(caveForegroundCutaway({x:0,y:0,z:0},eye,focus),false,'walking floor remains');
 assert.equal(caveForegroundCutaway(eye,eye,focus),false,'near-camera surface is not blindly discarded');
 assert.equal(caveForegroundCutaway(focus,eye,focus),false);
 assert.equal(caveForegroundCutaway(focus,focus,focus),false,'zero-length sight line is finite');
});

test('joined walking shelves no longer inherit an invisible collision seam',()=>{
 const nav=new CaveNavigation(caveObstacles()),terrain=createWitchCaveTerrain();
 const start={x:-31,z:-4.2},end={x:-32,z:-5.3};
 assert.ok(nav.segmentClear(start,end,.32));
 let at=start;
 for(let i=1;i<=22;i++){
  const t=i/22,to={x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t};
  assert.ok(caveClearance(to.x,to.z)>.4);
  assert.ok(Math.abs(terrain.heightAt(to.x,to.z)-terrain.heightAt(at.x,at.z))<.03);
  const moved=nav.move(at,to,.32,67);assert.ok(Math.hypot(moved.x-to.x,moved.z-to.z)<1e-5);at=to;
 }
});

test('terrain separates rear chambers while retaining open local connecting corridors',()=>{
 const terrain=createWitchCaveTerrain();
 function blocks(a,b){
  const steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.1),ay=terrain.heightAt(a.x,a.z)+1.6,by=terrain.heightAt(b.x,b.z)+1.6;
  for(let i=1;i<steps;i++){const t=i/steps;if(terrain.heightAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)>ay+(by-ay)*t+.02)return true;}
  return false;
 }
 for(const [a,b]of [[0,4],[0,5],[2,3],[2,4]])assert.equal(blocks(CAVE_ROOMS[a],CAVE_ROOMS[b]),true);
 for(const [a,b]of [[0,1],[0,3],[1,3],[3,4]])assert.equal(blocks(CAVE_ROOMS[a],CAVE_ROOMS[b]),false,'adjacent passages stay visually connected');
});

test('cave floor, painted rocks and ink use the same local cutaway and focus',async()=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});
 let ink;
 try{
  const rock=MeshBuilder.CreateBox('cave-occluder',{},world.scene);rock.material=new PBRMaterial('cave-rock',world.scene);applyVillageToon([rock],world.lighting);world.scene.render();
  ink=new VillageOutlines(world,[],{});
  const inkSource=ink.material.shaderPath.fragmentSource;
  assert.ok(inkSource.includes(CAVE_VIEW_GLSL));
  assert.match(inkSource,/caveForegroundCutaway\(inkWorldPosition,inkCamera,inkFocus\)/);
  for(const mesh of [rock,world.ground]){
   await mesh.material.forceCompilationAsync(mesh,{useInstances:true});world.scene.render();
   const source=mesh.subMeshes.find(s=>s.effect)?.effect.fragmentSourceCode;
   assert.ok(source.includes(CAVE_VIEW_GLSL.trim()));
   assert.match(source,/caveForegroundCutaway\(vPositionW,caveEye,caveFocus\)/);
   const plugin=mesh.material.pluginManager.getPlugin(mesh===world.ground?'CaveGroundMood':'CaveRockMood');
   assert.equal(plugin.camera,world.camera);
   if(mesh===world.ground){assert.match(source,/caveRockShadow=clamp\(1\.-numLights\*\(1\.-aggShadow\)/);assert.match(source,/mix\(\.60,1\.,caveRockShadow\)/);assert.match(source,/vPositionW\.y\*1\.8/);}
  }
  assert.equal(world.scene.fogStart,CAVE_FOG_START);assert.equal(world.scene.fogEnd,CAVE_FOG_END);
 }finally{ink?.dispose();engine.dispose();}
});

test('baked rock sight blockers follow actual tall surfaces and preserve natural arch openings',()=>{
 const hash=createHash('sha256');for(const name of ['witch-cave-layout.js','witch-cave-terrain.js'])hash.update(readFileSync(new URL('../src/'+name,import.meta.url),'utf8').replace(/\r\n?/g,'\n'));
 assert.equal(CAVE_SIGHT_DATA.fingerprint,hash.digest('hex'));
 assert.deepEqual(CAVE_SIGHT_DATA.heightRange,[1.5,2.1]);assert.equal(CAVE_SIGHT_DATA.kind,'rock');
 for(const [x,z]of [[-35,32],[-6,-27],[40.1,-1.9]]){
  assert.equal(caveRockOccludes(x,z,.2),false,'centre of arch is open at eye height');
  let opaque=0;for(let dx=-5;dx<=5;dx+=.4)for(let dz=-5;dz<=5;dz+=.4)if(caveRockOccludes(x+dx,z+dz))opaque++;
  assert.ok(opaque>0,'arch sides and nearby rock remain blockers');
 }
 assert.equal(caveRockOccludes(0,7),false,'water is not inferred opaque from navigation');
 assert.equal(caveRockOccludes(29,-25.5),false,'boss arena floor stays open');
});

test('water, falls, roof and additive glows bind the current fog runtime without retaining old maps',async()=>{
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});
 const fogTexture=world.caveFog?.texture.getInternalTexture();if(fogTexture)fogTexture.isReady=true;
 try{
  const materials=world.scene.materials.filter(m=>['cave-painted-water','cave-flowing-water','cave-ceiling-paint'].includes(m.name)||m.name.startsWith('cave-glow-'));
  assert.equal(materials.length,5);const bound=[];
  world.caveFog={bind:material=>bound.push(material.name)};
  for(const material of materials){
   const mesh=world.scene.meshes.find(m=>m.material===material);await material.forceCompilationAsync(mesh,{useInstances:material.name.startsWith('cave-glow-')});
   material.onBindObservable.notifyObservers(mesh);
   const fragment=material.shaderPath.fragmentSource;
   assert.match(fragment,/uniform sampler2D caveFogMap/);
   assert.match(fragment,material.name.startsWith('cave-glow-')?/if\(caveFogHidesInk\(glowWorldPosition\)\)discard/:/gl_FragColor=vec4\(caveFogShade\(/);
  }
  assert.equal(bound.length,5);
  world.caveFog=null;
  for(const material of materials)material.onBindObservable.notifyObservers(null);
  assert.equal(bound.length,5,'callbacks look up current world state, rather than old map runtime');
 }finally{world.caveFog=null;engine.dispose();}
});
