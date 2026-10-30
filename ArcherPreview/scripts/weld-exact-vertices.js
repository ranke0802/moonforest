import assert from 'node:assert/strict';
import {hash} from './resource-pack.js';
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export function accessorBytes(gltf,files,index){
  const a=gltf.accessors[index],size=sizes[a.componentType]*widths[a.type],raw=Buffer.alloc(size*a.count);
  const view=id=>{const v=gltf.bufferViews[id];return {v,bytes:files.get(gltf.buffers[v.buffer].uri).data.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)};};
  if(a.bufferView!==undefined){const {v,bytes}=view(a.bufferView),stride=v.byteStride??size;for(let i=0;i<a.count;i++)bytes.copy(raw,i*size,(a.byteOffset??0)+i*stride,(a.byteOffset??0)+i*stride+size);}
  if(a.sparse){const s=a.sparse,indices=view(s.indices.bufferView).bytes,values=view(s.values.bufferView).bytes,step=sizes[s.indices.componentType];for(let i=0;i<s.count;i++){const index=indices.readUIntLE((s.indices.byteOffset??0)+i*step,step),start=(s.values.byteOffset??0)+i*size;values.copy(raw,index*size,start,start+size);}}
  return {raw,size,count:a.count};
}
// Reuse vertices only when every byte, including UV seams, bone weights and
// all morph deltas, matches. Every triangle corner is verified after remapping.
// No triangle reduction, quantization, normal recomputation or skinning edits.
export function weldExactVertices(gltf,files){
  const reports=[];
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    assert.equal(p.mode??4,4);assert.ok(p.indices!==undefined);
    const indices=[...new Set([...Object.values(p.attributes),...(p.targets??[]).flatMap(t=>Object.values(t))])];
    const streams=indices.map(i=>accessorBytes(gltf,files,i)),count=streams[0].count;
    for(const s of streams)assert.equal(s.count,count);
    const unique=new Map(),first=[],remap=new Uint32Array(count);
    for(let i=0;i<count;i++){
      const key=streams.map(s=>s.raw.subarray(i*s.size,(i+1)*s.size).toString('base64')).join('|');
      if(!unique.has(key)){unique.set(key,first.length);first.push(i);}remap[i]=unique.get(key);
    }
    const report={mesh:mesh.name,originalVertices:count,vertices:first.length,removedDuplicates:count-first.length,verifiedTriangleCorners:0,vertexBytesSaved:0};reports.push(report);
    if(first.length===count)continue;
    const oldIndex=accessorBytes(gltf,files,p.indices),nextIndex=Buffer.alloc(oldIndex.raw.length),chunks=[];let offset=0;
    const append=(id,bytes,n)=>{const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}const a=gltf.accessors[id];a.bufferView=gltf.bufferViews.length;a.byteOffset=0;a.count=n;delete a.sparse;
      gltf.bufferViews.push({buffer:gltf.buffers.length,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;};
    const reduced=streams.map(s=>{const out=Buffer.alloc(first.length*s.size);first.forEach((old,i)=>s.raw.copy(out,i*s.size,old*s.size,(old+1)*s.size));return out;});
    for(let i=0;i<oldIndex.count;i++){
      const old=oldIndex.raw.readUIntLE(i*oldIndex.size,oldIndex.size),next=remap[old];nextIndex.writeUIntLE(next,i*oldIndex.size,oldIndex.size);
      for(let j=0;j<streams.length;j++){const s=streams[j];assert.ok(s.raw.subarray(old*s.size,(old+1)*s.size).equals(reduced[j].subarray(next*s.size,(next+1)*s.size)),'Changed triangle-corner attribute');}
      report.verifiedTriangleCorners++;
    }
    streams.forEach((s,i)=>{append(indices[i],reduced[i],first.length);report.vertexBytesSaved+=s.raw.length-reduced[i].length;});
    append(p.indices,nextIndex,oldIndex.count);gltf.accessors[p.indices].min=[0];gltf.accessors[p.indices].max=[first.length-1];
    const data=Buffer.concat(chunks),uri=hash(data)+'.bin';gltf.buffers.push({uri,byteLength:data.length});files.set(uri,{data});
  }
  return reports;
}
