import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,PBRMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage,prepareVillageStart} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {inspectMapDecodeCache,mapDecodePools} from '../src/map-decode-cache.js';
import {inspectMapTerrainCache} from '../src/map-terrain-cache.js';
import {mapShaderCacheSize} from '../src/map-shader-cache.js';
import {CAVE_SPAWN,MAP_PORTALS} from '../src/map-route.js';
import {configurePlayerSize,WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {waitForSceneReady} from '../src/scene-ready.js';

const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base))),results=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
// Observable.remove marks an observer inactive now and removes its array entry
// on a timer. A setImmediate alone can precede that timer in a warm-cache load.
const tick=()=>new Promise(r=>setTimeout(r,0));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(world){const s=world.scene;return {meshes:s.meshes.length,transforms:s.transformNodes.length,materials:s.materials.length,textures:s.textures.length,geometries:s.geometries.length,receivers:world.lighting.receivers.size,pending:s.getWaitingItemsCount(),observers:['onBeforeRenderObservable','onAfterRenderObservable','onDisposeObservable','onNewMaterialAddedObservable','onMaterialRemovedObservable','onNewMeshAddedObservable','onMeshRemovedObservable'].map(k=>s[k].observers.length),meshStage:s._afterRenderingMeshStage.length};}
function readyRaw(scene){for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;}
function placeAtArrival(world){const p=world.cave?CAVE_SPAWN:MAP_PORTALS['witch-cave'].arrival;world.camera.setTarget(new Vector3(p.x,world.terrain.heightAt(p.x,p.z)+WARRIOR_DIMENSIONS.stableFocusHeight,p.z));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z),0,{force:true});readyRaw(world.scene);return p;}
async function fixture(t,host){
 const oldLocation=globalThis.location,oldDecoder=MeshoptCompression._Default,engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{cave:true,touchDevice:true}),scene=world.scene;
 globalThis.location={href:`https://${host}/game/?character=warrior-v5`};engine.getCaps().instancedArrays=true;scene.defaultMaterial;scene.getOutlineRenderer();
 const state={calls:0,decodeCalls:0,decodedBytes:0,pendingDecodes:0,peakDecodes:0,modelHashes:new Map(),loadedModels:new Map(),containers:[],nextGate:null};
 await MeshoptDecoder.ready;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{state.decodeCalls++;state.pendingDecodes++;state.peakDecodes=Math.max(state.peakDecodes,state.pendingDecodes);try{if(state.nextGate){const gate=state.nextGate;state.nextGate=null;gate.entered.resolve();await gate.resume.promise;}const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);state.decodedBytes+=out.byteLength;return out;}finally{state.pendingDecodes--;}}};
 t.mock.method(globalThis,'fetch',async url=>{const name=new URL(url).pathname.split('/').at(-1);assert.ok(name.endsWith('.json'));return new Response(readFileSync(new URL(name,base)));});
 const loadContainer=async(model,scene)=>{
  const file=model.pathname.split('/').at(-1),modelUrl=new URL('content/'+file,base),gltf=JSON.parse(readFileSync(modelUrl));assert.equal(digest(readFileSync(modelUrl)),file.split('.')[0]);assert.ok(gltf.extensionsRequired.includes('EXT_meshopt_compression'));
  for(const b of gltf.buffers)if(b.uri){const bytes=readFileSync(new URL(b.uri,modelUrl));assert.equal(digest(bytes),b.uri.split('.')[0]);b.uri='data:application/octet-stream;base64,'+bytes.toString('base64');}
  // Keep compressed EXT bufferViews unchanged: Babylon's real extension and
  // cacheMapBufferViews run before the local real-WASM decoder boundary above.
  const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:file}),geometry=container.meshes.filter(m=>m.getTotalVertices()>0),hash=createHash('sha256');
  for(const m of geometry){hash.update(Buffer.from(Uint32Array.from(m.getIndices()).buffer));for(const kind of ['position','normal','uv'])hash.update(Buffer.from(Float32Array.from(m.getVerticesData(kind)??[]).buffer));}
  const signature=hash.digest('hex');if(state.modelHashes.has(file))assert.equal(signature,state.modelHashes.get(file),'cached geometry attributes/indices remain byte-equivalent');else state.modelHashes.set(file,signature);
  const materials=gltf.materials.map((source,i)=>{const m=new PBRMaterial(file+'-'+i,scene);m.transparencyMode=source.alphaMode==='BLEND'?2:source.alphaMode==='MASK'?1:0;m.backFaceCulling=!source.doubleSided;return m;});
  for(const m of geometry)m.material=materials[gltf.meshes[0]?.primitives[0]?.material??0];container.materials.push(...materials);state.calls++;state.loadedModels.set(file,(state.loadedModels.get(file)??0)+1);state.containers.push(container);readyRaw(scene);return container;
 };
 t.after(()=>{engine.dispose();MeshoptCompression._Default=oldDecoder;globalThis.location=oldLocation;});
 return {engine,world,scene,state,services:{initialize:async()=>{},ground:async()=>{},loadContainer}};
}

