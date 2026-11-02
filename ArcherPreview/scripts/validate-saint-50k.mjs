import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,FreeCamera,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {accessorBytes} from './pack-mourning-elena-v2-1.mjs';
import {instantiateBossModel} from '../src/boss-models.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {CharacterAnimator} from '../src/animation.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/saint-50k-2026-11-02'),r=JSON.parse(readFileSync(resolve(out,'candidate-report.json'),'utf8')),config=JSON.parse(readFileSync(resolve(out,'manifest-before.json'),'utf8'));
const original=await readRuntimeGltf(pathToFileURL(resolve(root,'public/assets',config.model))),candidate=await readRuntimeGltf(pathToFileURL(resolve(out,'candidate',r.candidate.model)));
const rb=readFileSync(resolve(out,'retained-vertices.u32')),retained=new Uint32Array(rb.buffer.slice(rb.byteOffset,rb.byteOffset+rb.byteLength));
for(const key of ['nodes','materials','images','skins','animations'])assert.deepEqual(original.gltf[key],candidate.gltf[key],key);
const g=original.gltf,h=candidate.gltf,p=g.meshes[0].primitives[0],q=h.meshes[0].primitives[0];
for(const key of Object.keys(p.attributes)){const a=accessorBytes(original,p.attributes[key]),b=accessorBytes(candidate,q.attributes[key]),stride=a.length/g.accessors[p.attributes[key]].count;for(let i=0;i<retained.length;i++)assert.ok(a.subarray(retained[i]*stride,(retained[i]+1)*stride).equals(b.subarray(i*stride,(i+1)*stride)),key+'/'+i);}
let animationStreams=0;for(const a of g.animations)for(const s of a.samplers)for(const key of ['input','output']){assert.ok(accessorBytes(original,s[key]).equals(accessorBytes(candidate,s[key])));animationStreams++;}
const chunks=[];let offset=0;const put=(values,type='float32')=>{const a=type==='uint32'?Uint32Array.from(values):Float32Array.from(values),b=Buffer.from(a.buffer),v={byteOffset:offset,byteLength:b.length,count:a.length,type};chunks.push(b);offset+=b.length;return v;};
const report={source:r.source,candidate:r.candidate,texture:r.texture,animationStreams,models:[],samples:[],binary:'posed-geometry.bin',scope:'Current CharacterAnimator + Babylon CPU skinning, same 1.7m actor scale; isolated unshipped candidate, not mobile GPU testing.'};
const sourcePoses=new Map();
for(const [label,input]of [['original',original],['candidate',candidate]]){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('review',new Vector3(0,1,5),scene);
 const json=structuredClone(input.gltf);for(const k of ['extensionsUsed','extensionsRequired'])json[k]=(json[k]??[]).filter(x=>x!=='EXT_meshopt_compression');for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+input.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json},''),asset=instantiateBossModel(container),actor=new TransformNode('saint-review',scene);actor.scaling.setAll(config.scale);for(const n of new Set([...asset.meshes,...asset.transformNodes]))if(!n.parent)n.parent=actor;
 const animator=new CharacterAnimator(asset.animationGroups,config.animations),nodes=orderPoseNodes([...asset.meshes,...asset.transformNodes]),body=asset.meshes.filter(m=>m.getTotalVertices());
 const model={label,meshes:body.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,indices:put(m.getIndices(),'uint32'),uv:put(m.getVerticesData(VertexBuffer.UVKind))})),poses:[]};let actionId=0;
 for(const state of Object.keys(config.animations)){
  const duration=animator.durations[state];
  for(const phase of [.25,.55,.85]){
   animator.transition(state,{clipTime:duration*phase,actionId:++actionId,loop:false});animator.update(.2);scene._animate(0);actor.computeWorldMatrix(true);refreshPoseMatrices(nodes);for(const s of asset.skeletons)s.prepare(true);
   const name=state+'-'+Math.round(phase*100),pose={name,meshes:[]};let maxError=0;
   for(const m of body){const p=m.getPositionData(true,true),n=m.getNormalsData(true,true),world=m.computeWorldMatrix(true),wp=new Float32Array(p.length),wn=new Float32Array(n.length),v=new Vector3(),normal=new Vector3();for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(p[i],p[i+1],p[i+2],world,v);Vector3.TransformNormalFromFloatsToRef(n[i],n[i+1],n[i+2],world,normal);normal.normalize();wp.set([v.x,-v.z,v.y],i);wn.set([normal.x,-normal.z,normal.y],i);}assert.ok(wp.every(Number.isFinite));if(label==='original')sourcePoses.set(name,wp);else{const before=sourcePoses.get(name);for(let i=0;i<retained.length;i++)for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(wp[i*3+k]-before[retained[i]*3+k]));assert.ok(maxError<1e-5,name+' deformation');}pose.meshes.push({name:m.name,positions:put(wp),normals:put(wn),enabled:true});}
   model.poses.push(pose);report.samples.push({model:label,pose:name,maxRetainedVertexDifference:maxError});
  }
 }
 report.models.push(model);animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
}
writeFileSync(resolve(out,report.binary),Buffer.concat(chunks));writeFileSync(resolve(out,'motion-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({posesPerModel:report.models[0].poses.length,animationStreams,maxRetainedVertexDifference:Math.max(...report.samples.map(s=>s.maxRetainedVertexDifference)),bytes:offset}));
