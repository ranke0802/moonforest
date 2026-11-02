import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accessorBytes} from '../../scripts/pack-mourning-elena-v2-1.mjs';
const data=readFileSync(new URL('../fixtures/mourning-50k-retained.u32',import.meta.url));
export const retained=new Uint32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
export function compareRetainedMourning(before,after){
 const a=before.gltf.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a').primitives[0],b=after.gltf.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a').primitives[0],attributes={};
 for(const name of Object.keys(a.attributes)){
  const old=accessorBytes(before,a.attributes[name]),now=accessorBytes(after,b.attributes[name]),stride=old.length/before.gltf.accessors[a.attributes[name]].count;
  assert.equal(now.length,retained.length*stride);
  for(let i=0;i<retained.length;i++)assert.ok(now.subarray(i*stride,(i+1)*stride).equals(old.subarray(retained[i]*stride,(retained[i]+1)*stride)),name+'/'+i);
  attributes[name]={byteExact:true,retainedVertices:retained.length};
 }
 return {oldVertices:before.gltf.accessors[a.attributes.POSITION].count,newVertices:retained.length,triangles:after.gltf.accessors[b.indices].count/3,attributes};
}
