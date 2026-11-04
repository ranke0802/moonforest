import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ArcRotateCamera,Color3,DirectionalLight,Effect,HemisphericLight,Mesh,MeshBuilder,NullEngine,PBRMaterial,Scene,ShadowGenerator,Skeleton,TransformNode,Vector2,Vector3} from '@babylonjs/core';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {prepareVillageInstanceAttributes} from '../src/village-instance-attributes.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {applyVillageToon} from '../src/village-toon.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {installVillageShadowFade} from '../src/village-shadow-fade.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const native=Mesh.prototype._processInstancedBuffers;
const digest=(data,count)=>createHash('sha256').update(Buffer.from(data.buffer,data.byteOffset,count*data.BYTES_PER_ELEMENT)).digest('hex');

async function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
 const camera=new ArcRotateCamera('camera',0,1.1,8,Vector3.Zero(),scene),key=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),shadows=new ShadowGenerator(256,key);
 new HemisphericLight('ambient',Vector3.Up(),scene);installVillageShadowFade(shadows);caveFogFallback(scene).getInternalTexture().isReady=true;
 const sources=[MeshBuilder.CreateBox('near',{size:2},scene),MeshBuilder.CreateBox('far',{size:1.8},scene)],roots=[],records=[];
 for(const source of sources){source.material=new PBRMaterial(source.name+'-paint',scene);source.isVisible=false;prepareVillageInstancing([source]);prepareTreeOcclusion([source]);applyVillageToon([source],{direction:Vector3.Up(),shadowsActive:true});}
 sources[0].addLODLevel(12,sources[1]);
 for(let i=0;i<6;i++){const root=new TransformNode('root-'+i,scene),mesh=sources[0].createInstance('placed-'+i);root.position.x=(i-2.5)*.55;mesh.parent=root;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();mesh.instancedBuffers.treeCoverage=1-i*.05;mesh.instancedBuffers.villageShadowFade=.5+i*.08;roots.push(root);records.push({root,meshes:[mesh],placement:{kind:'tree'}});shadows.addShadowCaster(mesh,false);}
 const ink=new VillageOutlines({scene,camera,shadows,touchDevice:true},records,{}),wrappers=new Map(sources.map(source=>[source,source._processInstancedBuffers]));
 await ink.prepare();for(const source of sources)await source.material.forceCompilationAsync(source,{useInstances:true});await shadows.forceCompilationAsync({useInstances:true});
 const draws=[],uploads=[];let context=null;
 const update=engine.updateDynamicVertexBuffer;
 engine.updateDynamicVertexBuffer=function(buffer,data,offset,length){
  if(context){let kind='world';for(const candidate in context.source._userInstancedBuffersStorage.data)if(context.source._userInstancedBuffersStorage.data[candidate]===data){kind=candidate;break;}uploads.push({pass:context.pass,kind,required:context.effect.getAttributesNames().includes(kind),bytes:length??data.byteLength});}
  return update.call(this,buffer,data,offset,length);
 };
 const observe=source=>{wrappers.set(source,source._processInstancedBuffers);const process=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,...args){
  const previous=context,pass=scene._isInIntermediateRendering()?'shadow':ink.drawing?'ink':'base';context={source,pass,effect};
  try{
   const result=process.call(this,mesh,sub,effect,fill,batch,...args),instances=batch.visibleInstances?.[sub._id]??[],self=!!batch.renderSelf?.[sub._id],count=instances.length+Number(self),storage=source._userInstancedBuffersStorage,attributes={};
   for(const kind in storage.strides)if(effect.getAttributesNames().includes(kind)){assert.ok(storage.renderPasses[engine.currentRenderPassId]?.[kind],pass+' must have its required '+kind+' VBO');attributes[kind]=digest(storage.data[kind],count*storage.strides[kind]);}
   draws.push({source:source.name,pass,count,self,instances:instances.map(mesh=>mesh.name),indices:[sub.indexStart,sub.indexCount],matrix:digest(batch.parent.instancesData,count*16),attributes});return result;
  }finally{context=previous;}
 };};for(const source of sources)observe(source);
 const capture=optimized=>{
  for(const [source,wrapper]of wrappers)source._processInstancedBuffers=optimized?wrapper:native;
  draws.length=uploads.length=0;scene.render();return {draws:structuredClone(draws),uploads:structuredClone(uploads)};
 };
 const refresh=()=>{ink.next=0;ink.update(1e12);ink.next=Infinity;};refresh();
 t.after(()=>{ink.dispose();scene.dispose();engine.dispose();});
 return {engine,scene,camera,shadows,sources,roots,records,ink,wrappers,capture,refresh,observe};
}

