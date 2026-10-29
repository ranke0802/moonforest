import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {prepareStartupResources} from '../src/startup-resources.js';
import {playerTextureManifest} from '../src/player-texture-profile.js';
import {CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CAVE_SPAWN} from '../src/map-route.js';
import {FOREST_PLACEMENTS} from '../src/monster-forest-layout.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {VILLAGE_SPAWN} from '../src/village-layout.js';
import {FOREST_SPAWN,MAP_PORTALS} from '../src/map-route.js';
const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name+'.json',base)));

// Real spatial startup plans and inventory, streamed synthetic bodies of the
// exact byte lengths. No browser, GPU rasterization or device timing is emulated.
for(const [device,agent,width,height]of [
 ['Galaxy S23 landscape',{userAgent:'Android SM-S911 Chrome'},780,360],
 ['Galaxy S23 portrait',{userAgent:'Android SM-S911 Chrome'},360,780],
])test(device+': cave/forest round trips share the 8K player and cached LODs',async t=>{
 const stored=new Map(),network=new Map(),sizes=read('resource-sizes').files,phases=[];
 const cache={async match(url){return stored.has(url)?new Response('cached'):undefined;},
  async put(url,response){let bytes=0;const reader=response.body.getReader();for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;}stored.set(url,bytes);},
  async delete(url){stored.delete(url);}};
 t.mock.method(globalThis,'fetch',async url=>{
  const name=new URL(url).pathname.split('/').at(-1);
  if(name.endsWith('.json'))return new Response(readFileSync(new URL(name,base)));
  assert.equal(statSync(new URL('content/'+name,base)).size,sizes[name]);
  network.set(String(url),(network.get(String(url))??0)+1);
  let left=sizes[name];return new Response(new ReadableStream({pull(c){if(!left){c.close();return;}const n=Math.min(left,65536);left-=n;c.enqueue(new Uint8Array(n));}},{highWaterMark:0}));
 });
 const saved={location:globalThis.location,caches:globalThis.caches};t.after(()=>Object.assign(globalThis,saved));
 globalThis.caches={async open(){return cache;}};
 for(let trip=0;trip<5;trip++){
  const forest=trip%2===1,character=forest?'warrior-v4':'warrior-v5';
  globalThis.location={href:'https://example.test/ArcherPreviewSite/?character='+character+'&rev=trip'+trip};
  const engine=new NullEngine({renderWidth:width*2,renderHeight:height*2}),scene=new Scene(engine);scene.useRightHandedSystem=true;
  try{
   const terrain=forest?createMonsterForestTerrain():createWitchCaveTerrain();
   const spawn=forest?MAP_PORTALS['witch-cave'].arrival:CAVE_SPAWN;
   const target=new Vector3(spawn.x,terrain.heightAt(spawn.x,spawn.z)+1.1,spawn.z);
   const camera=new ArcRotateCamera('startup',Math.PI*.38,1.18,4.8,target,scene);camera.fov=.65;camera.minZ=.05;camera.maxZ=350;
   const world={scene,camera,terrain,cave:!forest,touchDevice:true,environmentManifest:forest?'monster-forest':'witch-cave',groundManifest:forest?'monster-forest-ground':'witch-cave-ground',placements:forest?FOREST_PLACEMENTS:CAVE_PLACEMENTS};
   const profile=playerTextureManifest(character,{astc:{},maxTextureSize:16384},agent);
   assert.equal(profile,'warrior-v3-ios');let state;
   const before=new Map(network);
   const manifest=await prepareStartupResources(world,new URL(`https://example.test/ArcherPreviewSite/assets/${profile}.json`),s=>state=s,()=>{});
   assert.equal(manifest.textureProfile.maxSize,8192);assert.equal(manifest.textureProfile.preserveSourceResolution,true);
   assert.ok(world.startupResources.initialLodModels<world.villagePrepared.assets.size*3,'distant tiers remain deferred');
   if(trip)for(const path of manifest.resources){const url=new URL(path,'https://example.test/ArcherPreviewSite/assets/').href;assert.equal(network.get(url),before.get(url),'no repeat player downloads');}
   if(trip>=3)assert.equal(state.total,0,'revisiting the same arrival view is entirely cached');
   assert.ok([...network.values()].every(n=>n===1),'every content hash fetched at most once across routes/revisions');
   phases.push({character,arrival:trip>0,downloadBytes:state.total,cachedBytes:state.cached,initialLods:world.startupResources.initialLodModels});
   scene.dispose();await assert.rejects(world.prefetchResources(manifest.resources),{name:'AbortError'});
  }finally{engine.dispose();}
 }
 const original=read('warrior-v3'),model=JSON.parse(readFileSync(new URL(original.model,base)));
 for(const image of model.images)assert.ok([...network.keys()].every(url=>!url.endsWith(image.uri)),'never download raw player textures as well');
 t.diagnostic(JSON.stringify({device,phases,uniqueDownloads:network.size}));
});
