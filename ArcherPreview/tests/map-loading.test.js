import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,Texture,TransformNode,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {readMapManifest} from '../src/map-manifests.js';
import {readMapContainer} from '../src/map-container.js';
import {waitForSceneReady} from '../src/scene-ready.js';
import {ResourceDownloads} from '../src/resource-downloads.js';
import {createMapTransition,carryPortalPose} from '../src/map-transition.js';
import {BossBattle} from '../src/boss-battle.js';
import {WarriorEquipment} from '../src/equipment.js';
import {setupFullscreen} from '../src/fullscreen.js';

test('manifest requests coalesce and stay consistent across revisits; failures are explicit',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,json:async()=>({revision:1})};});
  const url='https://manifests.test/village.json',results=await Promise.all([readMapManifest(url),readMapManifest(url)]);
  assert.equal(results[0],results[1]);assert.equal(await readMapManifest(url),results[0]);assert.equal(calls,1);
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:503}));await assert.rejects(readMapManifest('https://manifests.test/failure.json'),/503/);
});

test('cached plans use one key inventory, no Response bodies, and still notice eviction',async()=>{
  const names=Array.from({length:120},(_,i)=>i.toString(16).padStart(64,'0')+'.bin'),base='https://cache.test/',sizes=Object.fromEntries(names.map(n=>[n,8])),stored=new Set(names.map(n=>base+n));let keys=0,fetches=0;
  const cache={keys:async()=>{keys++;return [...stored].map(url=>({url}));},match(){throw new Error('must not open cached response bodies');},put:async(url,response)=>{await response.arrayBuffer();stored.add(url);},delete:async url=>stored.delete(url)};
  const downloads=new ResourceDownloads(sizes,base,{cacheStorage:{open:async()=>cache},fetcher:async()=>{fetches++;return new Response(new Uint8Array(8));}});
  assert.equal((await downloads.prepare(names)).cached,960);assert.equal(keys,1);assert.equal(fetches,0);
  stored.delete(base+names[0]);assert.equal((await downloads.prepare(names)).total,8);assert.equal(keys,2);assert.equal(fetches,1);
});

test('GPU readiness fails explicitly on shader errors or deadline and accepts a ready scene',async()=>{
  let checks=0,time=0;const engine={_compiledEffects:{}},scene={isReady:()=>++checks>3,getEngine:()=>engine};
  await waitForSceneReady(scene,{now:()=>time,wait:async()=>{time+=30;}});assert.equal(checks,4);
  scene.isReady=()=>false;engine._compiledEffects.fail={getCompilationError:()=>'; missing',allFallbacksProcessed:()=>true};
  await assert.rejects(waitForSceneReady(scene),/셰이더/);
  engine._compiledEffects={};time=0;await assert.rejects(waitForSceneReady(scene,{timeoutMs:60,now:()=>time,wait:async()=>{time+=30;}}),/시간이 초과/);
});

test('concurrent map containers detach only their own constructor callbacks',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());
  let unrelated=0;const original=scene.onDisposeObservable.add(()=>unrelated++),initial=scene.onDisposeObservable.observers.length;
  await assert.rejects(readMapContainer(scene,{asset:{version:'3.0'}},''),/버전/);assert.equal(scene.onDisposeObservable.observers.length,initial);
  const json={asset:{version:'2.0'},scenes:[{nodes:[0]}],scene:0,nodes:[{name:'root'}]};
  const containers=await Promise.all(Array.from({length:12},()=>readMapContainer(scene,structuredClone(json),'',{skipMaterials:true})));
  assert.equal(scene.onDisposeObservable.observers.length,initial+12);
  for(const c of containers)c.dispose();await new Promise(r=>setTimeout(r,10));
  assert.equal(scene.onDisposeObservable.observers.length,initial);assert.ok(scene.onDisposeObservable.observers.includes(original));assert.equal(unrelated,0);
});

test('20 map transfers preserve fullscreen/orientation, camera relation, HP, potions and selected equipment',async t=>{
  const descriptors=Object.fromEntries(['document','screen','matchMedia'].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
  const doc=new EventTarget(),root={},button=new EventTarget();button.textContent='전체화면';button.setAttribute=()=>{};button.contains=()=>false;doc.documentElement=root;let locks=0,exits=0,unlocks=0;
  root.requestFullscreen=async()=>{doc.fullscreenElement=root;doc.dispatchEvent(new Event('fullscreenchange'));};doc.exitFullscreen=async()=>{exits++;doc.fullscreenElement=null;};
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});Object.defineProperty(globalThis,'screen',{configurable:true,value:{orientation:{type:'landscape-primary',lock:async()=>locks++,unlock:()=>unlocks++}}});Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});
  const stopFullscreen=setupFullscreen(button),engine=new NullEngine(),scene=new Scene(engine),actor=new TransformNode('actor',scene),camera=new ArcRotateCamera('camera',.7,1.1,17,Vector3.Zero(),scene),pan={x:1,y:0,z:2};
  const source=new PBRMaterial('paint',scene);source.emissiveTexture=new Texture(null,scene);
  const sword=MeshBuilder.CreateBox('Golden_Oathblade',{},scene),shield=MeshBuilder.CreateBox('Bunnyguard_Shield',{},scene);sword.material=shield.material=source;
  const equipment=new WarriorEquipment({meshes:[sword,shield]},{sword:'violet-silver',shield:'teal-bronze'}),battle=new BossBattle({scene},()=>{});battle.combat.hp=317;battle.potions.remaining=1;
  t.after(()=>{equipment.dispose();engine.dispose();stopFullscreen();for(const [n,d]of Object.entries(descriptors)){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}});
  button.dispatchEvent(new Event('click'));await new Promise(r=>setImmediate(r));assert.equal(locks,1);
  const choices=equipment.inspect(),materials=[sword.material,shield.material],angle=Math.atan2(Math.sin(camera.alpha+actor.rotation.y),Math.cos(camera.alpha+actor.rotation.y));
  const travel=createMapTransition({prepare:()=>battle.hide(),release:async()=>{},load:async()=>carryPortalPose(actor,camera,pan),finish:()=>{},frame:async()=>{}});
  for(let i=0;i<20;i++){
    assert.equal(await travel.travel(i%2?'village':'forest'),true);assert.equal(battle.playerHp,317);assert.equal(battle.potions.remaining,1);assert.deepEqual(equipment.inspect(),choices);assert.deepEqual([sword.material,shield.material],materials);
    assert.equal(doc.fullscreenElement,root);assert.equal(screen.orientation.type,'landscape-primary');assert.equal(exits,0);assert.equal(unlocks,0);assert.equal(locks,1);
    assert.equal(camera.radius,17);assert.equal(camera.beta,1.1);assert.ok(Math.abs(Math.atan2(Math.sin(camera.alpha+actor.rotation.y),Math.cos(camera.alpha+actor.rotation.y))-angle)<1e-12);
  }
});
