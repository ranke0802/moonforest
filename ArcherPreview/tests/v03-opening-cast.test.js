import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {MeshBuilder,NullEngine,RawTexture,Scene,SceneLoader} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {readFile} from 'node:fs/promises';
import {createStory} from '../src/v03/story.js';
import {createCastVisuals} from '../src/v03/cast-models.js';
import {CAST_ENTRIES} from '../src/v03/cast-catalog.js';
import {withResidentFaceRig} from '../src/v03/resident-face-models.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import * as content from '../src/v03/data/chapter1.js';

const map='great-plains';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{packed=false}={}){
 const engine=new NullEngine(),scene=new Scene(engine);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const world={scene,mapId:map,navigation:{obstacles:[]}};
 const placed=MeshBuilder.CreateBox('placed wagon',{},scene);
 world.authoredPlacements={records:new Map([['v03-opening-wagon',{meshes:[placed]}]])};
 const jobs={wagon:[],horse:[],driver:[]},calls={wagon:0,horse:0,driver:0},records=new Map();
 const queue=kind=>{calls[kind]++;return new Promise((resolve,reject)=>jobs[kind].push({resolve,reject}));};
 if(packed){
  t.mock.method(globalThis,'fetch',async url=>{
   await queue(url.pathname.includes('wagon-horse')?'horse':'wagon');return new Response(await readFile(url));
  });
  // Native image decoding is outside NullEngine; the GLB meshes, skeleton,
  // clips, toon materials and outline shells are the actual game resources.
  t.mock.method(GLTFLoader.prototype,'_loadTextureAsync',function(_context,texture,assign){
   const image=RawTexture.CreateRGBATexture(Uint8Array.of(70,45,35,255),1,1,this.babylonScene,false,false);
   image.getInternalTexture().isReady=true;image.name=texture.name;assign(image);return Promise.resolve(image);
  });
 }else{
  t.mock.method(globalThis,'fetch',async url=>new Response(Uint8Array.of(url.pathname.includes('wagon-horse')?1:0)));
  t.mock.method(SceneLoader,'ImportMeshAsync',async (_filter,_base,bytes)=>{
   const kind=bytes[0]?'horse':'wagon';await queue(kind);
   return {meshes:[MeshBuilder.CreateBox('imported '+kind,{},scene)],animationGroups:[],transformNodes:[],skeletons:[]};
  });
 }
 const npc={
  async add(assetId,{instanceId}){
   await queue('driver');
   if(!packed){records.set(instanceId,{ready:true,encounter:{actor:MeshBuilder.CreateBox('driver',{},scene)}});return;}
   const entry=withResidentFaceRig(CAST_ENTRIES.find(entry=>entry.assetId===assetId));
   const {gltf,files}=await readRuntimeGltf(new URL('../public/'+entry.runtime.model,import.meta.url));
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;
   const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');loader.dispose();container.addAllToScene();
   const actor=container.meshes.find(mesh=>!mesh.parent);assert.ok(actor);
   records.set(instanceId,{ready:true,container,encounter:{actor}});
  },
  remove(id){const row=records.get(id);if(row?.container)row.container.dispose();else row?.encounter.actor.dispose();records.delete(id);},
  get:id=>records.get(id),setTransform(){},
 };
 const visuals=createCastVisuals({getWorld:()=>world,loadRuntime:()=>npc,fallback:()=>assert.fail('A strict driver must never become a block')});
 const journey={getItem:()=>null,setItem(){},removeItem(){}};
 const api={world,battle:{encounters:[],combatCount:0},getController:()=>null,getPlayer:()=>null,input:{setSuspended(){}}};
 const story=createStory({api,doc:document,content,save:{journey,touch(){}},createVisual:visuals});
 t.after(()=>{story.dispose();scene.dispose();engine.dispose();});
 return {story,placed,scene,calls,finish(kind,fail=false){
  const job=jobs[kind].shift();assert.ok(job,'pending '+kind);
  if(fail)job.reject(new Error('fixture '+kind));else job.resolve();
 }};
}

