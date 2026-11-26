// Failure records for the 2026-11-26 MAP_MODEL_TIMEOUT (village-approach:0):
// error.modelWait names the await a streamed asset load was in and, for a shader
// wait, what was not ready at the deadline. Hypotheses (handoff 1126-load-stall):
// H1 BRDF LUT never ready, H2 PBR shader chunk import never settles,
// H4 linked program never reports completion, H3 the loader never reaches READY.
// Run with --expose-gc for the collection check in (d).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,PBRMaterial,Scene,MeshBuilder} from '@babylonjs/core';
import {PBRBaseMaterial} from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {prepareMapMaterials,mapMaterialWaitStats} from '../src/map-shader-cache.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';
import {loadingErrorRecord} from '../src/loading-view.js';
import {applyVillageToon} from '../src/village-toon.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';

{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}
const base=new URL('../public/assets/',import.meta.url);
const APPROACH='bc70ff9e9c809de821a746d2d364643ff29043ebbe236a20d5e520c81af94aa6.gltf';
const settle=(promise,ms)=>Promise.race([promise.then(v=>({state:'resolved',v}),e=>({state:'rejected',e})),new Promise(r=>setTimeout(()=>r({state:'pending'}),ms))]);
const tick=()=>new Promise(r=>setTimeout(r,0));

function primitivesOnly(value,path='modelWait'){
 if(value===null||['string','number','boolean'].includes(typeof value))return;
 assert.equal(typeof value,'object',path+' is a plain value');
 const proto=Object.getPrototypeOf(value);assert.ok(proto===Object.prototype||proto===Array.prototype,path+' is a plain object or array');
 for(const [key,item]of Object.entries(value))primitivesOnly(item,path+'.'+key);
}

// The plains with only the village-approach placements: the plan is that one asset, level 0.
function plains(t){
 const saved=globalThis.location;globalThis.location={href:'https://diag.test/game/moonforest-0.3.html?character=warrior-plains',search:'?character=warrior-plains'};t.after(()=>globalThis.location=saved);
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 const engine=new NullEngine(),world=createWorld(engine,{plains:true,village:true,touchDevice:false});t.after(()=>engine.dispose());
 engine.getCaps().instancedArrays=true; // as leak-probe.mjs: village placements draw as hardware instances
 world.placements=world.placements.filter(p=>p.asset==='village-approach');return {engine,world};
}
// Real approach geometry with a loader-like PBR colour material; `prepare` runs on it.
function approachContainer({prepare=()=>{},refs}={}){
 return async(model,scene,options={})=>{
  const name=model.pathname.split('/').at(-1),{gltf,files}=await readRuntimeGltf(new URL('content/'+name,base));
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  if(options.wait)options.wait.subStep='json';
  const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:name,lifetime:options.lifetime,wait:options.wait});
  const material=new PBRMaterial('ShellBakedColor',scene);material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;container.materials.push(material);
  for(const mesh of container.meshes)if(mesh.getTotalVertices()>0)mesh.material=material;
  // NullEngine leaves RawTextures (e.g. the cave-fog fallback sampler) unready; WebGL does not.
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  refs?.push(new WeakRef(material));prepare(scene,material);return container;
 };
}
const load=(world,loadContainer,ms=600)=>settle(loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer,modelTimeoutMs:ms}),20000);

test('H1: an unready BRDF LUT is reported at the materials step with brdf.internalReady=false and no effect',async t=>{
 const {world}=plains(t),refs=[];
 const result=await load(world,approachContainer({refs,prepare:scene=>{scene.environmentBRDFTexture.getInternalTexture().isReady=false;}}));
 assert.equal(result.state,'rejected');const error=result.e;
 assert.equal(error.code,'MAP_MODEL_TIMEOUT');assert.equal(error.assetId,'village-approach');assert.equal(error.level,0);
 const wait=error.modelWait;assert.equal(wait.step,'materials');assert.equal(wait.subStep,'ready');assert.ok(wait.stepMs>=0&&wait.totalMs>=wait.stepMs);
 assert.deepEqual(wait.loader,{views:4,viewsDone:4,images:0,imagesDone:0,textures:0,texturesReady:0});
 const m=wait.materials;assert.equal(m.pending,1);assert.deepEqual(m.brdf,{ready:false,internalReady:false,rgbd:true});
 assert.equal(m.subMeshes[0].material,'ShellBakedColor');assert.equal(m.subMeshes[0].class,'PBRMaterial');assert.deepEqual(m.subMeshes[0].plugins,['MoonforestVillageToon','MoonforestTreeCoverage']);
 assert.equal(m.subMeshes[0].effect,false,'PBR stops before creating an effect');assert.equal(m.parallelCompile,false);
 assert.equal(error.mapMaterialWait,undefined,'folded into modelWait');
 // (c) primitives only, survives the downloadable record unchanged
 primitivesOnly(wait);assert.deepEqual(JSON.parse(JSON.stringify(wait)),wait);
 const record=loadingErrorRecord(error);assert.deepEqual(record.modelWait,wait);assert.ok(JSON.stringify(record.modelWait).length<2000);
 // (d) the failed container's material is collectable while the error is still held
 // Babylon's Observable keeps its last notified value: scene.onMeshRemovedObservable holds the
 // last removed mesh (and its material) until the next removal, in the base tree too. Flush it.
 MeshBuilder.CreateBox('flush-last-removed',{},world.scene).dispose();
 if(typeof globalThis.gc==='function'){for(let i=0;i<4;i++){globalThis.gc();await tick();}assert.equal(refs[0].deref()===undefined,true,'failed material collected');}
 else t.diagnostic('gc not exposed: only the primitive walk above covers (d)');
});

