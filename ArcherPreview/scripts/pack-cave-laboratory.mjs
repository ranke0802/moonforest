// Incremental, offline-only packing. Never rebuild paid models or their images.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {NullEngine,Scene} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {readAccessor} from './web-geometry.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {laboratoryEnabled,CAVE_LABORATORY_GEOMETRY} from '../src/cave-laboratory-geometry.js';

const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const signature=g=>JSON.stringify({nodes:g.nodes,scenes:g.scenes,scene:g.scene,meshes:g.meshes.map(m=>({name:m.name,primitives:m.primitives.map(p=>({material:p.material,mode:p.mode??4}))}))});

export async function readLaboratorySource(path,sha256,{dependencies={}}={}){
 const bytes=await readFile(path);assert.equal(hash(bytes),sha256,'Unapproved laboratory source bytes');
 if(extname(path).toLowerCase()==='.glb'){
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  return splitGlb(bytes,{baseColorOnly:true});
 }
 assert.equal(extname(path).toLowerCase(),'.gltf');const json=JSON.parse(bytes);validateStatic(json);
 for(const buffer of json.buffers??[])if(buffer.uri&&!buffer.uri.startsWith('data:')){const expected=/^([a-f0-9]{64})\.bin$/.exec(buffer.uri)?.[1]??dependencies[buffer.uri];assert.match(expected??'',/^[a-f0-9]{64}$/,'External geometry needs an approved dependency hash');assert.equal(hash(await readFile(resolve(dirname(path),buffer.uri))),expected,'Approved geometry dependency changed');}
 return readRuntimeGltf(pathToFileURL(path));
}

function validateStatic(g){
 assert.equal(g.asset?.version,'2.0');assert.equal(g.skins?.length??0,0);assert.equal(g.animations?.length??0,0);assert.equal(g.images?.length??0,0,'A palette-only asset must not borrow an unrelated UV atlas');
 assert.equal(g.materials?.length,1,'One existing-style palette material only');
 for(const node of g.nodes??[])assert.equal(node.skin,undefined);
 for(const mesh of g.meshes)for(const p of mesh.primitives){assert.equal(p.mode??4,4);assert.equal(p.targets?.length??0,0);assert.ok(p.attributes.POSITION!==undefined&&p.attributes.NORMAL!==undefined);assert.equal(p.indices!==undefined,true);assert.ok(!Object.keys(p.attributes).some(k=>/^JOINTS_|^WEIGHTS_/.test(k)));}
}

export function laboratoryTopology(gltf,files){
 const vertices=[],faces=[];
 // Exported mesh nodes must already be rebased/baked. Keeping this explicit
 // makes vertex locks, world placement and all three LODs use one coordinate set.
 for(const node of gltf.nodes??[])if(node.mesh!==undefined){
  assert.ok(!node.matrix||node.matrix.every((v,i)=>Math.abs(v-([0,5,10,15].includes(i)?1:0))<1e-7),'Bake mesh-node matrices before native export');
  assert.ok(!node.translation||node.translation.every(v=>Math.abs(v)<1e-7),'Bake mesh-node translation');
  assert.ok(!node.rotation||node.rotation.every((v,i)=>Math.abs(v-(i===3?1:0))<1e-7),'Bake mesh-node rotation');
  assert.ok(!node.scale||node.scale.every(v=>Math.abs(v-1)<1e-7),'Bake mesh-node scale');
 }
 for(const mesh of gltf.meshes)for(const p of mesh.primitives){const position=readAccessor(gltf,files,p.attributes.POSITION),ids=readAccessor(gltf,files,p.indices),offset=vertices.length;for(let i=0;i<position.length;i+=3)vertices.push(Array.from(position.slice(i,i+3)));for(let i=0;i<ids.length;i+=3)faces.push([ids[i]+offset,ids[i+1]+offset,ids[i+2]+offset]);}
 const welded=new Map(),remap=vertices.map(p=>{assert.ok(p.every(Number.isFinite));const key=p.map(v=>Math.round(v*1e5)).join(':');if(!welded.has(key))welded.set(key,welded.size);return welded.get(key);}),edges=new Map(),parents=Array.from({length:welded.size},(_,i)=>i),used=new Set(),unique=new Set();let degenerate=0,duplicate=0;
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 for(const face of faces){const a=vertices[face[0]],b=vertices[face[1]],c=vertices[face[2]],ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])<1e-10)degenerate++;
  const ids=face.map(i=>remap[i]),key=[...ids].sort((a,b)=>a-b).join(':');if(unique.has(key))duplicate++;unique.add(key);
  for(let i=0;i<3;i++){const a=ids[i],b=ids[(i+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)??0)+1);used.add(a);used.add(b);parents[root(a)]=root(b);}
 }
 return {triangles:faces.length,components:new Set([...used].map(root)).size,boundaryEdges:[...edges.values()].filter(v=>v===1).length,nonmanifoldEdges:[...edges.values()].filter(v=>v>2).length,degenerate,duplicate};
}
function closed(audit){assert.equal(audit.components,1,'Native enclosure must be one connected volume');for(const key of ['boundaryEdges','nonmanifoldEdges','degenerate','duplicate'])assert.equal(audit[key],0,'Invalid laboratory topology: '+key);}

