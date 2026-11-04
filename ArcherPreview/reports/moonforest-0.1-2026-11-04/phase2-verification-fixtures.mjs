import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,PBRMaterial,RawTexture,DirectionalLight,ShadowGenerator,Observable,Bone,Skeleton,AnimationGroup,Material,Mesh} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {loadBossModelContainer} from '../../src/boss-gpu-preparation.js';
import {instantiateBossModel} from '../../src/boss-models.js';
import {BossBattle} from '../../src/boss-battle.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {createBossPreparation} from '../../src/boss-preparation.js';
import {isRuntimeOutline} from '../../src/character-outlines.js';
import {setWorldCharacter} from '../../src/world-limits.js';

export const assetRoot=new URL('../../public/assets/',import.meta.url);
export const sha=value=>createHash('sha256').update(typeof value==='string'?value:Buffer.from(value.buffer??value,value.byteOffset??0,value.byteLength??value.length)).digest('hex');
const liveCount=observable=>observable?.observers?.filter(observer=>!observer._willBeUnregistered).length??0;
const observerCount=owner=>Object.values(owner??{}).reduce((sum,value)=>sum+(value?.observers?liveCount(value):0),0);
export const drain=()=>new Promise(resolve=>setTimeout(resolve,0));

export function nativeCounters(){
 const counts={skeletonClones:0,boneLinks:0,animationGroupClones:0,animationGroupStarts:0,materialClones:0,meshClones:0},restores=[];
 for(const [type,name,key]of [[Skeleton,'clone','skeletonClones'],[Bone,'linkTransformNode','boneLinks'],[AnimationGroup,'clone','animationGroupClones'],[AnimationGroup,'start','animationGroupStarts'],[Material,'clone','materialClones'],[Mesh,'clone','meshClones']]){
  const original=type.prototype[name];if(typeof original!=='function')continue;
  type.prototype[name]=function(...args){counts[key]++;return original.apply(this,args);};restores.push(()=>type.prototype[name]=original);
 }
 return {counts,snapshot:()=>({...counts}),restore:()=>{for(const restore of restores.reverse())restore();}};
}

export function timerCounters(){
 const native={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval},timeouts=new Set(),intervals=new Set();
 globalThis.setTimeout=(callback,ms,...args)=>{let token;token=native.setTimeout((...values)=>{timeouts.delete(token);callback(...values);},ms,...args);timeouts.add(token);return token;};
 globalThis.clearTimeout=token=>{timeouts.delete(token);return native.clearTimeout(token);};
 globalThis.setInterval=(...args)=>{const token=native.setInterval(...args);intervals.add(token);return token;};globalThis.clearInterval=token=>{intervals.delete(token);return native.clearInterval(token);};
 return {snapshot:()=>({timeouts:timeouts.size,intervals:intervals.size}),restore:()=>Object.assign(globalThis,native)};
}

