import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {accessorBytes,weldExactVertices} from '../scripts/weld-exact-vertices.js';

test('exact vertex reuse preserves sparse weights and morphs while keeping every triangle corner unchanged',()=>{
  const data=Buffer.alloc(48);[0,0,0,1,0,0,0,0,0,1,0,0].forEach((n,i)=>data.writeFloatLE(n,i*4));const indices=Buffer.from([0,1,2,2,1,3]);
  const sparse=Buffer.from([1,3,4,4]);
  const g={buffers:[{uri:'v',byteLength:48},{uri:'i',byteLength:6},{uri:'s',byteLength:4}],bufferViews:[{buffer:0,byteLength:48},{buffer:1,byteLength:6},{buffer:2,byteOffset:0,byteLength:2},{buffer:2,byteOffset:2,byteLength:2}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:4},{bufferView:1,componentType:5121,type:'SCALAR',count:6},{componentType:5121,type:'SCALAR',count:4,sparse:{count:2,indices:{bufferView:2,componentType:5121},values:{bufferView:3}}}],meshes:[{name:'fixture',primitives:[{attributes:{POSITION:0,COLOR_0:2},indices:1}]}]};
  const files=new Map([['v',{data}],['i',{data:indices}],['s',{data:sparse}]]);const report=weldExactVertices(g,files)[0];assert.equal(report.vertices,2);assert.equal(report.verifiedTriangleCorners,6);assert.deepEqual([...accessorBytes(g,files,2).raw],[0,4]);
});
test('packed Elena keeps all original triangle attributes, rig, texture and clip outputs byte-exact',async()=>{
  const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('elena.json',base))),after=await readRuntimeGltf(new URL(manifest.model,base));
  // Fingerprints were taken from the immutable FBX-derived original. Keeping
  // the audit portable does not require publishing or retaining an obsolete GLB.
  const a=JSON.parse(readFileSync(new URL('./fixtures/elena-original-surface.json',import.meta.url))),b=after.gltf;
  const sha=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(sha(JSON.stringify(b.nodes)),a.nodes);
  let corners=0,oldVertices=0,newVertices=0;
  const primitives=b.meshes.flatMap(m=>m.primitives);assert.equal(primitives.length,a.primitives.length);
  for(let p=0;p<primitives.length;p++){
    const old=a.primitives[p],next=primitives[p],index=accessorBytes(b,after.files,next.indices);assert.equal(index.count,old.corners);
    oldVertices+=old.vertices;newVertices+=accessorBytes(b,after.files,next.attributes.POSITION).count;
    assert.deepEqual(Object.keys(next.attributes).sort(),Object.keys(old.attributes).sort());
    for(const[key,id]of Object.entries(next.attributes)){const attr=accessorBytes(b,after.files,id),hash=createHash('sha256');for(let i=0;i<index.count;i++){const v=index.raw.readUIntLE(i*index.size,index.size);hash.update(attr.raw.subarray(v*attr.size,(v+1)*attr.size));}assert.equal(hash.digest('hex'),old.attributes[key],key+' triangle-corner bytes');}
    corners+=index.count;
  }
  assert.equal(b.skins.length,a.skins.length);for(let i=0;i<a.skins.length;i++){assert.deepEqual(a.skins[i].joints,b.skins[i].joints);assert.equal(sha(accessorBytes(b,after.files,b.skins[i].inverseBindMatrices).raw),a.skins[i].matrices);}
  for(const clip of b.animations){const old=a.animations.find(c=>c.name===clip.name);assert.equal(sha(JSON.stringify(clip.channels.map(c=>c.target))),old.targets);for(let s=0;s<clip.samplers.length;s++)assert.equal(sha(accessorBytes(b,after.files,clip.samplers[s].output).raw),old.outputs[s]);}
  assert.equal(corners,311790);assert.equal(oldVertices,207979);assert.equal(newVertices,158730);assert.equal(manifest.geometry.lossless,true);assert.equal(manifest.texture.width,4096);
});