// Canonical per-accessor buffers keep near attributes byte-exact and shared
// between LODs. Only reduced index buffers differ; there is no quantization or
// automatic normal/UV reconstruction hidden in the pack step.
export async function paletteGeometry(source,files,{ratio=1,error=.02,lockedPositions=[],vertexLocks=null,positionAccessor=null}={}){
 const g=structuredClone(source);g.accessors=[];g.bufferViews=[];g.buffers=[];g.images=[];delete g.textures;delete g.samplers;delete g.extensionsUsed;delete g.extensionsRequired;
 g.materials=[{name:'Laboratory broad cave rock',doubleSided:false,pbrMetallicRoughness:{baseColorFactor:[.26,.25,.24,1],metallicFactor:0,roughnessFactor:1},alphaMode:'OPAQUE'}];
 const output=new Map(),stats=[],lockKeys=new Set(lockedPositions.map(p=>p.map(v=>Math.round(v*1e5)).join(':')));
 const store=(values,original)=>{
  const data=Buffer.from(values.buffer,values.byteOffset,values.byteLength),uri=hash(data)+'.bin';output.set(uri,{data});const bi=g.buffers.length,vi=g.bufferViews.length,ai=g.accessors.length;
  g.buffers.push({uri,byteLength:data.length});g.bufferViews.push({buffer:bi,byteLength:data.length});const accessor={...original,bufferView:vi,byteOffset:0,count:values.length/width[original.type]};delete accessor.sparse;delete accessor.extensions;g.accessors.push(accessor);return ai;
 };
 if(ratio<1)await MeshoptSimplifier.ready;
 for(let m=0;m<source.meshes.length;m++)for(let i=0;i<source.meshes[m].primitives.length;i++){
  const p=source.meshes[m].primitives[i],dest=g.meshes[m].primitives[i],position=readAccessor(source,files,p.attributes.POSITION),normal=readAccessor(source,files,p.attributes.NORMAL),indices=readAccessor(source,files,p.indices);let reduced=indices,measuredError=0;
  assert.ok(position instanceof Float32Array&&normal instanceof Float32Array);assert.equal(position.length,normal.length);assert.ok([...normal].every(Number.isFinite));
  const vertexLock=new Uint8Array(position.length/3);if(vertexLocks){assert.equal(p.attributes.POSITION,positionAccessor,'Lock mask uses another POSITION accessor');assert.equal(vertexLocks.length,vertexLock.length);vertexLock.set(vertexLocks);}else for(let v=0;v<vertexLock.length;v++)if(lockKeys.has(Array.from(position.slice(v*3,v*3+3)).map(n=>Math.round(n*1e5)).join(':')))vertexLock[v]=1;
  if(ratio<1){[reduced,measuredError]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(indices),position,3,normal,3,[.5,.5,.5],vertexLock,Math.max(12,Math.floor(indices.length*ratio/3)*3),error,['Permissive','LockBorder','PreserveFolds','ErrorAbsolute']);
   const used=new Set(reduced);for(let v=0;v<vertexLock.length;v++)if(vertexLock[v]&&indices.includes(v))assert.ok(used.has(v),'Locked seam/body-air vertex disappeared');
  }
  dest.attributes={POSITION:store(position,source.accessors[p.attributes.POSITION]),NORMAL:store(normal,source.accessors[p.attributes.NORMAL])};
  dest.indices=store(reduced,{componentType:reduced instanceof Uint16Array?5123:5125,type:'SCALAR'});dest.material=0;
  stats.push({mesh:m,primitive:i,before:indices.length/3,after:reduced.length/3,error:measuredError,lockedVertices:vertexLock.reduce((a,b)=>a+b,0)});
 }
 return {gltf:g,files:output,stats};
}

