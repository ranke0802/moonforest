import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {InstancedMesh,Mesh,NullEngine,PBRMaterial,RawTexture,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {loadStreamedVillage} from '../../src/village-streamed-environment.js';
import {readMapContainer} from '../../src/map-container.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {applyPlainsViewDistance} from '../../src/plains-view-distance.js';
import {VillageGroundDetail} from '../../src/village-ground.js';
import {VillageGroundShade} from '../../src/village-toon.js';
import '@babylonjs/loaders/glTF/index.js';

const root=fileURLToPath(new URL('../../',import.meta.url)),folder=new URL('./',import.meta.url),base=new URL('../../public/assets/',import.meta.url);
const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),native=Mesh.prototype._processInstancedBuffers,sha=value=>createHash('sha256').update(value).digest('hex');
const owned=['src/village-instance-attributes.js','src/village-instancing.js'],sourceHashes=()=>Object.fromEntries(owned.map(file=>[file,sha(readFileSync(new URL('../../'+file,import.meta.url)))])),hashes=sourceHashes();
const digest=(data,count)=>sha(Buffer.from(data.buffer,data.byteOffset,count*data.BYTES_PER_ELEMENT));
const summarize=values=>{const a=values.slice().sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],mean:a.reduce((s,v)=>s+v,0)/a.length,min:a[0],max:a.at(-1)};};
const clockDescriptor=Object.getOwnPropertyDescriptor(performance,'now'),nativeNow=performance.now.bind(performance),pinClock=value=>Object.defineProperty(performance,'now',{configurable:true,value:()=>value}),unpinClock=()=>clockDescriptor?Object.defineProperty(performance,'now',clockDescriptor):delete performance.now;
globalThis.location={href:'https://audit.test/game/'};const originalFetch=globalThis.fetch;globalThis.fetch=async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)));
const engine=new NullEngine({renderWidth:1414,renderHeight:652});engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});engine.getCaps().instancedArrays=true;
const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;scene.defaultMaterial;scene.getOutlineRenderer();caveFogFallback(scene).getInternalTexture().isReady=true;
const models=new Map(),rows=[];
const ground=async world=>{
 const color=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene),detail=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene);color.getInternalTexture().isReady=true;detail.getInternalTexture().isReady=true;detail.gammaSpace=false;
 world.floorMaterial.unfreeze();world.floorMaterial.diffuseTexture=color;new VillageGroundDetail(world.floorMaterial,detail);new VillageGroundShade(world.floorMaterial,world.lighting);world.releaseGround=()=>{color.dispose();detail.dispose();world.releaseGround=null;};
};
const loadContainer=async(model,target,options)=>{
 const source=new URL('content/'+model.pathname.split('/').at(-1),base),{gltf,files}=await readRuntimeGltf(source);models.set(source.pathname.split('/').at(-1),sha(readFileSync(source)));
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
 const container=await readMapContainer(target,gltf,'',{skipMaterials:true,...options}),material=new PBRMaterial('fixture-'+model.pathname,target),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,target);texture.getInternalTexture().isReady=true;material.albedoTexture=texture;material.transparencyMode=0;container.materials.push(material);container.textures.push(texture);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;return container;
};
let context=null,recording=true,totalUpdates=0;const uploads=[],draws=[],update=engine.updateDynamicVertexBuffer;
engine.updateDynamicVertexBuffer=function(buffer,data,offset,length){
 totalUpdates++;
 if(recording&&context){let kind='world';for(const candidate in context.source._userInstancedBuffersStorage?.data)if(context.source._userInstancedBuffersStorage.data[candidate]===data){kind=candidate;break;}uploads.push({pass:context.pass,source:context.source.uniqueId,sourceName:context.source.name,processor:context.source._processInstancedBuffers.name,kind,required:context.effect.getAttributesNames().includes(kind),effectMatches:context.effect===engine._currentEffect,bytes:length??data.byteLength});}
 return update.call(this,buffer,data,offset,length);
};
try{
 for(const [character,map,x,z]of [['warrior-v3','village',0,26],['warrior-plains','great-plains',-40,-18],['warrior-v4','monster-forest',0,45],['warrior-v5','witch-cave',39,-19]]){
  unpinClock();replaceWorldMap(world,character);applyPlainsViewDistance(world,2.4);const player=new Vector3(x,world.terrain.heightAt(x,z),z);
  world.camera.setTarget(player.add(new Vector3(0,1.35,0)));world.camera.alpha=1.2;world.camera.beta=1.14;world.camera.radius=13.243;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(player,0,{force:true});
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  await loadStreamedVillage(world,{initialize:async()=>{},ground,loadContainer});world.villageStreaming.active=false;
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  const wrappers=new Map();
  for(const source of scene.meshes){
   if(!source.getTotalVertices()||source instanceof InstancedMesh)continue;
   if(Object.hasOwn(source,'_processInstancedBuffers')&&source._processInstancedBuffers!==native)wrappers.set(source,source._processInstancedBuffers);
   const process=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,hardware,...args){
    const previous=context,pass=engine.currentRenderPassId===world.shadows.getShadowMap().renderPassId?'shadow':effect.getAttributesNames().includes('villageInk')?'ink':'base';context={source,pass,effect};
    try{
     const result=process.call(this,mesh,sub,effect,fill,batch,hardware,...args);if(!recording)return result;
     const instances=batch.visibleInstances?.[sub._id]??[],self=!!batch.renderSelf?.[sub._id],count=instances.length+Number(self),storage=source._userInstancedBuffersStorage,attributes={};
     if(hardware)for(const kind in storage?.strides)if(effect.getAttributesNames().includes(kind)){assert.ok(storage.renderPasses?.[engine.currentRenderPassId]?.[kind],map+' '+pass+' required '+kind);attributes[kind]=digest(storage.data[kind],count*storage.strides[kind]);}
     draws.push({pass,source:source.uniqueId,geometry:source.geometry?.uniqueId,sub:sub._id,indices:[sub.indexStart,sub.indexCount],vertices:[sub.verticesStart,sub.verticesCount],effect:effect.uniqueId,fill,self,instances:instances.map(instance=>instance.uniqueId),matrix:hardware?digest(batch.parent.instancesData,count*16):null,attributes});return result;
    }finally{context=previous;}
   };
  }
  assert.ok(wrappers.size>10,'use actual owned static source/LOD wrappers');
  const ownedIds=new Set([...wrappers.keys()].map(source=>source.uniqueId));
  const select=optimized=>{for(const [source,wrapper]of wrappers)source._processInstancedBuffers=optimized?wrapper:native;};
  const capture=optimized=>{select(optimized);draws.length=uploads.length=0;totalUpdates=0;scene.render();return {draws:structuredClone(draws),uploads:structuredClone(uploads),totalUpdates};};
  pinClock(nativeNow()+1000);world.lighting.follow(player,true);world.villageVisibility.update(world.camera.globalPosition,player,.1);capture(false);capture(true);capture(false);
  const samples=[];
  const detail=world.villageRenderRecords.find(record=>record.meshes.length&&['tree','prop','landmark','tower'].includes(record.placement.kind)&&record.fogVisible!==false)??world.villageRenderRecords.find(record=>record.meshes.length&&record.fogVisible!==false),detailPosition=new Vector3(detail.placement.x,detail.root.position.y,detail.placement.z);
  for(const [view,alpha,target,radius]of [['front',1.2,player,13.243],['reverse',1.2+Math.PI,player,13.243],['near-detail',1.2,detailPosition,6]]){
   world.camera.alpha=alpha;world.camera.radius=radius;world.camera.setTarget(target.add(new Vector3(0,1.35,0)));world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.villageVisibility.timer=0;world.villageVisibility.shadowTimer=0;world.villageVisibility.update(world.camera.globalPosition,target,.36);capture(false);capture(true);capture(false);
   const before=capture(false),after=capture(true),repeat=capture(false);assert.deepEqual(after.draws,before.draws,map+' '+view+' exact native batches and consumed bytes');assert.deepEqual(repeat.draws,before.draws,map+' stable baseline');
   assert.ok(before.draws.some(draw=>draw.pass==='shadow'));assert.ok(after.uploads.every(u=>!ownedIds.has(u.source)||u.kind==='world'||u.required),JSON.stringify(after.uploads.filter(u=>ownedIds.has(u.source)&&u.kind!=='world'&&!u.required).slice(0,5)));assert.ok(after.totalUpdates<before.totalUpdates);
   const times={baseline:[],candidate:[]};recording=false;
   for(let pair=0;pair<30;pair++)for(const name of pair%2?['candidate','baseline']:['baseline','candidate']){select(name==='candidate');const start=process.hrtime.bigint();scene.render();times[name].push(Number(process.hrtime.bigint()-start)/1e6);}
   recording=true;const group=list=>{const result={};for(const row of list){const key=row.pass+'/'+row.kind;result[key]=(result[key]??0)+1;}return result;};
   samples.push({view,batches:before.draws.length,inkBatches:before.draws.filter(draw=>draw.pass==='ink').length,exactNativeBatchesMatricesAndConsumedAttributeBytes:true,batchSha256:sha(JSON.stringify(before.draws)),bufferUpdates:{baseline:before.totalUpdates,candidate:after.totalUpdates},customUpdatesByPass:{baseline:group(before.uploads),candidate:group(after.uploads)},sceneCpuMs:{baseline:summarize(times.baseline),candidate:summarize(times.candidate)}});
  }
  assert.ok(samples.some(sample=>sample.inkBatches>0),map+' must exercise actual ink submission in at least one authored view');
  select(true);rows.push({map,wrappedSources:wrappers.size,records:world.villageRenderRecords.length,plainsDistance:world.plainsViewDistance,samples});console.log(JSON.stringify({map,wrappedSources:wrappers.size,updates:samples.map(s=>[s.view,s.bufferUpdates.baseline,s.bufferUpdates.candidate])}));await world.releaseEnvironment();
 }
 assert.deepEqual(sourceHashes(),hashes,'owned sources changed during comparison');
 const report={passed:true,baseline,sourceHashes:hashes,models:Object.fromEntries(models),modelCount:models.size,rows,scope:'Current native Mesh._processInstancedBuffers versus source-scoped effect attribute filtering. Same actual packed geometry, native main/shadow/ink batches, matrices, instance order/count and shader-consumed custom attribute byte prefixes. 30 alternating-order CPU samples per variant/view, no byte recording inside timings.',limitations:['NullEngine with opaque 1x1 texture fixtures; no GPU, image, physical-device FPS or thermal proof.','Unconsumed capacity padding and unused custom streams are intentionally not required to match; every shader-consumed attribute prefix is byte-identical.','Desktop CPU samples are noisy; upload call reduction is structural evidence, not a phone performance promise.','No geometry, LOD, render distance, shader, draw pass, textures, combat or HUD changes.']};writeFileSync(new URL('native-attributes.json',folder),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,maps:rows.length,views:rows.reduce((n,row)=>n+row.samples.length,0),models:models.size}));
}finally{unpinClock();scene.dispose();engine.dispose();globalThis.fetch=originalFetch;}
