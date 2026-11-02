import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {compareRetainedMourning,retained} from './helpers/mourning-50k.js';
import {accessorBytes,morphTextureEstimate} from '../scripts/pack-mourning-elena-v2-1.mjs';
const base=new URL('../public/assets/',import.meta.url),c=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));
test('approved 50k body preserves all retained UV/normal/skin/morph entries, clips and texture',async()=>{
 const before=await readRuntimeGltf(new URL('content/10eb3c62c2f2cc308a19bd211e774dc083e20de6f2e0e1782eeb948dc87d6a44.gltf',base)),after=await readRuntimeGltf(new URL(c.model,base)),g=before.gltf,h=after.gltf;
 assert.equal(c.geometry.triangles,49982);assert.equal(c.geometry.lossless,false);assert.ok(c.geometry.optimization.textureUnchanged);
 const comparison=compareRetainedMourning(before,after);assert.equal(comparison.newVertices,36196);assert.equal(comparison.triangles,44166);
 assert.deepEqual(g.nodes,h.nodes);assert.deepEqual(g.images,h.images);assert.deepEqual(g.materials,h.materials);
 for(let mi=0;mi<g.meshes.length;mi++){
  const a=g.meshes[mi].primitives[0],b=h.meshes[mi].primitives[0];assert.deepEqual(g.meshes[mi].extras,h.meshes[mi].extras);
  if(mi!==0)for(const [key,id]of Object.entries(a.attributes))assert.ok(accessorBytes(before,id).equals(accessorBytes(after,b.attributes[key])));
  if(mi!==0)assert.ok(accessorBytes(before,a.indices).equals(accessorBytes(after,b.indices)));
  for(let ti=0;ti<(a.targets?.length??0);ti++)for(const [key,id]of Object.entries(a.targets[ti])){
   const x=accessorBytes(before,id),y=accessorBytes(after,b.targets[ti][key]);if(mi!==0){assert.ok(x.equals(y));continue;}
   const stride=x.length/g.accessors[id].count;assert.equal(y.length,retained.length*stride);
   for(let i=0;i<retained.length;i++)assert.ok(y.subarray(i*stride,(i+1)*stride).equals(x.subarray(retained[i]*stride,(retained[i]+1)*stride)),ti+'/'+key+'/'+i);
  }
 }
 for(let i=0;i<g.skins.length;i++){assert.deepEqual(g.skins[i].joints,h.skins[i].joints);assert.ok(accessorBytes(before,g.skins[i].inverseBindMatrices).equals(accessorBytes(after,h.skins[i].inverseBindMatrices)));}
 for(let i=0;i<g.animations.length;i++){const a=g.animations[i],b=h.animations[i];assert.equal(a.name,b.name);assert.deepEqual(a.channels,b.channels);for(let s=0;s<a.samplers.length;s++)for(const key of ['input','output'])assert.ok(accessorBytes(before,a.samplers[s][key]).equals(accessorBytes(after,b.samplers[s][key])));}
 assert.equal(morphTextureEstimate(h).bytes,12985088);assert.ok(morphTextureEstimate(h).bytes<morphTextureEstimate(g).bytes*.42);
});