test('native base, shadow and ink retain exact active matrices/attribute bytes while omitting only unused uploads',async t=>{
 const f=await fixture(t);f.capture(true);f.capture(true);
 let beforeCalls=0,afterCalls=0;
 for(const radius of [8,18,8]){
  f.camera.radius=radius;f.camera.getViewMatrix();f.camera.getProjectionMatrix();f.refresh();
  f.capture(false);
  const before=f.capture(false),after=f.capture(true),repeat=f.capture(false);
  assert.deepEqual(after.draws,before.draws);assert.deepEqual(repeat.draws,before.draws);
  assert.ok(after.draws.some(draw=>draw.pass==='shadow'));assert.ok(after.draws.some(draw=>draw.pass==='ink'));
  assert.ok(after.uploads.every(upload=>upload.kind==='world'||upload.required));
  beforeCalls+=before.uploads.length;afterCalls+=after.uploads.length;
 }
 assert.ok(afterCalls<=beforeCalls*.6,`${beforeCalls} -> ${afterCalls} native buffer updates`);
 for(const source of f.sources)assert.deepEqual(Object.keys(source.instancedBuffers),['villageShadowFade','treeCoverage','villageInk']);
});

test('late tint/LOD/pass registration and changing instance membership read current native values',async t=>{
 const f=await fixture(t);f.capture(true);
 f.records[2].placement.tier=5;
 const root=new TransformNode('graded-root',f.scene),mesh=f.sources[0].createInstance('graded');mesh.parent=root;mesh.instancedBuffers.treeCoverage=.7;mesh.instancedBuffers.villageShadowFade=.8;mesh.computeWorldMatrix(true);
 f.ink.addRecords([{root,meshes:[mesh],placement:{kind:'ground-detail',tier:5}}]);await f.ink.prepare();f.refresh();
 for(const source of f.sources){source.instancedBuffers.villageInkTint=new Color3(.1,.2,.3);source.registerInstancedBuffer('unusedLate',1);source.instancedBuffers.unusedLate=17;for(const instance of source.instances)instance.instancedBuffers.unusedLate=23;}
 f.roots[1].setEnabled(false);f.records[3].meshes[0].instancedBuffers.treeCoverage=.47;f.records[4].meshes[0].instancedBuffers.villageShadowFade=.19;f.refresh();
 f.capture(false);const before=f.capture(false),after=f.capture(true);assert.deepEqual(after.draws,before.draws);assert.ok(after.draws.some(draw=>draw.attributes.villageInkTint));assert.ok(after.uploads.every(upload=>upload.kind!=='unusedLate'));
 const second=new ShadowGenerator(128,new DirectionalLight('second',new Vector3(.3,-1,.5),f.scene));installVillageShadowFade(second);second.addShadowCaster(f.records[0].meshes[0],false);await second.forceCompilationAsync({useInstances:true});
 f.capture(false);assert.deepEqual(f.capture(true).draws,f.capture(false).draws);second.dispose();
 const late=MeshBuilder.CreateBox('late-lod',{size:1.6},f.scene);late.material=new PBRMaterial('late-paint',f.scene);late.isVisible=false;prepareVillageInstancing([late]);prepareTreeOcclusion([late]);applyVillageToon([late],{direction:Vector3.Up(),shadowsActive:true});
 f.sources[0].addLODLevel(22,late);f.ink.sourceFor(f.sources[0],true);await f.ink.prepare([late]);await late.material.forceCompilationAsync(late,{useInstances:true});f.sources.push(late);f.observe(late);
 f.camera.radius=30;f.camera.getViewMatrix();f.camera.getProjectionMatrix();f.refresh();
 const cold=f.capture(true),reference=f.capture(false);assert.deepEqual(cold.draws,reference.draws);assert.ok(cold.draws.some(draw=>draw.source==='late-lod'));
});

