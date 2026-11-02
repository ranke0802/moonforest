import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,StandardMaterial,MeshBuilder,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {KhronosTextureContainer2} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {readMapManifest} from '../src/map-manifests.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';
import {prepareVillageStart,loadStreamedVillage} from '../src/village-streamed-environment.js';
import {applyVillageGround} from '../src/village-ground.js';
import {prepareMapResources} from '../src/startup-resources.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {releaseMapTexture,installMapTextureLifetimeGuard,isAbandonedMapTexture} from '../src/map-texture-lifetime.js';

const base=new URL('../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base))),results=[];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function clock(){let time=0,id=0;const pending=new Map();return {now:()=>time,setTimeout:(fn,ms)=>{pending.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>pending.delete(key),advance(ms){time+=ms;for(const [key,timer]of [...pending])if(timer.at<=time){pending.delete(key);timer.fn();}},get size(){return pending.size;}};}
function locationFor(t,host){const saved=globalThis.location;globalThis.location={href:`https://${host}/game/`};t.after(()=>globalThis.location=saved);}
function groundWorld(t,host){locationFor(t,host);const engine=new NullEngine(),scene=new Scene(engine),ground=MeshBuilder.CreateGround('ground',{},scene),floorMaterial=new StandardMaterial('floor',scene);ground.material=floorMaterial;const world={scene,ground,floorMaterial,terrain:{size:160},placements:[],environmentManifest:'witch-cave',groundManifest:'witch-cave-ground',mapId:'witch-cave',lighting:{}};t.after(()=>engine.dispose());return world;}
function textures({auto=false}={}){const created=[],entered=deferred();return {created,entered,factory(scene,callbacks){const texture=new Texture(null,scene),dispose=texture.dispose.bind(texture),item={texture,callbacks,disposes:0};created.push(item);texture.dispose=()=>{item.disposes++;dispose();};texture.updateURL=url=>{texture.url=url;const internal=new InternalTexture(scene.getEngine(),1);texture._texture=internal;item.internal=internal;scene.addPendingData(internal);scene.getEngine().getLoadedTexturesCache().push(internal);entered.resolve(item);if(auto)queueMicrotask(()=>{internal.isReady=true;scene.removePendingData(internal);callbacks.onLoad();});};return texture;}};}
const hooks=scene=>({dispose:scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length,textures:scene.textures.length,pending:scene.getWaitingItemsCount()});

test('one shared immutable manifest entry has its own deadline, evicts only its failed promise and ignores late fetch/parse',async t=>{
 const timers=clock(),first=deferred(),url='https://entry-deadline.test/village.json';let calls=0,signal;
 t.mock.method(globalThis,'fetch',async(u,options)=>{calls++;signal=options.signal;return calls===1?first.promise:new Response('{"revision":"new"}');});
 const a=readMapManifest(url,{timers}),b=readMapManifest(url,{timers});assert.equal(a,b);const old=a.catch(error=>error);await tick();timers.advance(45000);const error=await old;assert.equal(error.name,'TimeoutError');assert.equal(error.code,'MAP_SETUP_TIMEOUT');assert.equal(error.stage,'manifest');assert.equal(signal.aborted,true);const newer=await readMapManifest(url,{timers});assert.equal(newer.revision,'new');first.resolve(new Response('{"revision":"old"}'));await tick();assert.equal(await readMapManifest(url),newer);assert.equal(calls,2);assert.equal(timers.size,0);
 const parsing=deferred(),parseUrl='https://entry-deadline.test/parse.json';t.mock.method(globalThis,'fetch',async()=>({ok:true,json:()=>parsing.promise}));const pending=readMapManifest(parseUrl,{timers}).catch(error=>error);await Promise.resolve();await Promise.resolve();timers.advance(45000);assert.equal((await pending).name,'TimeoutError');parsing.resolve({revision:'abandoned'});await tick();assert.equal(timers.size,0);
 results.push({case:'shared-manifest-entry-fetch-and-parse-deadline',passed:true,lateCacheReplacement:false});
});

test('cancelling one manifest caller does not cancel the immutable entry or another caller',async t=>{
 const timers=clock(),response=deferred(),controller=new AbortController();let signal;t.mock.method(globalThis,'fetch',async(u,options)=>{signal=options.signal;return response.promise;});
 const shared=readMapManifest('https://shared-caller.test/data.json',{timers}),lifetime=new MapLoadLifetime({signal:controller.signal,timers}),one=lifetime.wait(shared).catch(error=>error);await tick();controller.abort();assert.equal((await one).name,'AbortError');assert.equal(signal.aborted,false);response.resolve(new Response('{"ok":true}'));assert.equal((await shared).ok,true);lifetime.close();assert.equal(timers.size,0);
 results.push({case:'shared-manifest-independent-caller-cancel',passed:true,otherCallerCancelled:false});
});

test('a late village manifest cannot create roots or replace the prepared plan of a newer map',async t=>{
 locationFor(t,'late-plan-owner.test');const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const timers=clock(),response=deferred();t.mock.method(globalThis,'fetch',async url=>new URL(url).pathname.endsWith('/witch-cave.json')?response.promise:new Response(JSON.stringify(read('monster-forest.json'))));
 const old=prepareVillageStart(world,{timers}).catch(error=>error);await Promise.resolve();replaceWorldMap(world,'warrior-v4');const newer=await prepareVillageStart(world,{timers}),count=world.scene.transformNodes.length;response.resolve(new Response(JSON.stringify(read('witch-cave.json'))));assert.equal((await old).name,'AbortError');assert.equal(world.villagePrepared,newer);assert.equal(world.scene.transformNodes.length,count);assert.equal(timers.size,0);
 results.push({case:'late-plan-different-map-owner',passed:true,lateRoots:0});
});

test('failed decoder configuration promises reset once for explicit retry and do not start workers',async t=>{
 locationFor(t,'decoder-config-retry.test');const timers=clock(),counts=new Map();t.mock.method(globalThis,'fetch',async url=>{const name=new URL(url).pathname.split('/').at(-1),count=(counts.get(name)??0)+1;counts.set(name,count);return count===1?new Response('',{status:503}):new Response(JSON.stringify(read(name)));});
 const ktx=await import('../src/village-ktx2.js?configuration-retry'),meshopt=await import('../src/village-meshopt.js?configuration-retry');
 for(const initialize of [ktx.initializeVillageKtx2,meshopt.initializeVillageMeshopt]){await assert.rejects(initialize({timers}),/503/);const a=initialize({timers}),b=initialize({timers});assert.equal(a,b);await a;}
 assert.equal(counts.get('ktx2-decoder.json'),2);assert.equal(counts.get('meshopt-decoder.json'),2);assert.equal(timers.size,0);
 results.push({case:'decoder-config-failure-explicit-retry',passed:true,automaticRetries:0});
});

test('a permanently pending ground texture times out, frees its token and cannot bind into a retried map floor',async t=>{
 const world=groundWorld(t,'ground-decode-timeout.test'),timers=clock();t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(read('witch-cave-ground.json'))));const old=textures(),token={owner:'other'};world.scene.addPendingData(token);const before=hooks(world.scene),failure=applyVillageGround(world,{timers,createTexture:old.factory}).catch(error=>error);await old.entered.promise;timers.advance(45000);const error=await failure;await tick();assert.equal(error.name,'TimeoutError');assert.equal(error.stage,'ground');assert.equal(old.created[0].disposes,1);assert.equal(old.created[0].internal._references,0);assert.equal(world.releaseGround,null);assert.deepEqual(hooks(world.scene),before);
 world.floorMaterial=new StandardMaterial('newer-floor',world.scene);world.ground=new Object();world.terrain={size:160};world.mapId='replacement';const newer=textures({auto:true});await applyVillageGround(world,{timers,createTexture:newer.factory});const material=world.floorMaterial,binding=material.diffuseTexture,release=world.releaseGround;old.created[0].callbacks.onLoad();old.created[0].callbacks.onError();await tick();assert.equal(world.floorMaterial,material);assert.equal(material.diffuseTexture,binding);assert.equal(world.releaseGround,release);assert.equal(world.scene.getWaitingItemsCount(),1);assert.equal(timers.size,0);release();for(const entry of newer.created)assert.equal(entry.disposes,1);world.scene.removePendingData(token);
 results.push({case:'ground-no-response-timeout-and-late-binding-isolation',passed:true,lateFloorBindings:0});
});

