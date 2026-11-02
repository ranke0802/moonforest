import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {accessorBytes} from './pack-mourning-elena-v2-1.mjs';
import {instantiateBossModel} from '../src/boss-models.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
import {hash} from './resource-pack.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/mourning-50k-2026-11-02');
const report=JSON.parse(readFileSync(resolve(out,'candidate-report.json'),'utf8')),config=JSON.parse(readFileSync(existsSync(resolve(out,'manifest-before.json'))?resolve(out,'manifest-before.json'):resolve(root,'public/assets/mourning-elena.json'),'utf8'));
const source=await readRuntimeGltf(pathToFileURL(resolve(root,'public/assets',config.model))),candidate=await readRuntimeGltf(pathToFileURL(resolve(out,'candidate',report.candidate.model)));
const retainedBytes=readFileSync(resolve(out,'retained-vertices.u32')),retained=new Uint32Array(retainedBytes.buffer.slice(retainedBytes.byteOffset,retainedBytes.byteOffset+retainedBytes.byteLength));
assert.deepEqual(candidate.gltf.nodes,source.gltf.nodes);
assert.deepEqual(candidate.gltf.materials,source.gltf.materials);
assert.deepEqual(candidate.gltf.images,source.gltf.images);
assert.equal(candidate.gltf.animations.length,source.gltf.animations.length);
let exactClipStreams=0;
for(let i=0;i<source.gltf.animations.length;i++){
 const a=source.gltf.animations[i],b=candidate.gltf.animations[i];assert.equal(a.name,b.name);assert.deepEqual(a.channels,b.channels);
 for(let k=0;k<a.samplers.length;k++){const x=a.samplers[k],y=b.samplers[k];assert.equal(x.interpolation,y.interpolation);for(const f of ['input','output']){assert.ok(accessorBytes(source,x[f]).equals(accessorBytes(candidate,y[f])));exactClipStreams++;}}
}
for(let i=0;i<source.gltf.skins.length;i++){const a=source.gltf.skins[i],b=candidate.gltf.skins[i];assert.deepEqual(a.joints,b.joints);assert.equal(a.skeleton,b.skeleton);assert.ok(accessorBytes(source,a.inverseBindMatrices).equals(accessorBytes(candidate,b.inverseBindMatrices)));}
const chunks=[];let byteOffset=0;
function put(data,type='float32'){const a=type==='uint32'?Uint32Array.from(data):Float32Array.from(data),b=Buffer.from(a.buffer);const info={byteOffset,byteLength:b.length,count:a.length,type};chunks.push(b);byteOffset+=b.length;return info;}
const validation={source:report.source,candidate:report.candidate,texture:report.texture,scope:'Isolated CPU-deformed comparison using current game animator; no browser automation, no deployment, no GPU performance claim.',clips:source.gltf.animations.map(a=>a.name),exactAnimationStreams:exactClipStreams,skinMatricesAndJointsExact:true,samples:[],models:[]};
const baselinePoses=new Map();
for(const [label,input]of [['original',source],['candidate',candidate]]){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const json=structuredClone(input.gltf);for(const k of ['extensionsUsed','extensionsRequired'])json[k]=(json[k]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const b of json.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+input.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json},'');
 const asset=instantiateBossModel(container),actor=new TransformNode('candidate-review',scene),carrier=new TransformNode('candidate-center',scene);
 carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
 const poseNodes=orderPoseNodes([...asset.meshes,...asset.transformNodes]),animator=new MourningElenaAnimator(asset,config,actor),body=asset.meshes.filter(m=>m.getTotalVertices());
 const model={label,meshes:body.map(m=>({name:m.name,vertices:m.getTotalVertices(),triangles:m.getTotalIndices()/3,indices:put(m.getIndices(),'uint32'),uv:put(m.getVerticesData(VertexBuffer.UVKind)??new Float32Array(m.getTotalVertices()*2)),material:input.gltf.materials[input.gltf.meshes[input.gltf.nodes.find(n=>n.name===m.name).mesh].primitives[0].material]?.name})),poses:[]};
 const v=new Vector3(),n=new Vector3();
 function capture(name){
  actor.computeWorldMatrix(true);carrier.computeWorldMatrix(true);refreshPoseMatrices(poseNodes);for(const s of asset.skeletons)s.prepare(true);
  const meshPoses=[],stats={model:label,pose:name,maximumRetainedVertexDifference:0};
  for(const m of body){
   const world=m.computeWorldMatrix(true),p=m.getPositionData(true,true),normals=m.getNormalsData(true,true),wp=new Float32Array(p.length),wn=new Float32Array(normals.length);
   for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(p[i],p[i+1],p[i+2],world,v);Vector3.TransformNormalFromFloatsToRef(normals[i],normals[i+1],normals[i+2],world,n);n.normalize();wp.set([v.x,-v.z,v.y],i);wn.set([n.x,-n.z,n.y],i);}
   assert.ok(wp.every(Number.isFinite));assert.ok(wn.every(Number.isFinite));
   const key=name+'/'+m.name;if(label==='original')baselinePoses.set(key,wp);else{
    const original=baselinePoses.get(key),isBody=m.name==='Elina_Chimera_Skin';
    for(let i=0;i<wp.length/3;i++){const old=isBody?retained[i]:i;for(let k=0;k<3;k++)stats.maximumRetainedVertexDifference=Math.max(stats.maximumRetainedVertexDifference,Math.abs(wp[i*3+k]-original[old*3+k]));}
   }
   meshPoses.push({name:m.name,positions:put(wp),normals:put(wn),enabled:m.isEnabled()});
  }
  if(label==='candidate')assert.ok(stats.maximumRetainedVertexDifference<.00001,name+' skin/morph deformation mismatch');
  validation.samples.push(stats);model.poses.push({name,meshes:meshPoses});
 }
 function walk(seconds){animator.transition('walk');for(let i=0;i<Math.round(seconds*60);i++)animator.update(1/60);}
 animator.reset();for(let i=0;i<30;i++)animator.update(1/60);capture('idle');walk(.5);capture('walk');
 for(let cycle=0;cycle<3;cycle++){
  const variant=['cast','cast_slam','cast_alternate'][cycle];
  for(let i=1;i<=180;i++){animator.transition(variant,{clipTime:i/60,actionId:cycle+1});animator.update(1/60);if(i===72||i===108)capture(variant+'-'+i);}
  walk(.5);capture(variant+'-return');
 }
 animator.transition('dead',{actionId:99});for(let i=1;i<=312;i++){animator.update(1/60);if([45,120,312].includes(i))capture('death-'+i);}
 validation.models.push(model);animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
}
validation.binary='posed-geometry.bin';validation.bytes=byteOffset;
writeFileSync(resolve(out,validation.binary),Buffer.concat(chunks));writeFileSync(resolve(out,'motion-validation.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({clips:validation.clips.length,exactAnimationStreams:exactClipStreams,samplesPerModel:validation.models[0].poses.length,maxRetainedVertexError:Math.max(...validation.samples.map(s=>s.maximumRetainedVertexDifference)),bytes:byteOffset}));
