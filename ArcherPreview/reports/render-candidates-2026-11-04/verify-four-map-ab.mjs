import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Session} from 'node:inspector';
import {NullEngine,PBRMaterial,RawTexture,Vector3,InstancedMesh,Node,Mesh} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {loadStreamedVillage} from '../../src/village-streamed-environment.js';
import {readMapContainer} from '../../src/map-container.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {applyPlainsViewDistance} from '../../src/plains-view-distance.js';
import {VillageGroundDetail} from '../../src/village-ground.js';
import {VillageGroundShade} from '../../src/village-toon.js';
import '@babylonjs/loaders/glTF/index.js';

const folder=new URL('./',import.meta.url),base=new URL('../../public/assets/',import.meta.url),baseline='c65e731',root=fileURLToPath(new URL('../../',import.meta.url));
const oldSource=execFileSync('git',['show',baseline+':ArcherPreview/src/village-active-candidates.js'],{cwd:root,encoding:'utf8'});
const BaselineCandidates=new Function('InstancedMesh','Node',oldSource.replace(/^import[^\n]+\n/,'').replace('export class VillageActiveCandidates','class VillageActiveCandidates')+'\nreturn VillageActiveCandidates;')(InstancedMesh,Node);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sum=(map,key)=>map[key]=(map[key]??0)+1;
const ownedSources=['src/village-active-candidates.js','src/village-streamed-environment.js'],sourceHashes=Object.fromEntries(ownedSources.map(path=>[path,sha(readFileSync(new URL('../../'+path,import.meta.url)))]));
const referenceStats=values=>{const list=values.slice().sort((a,b)=>a-b);return {samples:list.length,min:list[0],median:list[Math.floor(list.length/2)],p95:list[Math.ceil(list.length*.95)-1],mean:list.reduce((a,b)=>a+b,0)/list.length,max:list.at(-1)};};
const clockDescriptor=Object.getOwnPropertyDescriptor(performance,'now'),nativeNow=performance.now.bind(performance);
const pinClock=value=>Object.defineProperty(performance,'now',{configurable:true,value:()=>value});
const unpinClock=()=>clockDescriptor?Object.defineProperty(performance,'now',clockDescriptor):delete performance.now;
globalThis.location={href:'https://audit.test/game/'};
const originalFetch=globalThis.fetch;globalThis.fetch=async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)));
const engine=new NullEngine({renderWidth:1664,renderHeight:768});engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});engine.getCaps().instancedArrays=true;
const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;scene.defaultMaterial;scene.getOutlineRenderer();caveFogFallback(scene).getInternalTexture().isReady=true;
let activeStart,activeCpuMs=0;scene.onBeforeActiveMeshesEvaluationObservable.add(()=>{activeStart=process.hrtime.bigint();});scene.onAfterActiveMeshesEvaluationObservable.add(()=>{activeCpuMs=Number(process.hrtime.bigint()-activeStart)/1e6;});
const modelFiles=new Map();
const prepareGround=async world=>{
 const color=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene),detail=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,world.scene);color.getInternalTexture().isReady=true;detail.getInternalTexture().isReady=true;detail.gammaSpace=false;
 world.floorMaterial.unfreeze();world.floorMaterial.diffuseTexture=color;new VillageGroundDetail(world.floorMaterial,detail);new VillageGroundShade(world.floorMaterial,world.lighting);
 world.releaseGround=()=>{color.dispose();detail.dispose();world.releaseGround=null;};
};
const loadContainer=async(model,target,options)=>{
 const source=new URL('content/'+model.pathname.split('/').at(-1),base),{gltf,files}=await readRuntimeGltf(source);modelFiles.set(source.pathname.split('/').at(-1),sha(readFileSync(source)));
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(buffer.uri).data).toString('base64');
 const container=await readMapContainer(target,gltf,'',{skipMaterials:true,...options}),material=new PBRMaterial('fixture-'+model.pathname,target),texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,target);texture.getInternalTexture().isReady=true;
 material.albedoTexture=texture;material.transparencyMode=0;container.materials.push(material);container.textures.push(texture);
 for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;return container;
};
const session=new Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
await post('Profiler.enable');await post('Profiler.startPreciseCoverage',{callCount:true,detailed:false});
function calls(coverage){
 const result={meshIsReady:0,instanceIsReady:0,nodeIsEnabled:0,meshGetLOD:0,instanceGetLOD:0,meshPreActivate:0,instancePreActivate:0};
 for(const script of coverage.result){const prefix=script.url.endsWith('/Meshes/mesh.pure.js')?'mesh':script.url.endsWith('/Meshes/instancedMesh.pure.js')?'instance':script.url.endsWith('/node.js')?'node':null;if(!prefix)continue;
  for(const fn of script.functions){const suffix={isReady:'IsReady',isEnabled:'IsEnabled',getLOD:'GetLOD',_preActivate:'PreActivate'}[fn.functionName],key=prefix+suffix;if(Object.hasOwn(result,key))result[key]+=fn.ranges[0].count;}
 }return result;
}
function geometryProof(){return scene.geometries.map(geometry=>({id:geometry.uniqueId,indices:sha(Buffer.from(Uint32Array.from(geometry.getIndices()??[]).buffer)),vertices:Object.fromEntries(Object.keys(geometry.getVertexBuffers()??{}).sort().map(kind=>[kind,sha(Buffer.from(Float32Array.from(geometry.getVerticesData(kind)??[]).buffer))]))}));}
function classify(records){
 const owned=new Set(),sources=new Set();for(const record of records)for(const mesh of record.root.getChildMeshes())owned.add(mesh);
 for(const asset of world.villagePrepared.assets.values())for(const tier of asset.tiers.values())for(const mesh of tier.container.meshes)sources.add(mesh);
 const groups={};for(const mesh of scene.meshes){const role=sources.has(mesh)?'environment-source-or-lod':owned.has(mesh)?(mesh instanceof InstancedMesh?'placed-native-instance':!mesh.geometry?'placed-empty-root':'placed-mesh'):'world-or-dynamic';const key=[role,mesh.getClassName(),mesh.isEnabled()?'enabled':'disabled',mesh.isVisible?'visible-flag':'hidden-flag',mesh.geometry?'geometry':'no-geometry'].join('|');sum(groups,key);}
 return {total:scene.meshes.length,groups};
}
const maps=[['warrior-v3','village',0,26],['warrior-plains','great-plains',-40,-18],['warrior-v4','monster-forest',0,45],['warrior-v5','witch-cave',39,-19]],rows=[];
try{
 for(const [character,map,x,z]of maps){
  unpinClock();
  console.log('loading '+map);replaceWorldMap(world,character);applyPlainsViewDistance(world,2.4);
  const player=new Vector3(x,world.terrain.heightAt(x,z),z);world.camera.setTarget(player.add(new Vector3(0,1.35,0)));world.camera.alpha=1.2;world.camera.beta=1.14;world.camera.radius=13.243;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(player,0,{force:true});
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  const native=scene.getActiveMeshCandidates;await loadStreamedVillage(world,{initialize:async()=>{},ground:prepareGround,loadContainer});world.villageStreaming.active=false;
  const installed=scene.getActiveMeshCandidates,stats=world.environment.activeMeshCandidates,records=world.villageRenderRecords;
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  scene.getActiveMeshCandidates=native;const before=new BaselineCandidates(scene);for(const record of records)for(const mesh of record.meshes)before.add(mesh);
  const baselineProvider=scene.getActiveMeshCandidates;scene.getActiveMeshCandidates=installed;
  const nativeDraws=[];let recordDraws=true,geometryBefore;
  for(const source of scene.meshes){if(!source.getTotalVertices()||source instanceof InstancedMesh)continue;const process=source._processRendering;
   source._processRendering=function(mesh,sub,effect,fill,batch,...rest){
    if(!recordDraws)return process.call(this,mesh,sub,effect,fill,batch,...rest);
    const result=process.call(this,mesh,sub,effect,fill,batch,...rest),instances=batch.visibleInstances?.[sub._id]??[],self=!!batch.renderSelf?.[sub._id],data=batch.parent?.instancesData;
    const matrices=data?Array.from(data.subarray(0,(instances.length+(self?1:0))*16)):instances.map(instance=>Array.from(instance.getWorldMatrix().m));
    nativeDraws.push({pass:engine.currentRenderPassId===world.shadows.getShadowMap().renderPassId?'shadow':'main',source:source.uniqueId,geometry:source.geometry?.uniqueId,sub:sub._id,indexStart:sub.indexStart,indexCount:sub.indexCount,verticesStart:sub.verticesStart,verticesCount:sub.verticesCount,effect:effect?.uniqueId,fill,self,instances:instances.map(instance=>instance.uniqueId),matrixSha:sha(JSON.stringify(matrices))});return result;
   };
  }
  const samples=[];
  for(const [view,alpha]of [['fixed-front',1.2],['fixed-reverse',1.2+Math.PI]]){
   // The live ink selector otherwise runs every150ms. Freeze its scheduling
   // clock within the paired renders so inspector overhead cannot change ink
   // selection between baseline/new. CPU reference timing uses hrtime instead.
   pinClock(nativeNow()+1000);
   world.camera.alpha=alpha;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.lighting.follow(player,true);
   world.villageVisibility.timer=0;world.villageVisibility.shadowTimer=0;world.villageVisibility.update(world.camera.globalPosition,player,.1);for(let warm=0;warm<3;warm++)scene.render();
   // Native PBR may create absent backdrop normals on its first warm draw.
   // Compare the fully warmed streams for every subsequent A/B render.
   geometryBefore??=geometryProof();
   const classifications=classify(records),triplet=[];
   for(const [name,provider]of [['baseline',baselineProvider],['new',installed],['baseline-repeat',baselineProvider]]){
    scene.getActiveMeshCandidates=provider;const candidateList=provider(),candidateTypes={};for(let index=0;index<candidateList.length;index++)sum(candidateTypes,candidateList.data[index].getClassName());
    nativeDraws.length=0;await post('Profiler.takePreciseCoverage');const start=process.hrtime.bigint();scene.render();const cpuReferenceMs=Number(process.hrtime.bigint()-start)/1e6,counts=calls(await post('Profiler.takePreciseCoverage'));
    const active=scene.getActiveMeshes(),snapshot={active:active.data.slice(0,active.length).map(mesh=>mesh.uniqueId),draws:structuredClone(nativeDraws)};
    triplet.push({name,candidateCount:candidateList.length,candidateTypes,readiness:counts,cpuReferenceMs,snapshot});
   }
   assert.ok(triplet[0].snapshot.draws.some(draw=>draw.pass==='main'),map+' must actually draw main geometry');assert.ok(triplet[0].snapshot.draws.some(draw=>draw.pass==='shadow'),map+' must actually draw shadow geometry');
   assert.deepEqual(triplet[1].snapshot,triplet[0].snapshot,map+' '+view+' new provider must preserve active order and every actual main/shadow native draw batch');assert.deepEqual(triplet[2].snapshot,triplet[0].snapshot,map+' '+view+' repeated baseline controls must be stable');
   assert.ok(triplet[0].readiness.meshIsReady>0&&triplet[0].readiness.instanceIsReady>0,'precise coverage must observe actual readiness calls');assert.ok(triplet[1].readiness.meshIsReady<=triplet[0].readiness.meshIsReady);assert.equal(triplet[1].readiness.instanceIsReady,triplet[0].readiness.instanceIsReady);
   for(const key of ['meshGetLOD','instanceGetLOD','meshPreActivate','instancePreActivate'])assert.equal(triplet[1].readiness[key],triplet[0].readiness[key],key+' must retain source/LOD lifecycle calls');
   // Separate CPU reference samples from function-count/draw-capture overhead.
   // Keep both the camera and scheduling clock fixed, and retain noisy raw
   // min/median/max rather than interpreting this desktop run as phone FPS.
   await post('Profiler.stopPreciseCoverage');recordDraws=false;const queryTimes={baseline:[],new:[]},renderTimes={baseline:[],new:[]},activeTimes={baseline:[],new:[]};
   for(let pair=0;pair<32;pair++)for(const [name,provider]of pair%2?[['new',installed],['baseline',baselineProvider]]:[['baseline',baselineProvider],['new',installed]]){
    scene.getActiveMeshCandidates=provider;let start=process.hrtime.bigint();for(let query=0;query<25;query++)provider();queryTimes[name].push(Number(process.hrtime.bigint()-start)/1e6/25);
    start=process.hrtime.bigint();scene.render();renderTimes[name].push(Number(process.hrtime.bigint()-start)/1e6);activeTimes[name].push(activeCpuMs);
   }
   recordDraws=true;await post('Profiler.startPreciseCoverage',{callCount:true,detailed:false});
   samples.push({view,camera:{alpha:world.camera.alpha,beta:world.camera.beta,radius:world.camera.radius,target:Array.from(world.camera.target.asArray())},classification:classifications,stats:{baseline:{...before.stats},new:{...stats}},results:triplet.map(row=>({name:row.name,candidates:row.candidateCount,candidateTypes:row.candidateTypes,readiness:row.readiness,cpuReferenceMs:row.cpuReferenceMs,activeCount:row.snapshot.active.length,mainBatches:row.snapshot.draws.filter(draw=>draw.pass==='main').length,shadowBatches:row.snapshot.draws.filter(draw=>draw.pass==='shadow').length,mainInstances:row.snapshot.draws.filter(draw=>draw.pass==='main').reduce((sum,draw)=>sum+draw.instances.length,0),shadowInstances:row.snapshot.draws.filter(draw=>draw.pass==='shadow').reduce((sum,draw)=>sum+draw.instances.length,0),snapshotSha256:sha(JSON.stringify(row.snapshot))})),cpuReferenceWithoutCoverage:{candidateQueryMs:{baseline:referenceStats(queryTimes.baseline),new:referenceStats(queryTimes.new)},activeEvaluationIncludingProviderMs:{baseline:referenceStats(activeTimes.baseline),new:referenceStats(activeTimes.new)},sceneRenderMs:{baseline:referenceStats(renderTimes.baseline),new:referenceStats(renderTimes.new)},rawSamples:{queryTimes,activeTimes,renderTimes},scope:'Node CPU only;32alternating-order samples, each candidate query sample averages25calls. Active evaluation uses exact Babylon before/after-active observables, including candidate-provider work. No coverage or draw recording inside these timing samples.'},activeOrderAndAllBatchFieldsEqual:true});
  }
  assert.deepEqual(geometryProof(),geometryBefore,'all actual geometry position/normal/UV/index stream values stay exact across A/B');
  scene.getActiveMeshCandidates=installed;before.dispose();rows.push({map,character,position:[x,z],plainsDistance:world.plainsViewDistance,geometryLod:world.environment.loadedLods,geometryStreamsSha256:sha(JSON.stringify(geometryBefore)),geometryStreamsUnchanged:true,samples});await world.releaseEnvironment();assert.equal(scene.getActiveMeshCandidates,native,'map release restores the prior candidate owner');console.log('verified '+map);
 }
 assert.deepEqual(Object.fromEntries(ownedSources.map(path=>[path,sha(readFileSync(new URL('../../'+path,import.meta.url)))])),sourceHashes,'runtime sources must remain frozen during the A/B run');
 const output={baseline,passed:rows.length===4,sourceHashes,sceneReuse:true,models:Object.fromEntries(modelFiles),modelCount:modelFiles.size,rows,comparison:'Same engine, same scene, same actual packed map geometry and all authoritative layouts. Per fixed camera baseline c65e731/new/baseline-repeat, no admissions or camera movement inside a triplet. Scheduling clock is pinned so the150ms ink selector cannot change between the paired draws. Public native method identity remains untouched; V8 precise function coverage counts isReady calls.',limitations:['NullEngine does not measure GPU time, physical-device FPS, input latency, thermal state or visual quality.','Actual shipped geometry/LOD/UV/vertex streams, native instances and real world light/shadow/cull setup are used. Downloaded textures and material image decoding are replaced with1x1 opaque PBR albedo fixtures; no player/boss asset is added to this map-only comparison.','Triplet CPU timings include V8 precise-coverage and draw-recording overhead; separate reference timings disable both, but remain noisy desktop CPU observations and cannot predict phone FPS.','A complete rendered batch equality includes main and shadow sources, geometry ids, primitive ranges, instance order, instance matrix hashes and actual Effect ids.']};
 writeFileSync(new URL('four-map-ab-validation.json',folder),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({passed:output.passed,maps:rows.length,views:rows.reduce((sum,row)=>sum+row.samples.length,0),models:modelFiles.size,report:'four-map-ab-validation.json'}));
}finally{unpinClock();await post('Profiler.stopPreciseCoverage');session.disconnect();scene.dispose();engine.dispose();globalThis.fetch=originalFetch;}