test('ground cancellation after color but before detail frees both textures without changing the floor',async t=>{
 const world=groundWorld(t,'ground-detail-cancel.test'),timers=clock(),controller=new AbortController(),sample=textures(),second=deferred(),initial=world.floorMaterial.diffuseTexture;t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(read('witch-cave-ground.json'))));
 const factory=(scene,callbacks)=>{const result=sample.factory(scene,callbacks);if(sample.created.length===1)queueMicrotask(()=>callbacks.onLoad());else second.resolve();return result;};
 const pending=applyVillageGround(world,{timers,signal:controller.signal,createTexture:factory}).catch(error=>error);await second.promise;controller.abort();assert.equal((await pending).name,'AbortError');assert.equal(world.floorMaterial.diffuseTexture,initial);assert.equal(world.scene.getWaitingItemsCount(),0);for(const entry of sample.created)assert.equal(entry.disposes,1);assert.equal(timers.size,0);
 results.push({case:'partial-ground-caller-cancel',passed:true,ownedTexturesFreed:2});
});

test('three explicit ground retries on the same floor reuse its real material plugins and remain ready',async t=>{
 locationFor(t,'same-floor-ground-retry.test');const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(read('witch-cave-ground.json'))));const timers=clock(),floor=world.floorMaterial,ground=world.ground;let activeCount,detailPlugin,shadePlugin,previous;
 for(let repeat=0;repeat<3;repeat++){
  const sample=textures({auto:true});await applyVillageGround(world,{timers,createTexture:sample.factory});for(const texture of world.scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  const manager=floor.pluginManager,detail=manager.getPlugin('MoonforestGroundDetail'),shade=manager.getPlugin('MoonforestVillageToon');
  if(repeat){assert.equal(detail,detailPlugin);assert.equal(shade,shadePlugin);assert.equal(manager._activePlugins.length,activeCount);for(const entry of previous.created){assert.equal(entry.disposes,1);assert.equal(entry.internal._references,0);assert.notEqual(detail.texture,entry.texture);}}else{detailPlugin=detail;shadePlugin=shade;activeCount=manager._activePlugins.length;}
  assert.equal(manager._activePlugins.filter(p=>p.name==='MoonforestGroundDetail').length,1);assert.equal(manager._activePlugins.filter(p=>p.name==='MoonforestVillageToon').length,1);assert.equal(detail.texture,sample.created[1].texture);assert.equal(shade.lighting,world.lighting);assert.equal(detail.isReadyForSubMesh(),true);
  await floor.forceCompilationAsync(ground,{useInstances:true});assert.equal(floor.isReadyForSubMesh(ground,ground.subMeshes[0],true),true);assert.equal(world.floorMaterial,floor);assert.equal(world.ground,ground);previous=sample;
 }
 world.releaseGround();assert.equal(timers.size,0);results.push({case:'same-floor-three-manual-retries-material-readiness',passed:true,retries:3,detailPlugins:1,shadePlugins:1,oldDisposedTextureUsed:false,actualNullEngineMaterialReady:true});
});

