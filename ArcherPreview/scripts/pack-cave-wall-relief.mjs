// Repackage one already-owned asset. No generation, simplification, UV edits,
// new material or runtime deformation. Original inputs remain in Git/history.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {readAccessor} from './web-geometry.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {hash} from './resource-pack.js';
import {buildCaveWallRelief,caveWallReliefProfile,CAVE_WALL_RELIEF_REVISION} from './cave-wall-relief.mjs';

const assets=new URL('../public/assets/',import.meta.url),directory=new URL('../reports/cave-wall-relief-2026-11-03/',import.meta.url);
const manifestPath=new URL('witch-cave.json',assets),original=JSON.parse(fs.readFileSync(manifestPath)),manifest=structuredClone(original),id='cave-01-eroded-wall',asset=manifest.assets[id];
assert.equal(asset.vertexRelief,undefined,'Do not apply the same vertex relief twice');
const expectedModels=['29aec96c67e6e296617909e5e7e8216269cd48adbc1d2e5ff616a45bec7f93c9','590328f924cb948291ae3b6c5d78b0e387c0ff5f6231fa117ba74dc8d3df6615','ef930570501f371f48fa54a3578a98430e2317831893a19a876cb9a9111812ff'];
const decoded=[],sources=[];
for(const [index,level]of asset.lods.entries()){
 assert.equal(new URL(level.model,assets).pathname.split('/').at(-1),expectedModels[index]+'.gltf','Different base source requires a new review');
 const source=await readRuntimeGltf(new URL(level.model,assets));decoded.push(source);
 const parts=source.gltf.meshes.flatMap(mesh=>mesh.primitives.map(p=>({positions:Array.from(readAccessor(source.gltf,source.files,p.attributes.POSITION)),normals:Array.from(readAccessor(source.gltf,source.files,p.attributes.NORMAL)),indices:Array.from(readAccessor(source.gltf,source.files,p.indices))})));
 sources.push({level:index,parts});
}
const relief=buildCaveWallRelief(sources,id),allOutput=new Map(),levels=[],proofs=[];
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),digest=a=>hash(bytes(a));
const protectedDigest=(part,field)=>{
 const profile=caveWallReliefProfile(id),set=new Set();for(let i=0;i<part.indices.length;i+=3){const ids=part.indices.slice(i,i+3);if(ids.some(v=>profile.protected(part.positions.slice(v*3,v*3+3))))for(const v of ids)set.add(v);}
 return hash(bytes(Float32Array.from([...set].sort((a,b)=>a-b).flatMap(v=>part[field].slice(v*3,v*3+3)))));
};
for(let level=0;level<3;level++){
 const old=decoded[level],gltf=structuredClone(old.gltf),rawBuffers=new Map();
 for(const view of gltf.bufferViews)if(!rawBuffers.has(view.buffer))rawBuffers.set(view.buffer,Buffer.from(old.files.get(gltf.buffers[view.buffer].uri).data));
 let partIndex=0;
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
  const part=relief.levels[level].parts[partIndex++];
  for(const [semantic,values]of [['POSITION',part.positions],['NORMAL',part.normals]]){
   const accessor=gltf.accessors[primitive.attributes[semantic]],view=gltf.bufferViews[accessor.bufferView],buffer=rawBuffers.get(view.buffer),stride=view.byteStride??12,start=(view.byteOffset??0)+(accessor.byteOffset??0);
   assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC3');assert.equal(accessor.count*3,values.length);
   for(let vertex=0;vertex<accessor.count;vertex++)for(let axis=0;axis<3;axis++)buffer.writeFloatLE(values[vertex*3+axis],start+vertex*stride+axis*4);
  }
 }
 const canonical=new Map(),buffers=[];for(const [before,data]of rawBuffers){const uri=hash(data)+'.bin';canonical.set(before,buffers.length);buffers.push({uri,byteLength:data.length});}
 const files=new Map();let index=0;for(const data of rawBuffers.values())files.set(buffers[index++].uri,{data});
 for(const view of gltf.bufferViews)view.buffer=canonical.get(view.buffer);
 gltf.buffers=buffers;for(const k of ['extensionsUsed','extensionsRequired']){gltf[k]=(gltf[k]??[]).filter(v=>v!=='EXT_meshopt_compression');if(!gltf[k].length)delete gltf[k];}
 for(const image of gltf.images??[])if(image.uri){const data=fs.readFileSync(new URL(image.uri,new URL(asset.lods[level].model,assets)));files.set(image.uri,{data});}
 const packed=await compressMeshopt(gltf,files),roundTrip=await decodeMeshoptBuffers(packed.gltf,packed.files);
 const proof={level,parts:[]};partIndex=0;
 for(let mesh=0;mesh<gltf.meshes.length;mesh++)for(let part=0;part<gltf.meshes[mesh].primitives.length;part++){
  const before=old.gltf.meshes[mesh].primitives[part],after=roundTrip.gltf.meshes[mesh].primitives[part],expected=relief.levels[level].parts[partIndex],previous=sources[level].parts[partIndex++],channels={};
  const indices=readAccessor(roundTrip.gltf,roundTrip.files,after.indices);assert.deepEqual(indices,readAccessor(old.gltf,old.files,before.indices));
  for(const [semantic,accessor]of Object.entries(before.attributes)){
   const now=readAccessor(roundTrip.gltf,roundTrip.files,after.attributes[semantic]);
   assert.deepEqual(now,semantic==='POSITION'?Float32Array.from(expected.positions):semantic==='NORMAL'?Float32Array.from(expected.normals):readAccessor(old.gltf,old.files,accessor),'Changed non-position/normal attribute or lossy packing: '+semantic);
   channels[semantic]=digest(now);
  }
  assert.equal(protectedDigest(previous,'positions'),protectedDigest(expected,'positions'));assert.equal(protectedDigest(previous,'normals'),protectedDigest(expected,'normals'));
  proof.parts.push({vertices:expected.positions.length/3,triangles:indices.length/3,indicesSha256:digest(indices),channels,protectedPositionsSha256:protectedDigest(expected,'positions'),protectedNormalsSha256:protectedDigest(expected,'normals')});
 }
 assert.deepEqual(gltf.images,old.gltf.images);assert.deepEqual(gltf.textures,old.gltf.textures);assert.deepEqual(gltf.materials,old.gltf.materials);
 for(const [name,value]of packed.files){assert.equal(name.split('.')[0],hash(value.data),'Content-addressing mismatch');allOutput.set(name,value);}
 levels.push({...asset.lods[level],model:'./content/'+packed.model,resources:[...packed.files.keys()].map(name=>'./content/'+name),bytes:[...packed.files.values()].reduce((n,p)=>n+p.data.length,0),compression:packed.stats});proofs.push(proof);
}
asset.lods=levels;asset.mobileNear=structuredClone(levels[0]);
// Provenance must not contain live-looking resource URLs: the deployment
// graph intentionally visits all manifest links and would retain obsolete LODs.
asset.vertexRelief={revision:CAVE_WALL_RELIEF_REVISION,sourceModelHashes:original.assets[id].lods.map(l=>new URL(l.model,assets).pathname.split('/').at(-1).split('.')[0]),geometryOnly:true,normalTransport:'authored normal via inverse-transpose Jacobian',protectedRule:'Entire source faces touching localY<=3.05, localY>=4.8, or absX>=3.25 fixed in every LOD; additional monotone orientation locks',sourceStats:relief.stats,levels:proofs};
assert.deepEqual(asset.highTextures,original.assets[id].highTextures);assert.deepEqual(asset.bounds,original.assets[id].bounds);assert.equal(asset.height,original.assets[id].height);
for(const key of Object.keys(original.assets))if(key!==id)assert.deepEqual(manifest.assets[key],original.assets[key],'Other asset changed: '+key);
fs.mkdirSync(directory,{recursive:true});
const uniqueBytes=map=>{const set=new Set();let total=0;for(const level of map.lods)for(const path of level.resources??[]){const url=new URL(path,assets);if(!set.has(url.href)){set.add(url.href);total+=fs.statSync(url).size;}}return total;};
const beforeBytes=uniqueBytes(original.assets[id]),afterBytes=[...allOutput.values()].reduce((n,p)=>n+p.data.length,0);
const report={status:'PACK_VERIFIED_NOT_APPLIED',assetId:id,revision:CAVE_WALL_RELIEF_REVISION,stats:relief.stats,proofs,oldModels:original.assets[id].lods.map(l=>l.model),newModels:levels.map(l=>l.model),beforeBytes,afterBytes,byteDelta:afterBytes-beforeBytes,textureUrlsUnchanged:true,highTextureMax:4096,nativeLaboratoryUnchanged:true,terrainUnchanged:true,newGenerationCalls:0,additionalRuntimeWork:0};
if(process.argv.includes('--apply')){
 for(const [name,{data}]of allOutput){const path=new URL('content/'+name,assets);if(fs.existsSync(path))assert.ok(fs.readFileSync(path).equals(data));else fs.writeFileSync(path,data);}
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');report.status='APPLIED_PENDING_COLLISION_AND_FINAL_QA';
}else fs.writeFileSync(new URL('pending-manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(new URL('pack-verification.json',directory),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