async function measuredBounds(source,engine){
 const scene=new Scene(engine);scene.useRightHandedSystem=true;const json=structuredClone(source.gltf);
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 try{const container=await loader.loadAssetContainerAsync(scene,{json},''),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const mesh of container.meshes)if(mesh.getTotalVertices()>0){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;for(const [i,k]of ['x','y','z'].entries()){min[i]=Math.min(min[i],b.minimumWorld[k]);max[i]=Math.max(max[i],b.maximumWorld[k]);}}container.dispose();return {min,max,bounds:max.map((v,i)=>v-min[i])};}finally{scene.dispose();}
}

export async function packCaveLaboratory(approvalPath,{assetsRoot=resolve(import.meta.dirname,'../public/assets'),auditPath}={}){
 const approval=await readJson(approvalPath),directory=dirname(resolve(approvalPath));
 assert.equal(approval.approved,true,'Artist approval is required before packing');assert.equal(approval.newGenerationCalls,0);assert.equal(approval.assetId,CAVE_LABORATORY_GEOMETRY.assetId);
 assert.ok(laboratoryEnabled(approval.geometryContract));assert.equal(approval.geometryContract.assetId,approval.assetId);assert.equal(approval.geometryContract.revision,approval.revision);assert.equal(approval.geometryContract.sourceSha256,approval.source.sha256);
 const sourceFile=resolve(directory,approval.source.file),sourceBytes=await readFile(sourceFile);assert.equal(hash(sourceBytes),approval.source.sha256,'Approved source changed');
 const terrainFile=resolve(directory,approval.terrain.file),terrainBytes=await readFile(terrainFile);assert.equal(hash(terrainBytes),approval.terrain.sha256,'Approved terrain changed');assert.equal(approval.geometryContract.terrainSha256,approval.terrain.sha256);assert.equal(terrainBytes.length%12,0);
 const manifest=await readJson(resolve(assetsRoot,'witch-cave.json')),original=structuredClone(manifest),inputs=[];
 if(approval.levels){assert.equal(approval.levels.length,3);for(let level=0;level<3;level++){const row=approval.levels[level];assert.equal(row.level,level);assert.equal(row.visualReview?.passed,true);inputs.push(await readLaboratorySource(resolve(directory,row.model),row.sha256,row));}}
 else{assert.equal(approval.near.visualReview?.passed,true);const near=await readLaboratorySource(resolve(directory,approval.near.model),approval.near.sha256);validateStatic(near.gltf);closed(laboratoryTopology(near.gltf,near.files));
  let vertexLocks=null;if(approval.vertexLocks){const bytes=await readFile(resolve(directory,approval.vertexLocks.file));assert.equal(hash(bytes),approval.vertexLocks.sha256,'Approved vertex lock mask changed');assert.ok([...bytes].every(v=>v===0||v===1));vertexLocks=Uint8Array.from(bytes);}else assert.ok(Array.isArray(approval.lockedPositions)&&approval.lockedPositions.length>0,'Exported seam/body-air locks are required for LOD generation');
  const ratios=approval.lodPolicy?.ratios??[1,.7,.4],errors=approval.lodPolicy?.errors??[0,.015,.03];assert.equal(ratios.length,3);assert.equal(errors.length,3);assert.equal(ratios[0],1);
  for(let level=0;level<3;level++){assert.ok(ratios[level]>0&&ratios[level]<=1&&errors[level]>=0&&errors[level]<=.03);inputs.push(await paletteGeometry(near.gltf,near.files,{ratio:ratios[level],error:errors[level],lockedPositions:approval.lockedPositions,vertexLocks,positionAccessor:approval.vertexLocks?.positionAccessor}));}
 }
 const engine=new NullEngine(),packed=[],checks=[];let bounds;
 try{for(let level=0;level<3;level++){
  const input=inputs[level];validateStatic(input.gltf);const topology=laboratoryTopology(input.gltf,input.files);closed(topology);const measured=await measuredBounds(input,engine);if(!bounds)bounds=measured;
  assert.ok(Math.abs(measured.min[1])<.005,'Native origin must be at its real bottom');assert.ok(Math.abs(measured.min[0]+measured.max[0])<.01&&Math.abs(measured.min[2]+measured.max[2])<.01,'Native XZ origin must match placementBounds centre');assert.ok(measured.bounds.every((v,i)=>Math.abs(v-bounds.bounds[i])<.01),'LOD bounds/origin differ');
  assert.equal(signature(input.gltf),signature(inputs[0].gltf),'LOD mesh/node/material order differs');assert.ok(topology.triangles<=5000);if(level)assert.ok(topology.triangles<checks[level-1].triangles,`Safe LOD did not decrease triangles: level${level} ${topology.triangles} >= ${checks[level-1].triangles}; do not weaken locks automatically`);
  const canonical=await paletteGeometry(input.gltf,input.files),result=await compressMeshopt(canonical.gltf,canonical.files),decoded=await decodeMeshoptBuffers(result.gltf,result.files);
  for(let index=0;index<canonical.gltf.accessors.length;index++)assert.deepEqual(readAccessor(decoded.gltf,decoded.files,index),readAccessor(canonical.gltf,canonical.files,index),'Meshopt must be lossless');
  packed.push(result);checks.push({level,triangles:topology.triangles,topology,bounds:measured,meshopt:result.stats,simplification:input.stats??null});
 }}finally{engine.dispose();}
 const lods=packed.map((result,level)=>({level,model:'./content/'+result.model,resources:[...result.files.keys()].map(name=>'./content/'+name),triangles:checks[level].triangles,textureSize:0,bytes:[...result.files.values()].reduce((sum,p)=>sum+p.data.length,0)}));
 manifest.assets[approval.assetId]={name:'실험실 큰 암반·절리',category:'rock',bounds:bounds.bounds,height:bounds.bounds[1],frontYawOffset:0,geometryLod:true,lods,mobileNear:structuredClone(lods[0]),surfaceStyle:'cave-palette',essentialStructural:true,visualReview:'APPROVED',derivedFromExistingAssets:['cave-01-eroded-wall'],sourceSha256:approval.source.sha256,terrainSha256:approval.terrain.sha256,replacesLegacyAssets:[...approval.geometryContract.legacyAssets],approvedRevision:approval.revision,provenance:approval.provenance??{},newGenerationCalls:0};
 manifest.availableAssetCount=Object.keys(manifest.assets).length;manifest.derivedEnvironmentAssets=1;
 if(Number.isSafeInteger(approval.placementCount))manifest.placementCount=approval.placementCount;
 for(const [id,asset]of Object.entries(original.assets))if(id!==approval.assetId)assert.deepEqual(manifest.assets[id],asset,'Unrelated asset changed');
 for(const key of ['newSourceModels','reusedSourceModels','spentCredits','sourceSettings'])assert.deepEqual(manifest[key],original[key],'Paid ledger must remain unchanged');
 // Only now are immutable content and the one mutable manifest written. A
 // validation error above leaves every public asset untouched.
 assert.equal(hash(await readFile(sourceFile)),approval.source.sha256,'Source changed during packing');assert.equal(hash(await readFile(terrainFile)),approval.terrain.sha256,'Terrain changed during packing');
 await mkdir(resolve(assetsRoot,'content'),{recursive:true});for(const result of packed)for(const [name,{data}]of result.files)await writeFile(resolve(assetsRoot,'content',name),data);
 const manifestPath=resolve(assetsRoot,'witch-cave.json');await writeFile(manifestPath+'.tmp',JSON.stringify(manifest,null,2)+'\n');await rename(manifestPath+'.tmp',manifestPath);
 const audit={revision:approval.revision,sourceSha256:approval.source.sha256,terrainSha256:approval.terrain.sha256,assetId:approval.assetId,checks,geometryContract:approval.geometryContract,placement:approval.placement,sourceUnchanged:hash(await readFile(sourceFile))===approval.source.sha256,terrainUnchanged:hash(await readFile(terrainFile))===approval.terrain.sha256,otherManifestAssetsUnchanged:true,newGenerationCalls:0,newTextures:0,paidLedger:{newSourceModels:manifest.newSourceModels,spentCredits:manifest.spentCredits},activation:'Packing does not enable the runtime contract or modify terrain/layout.'};
 if(auditPath){await mkdir(dirname(resolve(auditPath)),{recursive:true});await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n');}return {asset:manifest.assets[approval.assetId],audit};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.ok(process.argv[2],'Usage: node scripts/pack-cave-laboratory.mjs <approved-source.json>');
 const result=await packCaveLaboratory(resolve(process.argv[2]),{auditPath:process.argv[3]??resolve(dirname(process.argv[2]),'laboratory-packing-audit.json')});console.log(JSON.stringify({id:result.audit.assetId,levels:result.audit.checks.map(c=>({level:c.level,triangles:c.triangles})),newTextures:0,newGenerationCalls:0}));
}