test('decoder initialization has the same bounded setup group and release is available before it responds',async t=>{
 locationFor(t,'initialization-owner.test');const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const timers=clock(),entered=deferred(),never=deferred();t.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(read(new URL(url).pathname.split('/').at(-1)))));
 const pending=loadStreamedVillage(world,{modelTimers:timers,initialize:()=>{entered.resolve();return never.promise;},ground:async()=>{throw new Error('must not reach ground');}}).catch(error=>error);await entered.promise;timers.advance(45000);const error=await pending;assert.equal(error.name,'TimeoutError');assert.equal(error.stage,'decoder-init');assert.equal(world.villagePrepared,null);assert.equal(world.releaseEnvironment,null);assert.equal(timers.size,0);
 const next=deferred(),again=loadStreamedVillage(world,{modelTimers:timers,initialize:()=>{next.resolve();return never.promise;},ground:async()=>{}}).catch(error=>error);await next.promise;await world.releaseEnvironment();assert.equal((await again).name,'AbortError');assert.equal(world.villageLoadOwner,null);assert.equal(timers.size,0);never.resolve();await tick();assert.equal(world.villagePrepared,null);
 results.push({case:'setup-group-init-timeout-and-immediate-release',passed:true});
});

test('resource manifest timeout cannot later republish a plan, and healthy cached transfers have no 45s total cap',async t=>{
 locationFor(t,'resource-setup-timeout.test');const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const timers=clock(),response=deferred();let first=true;
 t.mock.method(globalThis,'fetch',async url=>{const name=new URL(url).pathname.split('/').at(-1);if(first&&name==='witch-cave.json'){first=false;return response.promise;}return new Response(JSON.stringify(read(name)));});
 const saved=globalThis.caches,cacheGate=deferred(),cacheEntered=deferred();let block=true;globalThis.caches={open:async()=>({match:async()=>{if(block){block=false;cacheEntered.resolve();await cacheGate.promise;}return new Response('cached');}})};t.after(()=>globalThis.caches=saved);
 const failed=prepareMapResources(world,new URL('https://resource-setup-timeout.test/assets/'),()=>{},()=>{},{timers}).catch(error=>error);await tick();timers.advance(45000);assert.equal((await failed).name,'TimeoutError');assert.equal(world.villagePrepared??null,null);
 const progress=[],retry=prepareMapResources(world,new URL('https://resource-setup-timeout.test/assets/'),s=>progress.push(s),()=>{},{timers});await cacheEntered.promise;timers.advance(90000);let done=false;retry.then(()=>done=true);await tick();assert.equal(done,false,'healthy content/cache work is not given the manifest total deadline');cacheGate.resolve();await retry;const prepared=world.villagePrepared,downloads=world.resourceDownloadStats,files=world.startupResources.files;response.resolve(new Response(JSON.stringify(read('witch-cave.json'))));await tick();assert.equal(world.villagePrepared,prepared);assert.equal(world.resourceDownloadStats,downloads);assert.equal(world.startupResources.files,files);assert.equal(progress.at(-1).complete,true);assert.equal(timers.size,0);world.releaseResourceDownloads();
 results.push({case:'resource-manifest-timeout-retry-and-progressing-download-policy',passed:true,latePreparedPlan:false,healthyTransferTotalCap:false});
});

