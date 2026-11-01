import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,PBRMaterial} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';

const base=new URL('../public/assets/',import.meta.url);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const counts=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,geometry:scene.geometries.length,after:scene.onAfterRenderObservable.observers.length,dispose:scene.onDisposeObservable.observers.length});
async function realContainer(model,scene){
 const name=model.pathname.split('/').at(-1),{gltf,files}=await readRuntimeGltf(new URL('content/'+name,base));
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:name}),material=new PBRMaterial('cancel-fixture-'+name,scene);material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;container.materials.push(material);
 for(const mesh of container.meshes)if(mesh.getTotalVertices()>0)mesh.material=material;
 for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
 return container;
}
function fixture(t){
 const saved=globalThis.location;globalThis.location={href:'https://initial-cancel.test/game/?character=warrior-v5'};t.after(()=>globalThis.location=saved);
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());world.placements=world.placements.filter(p=>p.asset===CAVE_LABORATORY_GEOMETRY.assetId);
 const requested=deferred(),resume=deferred();let first=true,container;
 const promise=loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer:async(model,scene)=>{const result=await realContainer(model,scene);if(first){first=false;container=result;requested.resolve();await resume.promise;}return result;}});
 const outcome=promise.then(value=>({value}),error=>({error}));
 return {engine,world,requested,resume,outcome,container:()=>container};
}

test('release while essential initial geometry is pending cannot recreate texture observers or disposed records when it completes',async t=>{
 const f=fixture(t),{world}=f;await f.requested.promise;const oldRecord=world.villagePrepared.records[0];await world.releaseEnvironment();const released=counts(world.scene);released.materials-=f.container().materials.filter(m=>world.scene.materials.includes(m)).length;
 assert.equal(world.villageRenderRecords,null);assert.equal(oldRecord.root.isDisposed(),true);f.resume.resolve();const result=await f.outcome;
 assert.equal(result.error?.name,'AbortError');assert.equal(world.villageRenderRecords,null);assert.equal(world.villageStreaming,null);assert.equal(world.villagePrepared,null);assert.equal(world.villagePromise,null);assert.equal(world.environment.ready,false);assert.deepEqual(counts(world.scene),released);
 for(const mesh of f.container().meshes)assert.equal(mesh.isDisposed(),true);
});

test('a stale initial rejection after a new forest load cannot clear the newer owner, records or release function',async t=>{
 const f=fixture(t),{world}=f;await f.requested.promise;await world.releaseEnvironment();replaceWorldMap(world,'warrior-v4');world.placements=world.placements.filter(p=>p.kind==='tree').slice(0,1);assert.equal(world.placements.length,1);
 await loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer:realContainer});
 const prepared=world.villagePrepared,records=world.villageRenderRecords,owner=world.villageLoadOwner,promise=world.villagePromise,release=world.releaseEnvironment,inventory=counts(world.scene);inventory.materials-=f.container().materials.filter(m=>world.scene.materials.includes(m)).length;
 assert.equal(world.environment.ready,true);f.resume.resolve();const stale=await f.outcome;assert.equal(stale.error?.name,'AbortError');
 assert.equal(world.villagePrepared,prepared);assert.equal(world.villageRenderRecords,records);assert.equal(world.villageLoadOwner,owner);assert.equal(world.villagePromise,promise);assert.equal(world.releaseEnvironment,release);assert.equal(world.environment.ready,true);assert.deepEqual(counts(world.scene),inventory);
 for(const record of records)assert.equal(record.root.isDisposed(),false);await release();assert.equal(world.villagePrepared,null);
});

test('scene disposal during pending initial geometry leaves no late observers, models or ready environment resurrection',async t=>{
 const f=fixture(t),{world}=f;await f.requested.promise;world.scene.dispose();const disposed=counts(world.scene);f.resume.resolve();const result=await f.outcome;
 assert.equal(result.error?.name,'AbortError');assert.equal(world.scene.isDisposed,true);assert.equal(world.villagePrepared,null);assert.equal(world.villageRenderRecords,null);assert.equal(world.villageStreaming,null);assert.equal(world.environment.ready,false);assert.deepEqual(counts(world.scene),disposed);
 for(const mesh of f.container().meshes)assert.equal(mesh.isDisposed(),true);
});
