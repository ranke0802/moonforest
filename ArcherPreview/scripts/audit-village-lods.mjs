import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {readAccessor} from './web-geometry.js';
const directory=resolve(process.argv[2]??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/geometry-lod');
const baseline=JSON.parse(await readFile(resolve(directory,'baseline-manifest.json'),'utf8'));
const candidate=JSON.parse(await readFile(resolve(directory,'assets/village.json'),'utf8'));
async function load(lod){
 const path=resolve(directory,'assets',lod.model),gltf=JSON.parse(await readFile(path,'utf8')),files=new Map();
 for(const b of gltf.buffers)files.set(b.uri,{data:await readFile(resolve(dirname(path),b.uri))});
 return {gltf,files};
}
const result=[];
for(const [id,original]of Object.entries(baseline.assets)){
 const revised=candidate.assets[id];assert.deepEqual(revised.lods[0],original.lods[0]);assert.equal(revised.mobileNear.model,original.lods[1].model);
 const near=await load(revised.lods[0]),counts=[0,0,0];
 for(const level of [0,1,2]){
  const current=level?await load(revised.lods[level]):near;
  const transforms=nodes=>nodes.map(({name,...node})=>node);
  assert.deepEqual(transforms(current.gltf.nodes),transforms(near.gltf.nodes));
  for(let m=0;m<near.gltf.meshes.length;m++)for(let p=0;p<near.gltf.meshes[m].primitives.length;p++){
   const a=near.gltf.meshes[m].primitives[p],b=current.gltf.meshes[m].primitives[p],semantics=Object.keys(a.attributes);
   const values=semantics.map(s=>readAccessor(near.gltf,near.files,a.attributes[s]));
   const originals=new Set();const count=near.gltf.accessors[a.attributes.POSITION].count;
   const tuple=(arrays,i,n)=>arrays.flatMap(v=>Array.from(v.subarray(i*v.length/n,(i+1)*v.length/n))).join(',');
   for(let i=0;i<count;i++)originals.add(tuple(values,i,count));
   const reduced=semantics.map(s=>readAccessor(current.gltf,current.files,b.attributes[s]));
   const vertices=current.gltf.accessors[b.attributes.POSITION].count;
   for(let i=0;i<vertices;i++)assert.ok(originals.has(tuple(reduced,i,vertices)),id+': position/normal/UV drift');
   const indices=readAccessor(current.gltf,current.files,b.indices);
   assert.equal(indices.length%3,0);assert.ok([...indices].every(i=>i<vertices));counts[level]+=indices.length/3;
  }
  assert.equal(counts[level],revised.lods[level].triangles);
 }
 assert.ok(counts[2]<counts[1]&&counts[1]<counts[0]);result.push({id,triangles:counts,retainedAttributesExact:true,nearUnchanged:true});
}
assert.equal(result.length,25);
const totals=[0,1,2].map(i=>result.reduce((sum,a)=>sum+a.triangles[i],0));
await writeFile(resolve(directory,'integrity-audit.json'),JSON.stringify({assets:result,totals},null,2)+'\n');
console.log(JSON.stringify({assets:result.length,totals,midReduction:1-totals[1]/totals[0],farReduction:1-totals[2]/totals[0]}));
