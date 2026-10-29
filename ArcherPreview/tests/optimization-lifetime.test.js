import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Observable,PBRMaterial,StandardMaterial} from '@babylonjs/core';
import {TerrainHeightField} from '../src/terrain.js';
import {createTerrainGround} from '../src/terrain-mesh.js';
import {cachedMapTerrain,inspectMapTerrainCache,MAP_TERRAIN_CACHE_BYTES} from '../src/map-terrain-cache.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {caveSurfaceStyle} from '../src/witch-cave-surfaces.js';

const engineStub=()=>({onDisposeObservable:new Observable()});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const bytes=terrain=>Buffer.from(terrain.heights.buffer,terrain.heights.byteOffset,terrain.heights.byteLength);

test('all authored terrain grids are byte-identical on warm visits and independently mutable',()=>{
 const engine=engineStub();
 for(const factory of [createVillageTerrain,createMonsterForestTerrain,createWitchCaveTerrain]){
  const expected=factory();let calls=0;const counted=()=>{calls++;return factory();};
  const first=cachedMapTerrain(engine,counted);assert.deepEqual(bytes(first),bytes(expected));
  first.heights.fill(100);first.surfaceHeight=()=>99;first.size=0;
  for(let trip=0;trip<5;trip++){
   const actual=cachedMapTerrain(engine,counted);assert.ok(actual instanceof TerrainHeightField);
   assert.deepEqual(bytes(actual),bytes(expected));assert.equal(actual.size,expected.size);assert.equal(actual.surfaceHeight,null);
   for(let x=-70;x<70;x+=7.3)for(let z=-70;z<70;z+=8.7)assert.equal(actual.heightAt(x,z),expected.heightAt(x,z));
   actual.heights.fill(-100);
  }
  assert.equal(calls,1,'one height computation for six visits');
 }
 assert.deepEqual({...inspectMapTerrainCache(engine)},{bytes:356364,limit:MAP_TERRAIN_CACHE_BYTES,entries:3,hits:15,misses:3,evictions:0});
 engine.onDisposeObservable.notifyObservers(engine);assert.equal(inspectMapTerrainCache(engine),null);
});

test('terrain cache bounds entries/bytes, isolates engines and bypasses dynamic terrain',()=>{
 const e=engineStub(),other=engineStub();let calls=0;
 const small=()=>{calls++;return new TerrainHeightField({subdivisions:4});};
 cachedMapTerrain(e,small);cachedMapTerrain(other,small);assert.equal(calls,2);
 for(let i=0;i<12;i++)cachedMapTerrain(e,()=>new TerrainHeightField({subdivisions:4}));
 assert.equal(inspectMapTerrainCache(e).entries,3);
 for(let i=0;i<6;i++){
  cachedMapTerrain(e,()=>new TerrainHeightField({subdivisions:256}));
  assert.ok(inspectMapTerrainCache(e).bytes<=MAP_TERRAIN_CACHE_BYTES);
  assert.ok(inspectMapTerrainCache(e).entries<=3);
 }
 const large=()=>new TerrainHeightField({subdivisions:400});
 const prior=inspectMapTerrainCache(e);cachedMapTerrain(e,large);assert.equal(inspectMapTerrainCache(e).bytes,prior.bytes);
 let dynamicCalls=0;const dynamic=()=>{dynamicCalls++;const t=new TerrainHeightField({subdivisions:4});t.surfaceHeight=()=>dynamicCalls;return t;};
 cachedMapTerrain(e,dynamic);cachedMapTerrain(e,dynamic);assert.equal(dynamicCalls,2);
 const extra=()=>{const t=new TerrainHeightField({subdivisions:4});t.mutable={};return t;};
 assert.notEqual(cachedMapTerrain(e,extra).mutable,cachedMapTerrain(e,extra).mutable);
});

function cave(t){
 const engine=new NullEngine(),scene=new Scene(engine),terrain=new TerrainHeightField({size:8,subdivisions:4,height:()=>0});
 const ground=createTerrainGround(scene,terrain),floorMaterial=new StandardMaterial('ground',scene);ground.material=floorMaterial;
 const style=caveSurfaceStyle({scene,ground,terrain,floorMaterial});
 t.after(()=>{style.dispose();engine.dispose();});
 return {scene,style,frame:()=>scene.onBeforeRenderObservable.notifyObservers(scene)};
}

test('disposed PBR materials leave both pending and active registries, including deferred add races',async t=>{
 const {scene,style,frame}=cave(t);await drain();frame();const baseline=style.inspect();
 for(let trip=0;trip<6;trip++)for(const defer of [false,true]){
  const materials=Array.from({length:32},(_,i)=>new PBRMaterial('transient-'+i,scene));
  if(defer){await drain();materials.slice(0,16).forEach(m=>m.metadata={villageToon:true});frame();assert.equal(style.inspect().active,baseline.active+16);}
  for(const material of materials)material.dispose();await drain();
  for(let i=0;i<10;i++)frame();
  assert.deepEqual(style.inspect(),baseline,'no stale strong references after repeated creation/disposal');
 }
});

test('live container-removed material gets its late tint; player stays unchanged; cleanup detaches observers',async t=>{
 const {scene,style,frame}=cave(t);await drain();frame();
 const player=new PBRMaterial('player',scene),source=new PBRMaterial('container-source',scene);
 scene.removeMaterial(source); // AssetContainer.removeAllFromScene does this without disposing.
 await drain();frame();assert.equal(style.inspect().pending,2);
 assert.equal(source.pluginManager?.getPlugin('CaveRockMood')??null,null);
 source.metadata={villageToon:true};frame();const mood=source.pluginManager.getPlugin('CaveRockMood');
 assert.ok(mood.active);assert.equal(style.inspect().pending,1);
 assert.equal(player.pluginManager?.getPlugin('CaveRockMood')??null,null);
 scene.addMaterial(source);await drain();frame();assert.equal(source.pluginManager.getPlugin('CaveRockMood'),mood);
 const before=player.onDisposeObservable.observers.length;assert.ok(before>0);
 style.dispose();style.dispose();await new Promise(resolve=>setTimeout(resolve,0));await drain(); // Babylon defers observer-array removal to a timer.
 assert.deepEqual(style.inspect(),{pending:0,active:0,tracked:0,disposed:true});assert.equal(mood.active,false);
 assert.equal(player.onDisposeObservable.observers.length,before-1);
 assert.equal(scene.onBeforeRenderObservable.observers.length,0);
 assert.equal(scene.onNewMaterialAddedObservable.observers.length,0);
 assert.equal(scene.onMaterialRemovedObservable.observers.length,0);
 player.dispose();source.dispose();
});
