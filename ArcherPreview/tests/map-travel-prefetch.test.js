import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {prepareMapResources} from '../src/startup-resources.js';
import {ResourceDownloads} from '../src/resource-downloads.js';

test('actual three-map foreground plans check cached inventory once, not again for every LOD; streaming still checks eviction',async t=>{
 const base=new URL('../public/assets/',import.meta.url),root='https://map-prefetch.test/assets/';
 const old={location:globalThis.location,caches:globalThis.caches,fetch:globalThis.fetch};
 let keys=0,matches=0;const deleted=new Set(),index=JSON.parse(readFileSync(new URL('resource-index.json',base)));
 const urls=Object.keys(index.files).map(name=>root+'content/'+name);
 const cache={keys:async()=>{keys++;return urls.filter(url=>!deleted.has(url)).map(url=>({url}));},match:async url=>{matches++;return !deleted.has(url)?new Response('cached'):undefined;}};
 globalThis.location={href:'https://map-prefetch.test/?character=warrior-v5'};globalThis.caches={open:async()=>cache};
 let contentFetches=0;
 globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);if(!name.endsWith('.json')){contentFetches++;return new Response('',{status:503});}return new Response(readFileSync(new URL(name,base)));};
 const engine=new NullEngine({renderWidth:1664,renderHeight:768}),world=createWorld(engine,{cave:true,touchDevice:true});
 t.after(()=>{engine.dispose();Object.assign(globalThis,old);});
 const results=[];
 for(const character of ['warrior-v5','warrior-v4','warrior-v3','warrior-v4','warrior-v5']){
  for(const record of world.villagePrepared?.records??[])record.root.dispose();world.villagePrepared=null;world.releaseResourceDownloads?.();replaceWorldMap(world,character);
  const pos=character==='warrior-v5'?new Vector3(-42,1,43):new Vector3(0,1,6);world.camera.setTarget(pos);world.camera.radius=17;
  world.caveFog?.update?.(pos,0,true);
  keys=matches=0;let state;await prepareMapResources(world,new URL(root),s=>state=s);
  const plan=world.villagePrepared;const initialKeys=keys,initialMatches=matches;
  let repeatedFiles=0;
  for(const request of plan.plan){const paths=plan.assets.get(request.id).levels.find(l=>l.level===request.level).resources;repeatedFiles+=paths.length;await world.prefetchResources(paths,{initial:true});}
  assert.equal(keys,initialKeys);assert.equal(matches,initialMatches);assert.equal(contentFetches,0);assert.equal(state.total,0);assert.equal(world.resourceDownloadStats.initialPrefetchReusedFiles,repeatedFiles);
  assert.equal(world.villagePrepared,plan);assert.ok(plan.plan.length>0);
  // Recreate the former per-model prefetch sequence with the exact same paths
  // and CacheStorage fixture, rather than estimating requests from file count.
  keys=matches=0;const oldSequence=new ResourceDownloads(index.files,new URL(root),{index,cacheStorage:{open:async()=>cache}});
  for(const request of plan.plan)await oldSequence.prepare(plan.assets.get(request.id).levels.find(l=>l.level===request.level).resources);
  results.push({character,models:plan.plan.length,eliminatedRepeatedFileChecks:matches,eliminatedRepeatedKeyScans:keys,initialKeys,initialMatches,networkBytes:state.total});
 }
 const path=world.villagePrepared.resources[0],url=new URL(path,root).href;deleted.add(url);
 await assert.rejects(world.prefetchResources([path]),/503/);assert.equal(contentFetches,1,'streaming checks actual eviction instead of trusting an old session-wide list');
 t.diagnostic(JSON.stringify({visits:results,quality:'existing actual resource graph and LOD plan unchanged',phoneSpeedMeasured:false}));
});
