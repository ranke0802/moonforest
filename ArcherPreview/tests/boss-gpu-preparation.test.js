import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,Vector3,PBRMaterial,DirectionalLight,ShadowGenerator,TransformNode,Observable,LoadAssetContainerAsync} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {prepareBossMorphUpload,loadBossModelContainer} from '../src/boss-gpu-preparation.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {applyHitFlash} from '../src/hit-feedback.js';

const records=[],assetRoot=new URL('../public/assets/',import.meta.url),digest=data=>createHash('sha256').update(ArrayBuffer.isView(data)?Buffer.from(data.buffer,data.byteOffset,data.byteLength):Buffer.from(Float32Array.from(data).buffer)).digest('hex');
let packed;
async function model(){
 if(!packed){const config=JSON.parse(readFileSync(new URL('mourning-elena.json',assetRoot))),decoded=await readRuntimeGltf(new URL(config.model,assetRoot)),gltf=structuredClone(decoded.gltf);for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');packed={config,gltf};}
 return {config:structuredClone(packed.config),gltf:structuredClone(packed.gltf)};
}
function fixture(t,{texture=true,layers=256}={}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;Object.assign(engine.getCaps(),{textureFloat:texture,canUseGLVertexID:texture,maxVertexTextureImageUnits:texture?16:0,maxTextureSize:4096,texture2DArrayMaxLayerCount:layers});
 const native=engine.createRawTexture.bind(engine),uploads=[],buffers=[],updates=[];
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{uploads.push({bytes:data.byteLength,width:w,height:h,depth,hash:digest(data)});const result=native(data,w,h,format,mips,invertY,sampling,compression,type);result.depth=depth;result.is2DArray=true;return result;};engine.updateRawTexture2DArray=()=>{};
 for(const method of ['createVertexBuffer','createDynamicVertexBuffer','createIndexBuffer']){const original=engine[method].bind(engine);engine[method]=(...args)=>{buffers.push({method,bytes:args[0]?.byteLength??0});return original(...args);};}
 const update=engine.updateRawTexture.bind(engine);engine.updateRawTexture=(...args)=>{updates.push(args[1]?.byteLength??0);return update(...args);};
 const camera=new FreeCamera('upload-camera',new Vector3(0,4,-12),scene);camera.setTarget(new Vector3(0,1,2));t.after(()=>{scene.dispose();engine.dispose();});
 return {engine,scene,camera,uploads,buffers,updates};
}
async function directLoad(f,t,{optimized=false}={}){
 const {config,gltf}=await model(),observed=[];
 const loader=new GLTFFileLoader(optimized?{onMeshLoaded:mesh=>{if(mesh.morphTargetManager)observed.push({frozen:mesh.morphTargetManager.areUpdatesFrozen,bytesAlreadyUploaded:f.uploads.length,accepted:prepareBossMorphUpload(mesh)});}}:undefined);loader.skipMaterials=true;
 const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();t.after(()=>loader.dispose());return {config,container,observed};
}
function snapshot(container){
 return container.meshes.filter(mesh=>mesh.getTotalVertices()).map(mesh=>({name:mesh.name,indices:digest(mesh.getIndices()),attributes:Object.fromEntries(mesh.getVerticesDataKinds().sort().map(kind=>[kind,digest(mesh.getVerticesData(kind))])),...(mesh.morphTargetManager?{morph:{count:mesh.morphTargetManager.numTargets,max:mesh.morphTargetManager.numMaxInfluencers,optimize:mesh.morphTargetManager.optimizeInfluencers,texture:mesh.morphTargetManager.isUsingTextureForTargets,influencers:mesh.morphTargetManager.numInfluencers,targets:Array.from({length:mesh.morphTargetManager.numTargets},(_,i)=>{const target=mesh.morphTargetManager.getTarget(i);return {name:target.name,influence:target.influence,positions:digest(target.getPositions()),normals:target.getNormals()?digest(target.getNormals()):null};})}}:{})}));
}
function mockModelFile(scene,gltf,{failure=false,raw=false}={}){
 const requested=[],pending=[];scene._loadFile=(url,onSuccess,onProgress,offlineSupport,useArrayBuffer,onError)=>{
  const complete=new Observable(),request={onCompleteObservable:complete,abort(){onError?.({statusText:'cancelled'},Error('cancelled'));complete.notifyObservers(request);}};requested.push({url,useArrayBuffer});pending.push(request);
  queueMicrotask(()=>{if(failure)request.abort();else{onSuccess(raw?gltf:JSON.stringify(gltf),request);complete.notifyObservers(request);}});return request;
 };return {requested,pending};
}

test('actual witch loader creates each byte-identical morph texture once while preserving all geometry, target and influence state',async t=>{
 const baseline=fixture(t),before=await directLoad(baseline,t),optimized=fixture(t),after=await directLoad(optimized,t,{optimized:true});assert.equal(baseline.uploads.length,4);assert.equal(optimized.uploads.length,2);
 assert.deepEqual(optimized.uploads,[...new Map(baseline.uploads.map(upload=>[upload.hash,upload])).values()]);assert.deepEqual(snapshot(after.container),snapshot(before.container));assert.ok(after.observed.every(event=>event.frozen&&event.accepted));
 const bytes=rows=>rows.reduce((sum,row)=>sum+row.bytes,0),saved=bytes(baseline.uploads)-bytes(optimized.uploads);assert.equal(saved,12985088);
 const loaderUploads=optimized.uploads.slice(),raw=optimized.uploads.length;MourningElenaEncounter.prototype.prepareAsset.call({asset:after.container});assert.equal(optimized.uploads.length,raw+1,'the authored knee correction repacks the existing body texture once during preparation');for(const mesh of after.container.meshes)if(mesh.morphTargetManager)assert.equal(mesh.morphTargetManager.numMaxInfluencers,mesh.morphTargetManager.numTargets);
 const upload=optimized.uploads.at(-1);assert.equal(upload.depth,11);assert.equal(upload.bytes,optimized.uploads[0].bytes);assert.notEqual(upload.hash,optimized.uploads[0].hash);MourningElenaEncounter.prototype.prepareAsset.call({asset:after.container});assert.equal(optimized.uploads.length,raw+1,'warm reprepare does not repack again');
 records.push({case:'actual-byte-identical-morph-upload-dedup',baselineCalls:baseline.uploads.length,optimizedLoaderCalls:loaderUploads.length,baselineInputBytes:bytes(baseline.uploads),optimizedLoaderInputBytes:bytes(loaderUploads),duplicateInputBytesRemoved:saved,baselineUploads:baseline.uploads,optimizedLoaderUploads:loaderUploads,allGeometryTargetsAndLoaderInfluencesIdentical:true,correctedBodyUploadsDuringPreparation:1,correctedBodyUploadBytes:upload.bytes,warmPreparationUploads:0});
});

for(const options of [{texture:false,layers:256},{texture:true,layers:4}])test(`attribute/layer-limit fallback keeps the exact loader contract: ${JSON.stringify(options)}`,async t=>{
 const baseline=fixture(t,options),before=await directLoad(baseline,t),optimized=fixture(t,options),after=await directLoad(optimized,t,{optimized:true});assert.deepEqual(snapshot(after.container),snapshot(before.container));
 MourningElenaEncounter.prototype.prepareAsset.call({asset:before.container});MourningElenaEncounter.prototype.prepareAsset.call({asset:after.container});assert.deepEqual(snapshot(after.container),snapshot(before.container));
 const body=after.container.meshes.find(mesh=>mesh.name==='Elina_Chimera_Skin');assert.equal(body.morphTargetManager.isUsingTextureForTargets,false);assert.equal(after.observed.filter(event=>event.accepted).length,1,'only the one-target mouth meets the attribute/layer contract');
 records.push({case:'unchanged-fallback',options,actualBodyTargets:body.morphTargetManager.numTargets,bodyMaxAfterPreparation:body.morphTargetManager.numMaxInfluencers,snapshotsIdentical:true,baselineTextureCalls:baseline.uploads.length,optimizedTextureCalls:optimized.uploads.length});
});

test('the scoped modern loader wrapper passes its real URL root, glTF plugin options and preparation through the actual SDK',async t=>{
 const f=fixture(t),{gltf}=await model();delete gltf.images;delete gltf.textures;delete gltf.materials;for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const io=mockModelFile(f.scene,gltf),url=new URL('https://assets.example.test/preview/assets/content/witch.gltf'),container=await loadBossModelContainer(f.scene,url);for(const group of container.animationGroups)group.stop();
 assert.deepEqual(io.requested,[{url:url.href,useArrayBuffer:false}]);assert.equal(f.uploads.length,2,'the real glTF factory received the per-load onMeshLoaded option');assert.equal(f.scene.getWaitingItemsCount(),0);
 const paint=new PBRMaterial('wrapper-paint',f.scene);paint.unlit=true;paint.backFaceCulling=false;for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const light=new DirectionalLight('sun',new Vector3(.65,-1,-.45),f.scene),shadows=new ShadowGenerator(256,light);caveFogFallback(f.scene).getInternalTexture().isReady=true;
 const asset={meshes:[...container.meshes],transformNodes:container.transformNodes,skeletons:container.skeletons,animationGroups:container.animationGroups},terrain={heightAt:()=>0,place(p){p.y=0;}},encounter=new MourningElenaEncounter({scene:f.scene,shadows,terrain},()=>{},()=>{},()=>{},{loadAsset:async()=>({asset,config:packed.config})});
 await encounter.prepareHidden({preparation:createBossPreparation({frame:async()=>{assert.notEqual(encounter.actor?.isEnabled(),true);}})});const buffers=f.buffers.length,arrays=f.uploads.length,player=new TransformNode('player',f.scene);
 await encounter.summon(player,{position:new Vector3(0,0,2.8),preparation:createBossPreparation({frame:async()=>{}})});encounter.updateRenderRange(f.camera.position);f.scene.render();
 assert.equal(f.uploads.length,arrays);assert.equal(f.buffers.length,buffers);const updatesBefore=f.updates.length;for(let i=0;i<3;i++)f.scene.render();assert.ok(f.updates.length>updatesBefore,'normal per-frame skeleton texture updates remain');
 for(const mesh of asset.meshes)mesh.visibility=.5;encounter.setShadowCasting(false);applyHitFlash(asset.meshes,.1);f.scene.render();assert.equal(f.uploads.length,arrays);assert.equal(f.buffers.length,buffers);encounter.hide();
 records.push({case:'actual-public-wrapper-and-first-draw',requested:io.requested,textureArrayCalls:arrays,newGeometryOrMorphCreatesOnFirstDrawAndDeath:0,perFrameBoneUpdatesPreserved:true,pendingSceneItems:0});
});

test('unrelated loaders and already-ready/disposed meshes retain their original behavior; failed scoped loads release pending data',async t=>{
 const optimized=fixture(t),first=await directLoad(optimized,t,{optimized:true});const mesh=first.container.meshes.find(mesh=>mesh.morphTargetManager);assert.equal(prepareBossMorphUpload(mesh),false,'do not touch a manager after its first unfreeze');const uploads=optimized.uploads.length;optimized.scene.dispose();assert.equal(prepareBossMorphUpload(mesh),false);assert.equal(optimized.uploads.length,uploads);assert.equal(prepareBossMorphUpload(null),false);
 const unrelated=fixture(t),second=await directLoad(unrelated,t);assert.equal(unrelated.uploads.length,4,'no global loader, scene observer or prototype policy was changed');assert.equal(second.container.meshes.find(mesh=>mesh.name==='Elina_Chimera_Skin').morphTargetManager.optimizeInfluencers,false);
 const failed=fixture(t),{gltf}=await model(),io=mockModelFile(failed.scene,gltf,{failure:true});await assert.rejects(loadBossModelContainer(failed.scene,new URL('https://assets.example.test/witch.gltf')),/cancelled|Unable to load/i);assert.equal(failed.scene.getWaitingItemsCount(),0);assert.equal(failed.uploads.length,0);
 records.push({case:'scoped-loader-disposal-and-abort',unrelatedDefaultTextureCalls:4,disposedOrReadyManagerChanged:false,failedUploadCalls:0,pendingSceneItems:0,requests:io.requested.length});
});

test('overlapping public boss and non-pinning generic loads remain isolated, including container disposal and reload',async t=>{
 const f=fixture(t),{gltf}=await model();delete gltf.images;delete gltf.textures;delete gltf.materials;for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const io=mockModelFile(f.scene,gltf),rootUrl='https://assets.example.test/parallel/';
 const [boss,generic]=await Promise.all([loadBossModelContainer(f.scene,new URL(rootUrl+'boss.gltf')),LoadAssetContainerAsync('generic.gltf',f.scene,{rootUrl,pluginExtension:'.gltf',pluginOptions:{gltf:{useMaxMorphTargetInfluencers:false,skipMaterials:true}}})]);
 assert.equal(io.requested.length,2);assert.equal(f.uploads.length,4);
 for(const mesh of boss.meshes)if(mesh.morphTargetManager){assert.equal(mesh.morphTargetManager.numMaxInfluencers,mesh.morphTargetManager.numTargets);assert.equal(mesh.morphTargetManager.optimizeInfluencers,false);}
 for(const mesh of generic.meshes)if(mesh.morphTargetManager){assert.equal(mesh.morphTargetManager.numMaxInfluencers,0);assert.equal(mesh.morphTargetManager.optimizeInfluencers,true);}
 const originalManagers=boss.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean);boss.dispose();assert.ok(originalManagers.every(manager=>!f.scene.morphTargetManagers.includes(manager)));
 const before=f.uploads.length,reloaded=await loadBossModelContainer(f.scene,new URL(rootUrl+'boss.gltf'));assert.equal(f.uploads.length-before,2);assert.equal(f.scene.getWaitingItemsCount(),0);reloaded.dispose();generic.dispose();
 records.push({case:'concurrent-public-loads-and-dispose-reload',genericPinning:false,genericFinalMaxInfluencers:0,bossFinalMaxInfluencers:'numTargets',initialTextureCalls:4,reloadTextureCalls:2,requests:io.requested.length,pendingSceneItems:0});
});

