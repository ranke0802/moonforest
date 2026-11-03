import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {FreeCamera,NullEngine,Scene,MeshBuilder,PBRMaterial,Texture,Vector3,HemisphericLight} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {KhronosTextureContainer2 as Ktx} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {AutoReleaseWorkerPool} from '@babylonjs/core/Misc/workerPool.js';
import {applyConfig,workerFunction,initializeWebWorker} from '@babylonjs/core/Misc/khronosTextureContainer2Worker.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {VillageTextureStreaming,highTextureOptions} from '../src/village-texture-streaming.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {prepareMapMaterials} from '../src/map-shader-cache.js';

const base=new URL('../public/assets/',import.meta.url),records=[],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('village.json',base))),id='house-03-workshop',config=manifest.assets[id];
class LocalCodecWorker {
 constructor(){
  this.listeners=new Map();const worker=this,context={console,WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView,TextDecoder,TextEncoder,URL,Blob,performance,setTimeout,clearTimeout,atob,btoa,location:{href:'https://promotion.test/worker.js'},postMessage:value=>queueMicrotask(()=>worker.emit('message',{data:value}))};
  context.self=context;context.globalThis=context;context.onmessage=null;
  context.fetch=async url=>new Response(readFileSync(new URL('content/'+new URL(url).pathname.split('/').at(-1),base)),{headers:{'Content-Type':'application/wasm'}});
  this.context=vm.createContext(context);context.importScripts=(...urls)=>{for(const url of urls)vm.runInContext(readFileSync(new URL('content/'+new URL(url).pathname.split('/').at(-1),base),'utf8'),this.context);};
  vm.runInContext(`${applyConfig}(${workerFunction})()`,this.context);
 }
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,event){for(const fn of this.listeners.get(type)??[])fn(event);}
 postMessage(value){queueMicrotask(()=>{try{this.context.onmessage({data:value});}catch(error){this.emit('error',error);}});}
 terminate(){this.listeners.clear();}
}
let decodedPromise;
async function actualDecoded(engine){
 return decodedPromise??= (async()=>{
  const decoder=JSON.parse(readFileSync(new URL('ktx2-decoder.json',base))),urls=Object.fromEntries(Object.entries(decoder.urls).map(([key,url])=>[key,new URL(url,'https://promotion.test/assets/').href]));
  const data=readFileSync(new URL(config.highTextures.textures.albedo.url,base)),pool=new AutoReleaseWorkerPool(1,async()=>initializeWebWorker(new LocalCodecWorker(),undefined,urls)),saved=Ktx._WorkerPoolPromise;
  Ktx._WorkerPoolPromise=Promise.resolve(pool);
  try{const ktx=Object.create(Ktx.prototype);ktx._engine=engine;const decoded=await ktx._decodeAsync(data);assert.equal(decoded.mipmaps[0].width,4096);assert.equal(decoded.mipmaps.length,13);assert.equal(decoded.errors,undefined);return {data,decoded};}
  finally{pool.dispose();Ktx._WorkerPoolPromise=saved;}
 })();
}
function texture(scene,width,hardware=false){
 const internal=new InternalTexture(scene.getEngine(),1);Object.assign(internal,{width,height:width,baseWidth:width,baseHeight:width,isReady:true,_gammaSpace:true,_useSRGBBuffer:hardware,generateMipMaps:true});
 return new Texture(null,scene,{internalTexture:internal,...highTextureOptions('albedo')});
}
async function fixture(t,hardware=false){
 const engine=new NullEngine({renderWidth:1664,renderHeight:768}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{etc2:true,astc:true,maxTextureSize:8192,instancedArrays:true});
 const camera=new FreeCamera('promotion-camera',new Vector3(0,3,-12),scene);camera.setTarget(new Vector3(0,2,0));new HemisphericLight('sky',Vector3.Up(),scene);
 const world={scene,camera,touchDevice:true,villageStreaming:{active:true}},lighting={direction:Vector3.Up(),shadowsActive:false};
 const decoded=await readRuntimeGltf(new URL(config.lods[0].model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');container.addAllToScene();for(const group of container.animationGroups)group.stop();
 const source=container.meshes.filter(mesh=>mesh.getTotalVertices()),material=new PBRMaterial('workshop-paint',scene),original=texture(scene,2048,hardware);material.albedoTexture=original;material.transparencyMode=0;
 for(const mesh of source){mesh.material=material;mesh.alwaysSelectAsActiveMesh=true;mesh.createInstance(mesh.name+'-actual-shared-instance').position.x=3;}
 prepareVillageInstancing(source);applyVillageToon(source,lighting);prepareTreeOcclusion(source);
 const unrelated=MeshBuilder.CreateBox('unrelated-material-source',{},scene);unrelated.material=new PBRMaterial('unrelated-paint',scene);unrelated.position.x=1000;
 const decoys=[unrelated,...Array.from({length:255},(_,index)=>{const mesh=unrelated.clone('unrelated-'+index,null,true);mesh.position.x=1000+index;return mesh;})];
 await prepareMapMaterials([...source,unrelated]);scene.render();
 const assets=new Map([[id,{config,baseLevel:0,source:{materials:[material]}}]]),stats={},stream=new VillageTextureStreaming(world,assets,[],base,stats);stream.wanted.set(id,1);stream.update=()=>{};
 const callbacks=[],uploads=[],events=[],create=engine.createTexture.bind(engine),ktx=Object.create(Ktx.prototype);ktx._engine=engine;
 engine._bindTextureDirectly=()=>{};engine._uploadCompressedDataToTextureDirectly=(internal,format,width,height,data,face,level)=>{uploads.push({width,height,bytes:data.byteLength,level,sha256:sha(data)});events.push('mip'+level);};
 engine.createTexture=(...args)=>{
  if(!String(args[0]).includes(config.highTextures.textures.albedo.url.split('/').at(-1)))return create(...args);
  const internal=new InternalTexture(engine,1);Object.assign(internal,{url:args[0],isReady:false,invertY:args[2],generateMipMaps:true,_useSRGBBuffer:hardware});engine.getLoadedTexturesCache().push(internal);scene.addPendingData(internal);
  callbacks.push({internal,lateLoad:()=>args[5]?.(),lateError:()=>args[6]?.('late-old-texture'),async complete(decoded){ktx._createTexture(decoded,internal);events.push('upload-ready');scene.removePendingData(internal);args[5]?.();internal.onLoadedObservable.notifyObservers(internal);events.push('texture-callback');}});return internal;
 };
 let markDirtyCalls=0,unrelatedReads=0;
 const dirty=material.markDirty;material.markDirty=function(...args){markDirtyCalls++;return dirty.apply(this,args);};
 for(const mesh of decoys)for(const sub of mesh.subMeshes){const get=sub.getMaterial;sub.getMaterial=function(...args){unrelatedReads++;return get.apply(this,args);};}
 const requests=[],unique=new Set(Object.values(engine._compiledEffects)),boundTextures=[],effect=engine.createEffect.bind(engine);
 for(const compiled of unique){const set=compiled.setTexture;compiled.setTexture=function(name,texture){if(name==='albedoSampler')boundTextures.push(texture);return set.call(this,name,texture);};}
 engine.createEffect=(...args)=>{const result=effect(...args);requests.push(result);unique.add(result);return result;};
 const inventory=()=>({meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length,textures:scene.textures.length});
 t.after(()=>{stream.dispose();loader.dispose();scene.dispose();engine.dispose();});
 return {engine,scene,source,material,original,stats,stream,callbacks,uploads,events,requests,unique,boundTextures,inventory,get markDirtyCalls(){return markDirtyCalls;},get unrelatedReads(){return unrelatedReads;}};
}

for(const hardware of [false,true])test(`actual4K profile promotes/restores real instanced geometry without redundant unfreeze; hardware sRGB=${hardware}`,async t=>{
 const f=await fixture(t,hardware),{data,decoded}=await actualDecoded(f.engine),baseline=f.inventory(),geometry=f.source.map(mesh=>mesh.geometry),roundtrips=[];
 for(let cycle=0;cycle<3;cycle++){
  const before={dirty:f.markDirtyCalls,reads:f.unrelatedReads,effects:f.unique.size,uploads:f.uploads.length,requests:f.requests.length};
  const pending=f.stream.start(id);assert.equal(f.stats.highTexturePending,1);assert.equal(f.material.albedoTexture,f.original);assert.equal(f.material.isFrozen,false);
  f.scene.render();assert.equal(f.material.albedoTexture,f.original,'existing base material remains drawable while the high texture is unresolved');
  const readsBeforePromotion=f.unrelatedReads;await f.callbacks.at(-1).complete(decoded);await pending;const promotionReads=f.unrelatedReads-readsBeforePromotion;
  assert.equal(f.material.albedoTexture.getSize().width,4096);assert.equal(f.stats.highTextureMax,4096);assert.equal(f.stats.highTexturePending,0);
  const promotionDirty=f.markDirtyCalls-before.dirty,high=f.material.albedoTexture,effects=f.unique.size;
  f.scene.render();assert.equal(f.unique.size,effects,'first promoted draw has the same actual instanced shader variant');assert.equal(f.boundTextures.at(-1),high,'the first real material bind uses the new4K sampler');
  const promotionRequests=f.requests.length-before.requests,steadyRequests=f.requests.length;for(let frame=0;frame<20;frame++)f.scene.render();const steadyEffectRequests=f.requests.length-steadyRequests;
  const releaseDirty=f.markDirtyCalls,readsBeforeRestore=f.unrelatedReads;f.stream.release(id);const restoreDirty=f.markDirtyCalls-releaseDirty,restoreReads=f.unrelatedReads-readsBeforeRestore;
  f.scene.render();assert.equal(f.unique.size,before.effects);assert.equal(f.material.albedoTexture,f.original);assert.equal(high.getInternalTexture(),null);assert.equal(f.boundTextures.at(-1),f.original,'the first restored draw binds the original sampler');
  assert.equal(f.material.isFrozen,false);assert.deepEqual(f.source.map(mesh=>mesh.geometry),geometry);assert.deepEqual(f.inventory(),baseline);
  roundtrips.push({cycle,promotionMarkDirty:promotionDirty,restoreMarkDirty:restoreDirty,promotionUnrelatedGetMaterialReads:promotionReads,restoreUnrelatedGetMaterialReads:restoreReads,uploadCalls:f.uploads.length-before.uploads,newEffects:f.unique.size-before.effects,promotionEffectRequests:promotionRequests,steadyEffectRequests,restoreEffectRequests:f.requests.length-steadyRequests-steadyEffectRequests});
 }
 records.push({case:'actual4K-real-mesh-promotion',hardwareSrgb:hardware,asset:id,sourceKtxSha256:sha(data),sourceKtxBytes:data.length,transcodedFormat:decoded.transcodedFormat,mips:decoded.mipmaps.length,transcodedBytes:decoded.mipmaps.reduce((sum,mip)=>sum+mip.data.byteLength,0),uploadMips:f.uploads.slice(0,13),roundtrips,textureOptions:highTextureOptions('albedo',f.original),geometryShared:true,resourcesStable:true,firstDrawSamplerCorrect:true});
 assert.ok(roundtrips.every(row=>row.promotionMarkDirty===0&&row.restoreMarkDirty===0),'an unfrozen toon material does not need the SDK full-scene markDirty scan on promotion or restore');
 assert.ok(roundtrips.every(row=>row.steadyEffectRequests===0),'promotion does not introduce steady-frame cached effect requests');
 assert.equal(f.uploads.length,39,'all13 authored mips are uploaded exactly once per new allocation; no upload is deferred until draw');
 for(let cycle=0;cycle<3;cycle++)assert.deepEqual(f.uploads.slice(cycle*13,(cycle+1)*13),f.uploads.slice(0,13));
});

test('frozen non-toon fallback still invalidates readiness and restores its native frozen policy',async t=>{
 const f=await fixture(t),{decoded}=await actualDecoded(f.engine);f.material.metadata={};f.material.freeze();f.scene.render();
 const pending=f.stream.start(id);await f.callbacks.at(-1).complete(decoded);await pending;
 assert.equal(f.material.isFrozen,true);assert.equal(f.material.albedoTexture.getSize().width,4096);assert.ok(f.markDirtyCalls>=3);
 f.scene.render();assert.equal(f.material.isReadyForSubMesh(f.source[0],f.source[0].subMeshes[0],true),true);
 f.stream.release(id);assert.equal(f.material.isFrozen,true);assert.equal(f.material.albedoTexture,f.original);f.scene.render();
 records.push({case:'frozen-fallback',readinessRetained:true,frozenPolicyRetained:true});
});

test('job diagnostics distinguish resource wait, Texture readiness and synchronous promotion without per-frame sampling',async t=>{
 const f=await fixture(t),{decoded}=await actualDecoded(f.engine);let finishResources,now=100;
 f.stream.clock=()=>now;f.stream.world.prefetchResources=()=>new Promise(resolve=>finishResources=resolve);
 assert.equal(f.stats.highTextureStage,'idle');assert.equal(f.stats.highTexturePendingAsset,null);
 const pending=f.stream.start(id);assert.equal(f.stats.highTextureStage,'resources');assert.equal(f.stats.highTexturePendingAsset,id);assert.equal(f.callbacks.length,0);
 finishResources();await Promise.resolve();assert.equal(f.stats.highTextureStage,'texture:albedo');assert.equal(f.stats.highTexturePendingAsset,id);
 const mark=f.material._markAllSubMeshesAsTexturesDirty;let stageAtSetter;
 f.material._markAllSubMeshesAsTexturesDirty=function(...args){stageAtSetter=f.stats.highTextureStage;now+=2;return mark.apply(this,args);};
 await f.callbacks[0].complete(decoded);await pending;
 assert.equal(stageAtSetter,'promote');assert.equal(f.stats.highTextureLastPromoteMs,2,'controlled clock covers only the synchronous native texture assignment, not the preceding resource/Texture wait');
 assert.equal(f.stats.highTextureStage,'idle');assert.equal(f.stats.highTexturePendingAsset,null);assert.equal(f.stats.highTexturePending,0);
 const savedStage=f.stats.highTextureStage;for(let frame=0;frame<20;frame++)f.scene.render();assert.equal(f.stats.highTextureStage,savedStage);assert.equal(f.stats.highTextureLastPromoteMs,2);
 records.push({case:'diagnostic-stage-lifecycle',stages:['idle','resources','texture:albedo','promote','idle'],controlledPromoteMs:2,perFrameInstrumentation:false});
});

test('disposed resource waits and late Texture callbacks cannot revive stages or overwrite a new stream diagnostic owner',async t=>{
 const f=await fixture(t),{decoded}=await actualDecoded(f.engine);let release;
 f.stream.world.prefetchResources=()=>new Promise(resolve=>release=resolve);
 const waiting=f.stream.start(id);f.stream.dispose();assert.equal(f.stats.highTextureStage,'disposed');assert.equal(f.stats.highTexturePendingAsset,null);
 release();await waiting;assert.equal(f.callbacks.length,0);assert.equal(f.stats.highTextureStage,'disposed');assert.equal(f.stats.highTextureLastPromoteMs,0);
 delete f.stream.world.prefetchResources;
 const oldStats={},old=new VillageTextureStreaming(f.stream.world,f.stream.assets,[],base,oldStats);old.update=()=>{};old.wanted.set(id,1);const oldPending=old.start(id),oldCallback=f.callbacks.at(-1);old.dispose();await oldPending;
 const currentStats={},current=new VillageTextureStreaming(f.stream.world,f.stream.assets,[],base,currentStats);current.update=()=>{};current.wanted.set(id,1);t.after(()=>current.dispose());const currentPending=current.start(id),currentCallback=f.callbacks.at(-1);
 assert.equal(currentStats.highTextureStage,'texture:albedo');oldCallback.lateLoad();oldCallback.lateError();await Promise.resolve();await Promise.resolve();
 assert.equal(oldStats.highTextureStage,'disposed');assert.equal(oldStats.highTexturePendingAsset,null);assert.equal(oldStats.highTextureLastPromoteMs,0);assert.equal(old.resident.size,0);
 assert.equal(currentStats.highTextureStage,'texture:albedo');assert.equal(currentStats.highTexturePendingAsset,id);assert.equal(currentStats.highTexturePending,1);
 await currentCallback.complete(decoded);await currentPending;assert.equal(currentStats.highTextureStage,'idle');assert.equal(currentStats.highTexturePendingAsset,null);assert.equal(current.resident.size,1);assert.equal(oldStats.highTextureStage,'disposed');
 records.push({case:'diagnostic-owner-isolation',disposedResourceWait:true,lateTextureCallbacksIgnored:true,newStreamStagePreserved:true});
});

test('a real Texture error clears the pending diagnostic stage without recording a promotion or retrying',async t=>{
 const f=await fixture(t);t.mock.method(console,'warn',()=>{});
 const pending=f.stream.start(id);assert.equal(f.stats.highTextureStage,'texture:albedo');f.callbacks[0].lateError();await pending;
 assert.equal(f.stats.highTextureStage,'idle');assert.equal(f.stats.highTexturePendingAsset,null);assert.equal(f.stats.highTexturePending,0);assert.equal(f.stats.highTextureLastPromoteMs,0);
 assert.ok(f.stream.failed.has(id));assert.equal(f.material.albedoTexture,f.original);assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.stream.start(id),undefined);assert.equal(f.callbacks.length,1);
 records.push({case:'diagnostic-error',pendingStageCleared:true,noPromotion:true,noAutomaticRetry:true,originalSamplerRetained:true});
});

test.after(()=>{
 const folder=new URL('../reports/thermal-active-2026-11-04/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('texture-promotion-validation.json',folder),JSON.stringify({baseline:'1879954',passed:records.length===6&&records.filter(row=>row.roundtrips).every(row=>row.roundtrips.every(row=>row.promotionMarkDirty===0&&row.restoreMarkDirty===0)),cases:records,limitations:['Actual packed geometry and the shipped ETC1S decoder/WASM13mip bytes are used, with real Babylon material readiness and lifecycle.','KTX upload calls are intercepted at the SDK engine boundary; no WebGL driver, actual GPU upload duration, device thermal condition or mobile FPS is measured.','The complete map is not rendered; unrelated shared-geometry meshes expose the additional scene traversal, not a measured264.8ms causal contribution.','highTextureLastPromoteMs times synchronous JS material assignment/invalidation. It is not worker decode duration, texture wait duration, GPU upload elapsed time or GPU frame time.']},null,2)+'\n');
});
