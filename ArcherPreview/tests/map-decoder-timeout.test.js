import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,PBRMaterial,MeshBuilder} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import '@babylonjs/loaders/glTF/index.js';
import {MapLoadLifetime,MAP_MODEL_TIMEOUT_MS} from '../src/map-load-lifetime.js';
import {readMapContainer,loadMapContainer} from '../src/map-container.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {createWorld} from '../src/world.js';
import {CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';
import {inspectMapDecodeCache} from '../src/map-decode-cache.js';

const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base))),asset=manifest.assets[CAVE_LABORATORY_GEOMETRY.assetId],results=[];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function clock(){let time=0,id=0;const pending=new Map();return {now:()=>time,setTimeout:(fn,ms)=>{pending.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>pending.delete(key),advance(ms){time+=ms;for(const [key,timer]of [...pending])if(timer.at<=time){pending.delete(key);timer.fn();}},get size(){return pending.size;}};}
function source(){
 const url=new URL(asset.lods.find(l=>l.level===2).model,base),json=JSON.parse(readFileSync(url));
 assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));assert.equal(json.images?.length??0,0);
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,url)).toString('base64');
 return {json,fileName:url.pathname.split('/').at(-1)};
}
function owned(scene){return {meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length,textures:scene.textures.length,pending:scene.getWaitingItemsCount(),dispose:scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length,context:scene.getEngine().onContextRestoredObservable.observers.filter(o=>!o._willBeUnregistered).length};}
function readyRaw(scene){for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;}
async function decodeFixture(t,{world=false}={}){
 const old=MeshoptCompression._Default,engine=new NullEngine(),value=world?createWorld(engine,{cave:true,touchDevice:true}):null,scene=value?.scene??new Scene(engine),state={calls:0,active:0,gate:null};await MeshoptDecoder.ready;
 // Real shipped EXT bytes and real WASM, with only the worker-response boundary
 // held. The physical single-worker scheduling policy is not simulated here.
 MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{state.calls++;state.active++;try{if(state.calls===state.failCall)throw new Error('controlled decoder rejection');if(state.gate){const gate=state.gate;state.gate=null;gate.entered.resolve();await gate.resume.promise;}const decoded=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(decoded,count,stride,data,mode,filter);return decoded;}finally{state.active--;}}};
 t.after(()=>{engine.dispose();MeshoptCompression._Default=old;});return {engine,scene,world:value,state};
}

test('one model shares its 45s deadline across stages, cancels immediately and consumes late rejection without retry',async()=>{
 const timers=clock(),lifetime=new MapLoadLifetime({timers});assert.equal(lifetime.timeoutMs,MAP_MODEL_TIMEOUT_MS);const first=deferred();let starts=0;
 const task=lifetime.run(async()=>{starts++;await lifetime.wait(first.promise);return lifetime.wait(new Promise(()=>{}));}),outcome=task.catch(error=>error);
 timers.advance(30000);first.resolve();await Promise.resolve();await Promise.resolve();timers.advance(15000);const error=await outcome;
 assert.equal(error.name,'TimeoutError');assert.equal(error.code,'MAP_MODEL_TIMEOUT');assert.equal(error.timeoutMs,45000);assert.equal(starts,1);assert.equal(lifetime.signal.aborted,true);lifetime.close();assert.equal(timers.size,0);
 const controller=new AbortController(),cancelled=new MapLoadLifetime({signal:controller.signal,timers}),late=deferred(),wait=cancelled.wait(late.promise).catch(error=>error);controller.abort();assert.equal((await wait).name,'AbortError');late.reject(new Error('old worker rejection'));await tick();cancelled.close();assert.equal(timers.size,0);
 const abandoned=new MapLoadLifetime({timers}),lateValue=deferred(),failure=abandoned.wait(lateValue.promise,{onLate:()=>{throw new Error('cleanup failed');}}).catch(error=>error);timers.advance(45000);const retainedError=await failure;lateValue.resolve({});await tick();assert.equal(retainedError.name,'TimeoutError');assert.equal(abandoned.cleanupFailures,1);assert.equal(retainedError.lastCleanupError,'cleanup failed');abandoned.close();
 results.push({case:'shared-deadline-and-logical-cancel',passed:true,timeoutMs:45000,automaticRetries:0});
});