test('actual compressed cave/forest startup and complete source release stay bounded over six round trips',async t=>{
 const f=await fixture(t,'repeat-native-cache.test'),{world,scene,state,engine}=f,camera=world.camera,terrain=world.terrain,player=new TransformNode('retained-player-anchor',scene);configurePlayerSize(player,{scale:1},{warrior:true});
 const playerProfile=read('warrior-v3-ios.json').textureProfile;assert.equal(playerProfile.maxSize,8192);assert.equal(playerProfile.preserveSourceResolution,true);
 const perMap=new Map(),releasedPerMap=new Map(),plans=new Map(),visits=[];
 for(let visit=0;visit<12;visit++){
  const character=visit%2?'warrior-v4':'warrior-v5';if(visit)replaceWorldMap(world,character);const position=placeAtArrival(world),before=inspectMapDecodeCache(engine)?.geometry??null,start=await prepareVillageStart(world),requestCount=start.plan.length,calls=state.decodeCalls,plan=start.plan.map(r=>r.id+':'+r.level);if(plans.has(character))assert.deepEqual(plan,plans.get(character),'compare the same canonical arrival view each visit');else plans.set(character,plan);
  await loadStreamedVillage(world,f.services);await tick();readyRaw(scene);world.lighting.follow(new Vector3(position.x,world.terrain.heightAt(position.x,position.z),position.z),true);world.villageVisibility.update(world.camera.globalPosition,new Vector3(position.x,0,position.z),.1);scene.render();readyRaw(scene);await waitForSceneReady(scene,{timeoutMs:1000});for(const asset of start.assets.values())assert.ok(!asset.config.highTextures||asset.config.highTextures.textures.albedo.width<=4096);
  assert.equal(world.environment.ready,true);assert.equal(world.villageStreaming.active,false);assert.equal(world.camera,camera);assert.equal(world.terrain,terrain);assert.equal(player.metadata.playerDimensions,WARRIOR_DIMENSIONS);
  const key=world.mapId,loaded=inventory(world),cache=inspectMapDecodeCache(engine);assert.equal(loaded.pending,0);assert.ok(cache.geometry.bytes<=8*1048576);assert.ok(cache.textures.bytes<=24*1048576);assert.ok(mapShaderCacheSize(engine)<=12);assert.ok(inspectMapTerrainCache(engine).bytes<=512*1024);
  if(perMap.has(key)){if(JSON.stringify(loaded)!==JSON.stringify(perMap.get(key)))t.diagnostic(JSON.stringify({visit,map:key,plan,loaded,names:scene.meshes.map(m=>m.name),stages:scene._afterRenderingMeshStage.map(s=>s.component.constructor.name)}));assert.deepEqual(loaded,perMap.get(key),'same map scene resources/receivers/observers cannot grow per visit');}else perMap.set(key,loaded);
  const sources=[...start.assets.values()].flatMap(a=>[...a.tiers.values()].map(t=>t.container)),roots=start.records.map(r=>r.root);await world.releaseEnvironment();await tick();
  for(const r of roots)assert.equal(r.isDisposed(),true);for(const c of sources){assert.equal(c.meshes.length,0);assert.equal(c.materials.length,0);assert.equal(c.geometries.length,0);}assert.equal(world.villageLoadOwner,null);assert.equal(world.villagePrepared,null);assert.equal(world.villageStreaming,null);assert.equal(state.pendingDecodes,0);
  const released=inventory(world);if(releasedPerMap.has(key)){if(JSON.stringify(released)!==JSON.stringify(releasedPerMap.get(key)))t.diagnostic(JSON.stringify({visit,released,dispose:scene.onDisposeObservable.observers.map(o=>({removed:o._willBeUnregistered,callback:o.callback.toString().slice(0,160)}))}));assert.deepEqual(released,releasedPerMap.get(key));}else releasedPerMap.set(key,released);
  visits.push({visit,map:key,startupRequests:requestCount,decodeCalls:state.decodeCalls-calls,cacheHits:cache.geometry.hits-(before?.hits??0),loaded,released,cache:cache.geometry});
 }
 assert.ok(state.decodeCalls>0);assert.ok(inspectMapDecodeCache(engine).geometry.hits>0);assert.ok([...state.loadedModels.values()].some(n=>n>1));
 const report={status:'PASS',roundTrips:6,visits,modelLoads:state.calls,uniqueModels:state.loadedModels.size,decodeCalls:state.decodeCalls,decodedBytes:state.decodedBytes,adapterPeakDecoderPromises:state.peakDecodes,cache:inspectMapDecodeCache(engine),shaderCache:mapShaderCacheSize(engine),limits:'Actual shipped Meshopt bytes and Babylon EXT/cache path, real WASM in-process adapter; browser worker scheduling and material image decode/upload excluded. Player8K manifest is preserved but its images are not allocated here. No browser/driver/GPU/phone timing or heap claim.'};results.push(report);t.diagnostic(JSON.stringify({...report,visits:visits.map(v=>({visit:v.visit,map:v.map,decodeCalls:v.decodeCalls,cacheHits:v.cacheHits}))}));
});