test('old cancelled resource cache callbacks cannot replace newer prefetch, statistics or progress',async t=>{
 locationFor(t,'resource-transfer-owner.test');const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());const timers=clock(),gate=deferred(),entered=deferred(),saved=globalThis.caches;let block=true;globalThis.caches={open:async()=>({match:async()=>{if(block){block=false;entered.resolve();await gate.promise;}return new Response('cached');}})};t.after(()=>globalThis.caches=saved);t.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(read(new URL(url).pathname.split('/').at(-1)))));
 let oldProgress=0;const failed=prepareMapResources(world,new URL('https://resource-transfer-owner.test/assets/'),()=>oldProgress++,()=>{},{timers}).catch(error=>error);await entered.promise;world.releaseResourceDownloads();assert.equal((await failed).name,'AbortError');await prepareMapResources(world,new URL('https://resource-transfer-owner.test/assets/'),()=>{},()=>{},{timers});const current={prefetch:world.prefetchResources,release:world.releaseResourceDownloads,stats:world.resourceDownloadStats,resources:world.startupResources,progress:oldProgress};gate.resolve();await tick();await tick();assert.equal(world.prefetchResources,current.prefetch);assert.equal(world.releaseResourceDownloads,current.release);assert.equal(world.resourceDownloadStats,current.stats);assert.equal(world.startupResources,current.resources);assert.equal(oldProgress,current.progress);assert.equal(timers.size,0);world.releaseResourceDownloads();
 results.push({case:'cancelled-download-callback-owner-isolation',passed:true,lateProgressUpdates:0});
});

