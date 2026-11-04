import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Color3,Frustum,NullEngine,PBRMaterial,RawTexture,Vector2,Vector3,InstancedMesh} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {loadStreamedVillage} from '../../src/village-streamed-environment.js';
import {readMapContainer} from '../../src/map-container.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {applyPlainsViewDistance} from '../../src/plains-view-distance.js';
import {VillageGroundDetail} from '../../src/village-ground.js';
import {VillageGroundShade} from '../../src/village-toon.js';
import {VillageVisibility} from '../../src/village-visibility.js';
import {VillageOcclusion} from '../../src/village-occlusion.js';
import {plainsRenderRange} from '../../src/plains-view-distance.js';
import {selectVillageShadowCasters} from '../../src/village-shadow-policy.js';
import {ShadowFadeBudget,shadowFadeAttribute} from '../../src/village-shadow-fade.js';
import {caveFogAllowsRecord,caveFogRootEnabled} from '../../src/cave-fog-of-war.js';
import {VillageOutlines} from '../../src/village-outlines.js';
import {villageInkWidth} from '../../src/village-outline-policy.js';
import {lootRarity} from '../../src/loot-rarity.js';
import '@babylonjs/loaders/glTF/index.js';

const folder=new URL('./',import.meta.url),base=new URL('../../public/assets/',import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const oldSource=execFileSync('git',['show',baseline+':ArcherPreview/src/village-visibility.js'],{cwd:root,encoding:'utf8'});
assert.ok(!oldSource.includes('shadowUpdateSkips'),'baseline must precede this working-tree-only change');
const BaselineVisibility=new Function('Frustum','Vector3','VillageOcclusion','plainsRenderRange','selectVillageShadowCasters','ShadowFadeBudget','shadowFadeAttribute','caveFogAllowsRecord','caveFogRootEnabled',oldSource.replace(/^import[^\n]+\n/gm,'').replace('export function cellKey','function cellKey').replace('export class VillageVisibility','class VillageVisibility')+'\nreturn VillageVisibility;')(Frustum,Vector3,VillageOcclusion,plainsRenderRange,selectVillageShadowCasters,ShadowFadeBudget,shadowFadeAttribute,caveFogAllowsRecord,caveFogRootEnabled);
const previousUpdate=BaselineVisibility.prototype.updateShadows;
const oldOutlines=execFileSync('git',['show',baseline+':ArcherPreview/src/village-outlines.js'],{cwd:root,encoding:'utf8'});
const oldAddSource=oldOutlines.slice(oldOutlines.indexOf('  addRecords(records){'),oldOutlines.indexOf('  async prepare('));
const previousAddRecords=new Function('Vector2','Color3','villageInkWidth','lootRarity','return function(records){'+oldAddSource.slice(oldAddSource.indexOf('{')+1).trim().slice(0,-1)+'};')(Vector2,Color3,villageInkWidth,lootRarity);
const sha=value=>createHash('sha256').update(value).digest('hex'),sourceHash=()=>sha(readFileSync(new URL('../../src/village-visibility.js',import.meta.url)));
const sourceSha256=sourceHash(),stats=values=>{const a=values.slice().sort((a,b)=>a-b);return {samples:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],min:a[0],max:a.at(-1)};};
const outlinesSha256=sha(readFileSync(new URL('../../src/village-outlines.js',import.meta.url)));
const nativeNow=performance.now.bind(performance),clockDescriptor=Object.getOwnPropertyDescriptor(performance,'now');
const pinClock=value=>Object.defineProperty(performance,'now',{configurable:true,value:()=>value});
const unpinClock=()=>clockDescriptor?Object.defineProperty(performance,'now',clockDescriptor):delete performance.now;
globalThis.location={href:'https://audit.test/game/'};
const originalFetch=globalThis.fetch;globalThis.fetch=async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)));
const engine=new NullEngine({renderWidth:1664,renderHeight:768});engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});engine.getCaps().instancedArrays=true;
const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;scene.defaultMaterial;scene.getOutlineRenderer();caveFogFallback(scene).getInternalTexture().isReady=true;
const models=new Map();
const prepareGround=async world=>{
 const color=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene),detail=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene);color.getInternalTexture().isReady=true;detail.getInternalTexture().isReady=true;detail.gammaSpace=false;
 world.floorMaterial.unfreeze();world.floorMaterial.diffuseTexture=color;new VillageGroundDetail(world.floorMaterial,detail);new VillageGroundShade(world.floorMaterial,world.lighting);
 world.releaseGround=()=>{color.dispose();detail.dispose();world.releaseGround=null;};
};
const loadContainer=async(model,target,options)=>{
 const source=new URL('content/'+model.pathname.split('/').at(-1),base),{gltf,files}=await readRuntimeGltf(source);models.set(source.pathname.split('/').at(-1),sha(readFileSync(source)));
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
 const container=await readMapContainer(target,gltf,'',{skipMaterials:true,...options}),material=new PBRMaterial('fixture-'+model.pathname,target),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,target);texture.getInternalTexture().isReady=true;
 material.albedoTexture=texture;material.transparencyMode=0;container.materials.push(material);container.textures.push(texture);
 for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;return container;
};
const shadowStats=value=>Object.fromEntries(['shadowCasters','majorShadowCasters','fadingShadows'].map(key=>[key,value.stats[key]]));
function save(value,records){
 return {active:[...value.shadowFade.active],desired:[...value.shadowFade.desired],initial:value.shadowFade.initial,cast:[...value.cast],castRecords:[...value.castRecords],scratch:[...value.shadowScratch],stats:shadowStats(value),renderList:world.shadows.getShadowMap().renderList.slice(),records:records.map(r=>({r,enabled:r.root.isEnabled(false),caster:r.shadowCaster,attributes:r.meshes.map(mesh=>[mesh,mesh.instancedBuffers?.[shadowFadeAttribute]])}))};
}
function restore(value,saved){
 Object.assign(value.shadowFade,{active:new Map(saved.active),desired:new Set(saved.desired),initial:saved.initial});value.cast=new Set(saved.cast);value.castRecords=new Set(saved.castRecords);value.shadowScratch=new Set(saved.scratch);Object.assign(value.stats,saved.stats);
 world.shadows.getShadowMap().renderList.splice(0,Infinity,...saved.renderList);
 for(const {r,enabled,caster,attributes}of saved.records){r.shadowCaster=caster;r.root.setEnabled(enabled);for(const [mesh,fade]of attributes)if(mesh.instancedBuffers)mesh.instancedBuffers[shadowFadeAttribute]=fade;}
}
function semanticState(value,records){
 return {active:[...value.shadowFade.active].map(([r,fade])=>[r.placement.id,fade]),cast:[...value.cast].map(m=>m.uniqueId),castRecords:[...value.castRecords].map(r=>r.placement.id),renderList:world.shadows.getShadowMap().renderList.map(m=>m.uniqueId),stats:shadowStats(value),records:records.map(r=>[r.placement.id,r.root.isEnabled(),r.shadowCaster,r.meshes.map(mesh=>[mesh.uniqueId,mesh.instancedBuffers?.[shadowFadeAttribute]])])};
}
function outlineSetup(records,baseline,countCalls=false){
 const groups=new Map();for(const record of records){const key=record.placement.asset;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
 const ink=new VillageOutlines(world,[],{});if(baseline)ink.addRecords=previousAddRecords;
 let sourceCalls=0;if(countCalls){const sourceFor=ink.sourceFor;ink.sourceFor=(...args)=>{sourceCalls++;return sourceFor(...args);};}
 const started=process.hrtime.bigint();for(const group of groups.values())ink.addRecords(group);const addRecordsMs=Number(process.hrtime.bigint()-started)/1e6;
 ink.update(performance.now());
 const state={sources:[...ink.sources].map(source=>source.uniqueId),entries:ink.entries.map(entry=>[entry.mesh.uniqueId,entry.inkWidth,entry.mesh.instancedBuffers?.villageInkTint?.asArray()??null]),selected:[...ink.selected].map(entry=>entry.mesh.uniqueId),triangles:ink.stats.outlineTriangles};
 ink.dispose();return {sourceCalls,addRecordsMs,state};
}
const maps=[['warrior-v3','village',0,26],['warrior-plains','great-plains',-40,-18],['warrior-v4','monster-forest',0,45],['warrior-v5','witch-cave',39,-19]],rows=[];
try{
 for(const [character,map,x,z]of maps){
  unpinClock();replaceWorldMap(world,character);applyPlainsViewDistance(world,2.4);
  const player=new Vector3(x,world.terrain.heightAt(x,z),z);world.camera.setTarget(player.add(new Vector3(0,1.35,0)));world.camera.alpha=1.2;world.camera.beta=1.14;world.camera.radius=13.243;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(player,0,{force:true});
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  await loadStreamedVillage(world,{initialize:async()=>{},ground:prepareGround,loadContainer});world.villageStreaming.active=false;
  const visibility=world.villageVisibility,records=world.villageRenderRecords,draws=[];let recording=true;
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  for(const source of scene.meshes){
   if(!source.getTotalVertices()||source instanceof InstancedMesh)continue;const process=source._processRendering;
   source._processRendering=function(mesh,sub,effect,fill,batch,...rest){
    const result=process.call(this,mesh,sub,effect,fill,batch,...rest);if(!recording)return result;
    const instances=batch.visibleInstances?.[sub._id]??[],self=!!batch.renderSelf?.[sub._id],data=batch.parent?.instancesData;
    const matrices=data?Array.from(data.subarray(0,(instances.length+(self?1:0))*16)):instances.map(instance=>Array.from(instance.getWorldMatrix().m));
    draws.push({pass:engine.currentRenderPassId===world.shadows.getShadowMap().renderPassId?'shadow':'main',source:source.uniqueId,geometry:source.geometry?.uniqueId,sub:sub._id,indexStart:sub.indexStart,indexCount:sub.indexCount,verticesStart:sub.verticesStart,verticesCount:sub.verticesCount,effect:effect?.uniqueId,fill,self,instances:instances.map(instance=>instance.uniqueId),matrixSha:sha(JSON.stringify(matrices))});return result;
   };
  }
  pinClock(nativeNow()+1000);world.lighting.follow(player,true);visibility.update(world.camera.globalPosition,player,.1);for(let i=0;i<3;i++)scene.render();
  const outlineBefore=outlineSetup(records,true,true),outlineAfter=outlineSetup(records,false,true);assert.deepEqual(outlineAfter.state,outlineBefore.state,map+' outline source setup, entries and selection');
  const outlineTimes={baseline:[],candidate:[]};
  for(let pair=0;pair<24;pair++)for(const name of pair%2?['candidate','baseline']:['baseline','candidate'])outlineTimes[name].push(outlineSetup(records,name==='baseline').addRecordsMs);
  const outlinePreparation={baselineSourceForCalls:outlineBefore.sourceCalls,candidateSourceForCalls:outlineAfter.sourceCalls,exactSourcesEntriesAndSelectionMatch:true,setupStateSha256:sha(JSON.stringify(outlineBefore.state)),addRecordsMs:{baseline:stats(outlineTimes.baseline),candidate:stats(outlineTimes.candidate)}};
  const samples=[];let comparisons=0;
  for(const [view,alpha]of [['front',1.2],['reverse',1.2+Math.PI]]){
   world.camera.alpha=alpha;world.camera.getViewMatrix();world.camera.getProjectionMatrix();visibility.timer=0;visibility.shadowTimer=0;visibility.update(world.camera.globalPosition,player,.1);scene.render();
   const saved=save(visibility,records);previousUpdate.call(visibility,0);const expected=semanticState(visibility,records);draws.length=0;scene.render();const before=structuredClone(draws);
   restore(visibility,saved);visibility.updateShadows(0);assert.deepEqual(semanticState(visibility,records),expected,map+' '+view+' caster state');draws.length=0;scene.render();assert.deepEqual(draws,before,map+' '+view+' exact native main/shadow batches');comparisons++;
   assert.ok(draws.some(draw=>draw.pass==='main'));assert.ok(draws.some(draw=>draw.pass==='shadow'));
   const cpu={baseline:[],candidate:[]};recording=false;
   for(let pair=0;pair<40;pair++)for(const name of pair%2?['candidate','baseline']:['baseline','candidate']){
    const update=name==='baseline'?previousUpdate:VillageVisibility.prototype.updateShadows,start=process.hrtime.bigint();for(let repeat=0;repeat<400;repeat++)update.call(visibility,0);cpu[name].push(Number(process.hrtime.bigint()-start)/1e6/400);
   }
   recording=true;samples.push({view,shadowCasters:visibility.cast.size,mainBatches:before.filter(d=>d.pass==='main').length,shadowBatches:before.filter(d=>d.pass==='shadow').length,nativeBatchSha256:sha(JSON.stringify(before)),exactCasterAndNativeBatchMatch:true,updateShadowsMs:{baseline:stats(cpu.baseline),candidate:stats(cpu.candidate)}});
  }
  // Fade two different authored caster groups; compare each simulation step
  // from an identical pre-step state, then render both real native batches.
  const eligible=records.filter(r=>r.meshes.length&&r.fogVisible!==false&&r.authoredSuppressed!==true),next=eligible.slice(-Math.min(8,eligible.length));visibility.shadowFade.select(next);
  for(let frame=0;frame<48;frame++){
   const saved=save(visibility,records);previousUpdate.call(visibility,1/30);const expected=semanticState(visibility,records);draws.length=0;scene.render();const before=structuredClone(draws);
   restore(visibility,saved);visibility.updateShadows(1/30);assert.deepEqual(semanticState(visibility,records),expected,map+' fade '+frame);draws.length=0;scene.render();assert.deepEqual(draws,before,map+' fade native batches '+frame);comparisons++;
  }
  rows.push({map,records:records.length,plainsDistance:world.plainsViewDistance,loadedLods:world.environment.loadedLods,comparisons,samples,outlinePreparation,shadowUpdates:visibility.stats.shadowUpdates,shadowUpdateSkips:visibility.stats.shadowUpdateSkips,finalCasterCount:visibility.cast.size});
  console.log(JSON.stringify({map,comparisons,outlinePreparation:{baselineCalls:outlineBefore.sourceCalls,candidateCalls:outlineAfter.sourceCalls,baselineMedianMs:outlinePreparation.addRecordsMs.baseline.median,candidateMedianMs:outlinePreparation.addRecordsMs.candidate.median},samples:samples.map(s=>({view:s.view,baselineMedianMs:s.updateShadowsMs.baseline.median,candidateMedianMs:s.updateShadowsMs.candidate.median}))}));
  await world.releaseEnvironment();assert.equal(visibility.shadowState.size,0,'release clears retained references');
 }
 assert.equal(sourceHash(),sourceSha256,'owned runtime source changed during comparison');
 assert.equal(sha(readFileSync(new URL('../../src/village-outlines.js',import.meta.url))),outlinesSha256,'owned outline source changed during comparison');
 const report={passed:true,baseline,sourceSha256,outlinesSha256,models:Object.fromEntries(models),modelCount:models.size,rows,scope:'Current HEAD baseline versus working-tree candidate; actual four authored map layouts and decoded packed geometry, real native main/shadow batches and 48 paired fading steps per map. Alternating CPU samples time only updateShadows after settling, 400 calls per sample, 40 samples per variant/view. Outline source preparation uses the same actual instances grouped per asset, 24 alternating-order addRecords samples per variant; source call counts are collected separately from timings.',limitations:['NullEngine and opaque 1x1 material fixtures do not verify physical-device FPS, GPU time, images or thermals.','Only redundant CPU-side shadow caster submission and per-batch outline source setup work changes; geometry, render passes, shadow quality, player/boss textures, background texture policy, LOD thresholds and 240% plains view distance are untouched by this change.','Per-function desktop timings are noisy and small; they must not be advertised as a material whole-frame or mobile FPS gain.','Lifecycle invalidation for fog, same-length mesh replacement, late mesh installation, external fade mutation and disposal is independently covered by village-shadow-reuse.test.js using real native instances.']};
 writeFileSync(new URL('cpu-shadow-reuse.json',folder),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,maps:rows.length,comparisons:rows.reduce((sum,r)=>sum+r.comparisons,0),models:models.size,report:'cpu-shadow-reuse.json'}));
}finally{unpinClock();scene.dispose();engine.dispose();globalThis.fetch=originalFetch;}