test('an in-flight real Meshopt LOD completes only into bounded CPU cache and is disposed before cave-to-forest replacement',async t=>{
 const f=await fixture(t,'repeat-pending-cache.test'),{world,scene,state,engine}=f;placeAtArrival(world);await loadStreamedVillage(world,f.services);const start=world.villagePrepared,stream=world.villageStreaming,request=[...start.assets].flatMap(([id,a])=>a.source?a.levels.filter(l=>!a.tiers.has(l.level)).map(l=>({id,level:l.level})):[])[0];assert.ok(request);
 const gate={entered:deferred(),resume:deferred()};state.nextGate=gate;stream.active=true;stream.demand.get=()=>[request];stream.update(performance.now()+10000);assert.ok(stream.pending);await gate.entered.promise;
 const count=state.calls;let released=false;const release=world.releaseEnvironment().then(()=>released=true);await tick();assert.equal(released,false,'release must not race a live old source into a new map');gate.resume.resolve();await release;await tick();assert.equal(state.calls,count+1);assert.equal(state.pendingDecodes,0);assert.equal(world.villagePrepared,null);assert.equal(scene.getWaitingItemsCount(),0);assert.ok(inspectMapDecodeCache(engine).geometry.bytes<=8*1048576);
 const late=state.containers.at(-1);assert.equal(late.meshes.length,0);assert.equal(late.geometries.length,0);replaceWorldMap(world,'warrior-v4');placeAtArrival(world);await loadStreamedVillage(world,f.services);assert.equal(world.environment.ready,true);assert.equal(scene.getWaitingItemsCount(),0);await world.releaseEnvironment();
 results.push({status:'PASS',case:'real pending decoder completes after release request',request,cache:inspectMapDecodeCache(engine),limitation:'A controlled decoder completion is required. A permanently stalled geometry decoder remains an unbounded release dependency in the current code; unlike the high-texture waiter, it is not cancelled by dispose.'});
});

test('engine disposal during a real compressed decode prevents late cache publication and leaves no scene ownership',async t=>{
 const f=await fixture(t,'repeat-disposed-cache.test'),{world,scene,state,engine}=f;placeAtArrival(world);const gate={entered:deferred(),resume:deferred()};state.nextGate=gate;const load=loadStreamedVillage(world,f.services),outcome=load.then(value=>({value}),error=>({error:error.name}));await gate.entered.promise;const pool=mapDecodePools(engine);engine.dispose();gate.resume.resolve();await outcome;await tick();
 assert.equal(pool.disposed,true);assert.equal(pool.geometry.bytes,0);assert.equal(pool.textures.bytes,0);assert.equal(inspectMapDecodeCache(engine),null);assert.equal(world.villagePrepared,null);assert.equal(world.villageStreaming,null);assert.equal(state.pendingDecodes,0);assert.equal(scene.onAfterRenderObservable.observers.length,0);
 results.push({status:'PASS',case:'engine disposal during actual EXT decoder promise',cacheBytes:pool.geometry.bytes+pool.textures.bytes,lateWorldOwnership:false});
});

test.after(()=>{const path=new URL('../reports/cave-repeat-review-2026-11-02/',import.meta.url);mkdirSync(path,{recursive:true});writeFileSync(new URL('map-compressed-lifecycle.json',path),JSON.stringify({baseRevision:'4c5de0c',expectedCases:3,completedCases:results.length,passed:results.length===3,runtimeSourceHashes:Object.fromEntries(['world.js','village-streamed-environment.js','map-container.js','map-decode-cache.js','map-terrain-cache.js'].map(name=>[name,digest(readFileSync(new URL('../src/'+name,import.meta.url)))])),cases:results,browserAutomation:false,sourceChangedByThisTask:false},null,2)+'\n');});
