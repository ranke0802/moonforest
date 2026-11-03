import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3,AssetContainer,MeshBuilder,PBRMaterial,HemisphericLight} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createQuestProps} from '../src/chapter-quest-props.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};},tick=()=>new Promise(r=>setTimeout(r,0));
const profile={model:'model.gltf',resources:['model.gltf','model.bin']};
const assets={a:{height:1,bounds:[1,1,1],lods:[profile,profile,profile]},b:{height:1,bounds:[1,1,1],lods:[profile,{...profile,model:'b.gltf'},profile]}};
function fixture(t,options={}){
 const engine=new NullEngine({renderWidth:800,renderHeight:400});engine.getCaps().instancedArrays=true;
 const scene=new Scene(engine),camera=new ArcRotateCamera('c',-.8,.9,12,new Vector3(2,0,3),scene);new HemisphericLight('light',Vector3.Up(),scene);
 // Real WebGL completes this existing fallback upload; NullEngine needs it
 // signalled explicitly before the ink material's actual readiness check.
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const calls=[],world={scene,camera,lighting:{direction:Vector3.Up(),shadowsActive:false,registerMeshes:meshes=>calls.push(['register',...meshes])},terrain:{heightAt:()=>2},prefetchResources:async resources=>calls.push(['prefetch',resources]),touchDevice:true};
 const container=()=>{const a=new AssetContainer(scene),mesh=MeshBuilder.CreateBox('source',{},scene),material=new PBRMaterial('material',scene);material.transparencyMode=0;mesh.material=material;a.meshes.push(mesh);a.materials.push(material);a.removeAllFromScene();return a;};
 const props=createQuestProps(world,{baseUrl:new URL('https://quest.test/assets/quest-props.json'),readManifest:async()=>({assets}),loadContainer:async()=>{calls.push(['load']);return container();},...options});
 t.after(()=>{props.dispose();scene.dispose();engine.dispose();});return {engine,scene,camera,world,props,calls,container};
}
test('hidden and distant quest props perform no import; eligible models load serially and failed imports never spin',async t=>{
 const entered=deferred(),resume=deferred();let active=0,max=0,loads=0;
 const f=fixture(t,{loadContainer:async()=>{active++;max=Math.max(max,active);if(++loads===1){entered.resolve();await resume.promise;}active--;if(loads===2)throw Error('decode failed');return f.container();}});
 const points=[{id:'hidden',model:'a',x:2,z:3},{id:'far',model:'b',x:60,z:0}];await f.props.load(points);assert.equal(f.props.isReady(points[0]),false);assert.equal(f.props.isReady({model:null}),true);
 f.props.update(points,{x:2,z:3},()=>false);await f.props.whenIdle();assert.equal(loads,0);
 f.props.update(points,{x:2,z:3},()=>true);await entered.promise;assert.equal(loads,1);assert.equal(points[0].visual,undefined);
 points[1].x=3;f.props.update(points,{x:2,z:3},()=>true);assert.equal(loads,1);resume.resolve();await f.props.whenIdle();assert.equal(loads,2);assert.equal(max,1);assert.equal(points[0].visual.isEnabled(),true);assert.equal(f.props.isReady(points[0]),true);assert.equal(points[1].visual,undefined);assert.equal(f.props.isReady(points[1]),false);
 for(let i=0;i<100;i++)f.props.update(points,{x:2,z:3},()=>true);await f.props.whenIdle();assert.equal(loads,2);assert.equal(f.props.inspect().modelFailures,1);
});
test('24 flat annulus instances share one geometry and one real instanced marker submission',async t=>{
 const f=fixture(t),points=Array.from({length:24},(_,i)=>({id:'p'+i,x:2+(i%6)*.12,z:3+Math.floor(i/6)*.12}));await f.props.load(points);f.props.update(points,{x:2,z:3},()=>true);
 const source=points[0].marker.sourceMesh;assert.equal(source.getTotalIndices()/3,48);assert.equal(source.getTotalVertices(),48);assert.equal(f.scene.geometries.length,1);
 assert.ok(points.every(p=>p.marker.sourceMesh===source&&p.marker.geometry===source.geometry));assert.ok(points.every(p=>p.marker.isWorldMatrixFrozen));assert.equal(f.scene.meshes.includes(source),false);
 const draws=[],draw=f.engine.drawElementsType.bind(f.engine);f.engine.drawElementsType=(...a)=>{draws.push(a);return draw(...a);};f.scene.render();draws.length=0;f.scene.render();
 assert.equal(draws.length,1);assert.equal(draws[0][2],144);assert.equal(draws[0][3],24);assert.equal(f.scene.getActiveMeshes().length,24);
 const after={draws:draws.length,indexCount:draws[0][2],instances:draws[0][3]};f.props.update(points,{x:2,z:3},()=>false);
 const oldRings=points.map(p=>{const mesh=MeshBuilder.CreateTorus('old-marker',{diameter:.65,thickness:.025,tessellation:24},f.scene);mesh.position.copyFrom(p.marker.position);mesh.material=source.material;mesh.freezeWorldMatrix();return mesh;});f.scene.render();draws.length=0;f.scene.render();assert.equal(draws.length,24);assert.equal(oldRings[0].getTotalIndices()/3,1250);
 const report={case:'flat-shared-quest-markers',beforePerMarkerTriangles:oldRings[0].getTotalIndices()/3,afterPerMarkerTriangles:48,markers:24,beforeUniqueGeometries:new Set(oldRings.map(m=>m.geometry)).size,afterUniqueGeometries:1,beforeDraws:draws.length,after,limit:'NullEngine actual Babylon submission; driver/GPU time and phone FPS not measured.'};
 mkdirSync('reports/performance-density-2026-11-03',{recursive:true});writeFileSync('reports/performance-density-2026-11-03/regression-marker-after.json',JSON.stringify(report,null,2));
});
test('static props preserve authored geometry and placement while warming toon, cave/fog and ink before visibility',async t=>{
 const attached=[];let allow=false,loaded;
 const f=fixture(t,{loadContainer:async()=>{const a=f.container();loaded=a;const material=a.materials[0],ready=material.isReadyForSubMesh.bind(material);material.isReadyForSubMesh=(...args)=>allow&&ready(...args);return a;}});
 f.world.cave=true;f.world.caveAtmosphere={attachMaterial:material=>attached.push(['paint',material.getClassName()])};f.world.caveFog={allowsPoint:()=>true,attach:material=>attached.push(['fog',material.getClassName()])};
 const point={id:'treasure',model:'a',x:2,z:3,height:.6,scale:1.2,yaw:.4,tier:5};await f.props.load([point]);f.props.update([point],{x:2,z:3},()=>true);await tick();
 assert.equal(point.visual,undefined);assert.equal(loaded.materials[0].metadata.villageToon,true);assert.ok(f.calls.some(c=>c[0]==='register'));assert.deepEqual(attached,[['fog','StandardMaterial'],['paint','PBRMaterial'],['fog','PBRMaterial']]);
 allow=true;await f.props.whenIdle();const visual=point.visual,mesh=visual.getChildMeshes()[0],source=loaded.meshes[0];
 assert.equal(mesh.sourceMesh,source);assert.equal(mesh.geometry,source.geometry);assert.equal(visual.scaling.x,.72);assert.equal(visual.position.y,2);assert.equal(visual.rotation.y,.4);assert.equal(visual.isEnabled(),true);assert.equal(visual.isWorldMatrixFrozen,true);assert.equal(mesh.isWorldMatrixFrozen,true);
 assert.equal(f.scene.materials.find(m=>m.name==='quest-point-marker').emissiveColor.r,0);
 f.props.update([point],{x:60,z:60},()=>true);assert.equal(visual.isEnabled(),false);
});
test('the default owned glTF path cancels a real pending Meshopt import and forbids late geometry publication',async t=>{
 await MeshoptDecoder.ready;
 const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('quest-props.json',base))),model=new URL(manifest.assets.apple.lods[1].model,base),json=JSON.parse(readFileSync(model));
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,model)).toString('base64');
 delete json.materials;delete json.textures;delete json.images;delete json.samplers;json.extensionsRequired=json.extensionsRequired.filter(x=>x!=='KHR_texture_basisu');for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;
 const oldDecoder=MeshoptCompression._Default,oldFetch=globalThis.fetch,entered=deferred(),resume=deferred();let calls=0;
 MeshoptCompression._Default={decodeGltfBufferAsync:async(source,count,stride,mode,filter)=>{if(++calls===1){entered.resolve();await resume.promise;}const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,source,mode,filter);return out;}};
 globalThis.fetch=async()=>new Response(JSON.stringify(json));t.after(()=>{MeshoptCompression._Default=oldDecoder;globalThis.fetch=oldFetch;});
 const f=fixture(t,{readManifest:async()=>manifest,loadContainer:undefined}),point={id:'apple',model:'apple',x:2,z:3};await f.props.load([point]);f.props.update([point],point,()=>true);await entered.promise;
 assert.ok(calls>0);f.props.release();await f.props.whenIdle();await tick();assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.scene.meshes.length,0);assert.equal(f.scene.geometries.length,0);
 let creations=0;const create=f.engine.createVertexBuffer.bind(f.engine);f.engine.createVertexBuffer=(...a)=>{creations++;return create(...a);};resume.resolve();await tick();await tick();assert.equal(creations,0);assert.equal(point.visual,undefined);assert.equal(f.scene.getWaitingItemsCount(),0);
 await f.props.load([point]);f.props.update([point],point,()=>true);await f.props.whenIdle();const mesh=point.visual.getChildMeshes().find(m=>m.getTotalVertices()>0);assert.equal(mesh.getTotalVertices(),json.accessors[json.meshes[0].primitives[0].attributes.POSITION].count);assert.equal(mesh.getTotalIndices()/3,manifest.assets.apple.lods[1].triangles);assert.equal(mesh.geometry,mesh.sourceMesh.geometry);
 const report={case:'owned-quest-prop-cancel-real-meshopt',pendingAfterRelease:0,lateVertexCreations:0,retryTriangles:mesh.getTotalIndices()/3,retryVertices:mesh.getTotalVertices(),images:'Image/KTX boundary omitted; actual shipped Meshopt geometry and owned glTF loader used.'};writeFileSync('reports/performance-density-2026-11-03/regression-quest-cancel-after.json',JSON.stringify(report,null,2));
});
test('failed ink warmup leaves no source callbacks or records in the successful live outline',async t=>{
 const prepare=VillageOutlines.prototype.prepare,containers=[];let first=true,ink;
 VillageOutlines.prototype.prepare=async function(...args){ink=this;if(first){first=false;throw Error('ink preparation failure');}return prepare.apply(this,args);};t.after(()=>{VillageOutlines.prototype.prepare=prepare;});
 const f=fixture(t,{loadContainer:async()=>{const c=f.container();containers.push(c);return c;}}),points=[{id:'a',model:'a',x:2,z:3},{id:'b',model:'b',x:3,z:3}];
 const baseline={observers:f.scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,stage:f.scene._afterRenderingMeshStage.length};
 await f.props.load(points);f.props.update(points,{x:2,z:3},()=>true);await f.props.whenIdle();assert.equal(f.props.inspect().modelFailures,1);assert.equal(points[0].visual,undefined);assert.equal(points[1].visual.isEnabled(),true);
 assert.equal(containers[0].meshes.length,0);assert.equal(ink.entries.length,1);assert.equal(ink.sources.size,1);assert.equal(ink.baseObservers.length,1);assert.equal(f.scene.getWaitingItemsCount(),0);
 f.props.release();await tick();assert.equal(f.scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,baseline.observers);assert.equal(f.scene._afterRenderingMeshStage.length,baseline.stage);assert.equal(f.scene.meshes.length,0);assert.equal(f.scene.geometries.length,0);assert.equal(f.scene.getWaitingItemsCount(),0);
});
test('a permanently pending ink warmup times out once, then an independent model succeeds without a stale outline entry',async t=>{
 const prepare=VillageOutlines.prototype.prepare;let first=true,ink;
 VillageOutlines.prototype.prepare=async function(...args){ink=this;if(first){first=false;return new Promise(()=>{});}return prepare.apply(this,args);};t.after(()=>{VillageOutlines.prototype.prepare=prepare;});
 const f=fixture(t,{timeoutMs:80}),points=[{id:'a',model:'a',x:2,z:3},{id:'b',model:'b',x:3,z:3}];await f.props.load(points);f.props.update(points,{x:2,z:3},()=>true);await f.props.whenIdle();
 assert.equal(f.props.inspect().lastError.name,'TimeoutError');assert.equal(f.props.inspect().modelLoads,2);assert.equal(points[0].visual,undefined);assert.equal(points[1].visual.isEnabled(),true);assert.equal(ink.entries.length,1);assert.equal(ink.baseObservers.length,1);assert.equal(f.scene.getWaitingItemsCount(),0);
 for(let i=0;i<10;i++)f.props.update(points,{x:2,z:3},()=>true);await f.props.whenIdle();assert.equal(f.props.inspect().modelLoads,2);
 f.props.release();await tick();assert.equal(f.scene.meshes.length,0);assert.equal(f.scene.geometries.length,0);assert.equal(f.scene._afterRenderingMeshStage.length,0);assert.equal(f.scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,0);
});
