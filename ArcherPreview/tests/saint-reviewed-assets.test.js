import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {accessorBytes} from '../scripts/pack-mourning-elena-v2-1.mjs';
const base=new URL('../public/assets/',import.meta.url);
const c=JSON.parse(readFileSync(new URL('elena.json',base)));
const old=JSON.parse(readFileSync(new URL('../reports/saint-50k-2026-11-02/manifest-before.json',import.meta.url)));

test('approved saint reduction preserves every retained skin/UV/normal and all animation streams',async()=>{
 const before=await readRuntimeGltf(new URL(old.model,base)),after=await readRuntimeGltf(new URL(c.model,base)),g=before.gltf,h=after.gltf;
 assert.equal(c.geometry.triangles,56918);assert.equal(c.geometry.vertices,96734);assert.equal(c.geometry.lossless,false);
 for(const key of ['nodes','skins','materials','images','animations'])assert.deepEqual(h[key],g[key],key);
 const rb=readFileSync(new URL('./fixtures/saint-reviewed-retained.u32',import.meta.url)),retained=new Uint32Array(rb.buffer.slice(rb.byteOffset,rb.byteOffset+rb.byteLength));
 const a=g.meshes[0].primitives[0],b=h.meshes[0].primitives[0];assert.equal(retained.length,96734);
 assert.equal(h.accessors[b.indices].count/3,56918);
 assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
 for(const key of Object.keys(a.attributes)){
  const source=accessorBytes(before,a.attributes[key]),actual=accessorBytes(after,b.attributes[key]),stride=source.length/g.accessors[a.attributes[key]].count;
  assert.equal(actual.length,retained.length*stride);
  for(let i=0;i<retained.length;i++)assert.ok(actual.subarray(i*stride,(i+1)*stride).equals(source.subarray(retained[i]*stride,(retained[i]+1)*stride)),key+'/'+i);
 }
 for(const skin of g.skins)assert.ok(accessorBytes(before,skin.inverseBindMatrices).equals(accessorBytes(after,skin.inverseBindMatrices)));
 for(const animation of g.animations)for(const sampler of animation.samplers)for(const key of ['input','output'])assert.ok(accessorBytes(before,sampler[key]).equals(accessorBytes(after,sampler[key])));
 for(const image of g.images){const bytes=readFileSync(new URL(image.uri,new URL(c.model,base)));assert.equal(createHash('sha256').update(bytes).digest('hex'),image.uri.split('.')[0]);}
});

test('saint scale, gameplay tracks, clip selection and style remain unchanged',()=>{
 const excluded=new Set(['geometry','resources','model','version']);
 for(const key of Object.keys(old))if(!excluded.has(key))assert.deepEqual(c[key],old[key],key);
 assert.equal(c.bodyHeight,1.7);assert.equal(c.scale,1.0625);
 assert.equal(c.texture.width,4096);assert.equal(c.texture.height,4096);
 assert.equal(c.geometry.originalTriangleSurfaces,false);
});