test('unknown effect, external override, reentry, disposal and dynamic actors preserve native fallback',async t=>{
 const f=await fixture(t),source=f.sources[0],wrapper=f.wrappers.get(source),buffers=source.instancedBuffers,instance=f.records[0].meshes[0],effect=f.ink.material.getEffect();
 f.capture(false);
 const engineUpdate=f.engine.updateDynamicVertexBuffer;let uploads=0;
 f.engine.updateDynamicVertexBuffer=function(...args){uploads++;return engineUpdate.apply(this,args);};
 f.engine._currentEffect=null;source._processInstancedBuffers=wrapper;source._processInstancedBuffers([instance],false);assert.equal(uploads,Object.keys(buffers).length);
 uploads=0;f.engine._currentEffect=effect;source._processInstancedBuffers=function(...args){return wrapper.apply(this,args);};source._processInstancedBuffers([instance],false);assert.equal(uploads,Object.keys(buffers).length,'foreign method ownership falls back');
 source._processInstancedBuffers=wrapper;let nested=false;
 f.engine.updateDynamicVertexBuffer=function(...args){if(!nested){nested=true;source._processInstancedBuffers([instance],false);}return engineUpdate.apply(this,args);};source._processInstancedBuffers([instance],false);assert.equal(source.instancedBuffers,buffers);assert.ok(nested);
 f.engine.updateDynamicVertexBuffer=()=>{throw Error('driver failure');};assert.throws(()=>source._processInstancedBuffers([instance],false),/driver failure/);assert.equal(source.instancedBuffers,buffers);
 f.engine.updateDynamicVertexBuffer=engineUpdate;
 const dynamic=MeshBuilder.CreateBox('actor',{},f.scene);dynamic.skeleton=new Skeleton('actor-skeleton','actor-skeleton',f.scene);prepareVillageInstancing([dynamic]);assert.equal(dynamic._processInstancedBuffers,native);
 const foreign=MeshBuilder.CreateBox('foreign',{},f.scene),override=()=>42;foreign._processInstancedBuffers=override;prepareVillageInstancing([foreign]);assert.equal(foreign._processInstancedBuffers,override);
 const disposable=MeshBuilder.CreateBox('disposable',{},f.scene);prepareVillageInstancing([disposable]);const retained=disposable._processInstancedBuffers;disposable.dispose();assert.equal(disposable._processInstancedBuffers,native);assert.doesNotThrow(()=>retained.call(disposable,[],false));
 assert.equal(foreign._processInstancedBuffers(),42);assert.equal(source.instancedBuffers,buffers);
});

test('replaced storage or engine and a later prototype hook use the complete current native path',async t=>{
 const f=await fixture(t);f.capture(false);
 const source=f.sources[0],wrapper=f.wrappers.get(source),instance=f.records[0].meshes[0],buffers=source.instancedBuffers,userStorage=source._userInstancedBuffersStorage,instanceStorage=source._instanceDataStorage,getEngine=source.getEngine;
 source._processInstancedBuffers=wrapper;f.engine._currentEffect=f.ink.material.getEffect();
 const update=f.engine.updateDynamicVertexBuffer;let uploads=0;f.engine.updateDynamicVertexBuffer=function(...args){uploads++;return update.apply(this,args);};
 const verify=()=>{uploads=0;source._processInstancedBuffers([instance],false);assert.equal(uploads,Object.keys(buffers).length,'uncertain ownership processes all native attributes');assert.equal(source.instancedBuffers,buffers);};
 try{
  source._userInstancedBuffersStorage={...userStorage};verify();source._userInstancedBuffersStorage=userStorage;
  source._instanceDataStorage={...instanceStorage};verify();source._instanceDataStorage=instanceStorage;
  const facade=Object.create(f.engine);source.getEngine=()=>facade;verify();source.getEngine=getEngine;
  instanceStorage.engine=facade;verify();instanceStorage.engine=f.engine;
  let hooks=0;Mesh.prototype._processInstancedBuffers=function(...args){hooks++;return native.apply(this,args);};verify();assert.equal(hooks,1,'late external prototype hooks are honored');
 }finally{Mesh.prototype._processInstancedBuffers=native;source._userInstancedBuffersStorage=userStorage;source._instanceDataStorage=instanceStorage;source.getEngine=getEngine;instanceStorage.engine=f.engine;f.engine.updateDynamicVertexBuffer=update;}
 const replacement={...buffers};let changed=false;
 f.engine.updateDynamicVertexBuffer=function(...args){if(!changed){changed=true;source.instancedBuffers=replacement;}return update.apply(this,args);};
 source._processInstancedBuffers([instance],false);assert.equal(source.instancedBuffers,replacement,'a foreign replacement during processing is never overwritten');source.instancedBuffers=buffers;
});
