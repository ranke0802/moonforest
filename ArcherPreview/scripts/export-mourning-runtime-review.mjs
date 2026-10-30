import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/elena-two-phase');mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const samplerPath=resolve(root,'src/mourning-elena-animation.js'),samplerSha256=sha(readFileSync(samplerPath));
const config=JSON.parse(readFileSync(resolve(root,'public/assets/mourning-elena.json'),'utf8'));
const modelUrl=new URL(config.model,new URL('../public/assets/',import.meta.url)),source=await readRuntimeGltf(modelUrl),gltf=structuredClone(source.gltf);
for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const loader=new GLTFFileLoader();loader.skipMaterials=true;
const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
for(const group of container.animationGroups)group.stop();
const asset=instantiateBossModel(container),actor=new TransformNode('runtime-review-actor',scene),carrier=new TransformNode('runtime-review-center',scene);
carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale);actor.rotation.y=0;
for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
const allPoseNodes=orderPoseNodes([...asset.meshes,...asset.transformNodes]);
actor.computeWorldMatrix(true);carrier.computeWorldMatrix(true);refreshPoseMatrices(allPoseNodes);
const animator=new MourningElenaAnimator(asset,config,actor),body=asset.meshes.filter(m=>m.getTotalVertices());
const chunks=[];let offset=0;
function put(data,type){const array=type==='uint32'?Uint32Array.from(data):Float32Array.from(data),bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const row={byteOffset:offset,byteLength:bytes.length,count:array.length,type};chunks.push(bytes);offset+=bytes.length;return row;}
function rawHash(mesh){const hash=createHash('sha256');for(const kind of mesh.getVerticesDataKinds()){const a=mesh.getVerticesData(kind);hash.update(kind);hash.update(Buffer.from(Float32Array.from(a).buffer));}hash.update(Buffer.from(Uint32Array.from(mesh.getIndices()).buffer));return hash.digest('hex');}
const before=body.map(rawHash),meshes=body.map(mesh=>{const sourceNode=source.gltf.nodes.find(n=>n.name===mesh.name),sourceMesh=source.gltf.meshes[sourceNode.mesh],materialIndices=[...new Set(sourceMesh.primitives.map(p=>p.material))];return {name:mesh.name,vertices:mesh.getTotalVertices(),triangles:mesh.getTotalIndices()/3,subMeshes:mesh.subMeshes.length,sourceMaterialIndices:materialIndices,materialSlots:materialIndices.length,sourceMaterialNames:materialIndices.map(i=>source.gltf.materials[i].name),indices:put(mesh.getIndices(),'uint32'),uv:put(mesh.getVerticesData(VertexBuffer.UVKind),'float32')};});
assert.equal(meshes.reduce((n,m)=>n+m.triangles,0),143132);
const poses=[];
function capture(label){
  actor.computeWorldMatrix(true);carrier.computeWorldMatrix(true);refreshPoseMatrices(allPoseNodes);
  for(const skeleton of asset.skeletons)skeleton.prepare(true);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],p=new Vector3(),n=new Vector3();
  const exports=body.map(mesh=>{
    const world=mesh.computeWorldMatrix(true),positions=mesh.getPositionData(true,true),normals=mesh.getNormalsData(true,true),wp=new Float32Array(positions.length),wn=new Float32Array(normals.length);
    for(let i=0;i<positions.length;i+=3){
      Vector3.TransformCoordinatesFromFloatsToRef(positions[i],positions[i+1],positions[i+2],world,p);assert.ok(p.asArray().every(Number.isFinite));
      Vector3.TransformNormalFromFloatsToRef(normals[i],normals[i+1],normals[i+2],world,n);n.normalize();
      wp.set([p.x,-p.z,p.y],i);wn.set([n.x,-n.z,n.y],i);
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],p.asArray()[k]);max[k]=Math.max(max[k],p.asArray()[k]);}
    }
    return {name:mesh.name,positions:put(wp,'float32'),normals:put(wn,'float32')};
  });
  const bones=Object.fromEntries(asset.transformNodes.filter(n=>['DEF_Prayer_Hand.L','DEF_Prayer_Hand.R','DEF_FrontHand.L_Palm','DEF_Chest','DEF_Head'].includes(n.name)).map(n=>[n.name,n.getAbsolutePosition().asArray()]));
  poses.push({label,animator:animator.inspect(),boundsBabylon:{min,max},bones,meshes:exports});
}
function advanceWalk(seconds){animator.transition('walk');for(let i=0;i<Math.round(seconds*60);i++)animator.update(1/60);}
advanceWalk(.5);capture('walk-0p5');
let previous=0;
for(const seconds of [.6,1.2,1.8,3]){for(let i=Math.round(previous*60)+1;i<=Math.round(seconds*60);i++){animator.transition('cast',{clipTime:i/60,actionId:1});animator.update(1/60);}capture('cast-'+String(seconds).replace('.','p'));previous=seconds;}
advanceWalk(.5);capture('walk-return-0p5');
const after=body.map(rawHash);assert.deepEqual(after,before,'CPU deformation modified base geometry');
assert.equal(sha(readFileSync(samplerPath)),samplerSha256,'Runtime animator changed during capture');
const tri=meshes.reduce((n,m)=>n+m.triangles,0),sub=meshes.reduce((n,m)=>n+m.subMeshes,0);
const report={generatedAt:new Date().toISOString(),scope:'Actual MourningElenaAnimator CPU morph + skin deformation, then mesh world transform; offline Blender rasterization only, not Babylon GPU shader validation.',samplerSha256,sourceModelSha256:config.sourceSha256,runtimeModelSha256:sha(readFileSync(modelUrl)),rightHanded:true,config:{scale:config.scale,height:config.height,centerOffset:config.centerOffset,sourceCenter:config.sourceCenter},method:{api:'mesh.getPositionData(true, true), mesh.getNormalsData(true, true)','verifiedOrder':'ApplyMorph -> skeleton.getTransformMatrices(mesh) / ApplySkeleton -> world matrix','matrixRefresh':'parent-ordered refreshPoseMatrices, skeleton.prepare(true), mesh.computeWorldMatrix(true)','coordinateConversion':'Babylon RH x,y,z -> Blender x,-z,y','texture':'asset-source-texture-0.png, exact decoded source JPEG','materialLoad':'skipMaterials: true in NullEngine to avoid image decoding; source material index/UV preserved and supplied to Blender separately','clocks':'60Hz walk0.5; cast0.6/1.2/1.8/3.0; return walk0.5; gaitRate2'},meshes,poses,sourceImmutable:{baseVertexBuffersAndIndicesEqual:true,before,after,allPackedSourceBufferBytesEqual:'See asset-pack-report.json; 945 source views verified',samplerUnchangedDuringCapture:true},passPrediction:{visibleBodyMeshes:body.length,sourceMaterials:source.gltf.materials.length,sourceMaterialNames:source.gltf.materials.map(m=>m.name),bodyDraws:sub,bodyTriangles:tri,outlineDraws:sub,outlineTriangles:tri,shadowDrawsPerMapPass:sub,shadowTrianglesPerMapPass:tri,drawsForBodyOutlineOneShadowMap:sub*3,submittedTrianglesForBodyOutlineOneShadowMap:tri*3,contactPatchDraws:1,contactPatchTriangles:2,note:'Prediction from source submeshes and current attachCharacterOutlines/BossEncounter; assumes all three visible and one shadow-map pass. Extra cascades/lights, culling, hit overlays, and engine material passes may change actual GPU draw counts. No measured GPU claim.'},binary:'runtime-review-geometry.bin'};
writeFileSync(resolve(out,report.binary),Buffer.concat(chunks));writeFileSync(resolve(out,'runtime-review-poses.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({samplerSha256,meshCounts:meshes.map(({name,vertices,triangles,subMeshes})=>({name,vertices,triangles,subMeshes})),poses:poses.map(({label,animator,boundsBabylon})=>({label,animator,boundsBabylon})),passPrediction:report.passPrediction,binaryBytes:offset}));
animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();