test('permanent real Meshopt response timeout releases only its partial import and allows explicit same-scene retry',async t=>{
 const f=await decodeFixture(t),{scene,state}=f,{json,fileName}=source(),timers=clock(),gate={entered:deferred(),resume:deferred()};state.gate=gate;
 const retained=MeshBuilder.CreateBox('unrelated-player',{},scene),pending={owner:'unrelated'};scene.addPendingData(pending);const initial=owned(scene),containers=[];
 const original=GLTFFileLoader.prototype._getLoader;t.mock.method(GLTFFileLoader.prototype,'_getLoader',function(...args){const implementation=original.apply(this,args),start=implementation.importMeshAsync;implementation.importMeshAsync=function(names,target,container,...rest){containers.push({container,disposes:0});const tracked=containers.at(-1),dispose=container.dispose.bind(container);container.dispose=()=>{tracked.disposes++;dispose();};return start.call(this,names,target,container,...rest);};return implementation;});
 const load=readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,timeoutMs:45000,timers}),outcome=load.catch(error=>error);await gate.entered.promise;assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));
 timers.advance(45000);const error=await outcome;await tick();assert.equal(error.name,'TimeoutError');assert.equal(error.code,'MAP_MODEL_TIMEOUT');assert.equal(error.timeoutMs,45000);assert.equal(timers.size,0);assert.equal(state.active,1);assert.equal(containers.length,1);assert.equal(containers[0].disposes,1);assert.equal(retained.isDisposed(),false);assert.deepEqual(owned(scene),initial);assert.equal(scene._pendingData.includes(pending),true);
 // No automatic retry occurred while the old response remains unanswered.
 const decodedCalls=state.calls;await tick();assert.equal(state.calls,decodedCalls);
 const retry=await readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,timeoutMs:45000,timers});assert.ok(retry.meshes.some(m=>m.getTotalVertices()>0));readyRaw(scene);const newer=owned(scene),mesh=retry.meshes.find(m=>m.getTotalVertices()>0),vertices=mesh.getVerticesData('position').slice(),geometry=mesh.geometry;let vertexCreations=0;const create=f.engine.createVertexBuffer.bind(f.engine);t.mock.method(f.engine,'createVertexBuffer',(...args)=>{vertexCreations++;return create(...args);});
 gate.resume.resolve();await tick();await tick();assert.equal(state.active,0);assert.equal(containers[0].disposes,1);assert.equal(vertexCreations,0,'late old decode must not build a new Babylon vertex buffer');assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.getVerticesData('position'),vertices);assert.deepEqual(owned(scene),newer);assert.equal(scene._pendingData.includes(pending),true);assert.equal(retained.isDisposed(),false);retry.dispose();scene.removePendingData(pending);assert.equal(scene.getWaitingItemsCount(),0);assert.ok(inspectMapDecodeCache(f.engine).geometry.bytes<=8*1048576);
 results.push({case:'actual-compressed-timeout-late-success-explicit-retry',passed:true,partialContainerDisposes:containers[0].disposes,lateVertexCreations:vertexCreations,unrelatedPendingPreserved:true});
});

test('late real decoder rejection after owner cancellation cannot poison a new foreground import',async t=>{
 const {scene,state}=await decodeFixture(t),{json,fileName}=source(),controller=new AbortController(),timers=clock(),gate={entered:deferred(),resume:deferred()};state.gate=gate;
 const outcome=readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,signal:controller.signal,timers}).catch(error=>error);await gate.entered.promise;controller.abort();assert.equal((await outcome).name,'AbortError');await tick();const retry=await readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,timers});const initial=owned(scene),geometry=retry.meshes.find(m=>m.geometry)?.geometry;gate.resume.reject(new Error('decoder failed after cancellation'));await tick();await tick();assert.deepEqual(owned(scene),initial);assert.equal(retry.meshes.find(m=>m.geometry)?.geometry,geometry);assert.equal(state.active,0);assert.equal(timers.size,0);retry.dispose();
 results.push({case:'actual-compressed-cancel-late-rejection-new-import',passed:true,lateWorldPublication:false});
});

