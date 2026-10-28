import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,AssetContainer,MeshBuilder} from '@babylonjs/core';
import {createMapDeparture} from '../src/map-departure.js';
import {createWorld} from '../src/world.js';

test('travel paints the curtain before releasing the renderer and only navigates once',async()=>{
 const events=[],frames=[];
 const departure=createMapDeparture({prepare:()=>events.push('curtain, pause, cancel'),
  frame:()=>new Promise(resolve=>frames.push(resolve)),release:()=>events.push('release'),navigate:url=>events.push(url)});
 const pending=departure.leave('forest');assert.equal(departure.departing,true);
 assert.deepEqual(events,['curtain, pause, cancel']);assert.equal(await departure.leave('village'),false);
 frames.shift()();await Promise.resolve();assert.equal(events.length,1);
 frames.shift()();assert.equal(await pending,true);
 assert.deepEqual(events,['curtain, pause, cancel','release','forest']);
});

test('failed travel stays covered and reports once instead of restarting disposed resources',async()=>{
 let errors=0,attempts=0;
 const departure=createMapDeparture({prepare(){},frame:async()=>{},release(){},navigate(){attempts++;throw new Error('navigation blocked');},onError(){errors++;}});
 assert.equal(await departure.leave('forest'),false);assert.equal(await departure.leave('forest'),false);
 assert.equal(errors,1);assert.equal(attempts,1);assert.equal(departure.departing,true);
});

test('v3/v4 round trips dispose live and detached LOD meshes, with no temporary ground canvas',async()=>{
 for(let trip=0;trip<4;trip++){
  const engine=new NullEngine(),world=createWorld(engine,{village:true,forest:trip%2===1,touchDevice:true});
  assert.equal(world.floorMaterial.diffuseTexture,null);
  assert.ok(!world.scene.textures.some(t=>t.name==='floor-grid'));
  const cached=new AssetContainer(world.scene),mesh=MeshBuilder.CreateBox('detached-lod',{},world.scene);
  cached.meshes.push(mesh);cached.removeAllFromScene();
  const live=world.scene.meshes.slice();assert.ok(live.length>20);
  let navigated=false,failure;
  const departure=createMapDeparture({prepare(){},frame:async()=>{},release:()=>engine.dispose(),navigate:()=>{
   assert.equal(world.scene.isDisposed,true);assert.ok(mesh.isDisposed());assert.ok(live.every(m=>m.isDisposed()));
   assert.equal(engine.scenes.length,0);assert.equal(world.scene.textures.length,0);navigated=true;
  },onError:error=>{failure=error;}});
  const result=await departure.leave('next');if(failure)throw failure;assert.equal(result,true);assert.ok(navigated);
 }
});