test('opening joins pending models, holds for the actual driver, and adopts the same cast on the first play frame',async t=>{
 const h=fixture(t),controller=new AbortController();
 const gate=h.story.prepareOpeningCast(map,{signal:controller.signal});
 assert.equal(h.story.prepareOpeningCast(map,{signal:controller.signal}),gate);
 let ready=false;gate.then(()=>{ready=true;});
 await tick();h.finish('horse');h.finish('driver',true);await tick();
 assert.equal(ready,false);assert.equal(h.placed.isVisible,true);
 h.finish('wagon');await tick();assert.equal(ready,false);
 h.finish('driver');await gate;assert.equal(h.placed.isVisible,false);
 const driver=h.story.castVisual('driver'),wagon=h.scene.getTransformNodeByName('v03-story-wagon');
 h.story.start({fresh:true});controller.abort();
 h.story.update(0,{ready:true,mapId:map,character:'warrior-plains'});
 assert.equal(h.story.castVisual('driver'),driver);assert.ok(wagon);assert.equal(wagon.isDisposed(),false);
 assert.deepEqual(h.calls,{wagon:1,horse:1,driver:2});
 h.story.stop();assert.equal(h.placed.isVisible,true);
});

test('after two failed horse imports a manual retry retains the other two real models',async t=>{
 const h=fixture(t),gate=h.story.prepareOpeningCast(map);
 const rejected=assert.rejects(gate,/horse/);
 await tick();h.finish('wagon');h.finish('driver');h.finish('horse',true);
 await tick();h.finish('horse',true);await rejected;
 assert.deepEqual(h.calls,{wagon:1,horse:2,driver:1});
 const retry=h.story.prepareOpeningCast(map);await tick();h.finish('horse');await retry;
 assert.deepEqual(h.calls,{wagon:1,horse:3,driver:1});
});

test('abandoning during import disposes late models and preserves the placed wagon',async t=>{
 const h=fixture(t),controller=new AbortController();
 const gate=h.story.prepareOpeningCast(map,{signal:controller.signal});
 const rejected=assert.rejects(gate,{name:'AbortError'});
 await tick();controller.abort();await rejected;
 h.finish('horse');h.finish('wagon');h.finish('driver');await tick();
 assert.deepEqual(h.scene.meshes.map(mesh=>mesh.name),['placed wagon']);
 assert.equal(h.story.castVisual('driver'),null);assert.equal(h.placed.isVisible,true);
});

test('a driver timing out can be retried without waiting for its stale import or importing the wagon again',async t=>{
 const h=fixture(t);
 t.mock.timers.enable({apis:['setTimeout']});
 const old=h.story.prepareOpeningCast(map),timedOut=assert.rejects(old,{name:'TimeoutError'});
 await tick();h.finish('horse');h.finish('wagon');await tick();
 t.mock.timers.tick(45000);await timedOut;
 const retry=h.story.prepareOpeningCast(map);await tick();
 assert.deepEqual(h.calls,{wagon:1,horse:1,driver:2});
 h.finish('driver');h.finish('driver');await retry;
 assert.equal(h.scene.meshes.filter(mesh=>mesh.name==='driver').length,1);
});

test('the shipped opening wagon, rigged horse and face-rigged driver have drawable geometry when the cover can lift',async t=>{
 const h=fixture(t,{packed:true}),gate=h.story.prepareOpeningCast(map);
 await tick();h.finish('driver');h.finish('horse');h.finish('wagon');await gate;
 for(const name of ['v03-story-wagon','v03-wagon-horse']){
  const root=h.scene.getTransformNodeByName(name);
  assert.ok(root?.getChildMeshes().some(mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0),name);
 }
 const driver=await h.story.castVisual('driver').ensureModel();
 assert.ok(driver.getChildMeshes().some(mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices()>0));
 assert.ok(h.scene.skeletons.length>0);assert.ok(h.scene.animationGroups.length>0);
});
