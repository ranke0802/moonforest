import {readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,PBRMaterial,Vector3,InstancedMesh,Mesh,Node} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {loadStreamedVillage} from '../../src/village-streamed-environment.js';
import {readMapContainer} from '../../src/map-container.js';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import '@babylonjs/loaders/glTF/index.js';
const base=new URL('../../public/assets/',import.meta.url),maps=[['warrior-v3','village',0,6],['warrior-plains','great-plains',-87,-32],['warrior-v4','monster-forest',0,45],['warrior-v5','witch-cave',-42,43]];
globalThis.location={href:'https://audit.test/game/'}; globalThis.fetch=async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base)));
const engine=new NullEngine({renderWidth:900,renderHeight:450});engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});engine.getCaps().instancedArrays=true;
const world=createWorld(engine,{village:true,touchDevice:true}),scene=world.scene;scene.defaultMaterial;scene.getOutlineRenderer();caveFogFallback(scene).getInternalTexture().isReady=true;
const loadContainer=async(model,target,options)=>{const source=new URL('content/'+model.pathname.split('/').at(-1),base),{gltf,files}=await readRuntimeGltf(source);for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');const container=await readMapContainer(target,gltf,'',{skipMaterials:true,...options});const material=new PBRMaterial('fixture-'+model.pathname,target);container.materials.push(material);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;return container;};
const previousReady=InstancedMesh.prototype.isReady,previousMeshReady=Mesh.prototype.isReady;let ready=0,meshReady=0;InstancedMesh.prototype.isReady=function(...args){ready++;return previousReady.apply(this,args);};Mesh.prototype.isReady=function(...args){meshReady++;return previousMeshReady.apply(this,args);};
const rows=[];
for(const [character,map,x,z] of maps){
 console.log('start',map);replaceWorldMap(world,character);let p=new Vector3(x,world.terrain.heightAt(x,z),z);world.camera.setTarget(p.add(new Vector3(0,1,0)));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();world.caveFog?.update(p,0,{force:true});for(const tex of scene.textures)if(tex.getInternalTexture())tex.getInternalTexture().isReady=true;await loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer});
 for(const tex of scene.textures)if(tex.getInternalTexture())tex.getInternalTexture().isReady=true;world.villageVisibility.update(world.camera.globalPosition,world.camera.target,.1);
 console.log('loaded',map);const filtered=scene.getActiveMeshCandidates;
 // Wrapper's baseline is the provider installed before the streamed environment.
 const instanceSet=new WeakSet(world.villageRenderRecords.flatMap(r=>r.meshes));const oldData=[],oldResult={data:oldData,length:0};const baseline=()=>{oldData.length=0;for(const m of scene.meshes)if(!(instanceSet.has(m)&&m instanceof InstancedMesh&&m.isEnabled===Node.prototype.isEnabled&&m.isReady===InstancedMesh.prototype.isReady&&!m.isEnabled()))oldData.push(m);oldResult.length=oldData.length;return oldResult;};
 for(let i=0;i<10;i++)scene.render();let samples=[];
 for(let i=0;i<30;i++)for(const [name,provider] of (i%2?[['filtered',filtered],['baseline',baseline]]:[['baseline',baseline],['filtered',filtered]])){
  scene.getActiveMeshCandidates=provider;ready=0;meshReady=0;const start=performance.now();scene.render();const ms=performance.now()-start;const active=scene.getActiveMeshes();samples.push({name,ms,ready,meshReady,active:active.data.slice(0,active.length).map(m=>m.uniqueId)});
 }
 for(let i=0;i<samples.length;i+=2)if(JSON.stringify(samples[i].active)!==JSON.stringify(samples[i+1].active))throw Error(map+' active mismatch');
 const avg=name=>{const s=samples.filter(v=>v.name===name);return {instanceReadyCalls:s.reduce((n,v)=>n+v.ready,0)/s.length,meshReadyCalls:s.reduce((n,v)=>n+v.meshReady,0)/s.length,sceneMsMedian:s.map(v=>v.ms).sort((a,b)=>a-b)[Math.floor(s.length/2)]};};
 console.log('sampled',map);scene.getActiveMeshCandidates=filtered;const list=scene.getActiveMeshCandidates();const classes={};for(let i=0;i<list.length;i++){const m=list.data[i];const key=[m.getClassName(),m.isEnabled()?'enabled':'disabled',m.isVisible?'visible':'hidden',m.getTotalVertices()>0?'geometry':'empty'].join('/');classes[key]=(classes[key]??0)+1;} rows.push({map,classes,stats:{...world.environment.activeMeshCandidates},baseline:avg('baseline'),filtered:avg('filtered'),activeMatch:true});await world.releaseEnvironment();
}
InstancedMesh.prototype.isReady=previousReady;Mesh.prototype.isReady=previousMeshReady;scene.dispose();engine.dispose();const output={scope:'Babylon NullEngine, real map layouts and decoded packed geometry, placeholder materials; baseline reproduces prior instance filter, 30 alternating warm samples, render CPU includes candidate scan. Not GPU, phone, or FPS measurements.',rows};writeFileSync(new URL('classify.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
