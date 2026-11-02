import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,PBRMaterial,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {waitForSceneReady} from '../src/scene-ready.js';
import '@babylonjs/loaders/glTF/index.js';

const base=new URL('../public/assets/',import.meta.url),maps=[['warrior-v3','village',0,6],['warrior-plains','great-plains',-87,-32],['warrior-v4','monster-forest',0,45],['warrior-v5','witch-cave',-42,43]];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const inventory=scene=>({meshes:scene.meshes.length,transforms:scene.transformNodes.length,materials:scene.materials.length,textures:scene.textures.length,geometries:scene.geometries.length,pending:scene.getWaitingItemsCount()});
const readyRaw=scene=>{for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};

test('four maps revisit, cancel and retry with decoded real geometry and isolated late results',async t=>{
 const previous=globalThis.location,engine=new NullEngine({renderWidth:900,renderHeight:450});globalThis.location={href:'https://four-map-promotion.test/game/'};
 engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene,plateaus=new Map(),results=[];
 scene.defaultMaterial;scene.getOutlineRenderer();engine.getCaps().instancedArrays=true;
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 const loadContainer=async(model,target,options)=>{
  const source=new URL('content/'+model.pathname.split('/').at(-1),base),{gltf,files}=await readRuntimeGltf(source);
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const container=await readMapContainer(target,gltf,'',{skipMaterials:true,...options});
  const material=new PBRMaterial('fixture-'+model.pathname,target);container.materials.push(material);
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;
  return container;
 };
 const services={initialize:async()=>{},ground:async()=>{},loadContainer};
 t.after(async()=>{await world.releaseEnvironment?.();scene.dispose();engine.dispose();globalThis.location=previous;});
 function arrive(character,x,z){
  replaceWorldMap(world,character);const p=new Vector3(x,world.terrain.heightAt(x,z),z);world.camera.setTarget(p.add(new Vector3(0,1,0)));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(p,0,{force:true});
 }
 for(let cycle=0;cycle<2;cycle++)for(const [character,map,x,z]of maps){
  arrive(character,x,z);await loadStreamedVillage(world,services);assert.equal(world.environment.ready,true);assert.equal(world.mapId,map);assert.equal(scene.getWaitingItemsCount(),0);
  readyRaw(scene);world.villageVisibility.update(world.camera.globalPosition,world.camera.target,.1);scene.render();readyRaw(scene);await waitForSceneReady(scene,{timeoutMs:2000});
  const counts=inventory(scene);if(cycle)assert.deepEqual(counts,plateaus.get(map),map+' revisit resource plateau');else plateaus.set(map,counts);
  const records=world.villageRenderRecords,assets=world.villagePrepared.assets;assert.ok(records.length>0);await world.releaseEnvironment();assert.ok(records.every(r=>r.root.isDisposed()));assert.ok([...assets.values()].every(a=>[...a.tiers.values()].every(t=>t.container.meshes.length===0)));assert.equal(world.villageLoadOwner,null);assert.equal(scene.getWaitingItemsCount(),0);
 }
 for(const [character,map,x,z]of maps){
  arrive(character,x,z);const entered=deferred(),late=deferred();let disposed=0;
  const abandoned=loadStreamedVillage(world,{...services,loadContainer:()=>{entered.resolve();return late.promise;}}).catch(e=>e);
  await entered.promise;await world.releaseEnvironment();assert.equal((await abandoned).name,'AbortError');
  await loadStreamedVillage(world,services);const owner=world.villageLoadOwner,prepared=world.villagePrepared,records=world.villageRenderRecords;
  late.resolve({dispose(){disposed++;}});await tick();await tick();
  assert.equal(disposed,1,map+' late container disposed');assert.equal(world.villageLoadOwner,owner);assert.equal(world.villagePrepared,prepared);assert.equal(world.villageRenderRecords,records);assert.equal(world.environment.ready,true);assert.equal(scene.getWaitingItemsCount(),0);
  readyRaw(scene);world.villageVisibility.update(world.camera.globalPosition,world.camera.target,.1);scene.render();readyRaw(scene);await waitForSceneReady(scene,{timeoutMs:2000});
  await world.releaseEnvironment();assert.equal(world.villageLoadOwner,null);results.push({map,revisits:2,cancelRetry:1,lateDisposed:disposed});
 }
 if(process.env.VILLAGE_PROMOTION_AUDIT){mkdirSync(process.env.VILLAGE_PROMOTION_AUDIT,{recursive:true});writeFileSync(process.env.VILLAGE_PROMOTION_AUDIT+'/four-map-lifecycle.json',JSON.stringify({scope:'NullEngine actual map layouts, streamed load, decoded shipped geometry and scene ownership; image decoding, GPU upload and browser/device timing excluded.',maps:results},null,2));}
});