test('real SDK KTX upload boundary rejects abandoned final-owner textures and preserves normal/shared uploads',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>engine.dispose());installMapTextureLifetimeGuard(KhronosTextureContainer2);const first=KhronosTextureContainer2.prototype._createTexture;installMapTextureLifetimeGuard(KhronosTextureContainer2);assert.equal(KhronosTextureContainer2.prototype._createTexture,first);
 const decoded={transcodedFormat:0x9278,isInGammaSpace:false,mipmaps:[{width:4,height:4,data:new Uint8Array(16)}]},ktx=Object.create(KhronosTextureContainer2.prototype);ktx._engine=engine;let uploads=0,binds=0;t.mock.method(engine,'_bindTextureDirectly',()=>binds++);t.mock.method(engine,'_uploadCompressedDataToTextureDirectly',()=>uploads++);
 const wrapper=(internal=new InternalTexture(engine,1))=>{const texture=new Texture(null,scene);texture._texture=internal;if(!engine.getLoadedTexturesCache().includes(internal))engine.getLoadedTexturesCache().push(internal);return texture;},old=wrapper(),internal=old.getInternalTexture(),wait=deferred();scene.addPendingData(internal);ktx._decodeAsync=()=>wait.promise;const pending=ktx._uploadAsync(new Uint8Array(),internal).catch(error=>error);releaseMapTexture(old,scene);assert.equal(internal._references,0);assert.equal(isAbandonedMapTexture(internal),true);assert.equal(engine.getLoadedTexturesCache().includes(internal),false);assert.equal(scene.getWaitingItemsCount(),0);wait.resolve(decoded);assert.equal((await pending).name,'AbortError');assert.equal(uploads,0);assert.equal(binds,0);assert.equal(internal.isReady,false);
 const live=wrapper();ktx._decodeAsync=async()=>decoded;await ktx._uploadAsync(new Uint8Array(),live.getInternalTexture());assert.equal(uploads,1);assert.equal(binds,2);assert.equal(live.isReady(),true);releaseMapTexture(live,scene);
 const shared=wrapper(),sharedInternal=shared.getInternalTexture(),other=wrapper(sharedInternal);sharedInternal.incrementReferences();scene.addPendingData(sharedInternal);releaseMapTexture(shared,scene);assert.equal(sharedInternal._references,1);assert.equal(isAbandonedMapTexture(sharedInternal),false);assert.equal(scene.getWaitingItemsCount(),1);assert.equal(engine.getLoadedTexturesCache().includes(sharedInternal),true);await ktx._uploadAsync(new Uint8Array(),sharedInternal);assert.equal(uploads,2);assert.equal(other.isReady(),true);releaseMapTexture(other,scene);assert.equal(scene.getWaitingItemsCount(),0);
 const a=wrapper(),own=a.getInternalTexture(),b=wrapper(own),foreign=wrapper(own);own.incrementReferences();own.incrementReferences();scene.addPendingData(own);releaseMapTexture(a,scene);releaseMapTexture(b,scene);assert.equal(own._references,1);assert.equal(isAbandonedMapTexture(own),false);assert.equal(scene.getWaitingItemsCount(),1);releaseMapTexture(foreign,scene);assert.equal(isAbandonedMapTexture(own),true);assert.equal(scene.getWaitingItemsCount(),0);
 results.push({case:'real-sdk-late-ktx-create-boundary-owned-vs-shared',passed:true,abandonedUploadCalls:0,normalUploadCalls:1,sharedUploadCalls:1,simulatedGPU:true});
});

test.after(()=>{const path=new URL('../reports/cave-decoder-timeout-2026-11-02/',import.meta.url);mkdirSync(path,{recursive:true});writeFileSync(new URL('setup-validation.json',path),JSON.stringify({expectedCases:11,completedCases:results.length,passed:results.length===11,cases:results,limitations:['NullEngine and controlled decoder/Texture callback boundaries; no real browser, GPU, worker scheduling or phone temperature measurement.','45s applies to manifest/setup/ground/model response boundaries. Healthy byte transfers keep the existing progress-driven download path without a total 45s cutoff.','Abandoned GPU upload is blocked at the actual SDK _createTexture call for exactly marked final-owner InternalTextures; the physical worker or one synchronous WASM call is not terminated.'],browserAutomation:false},null,2)+'\n');});
