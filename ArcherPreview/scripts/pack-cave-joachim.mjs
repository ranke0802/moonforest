// Only the approved static copy is packed. Never re-export/repack the actors,
// village models or existing cave textures when a story prop changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,basename,extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {basisModel} from './pack-village-ktx2.mjs';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {readAccessor} from './web-geometry.js';

const source=resolve(process.argv[2]),directory=dirname(source),approved=JSON.parse(await readFile(source,'utf8'));
assert.equal(approved.levels.length,3);assert.ok(approved.levels.every(l=>l.visualReview.passed));assert.equal(approved.static,true);
const input={lods:approved.levels,bounds:approved.bodyNearSizeMetres,sourceSha256:approved.source.fbxSha256};
const assets=resolve(import.meta.dirname,'../public/assets'),content=resolve(assets,'content'),output=resolve(directory,'runtime');
await mkdir(content,{recursive:true});await mkdir(output,{recursive:true});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const load=async row=>{
 const path=resolve(directory,row.model),bytes=await readFile(path);assert.equal(hash(bytes),row.sha256,'Unreviewed Joachim model');
 if(extname(path)==='.glb')return splitGlb(bytes,{baseColorOnly:true});
 const gltf=JSON.parse(bytes),files=new Map();
 for(const item of [...gltf.buffers,...gltf.images])if(item.uri){const data=await readFile(resolve(dirname(path),item.uri));if(/^[a-f0-9]{64}\./.test(basename(item.uri)))assert.equal(hash(data),basename(item.uri).slice(0,64),'Changed Joachim dependency');files.set(item.uri,{data});}
 return {gltf,files};
};
const originals=[];for(const row of input.lods)originals.push(await load(row));
for(const {gltf}of originals){assert.ok(!gltf.skins?.length&&!gltf.animations?.length);assert.equal(gltf.images.length,1);assert.ok(gltf.meshes.every(m=>m.primitives.every(p=>!p.targets?.length)));}
const color=originals[0].gltf.images[0],sourceColor=resolve(output,'source-color.jpg');
await writeFile(sourceColor,originals[0].files.get(color.uri).data);
await promisify(execFile)(process.env.CAVE_PYTHON??'python',[resolve(import.meta.dirname,'prepare-cave-joachim-texture.py'),sourceColor,resolve(output,'textures')],{maxBuffer:1024*1024});
const profiles=await read(resolve(output,'textures/profiles.json')),stored=new Map();
for(const p of profiles){const bytes=await readFile(p.file);assert.equal(hash(bytes),p.sha256);p.url='./content/'+p.sha256+'.ktx2';await writeFile(resolve(assets,p.url),bytes);stored.set(basename(p.url),{data:bytes});}
const lods=[],checks=[];
for(let level=0;level<3;level++){
 const {gltf,files}=originals[level],texture=profiles.find(p=>p.width===[1024,512,256][level]);
 const g=basisModel(gltf,[{uri:basename(texture.url),mimeType:'image/ktx2'}]);
 for(const material of g.materials){delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;material.pbrMetallicRoughness={...material.pbrMetallicRoughness,metallicFactor:0,roughnessFactor:1};delete material.pbrMetallicRoughness.metallicRoughnessTexture;}
 const inputs=new Map(files);inputs.set(basename(texture.url),stored.get(basename(texture.url)));
 const result=await compressMeshopt(g,inputs),decoded=await decodeMeshoptBuffers(result.gltf,result.files);
 for(let i=0;i<gltf.accessors.length;i++)assert.deepEqual(readAccessor(decoded.gltf,decoded.files,i),readAccessor(gltf,files,i));
 for(const [name,{data}]of result.files)await writeFile(resolve(content,name),data);
 const resources=[...result.files.keys()].map(name=>'./content/'+name),triangles=g.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);
 assert.equal(triangles,input.lods[level].triangles);
 lods.push({level,model:'./content/'+result.model,resources,triangles,textureSize:texture.width,bytes:[...result.files.values()].reduce((s,p)=>s+p.data.length,0)});
 checks.push({level,triangles,accessorsVerified:gltf.accessors.length,meshoptLossless:true,textureSize:texture.width});
}
assert.ok(lods[2].triangles<lods[1].triangles&&lods[1].triangles<lods[0].triangles,'Approved geometry tiers must decrease');
const high=profiles.find(p=>p.width===4096),{file,sha256,...highTexture}=high;
const manifest=await read(resolve(assets,'witch-cave.json'));
manifest.assets['joachim-resting']={name:'요아힘 · 보존 중인 신체',category:'prop',bounds:input.bounds,height:input.bounds[1],frontYawOffset:0,geometryLod:true,lods,mobileNear:structuredClone(lods[0]),highTextures:{shading:'toon-color',textures:{albedo:highTexture},resources:[high.url]},visualReview:'APPROVED',derivedFromExistingCharacter:true,sourceSha256:input.sourceSha256};
manifest.availableAssetCount=Object.keys(manifest.assets).length;
manifest.staticCharacterReuses=1;
await writeFile(resolve(assets,'witch-cave.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(output,'packing-audit.json'),JSON.stringify({checks,sourceSha256:input.sourceSha256,sourceUnchanged:true,newGenerationCalls:0,playerUnchanged:true,backgroundMax:4096},null,2)+'\n');
console.log(JSON.stringify({id:'joachim-resting',lods:checks,newGenerationCalls:0}));