export async function createActualActorFixture({ids=['guardian-bear','hooded-goblin','mourning-elena']}={}){
 setWorldCharacter('warrior-v3');
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:8192,texture2DArrayMaxLayerCount:256});
 const uploads=[];engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{uploads.push({bytes:data.byteLength,width:w,height:h,depth});const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};engine.updateRawTexture2DArray=()=>{};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const camera=new FreeCamera('phase2-camera',new Vector3(0,10,-25),scene);camera.setTarget(new Vector3(0,2,0));
 const light=new DirectionalLight('phase2-sun',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(512,light);
 const terrain={heightAt:()=>0,place:p=>{p.y=0;}},world={scene,camera,terrain,shadows,mapId:'actor-verification',cave:false,lighting:{registerMeshes(){}}},player=new TransformNode('phase2-player',scene);player.position.set(0,0,-10);
 const events=[],battle=new BossBattle(world,()=>{},()=>{},()=>true,{onDefeat:event=>events.push(event)}),libraries=new Map(),ioRequests=[],assets=[],virtualModels=new Map();
 scene._loadFile=(url,onSuccess,onProgress,offline,useArrayBuffer,onError)=>{
  const complete=new Observable(),request={onCompleteObservable:complete,abort(){onError?.({statusText:'cancelled'},new Error('cancelled'));complete.notifyObservers(request);}};ioRequests.push({url,useArrayBuffer});
  const id=String(url).split('/').at(-1).replace(/\.gltf$/,''),gltf=virtualModels.get(id);assert.ok(gltf,'known virtual model '+url);
  queueMicrotask(()=>{onSuccess(JSON.stringify(gltf),request);complete.notifyObservers(request);});return request;
 };
 let parses=0,instances=0,newGeometry=0,newMaterial=0;
 const geometryObserver=scene.onNewGeometryAddedObservable.add(()=>newGeometry++),materialObserver=scene.onNewMaterialAddedObservable.add(()=>newMaterial++);
 for(const id of ids){
  const config=JSON.parse(readFileSync(new URL(id+'.json',assetRoot),'utf8')),modelUrl=new URL(config.model,assetRoot),decoded=await readRuntimeGltf(modelUrl),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  // Reuse the existing virtual asset-load harness: actual shipped decoded
  // positions/indices/skin/morph/clips, real scoped public loader hook. Images
  // and native KTX decoding use opaque1x1fixtures and are explicitly unmeasured.
  delete gltf.images;delete gltf.textures;delete gltf.materials;for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  virtualModels.set(id,gltf);
  const library={config,loads:0,container:null,pending:null,async load(){if(!this.pending)this.pending=(async()=>{
   const url=new URL('https://phase2-assets.test/'+id+'.gltf');
   parses++;this.container=await loadBossModelContainer(scene,url);for(const group of this.container.animationGroups)group.stop();
   const paint=new PBRMaterial(id+'-source-fixture',scene),mouth=id==='mourning-elena'?new PBRMaterial(id+'-mouth-fixture',scene):paint,texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);texture.getInternalTexture().isReady=true;
   for(const material of new Set([paint,mouth])){material.albedoTexture=texture;material.unlit=true;material.backFaceCulling=false;this.container.materials.push(material);}this.container.textures.push(texture);
   for(const mesh of this.container.meshes)if(mesh.getTotalVertices())mesh.material=/Lament_Mouth_Interior/.test(mesh.name)?mouth:paint;
   assets.push({id,version:config.version,model:modelUrl.href,modelSha256:sha(readFileSync(modelUrl)),triangles:this.container.meshes.reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),vertices:this.container.meshes.reduce((sum,mesh)=>sum+mesh.getTotalVertices(),0)});this.loads++;
  })();await this.pending;},async instantiate(){await this.load();instances++;return {config:this.config,asset:instantiateBossModel(this.container)};}};
  libraries.set(id,library);
 }
 const libraryFactory=(sceneOrId,assetId)=>{const key=assetId??(typeof sceneOrId==='string'?sceneOrId:sceneOrId.assetId??sceneOrId.asset?.id),library=libraries.get(key);assert.ok(library,'known actual library '+key);return {library,owned:false};};
 const counters=()=>({modelParses:parses,libraryInstantiateMethodCalls:instances,newGeometry,newMaterial,morphTextureArrayCreates:uploads.length});
 const counts=()=>{
  const meshes=[...new Set([...scene.meshes,...[...libraries.values()].flatMap(library=>library.container?.meshes??[])])],geometries=new Set(meshes.map(mesh=>mesh.geometry).filter(Boolean)),managers=new Set(meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean)),arrays=new Set();let geometryBytes=0,morphBytes=0;
  const bytes=data=>{if(!data||arrays.has(data))return 0;arrays.add(data);return data.byteLength??data.length*4;};
  for(const geometry of geometries){geometryBytes+=bytes(geometry.getIndices());for(const kind of Object.keys(geometry.getVertexBuffers()??{}))geometryBytes+=bytes(geometry.getVerticesData(kind));}
  for(const manager of managers)for(let i=0;i<manager.numTargets;i++){const target=manager.getTarget(i);for(const getter of ['getPositions','getNormals','getTangents','getUVs'])morphBytes+=bytes(target[getter]?.());}
  const skeletons=new Set([...scene.skeletons,...[...libraries.values()].flatMap(library=>library.container?.skeletons??[])]),nodes=[...scene.meshes,...scene.transformNodes];
  const sceneObservers=observerCount(scene),nodeObservers=nodes.reduce((sum,node)=>sum+observerCount(node)+observerCount(node._nodeDataStorage),0);
  return {meshes:scene.meshes.length,geometries:scene.geometries.length,materials:scene.materials.length,textures:scene.textures.length,skeletons:scene.skeletons.length,animationGroups:scene.animationGroups.length,morphManagers:scene.morphTargetManagers.length,transformNodes:scene.transformNodes.length,sceneObservers,sceneObserverKinds:Object.fromEntries(Object.entries(scene).filter(([,value])=>value?.observers&&liveCount(value)>0).map(([key,value])=>[key,liveCount(value)])),nodeObservers,pendingSceneItems:scene.getWaitingItemsCount(),battleEncounters:battle.encounters.length,estimatedMemory:{cpuUniqueGeometryBytes:geometryBytes,cpuUniqueMorphArrayBytes:morphBytes,skeletonMatrixBytes:[...skeletons].reduce((sum,skeleton)=>sum+(skeleton.bones.length+1)*16*4,0),scope:'Lower-bound owned CPU buffer data and skeleton matrices, deduplicated by actual object identity. Excludes JS object overhead, decoded image caches, driver/GPU allocations and physical-device residency.'}};
 };
 const preparationFactory=options=>createBossPreparation({frame:async()=>{},...options});
 const renderCost=()=>{
  const original=Mesh.prototype._processRendering,draws=[];
  Mesh.prototype._processRendering=function(mesh,sub,effect,fill,batch,...args){const instances=batch.visibleInstances?.[sub._id]?.length??0,self=batch.renderSelf?.[sub._id]?1:0;draws.push({pass:engine.currentRenderPassId===shadows.getShadowMap().renderPassId?'shadow':'main',role:isRuntimeOutline(this)?'outline':this.metadata?.moonforestInternalLines?'internal-lines':'surface-or-effect',triangles:sub.indexCount/3*(self+instances),source:this.name});return original.call(this,mesh,sub,effect,fill,batch,...args);};
  try{scene.render();return {draws:draws.length,mainDraws:draws.filter(row=>row.pass==='main').length,shadowDraws:draws.filter(row=>row.pass==='shadow').length,submittedTrianglesByPass:Object.fromEntries(['main','shadow'].map(pass=>[pass,draws.filter(row=>row.pass===pass).reduce((sum,row)=>sum+row.triangles,0)])),submittedTrianglesByRole:Object.fromEntries(['outline','internal-lines','surface-or-effect'].map(role=>[role,draws.filter(row=>row.role===role).reduce((sum,row)=>sum+row.triangles,0)])),internalLines:'Existing internal-line material shader plugin retained in surface draws; zero standalone internal-line batches does not mean zero shader cost.',scope:'NullEngine actual CPU draw submissions including silhouettes/internal lines/shadow where selected; no rasterization/GPU or FPS result.'};}finally{Mesh.prototype._processRendering=original;}
 };
 const dispose=()=>{battle.hide();scene.onNewGeometryAddedObservable.remove(geometryObserver);scene.onNewMaterialAddedObservable.remove(materialObserver);for(const library of libraries.values())library.container?.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');};
 return {engine,scene,camera,world,player,battle,events,libraries,libraryFactory,assets,ioRequests,uploads,counters,counts,preparationFactory,renderCost,virtualModel:id=>structuredClone(virtualModels.get(id)),dispose};
}
