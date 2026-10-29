import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {prepareStartupResources} from '../src/startup-resources.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {VILLAGE_SPAWN} from '../src/village-layout.js';
import {planResourceTransfers} from '../src/resource-index.js';
const base=new URL('../public/assets/',import.meta.url);
for(const profile of ['warrior-v3','warrior-v3-ios'])test(`${profile} startup inventory covers real player 8K, selected village LODs and ground; cached reload downloads no content`,async t=>{
 const engine=new NullEngine({renderWidth:900,renderHeight:450}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const terrain=createVillageTerrain(),target=new Vector3(0,terrain.heightAt(0,VILLAGE_SPAWN.z)+1.1,VILLAGE_SPAWN.z);
 const camera=new ArcRotateCamera('camera',Math.PI*.38,.88,17,target,scene);camera.fov=.65;camera.minZ=.05;
 const world={scene,camera,terrain,touchDevice:true},requested=[],checked=[];
 const saved={fetch:globalThis.fetch,location:globalThis.location,caches:globalThis.caches};
 t.after(()=>{Object.assign(globalThis,saved);engine.dispose();});
 globalThis.location={href:'https://example.test/ArcherPreviewSite/?character=warrior-v3'};
 globalThis.fetch=async url=>{requested.push(String(url));assert.ok(String(url).endsWith('.json'));return new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)));};
 globalThis.caches={async open(){return {async match(url){checked.push(url);assert.ok(statSync(new URL('content/'+new URL(url).pathname.split('/').at(-1),base)).size>0);return new Response('cached');}};}};
 let state;const player=await prepareStartupResources(world,new URL(`https://example.test/ArcherPreviewSite/assets/${profile}.json`),s=>state=s,()=>{});
 assert.equal(player.textureProfile.maxSize,8192);assert.equal(player.textureProfile.preserveSourceResolution,true);assert.equal(state.total,0);assert.equal(state.complete,true);
 assert.ok(world.startupResources.initialLodModels<60);assert.ok(checked.length>20);assert.equal(checked.length,new Set(checked).size);
 assert.ok(requested.every(u=>u.endsWith('.json')));assert.equal(world.villagePrepared.records.length>100,true);
 if(profile==='warrior-v3-ios'){
  const original=JSON.parse(readFileSync(new URL('warrior-v3.json',base),'utf8'));
  const model=JSON.parse(readFileSync(new URL(original.model,base),'utf8'));
  assert.ok(checked.every(url=>!model.images.some(im=>url.endsWith(im.uri))),'Never prefetch the uncompressed player too');
 }
 const index=JSON.parse(readFileSync(new URL('resource-index.json',base))),missing=checked.map(url=>({url,size:index.files[new URL(url).pathname.split('/').at(-1)]})),plan=planResourceTransfers(missing,index);
 assert.ok(plan.packs.length+plan.files.length<checked.length*.7,'startup bundling must reduce request count without fetching extra resources');
 t.diagnostic(JSON.stringify({mobileLandscapeInitialModels:world.startupResources.initialLodModels,coldAssetBytes:state.cached,coldBundledBytes:plan.bytes,oldRequests:checked.length,bundledRequests:plan.packs.length+plan.files.length,packs:plan.packs.length,cachedDownloadBytes:state.total}));
});