test('truncated public model data rejects cleanly and a fresh model request retains the same optimized upload path',async t=>{
 const f=fixture(t),url=new URL('https://assets.example.test/retry/witch.gltf');mockModelFile(f.scene,'{"asset":{"version":"2.0"},"meshes":[',{raw:true});await assert.rejects(loadBossModelContainer(f.scene,url));assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.uploads.length,0);
 const {gltf}=await model();delete gltf.images;delete gltf.textures;delete gltf.materials;for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const io=mockModelFile(f.scene,gltf),container=await loadBossModelContainer(f.scene,url);assert.equal(io.requested.length,1);assert.equal(f.uploads.length,2);assert.equal(f.scene.getWaitingItemsCount(),0);container.dispose();
 records.push({case:'truncated-public-load-then-retry',failedUploadCalls:0,retryTextureCalls:2,pendingSceneItems:0});
});

test('actual BossModelLibrary load preserves config no-cache, URL resolution, error retry and one cached successful model request',async t=>{
 // Bind only Vite's import.meta.env and package-relative imports; execute the
 // actual library source and actual modern SDK loader rather than a fake loader.
 let source=readFileSync(new URL('../src/boss-models.js',import.meta.url),'utf8').replace('import.meta.env.BASE_URL',JSON.stringify('/preview/')).replace("'@babylonjs/core'",JSON.stringify(new URL('../node_modules/@babylonjs/core/index.js',import.meta.url).href)).replace("'./boss-gpu-preparation.js'",JSON.stringify(new URL('../src/boss-gpu-preparation.js',import.meta.url).href));
 for(const name of ['map-manifests.js','map-load-lifetime.js'])source=source.replace(`'./${name}'`,JSON.stringify(new URL('../src/'+name,import.meta.url).href));
 const {BossModelLibrary}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),f=fixture(t),{gltf,config}=await model(),priorFetch=globalThis.fetch,priorLocation=globalThis.location,fetches=[];
 delete gltf.images;delete gltf.textures;delete gltf.materials;for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 globalThis.location={href:'https://assets.example.test/game/'};globalThis.fetch=async(url,options)=>{fetches.push({url:String(url),cache:options.cache});return {ok:true,json:async()=>config};};t.after(()=>{globalThis.fetch=priorFetch;if(priorLocation===undefined)delete globalThis.location;else globalThis.location=priorLocation;});
 const failed=mockModelFile(f.scene,gltf,{failure:true}),library=new BossModelLibrary(f.scene,'mourning-elena');await assert.rejects(library.load(),/cancelled|Unable to load/i);assert.equal(library.pending,null);assert.equal(library.loads,0);assert.equal(failed.requested.length,1);
 const successful=mockModelFile(f.scene,gltf);await library.load();await library.load();assert.equal(library.loads,1);assert.equal(successful.requested.length,1);assert.equal(f.uploads.length,2);assert.deepEqual(fetches,Array.from({length:2},()=>({url:'https://assets.example.test/preview/assets/mourning-elena.json',cache:'no-cache'})));assert.equal(successful.requested[0].url,new URL(config.model,'https://assets.example.test/preview/assets/mourning-elena.json').href);
 const loaded=await library.instantiate();assert.equal(loaded.modelTimings.mode,'adopt');assert.equal(loaded.modelTimings.steps[0].name,'model-adopt');assert.equal((await library.instantiate()).modelTimings.mode,'reuse');
 records.push({case:'actual-library-network-cache-retry',fetches,modelRequestsBeforeFailure:1,modelRequestsAfterRetry:1,successfulLibraryLoads:library.loads,morphTextureCalls:2,modelTimingsPreserved:true});
});

test.after(()=>{const folder=new URL('../reports/clone-upload-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('upload-validation.json',folder),JSON.stringify({baseline:'c020469',passed:records.length===8,cases:records,scope:'Actual Babylon 9.31 loader, packed geometry/skin/morph CPU payload events, actual public module loader wrapper and BossModelLibrary source with Vite environment bound for Node.',limitations:['NullEngine cannot measure GPU upload, allocation, driver queue completion, elapsed GPU time or mobile FPS.','Model images/KTX omitted; first geometry/morph data are real. Texture-array calls use an inert NullEngine raw texture shim.','Removed bytes are duplicate CPU packing and texture-array input payload; they are not measured GPU memory savings or a GPU-time improvement.','Only the existing boss default max-influencer=true loader is optimized. Independently configured pin=false loaders are verified unchanged; an external global observer mutating the boss loader policy after activation is outside this contract and does not exist in the repository.'],browserAutomation:false},null,2)+'\n');});