test('one failed compressed view abandons sibling decoder work and late sibling success cannot allocate vertices',async t=>{
 const {engine,scene,state}=await decodeFixture(t),{json,fileName}=source(),timers=clock(),gate={entered:deferred(),resume:deferred()};state.gate=gate;state.failCall=2;
 const outcome=readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,timers}).catch(error=>error);await gate.entered.promise;const error=await outcome;assert.match(error.message,/controlled decoder rejection/);assert.equal(state.active,1);assert.equal(timers.size,0);await tick();const initial=owned(scene);let vertexCreations=0;const create=engine.createVertexBuffer.bind(engine);t.mock.method(engine,'createVertexBuffer',(...args)=>{vertexCreations++;return create(...args);});gate.resume.resolve();await tick();await tick();assert.equal(state.active,0);assert.equal(vertexCreations,0);assert.deepEqual(owned(scene),initial);
 results.push({case:'ordinary-decode-error-cancels-late-sibling',passed:true,lateVertexCreations:0});
});

test('scene disposal settles a permanently pending real decode without waiting for its physical completion',async t=>{
 const {scene,state}=await decodeFixture(t),{json,fileName}=source(),timers=clock(),gate={entered:deferred(),resume:deferred()};state.gate=gate;
 const outcome=readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName,timers}).catch(error=>error);await gate.entered.promise;scene.dispose();assert.equal((await outcome).name,'AbortError');assert.equal(timers.size,0);assert.equal(scene.getWaitingItemsCount(),0);assert.equal(state.active,1);gate.resume.resolve();await tick();await tick();assert.equal(state.active,0);assert.equal(scene.meshes.length,0);assert.equal(scene.getWaitingItemsCount(),0);
 results.push({case:'actual-compressed-scene-dispose-before-decoder-response',passed:true,logicalJobSettledBeforePhysicalResponse:true});
});

test('a partial textured import timeout removes only its owned pending texture and ignores late image callbacks',async t=>{
 const {engine,scene}=await decodeFixture(t),timers=clock(),sourceAsset=Object.values(manifest.assets).find(a=>a.lods?.some(l=>l.level===2)&&a.lods.find(l=>l.level===2).textureSize>0),url=new URL(sourceAsset.lods.find(l=>l.level===2).model,base),json=JSON.parse(readFileSync(url)),entered=deferred(),textures=[];
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,url)).toString('base64');
 for(const image of json.images??[])if(image.uri)image.uri='data:image/ktx2;base64,'+readFileSync(new URL(image.uri,url)).toString('base64');
 const warm=new PBRMaterial('warm-shared-brdf',scene);warm.dispose();readyRaw(scene);
 const token={owner:'other-loader'};scene.addPendingData(token);const initial=owned(scene);
 // Keep the actual glTF/Meshopt/material setup. NullEngine has no image upload,
 // so hold only its Texture->InternalTexture callback boundary explicitly.
 t.mock.method(engine,'createTexture',(url,noMipmap,invertY,target,samplingMode,onLoad,onError)=>{const internal=new InternalTexture(engine,1);target.addPendingData(internal);textures.push({internal,onLoad,onError});entered.resolve();return internal;});
 const outcome=readMapContainer(scene,json,'',{fileName:url.pathname.split('/').at(-1),timers}).catch(error=>error);await entered.promise;assert.ok(scene.getWaitingItemsCount()>1);timers.advance(45000);const error=await outcome;await tick();assert.equal(error.name,'TimeoutError');if(scene.getWaitingItemsCount()!==1)t.diagnostic(JSON.stringify({pending:scene._pendingData.map(v=>({same:v===token,refs:v._references,label:v.label})),textures:textures.map(v=>({refs:v.internal._references,label:v.internal.label})),wrappers:scene.textures.map(v=>({name:v.name,refs:v.getInternalTexture()?._references})),cleanupFailures:error.cleanupFailures,lastCleanupError:error.lastCleanupError}));assert.equal(scene.getWaitingItemsCount(),1);assert.equal(scene._pendingData.includes(token),true);for(const t of textures)assert.equal(t.internal._references,0);assert.deepEqual(owned(scene),initial);
 for(const t of textures){t.onLoad?.();t.onError?.('late upload failure',new Error('old image'));}await tick();assert.deepEqual(owned(scene),initial);assert.equal(timers.size,0);scene.removePendingData(token);
 results.push({case:'actual-compressed-partial-materials-texture-pending-boundary',passed:true,ownedPendingRemoved:true,unrelatedPendingPreserved:true,imageDecodeUpload:'controlled callback boundary, not GPU execution'});
});