test('H2: a PBR shader import that never settles reports an effect without a pipeline and a ready LUT',async t=>{
 const state=PBRBaseMaterial._ShaderLoader._webGL,saved={...state};t.after(()=>Object.assign(state,saved));
 Object.assign(state,{loaded:false,loadPromise:null,load:()=>[new Promise(()=>{})]});
 const {world}=plains(t);const result=await load(world,approachContainer());
 assert.equal(result.state,'rejected');const m=result.e.modelWait.materials;
 assert.equal(result.e.modelWait.step,'materials');assert.equal(m.brdf.internalReady,true);
 const row=m.subMeshes[0];assert.equal(row.effect,true);assert.equal(row.effectReady,false);assert.equal(row.pipeline,false);assert.equal(row.error,null);
 assert.ok(m.effectsNotReady>=1);assert.ok(m.effects.some(name=>/pbr/.test(name)),m.effects.join());
});

test('H4: a linked program that never reports completion has pipeline=true, pipelineReady=false, no error',async t=>{
 const {engine,world}=plains(t);
 const create=engine.createPipelineContext.bind(engine);
 engine.createPipelineContext=(...args)=>{const context=create(...args);context.isParallelCompiled=true;return context;};
 engine._isRenderingStateCompiled=()=>false;
 const result=await load(world,approachContainer());
 assert.equal(result.state,'rejected');const row=result.e.modelWait.materials.subMeshes[0];
 assert.equal(result.e.modelWait.step,'materials');assert.equal(row.effect,true);assert.equal(row.pipeline,true);assert.equal(row.pipelineReady,false);assert.equal(row.error,null);
});

test('H3: a decode that never answers is reported in the container step with loader counts',async t=>{
 const saved=MeshoptCompression._Default;t.after(()=>{MeshoptCompression._Default=saved;});
 MeshoptCompression._Default={decodeGltfBufferAsync:()=>new Promise(()=>{}),dispose(){}};
 const {world}=plains(t);
 const loadContainer=async(model,scene,options)=>{
  const name=model.pathname.split('/').at(-1),url=new URL('content/'+name,base),gltf=JSON.parse(readFileSync(url));
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+readFileSync(new URL(b.uri,url)).toString('base64');
  options.wait.subStep='json';
  return readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:name,lifetime:options.lifetime,wait:options.wait});
 };
 const result=await load(world,loadContainer);
 assert.equal(result.state,'rejected');const wait=result.e.modelWait;
 assert.equal(result.e.code,'MAP_MODEL_TIMEOUT');assert.equal(wait.step,'container');assert.equal(wait.subStep,'loader');
 assert.ok(wait.loader.views>wait.loader.viewsDone,JSON.stringify(wait.loader));assert.equal(wait.materials,undefined);
 primitivesOnly(wait);
});

test('outline wait: an ink ShaderMaterial whose sampler never readies is reported at the outlines step',async t=>{
 const {world}=plains(t);
 const result=await load(world,approachContainer({prepare:scene=>{for(const texture of scene.textures)if(texture.name==='cave-fog-inactive-sampler')texture.getInternalTexture().isReady=false;}}));
 assert.equal(result.state,'rejected');const wait=result.e.modelWait;
 assert.equal(wait.step,'outlines');assert.equal(wait.materials.subMeshes[0].class,'ShaderMaterial');assert.match(wait.materials.subMeshes[0].material,/^village-ink/);
 assert.equal(wait.materials.brdf.internalReady,true);primitivesOnly(wait);
});

test('(b) a successful load attaches nothing and builds no description',async t=>{
 const {world}=plains(t),before=mapMaterialWaitStats().descriptions;
 const result=await load(world,approachContainer(),5000);
 assert.equal(result.state,'resolved');assert.equal(world.environment.modelFailure,null);
 assert.equal(mapMaterialWaitStats().descriptions,before);
});

test('prepareMapMaterials: an AbortError release is not described; a timeout is, once, with at most six rows',async t=>{
 const engine=new NullEngine();t.after(()=>engine.dispose());const scene=new Scene(engine);
 const meshes=Array.from({length:8},(_,i)=>{const mesh=MeshBuilder.CreateBox('m'+i,{},scene),material=new PBRMaterial('p'+i,scene);mesh.material=material;applyVillageToon([mesh],{direction:{x:0,y:-1,z:0},shadowsActive:false});return mesh;});
 scene.environmentBRDFTexture.getInternalTexture().isReady=false;
 const released=new MapLoadLifetime({timeoutMs:45000});const before=mapMaterialWaitStats().descriptions;
 const pending=released.run(()=>prepareMapMaterials(meshes,{cancelled:()=>released.signal.aborted,signal:released.signal}));
 await tick();released.abort();await assert.rejects(pending,{name:'AbortError'});released.close();
 assert.equal(mapMaterialWaitStats().descriptions,before,'a release is not a failure');
 const timed=new MapLoadLifetime({timeoutMs:200});
 const result=await settle(timed.run(()=>prepareMapMaterials(meshes,{cancelled:()=>timed.signal.aborted,signal:timed.signal})),3000);timed.close();
 assert.equal(result.state,'rejected');assert.equal(mapMaterialWaitStats().descriptions,before+1);
 const m=result.e.mapMaterialWait;assert.equal(m.pending,8);assert.equal(m.subMeshes.length,6);primitivesOnly(m,'mapMaterialWait');
});
