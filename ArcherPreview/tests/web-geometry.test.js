import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb } from '../scripts/resource-pack.js';
import { readAccessor } from '../scripts/web-geometry.js';

test('web warrior preserves every clip, rig, texture and retained skin/UV vertex',async()=>{
 const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets');
 let bytes;try{bytes=await readFile(resolve(root,'assets/models/violet-warrior-v2.glb'));}catch{bytes=await readFile(resolve(base,'violet-warrior-v2.glb'));}
 const original=splitGlb(bytes),manifest=JSON.parse(await readFile(resolve(base,'warrior-v2.json'),'utf8'));
 const optimized=JSON.parse(await readFile(resolve(base,manifest.model),'utf8')),files=new Map();
 for(const buffer of optimized.buffers)files.set(buffer.uri,{data:await readFile(resolve(base,'content',buffer.uri))});
 assert.deepEqual(optimized.nodes,original.gltf.nodes);
 assert.deepEqual(optimized.materials,original.gltf.materials);
 assert.deepEqual(optimized.images,original.gltf.images);
 assert.equal(optimized.animations.length,9);
 const exact=(a,b)=>assert.deepEqual(readAccessor(optimized,files,a),readAccessor(original.gltf,original.files,b));
 for(let i=0;i<optimized.skins.length;i++){
  const a=optimized.skins[i],b=original.gltf.skins[i];assert.deepEqual(a.joints,b.joints);exact(a.inverseBindMatrices,b.inverseBindMatrices);
 }
 for(let i=0;i<optimized.animations.length;i++){
  const a=optimized.animations[i],b=original.gltf.animations[i];assert.equal(a.name,b.name);assert.deepEqual(a.channels,b.channels);
  for(let j=0;j<a.samplers.length;j++){assert.equal(a.samplers[j].interpolation,b.samplers[j].interpolation);exact(a.samplers[j].input,b.samplers[j].input);exact(a.samplers[j].output,b.samplers[j].output);}
 }
 let triangles=0,originalTriangles=0;
 for(let m=0;m<optimized.meshes.length;m++)for(let p=0;p<optimized.meshes[m].primitives.length;p++){
  const a=optimized.meshes[m].primitives[p],b=original.gltf.meshes[m].primitives[p];
  assert.equal(a.material,b.material);
  const indices=readAccessor(optimized,files,a.indices),count=optimized.accessors[a.attributes.POSITION].count;
  for(const index of indices)assert.ok(index<count);
  triangles+=indices.length/3;originalTriangles+=original.gltf.accessors[b.indices].count/3;
  const keys=Object.keys(a.attributes),values=(g,f,primitive)=>keys.map(k=>{const data=readAccessor(g,f,primitive.attributes[k]);return {data,size:data.length/g.accessors[primitive.attributes[k]].count};});
  const old=values(original.gltf,original.files,b),next=values(optimized,files,a);
  const signature=(arrays,i)=>arrays.map(({data,size})=>Array.from(data.subarray(i*size,(i+1)*size)).join(',')).join('|');
  const survivors=new Set();for(let i=0;i<original.gltf.accessors[b.attributes.POSITION].count;i++)survivors.add(signature(old,i));
  for(let i=0;i<count;i++)assert.ok(survivors.has(signature(next,i)),'Position, normals, UV, bone IDs and weights must all survive together');
 }
 assert.ok(triangles<originalTriangles*.3,`${triangles}/${originalTriangles}`);
 assert.ok(triangles>100000,'Keep conservative near-view detail');
});