test('the native environment timeout is recoverable only by explicit load and keeps the new owner isolated from the old decode',async t=>{
 const {world,scene,state}=await decodeFixture(t,{world:true}),savedLocation=globalThis.location;globalThis.location={href:'https://model-timeout.test/game/?character=warrior-v5'};t.after(()=>globalThis.location=savedLocation);
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 world.placements=world.placements.filter(p=>p.asset===CAVE_LABORATORY_GEOMETRY.assetId);assert.equal(world.placements.length,1);const timers=clock(),gate={entered:deferred(),resume:deferred()};state.gate=gate;
 const services={initialize:async()=>{},ground:async()=>{},modelTimers:timers,modelTimeoutMs:45000,loadContainer:async(model,scene,options)=>{const {json,fileName}=source(),container=await readMapContainer(scene,json,'',{skipMaterials:true,fileName,...options}),material=new PBRMaterial('timeout-native-fixture',scene);material.transparencyMode=0;container.materials.push(material);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;readyRaw(scene);return container;}};
 const camera=world.camera,load=loadStreamedVillage(world,services),outcome=load.catch(error=>error);await gate.entered.promise;timers.advance(45000);const error=await outcome;await tick();assert.equal(error.name,'TimeoutError');assert.equal(error.assetId,CAVE_LABORATORY_GEOMETRY.assetId);assert.equal(error.level,2);assert.equal(world.environment.modelFailure.code,'MAP_MODEL_TIMEOUT');assert.equal(world.villagePrepared,null);assert.equal(world.villageLoadOwner,null);assert.equal(world.villageStreaming,null);assert.equal(world.environment.ready,false);assert.equal(scene.getWaitingItemsCount(),0);assert.equal(timers.size,0);const requests=state.calls;await tick();assert.equal(state.calls,requests);
 await loadStreamedVillage(world,services);await tick();const newer={owner:world.villageLoadOwner,prepared:world.villagePrepared,records:world.villageRenderRecords,release:world.releaseEnvironment,inventory:owned(scene)};assert.equal(world.environment.ready,true);assert.equal(world.camera,camera);gate.resume.resolve();await tick();await tick();assert.equal(world.villageLoadOwner,newer.owner);assert.equal(world.villagePrepared,newer.prepared);assert.equal(world.villageRenderRecords,newer.records);assert.equal(world.releaseEnvironment,newer.release);assert.deepEqual(owned(scene),newer.inventory);assert.equal(world.environment.ready,true);await world.releaseEnvironment();assert.equal(timers.size,0);assert.equal(scene.getWaitingItemsCount(),0);
 results.push({case:'native-essential-structure-timeout-explicit-same-world-retry',passed:true,sceneAndCameraPreserved:true,automaticRetries:0,lateOwnershipChanges:0});
});

test('model download and response parsing use the same deadline and never start an import after timeout',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),timers=clock(),response=deferred();t.after(()=>engine.dispose());let calls=0,requestSignal;
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;requestSignal=options.signal;return response.promise;});
 const outcome=loadMapContainer(new URL('https://download-timeout.test/model.gltf'),scene,{timeoutMs:45000,timers}).catch(error=>error);await Promise.resolve();timers.advance(45000);assert.equal((await outcome).name,'TimeoutError');assert.equal(requestSignal.aborted,true);assert.equal(calls,1);const initial=owned(scene);response.resolve(new Response(JSON.stringify({asset:{version:'2.0'}})));await tick();assert.deepEqual(owned(scene),initial);assert.equal(timers.size,0);
 results.push({case:'fetch-deadline-late-response',passed:true,importsAfterTimeout:0});
});

test.after(()=>{const path=new URL('../reports/cave-decoder-timeout-2026-11-02/',import.meta.url);mkdirSync(path,{recursive:true});writeFileSync(new URL('core-validation.json',path),JSON.stringify({expectedCases:8,completedCases:results.length,passed:results.length===8,timeoutMs:MAP_MODEL_TIMEOUT_MS,cases:results,sourceHashes:Object.fromEntries(['map-load-lifetime.js','map-container.js','village-streamed-environment.js','village-outlines.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')])),limitations:['NullEngine does not execute a real browser/GPU or worker scheduling. Actual shipped Meshopt EXT bytes and actual WASM decode are used behind a controlled response boundary.','Logical deadlines prevent unbounded map waits; they cannot interrupt one synchronous WASM/driver call, terminate Babylon global workers or guarantee that a permanently faulty worker recovers on manual retry.','An unanswered physical decoder may retain its detached CPU input/promise until it returns. No world, scene observer, pending token or geometry may be published by that abandoned owner.'],browserAutomation:false},null,2)+'\n');});
