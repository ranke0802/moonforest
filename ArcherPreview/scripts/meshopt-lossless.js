import assert from 'node:assert/strict';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {hash} from './resource-pack.js';

export const MESHOPT_EXTENSION='EXT_meshopt_compression';
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};

/** Only entropy coding. No filters, quantization, reordering or simplification. */
export async function compressMeshopt(source,files,cache=new Map()){
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  assert.ok(!source.extensionsUsed?.includes(MESHOPT_EXTENSION),'Already compressed');
  const gltf=structuredClone(source),output=new Map();
  const stats={encodedViews:0,rawViews:0,verifiedViews:0};
  const indices=new Set(source.meshes.flatMap(m=>m.primitives.map(p=>p.indices)));
  // Keep a small number of packed files (one per old geometry/clip buffer),
  // instead of issuing thousands of network requests for individual views.
  for(let bi=0;bi<source.buffers.length;bi++){
    const original=source.buffers[bi],raw=files.get(original.uri).data;
    const chunks=[],dedup=new Map();let offset=0,fallback;
    const store=data=>{
      const key=hash(data);if(dedup.has(key))return dedup.get(key);
      const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
      const at=offset;chunks.push(data);offset+=data.length;dedup.set(key,at);return at;
    };
    for(let vi=0;vi<source.bufferViews.length;vi++){
      const view=source.bufferViews[vi];if(view.buffer!==bi)continue;
      const aIndex=source.accessors.findIndex(a=>a.bufferView===vi),a=source.accessors[aIndex];
      const bytes=raw.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
      const stride=view.byteStride??(a?widths[a.type]*sizes[a.componentType]:0);
      const mode=indices.has(aIndex)?'INDICES':'ATTRIBUTES';
      let encoded;
      if(a&&!a.sparse&&stride>0&&bytes.length%stride===0&&(mode==='INDICES'?[2,4].includes(stride):stride%4===0&&stride<=256)){
        const key=hash(bytes)+':'+stride+':'+mode;
        encoded=cache.get(key);
        if(!encoded){
          encoded=Buffer.from(MeshoptEncoder.encodeGltfBuffer(bytes,bytes.length/stride,stride,mode,0));
          const decoded=new Uint8Array(bytes.length);
          MeshoptDecoder.decodeGltfBuffer(decoded,bytes.length/stride,stride,encoded,mode,'NONE');
          assert.ok(Buffer.from(decoded).equals(bytes),'Non-lossless meshopt output');cache.set(key,encoded);
        }
        stats.verifiedViews++;
      }
      const target=gltf.bufferViews[vi];
      // Small views can cost more in extension JSON than they save in payload.
      if(encoded&&encoded.length+120<bytes.length){
        if(fallback===undefined){
          fallback=gltf.buffers.length;
          gltf.buffers.push({byteLength:original.byteLength,extensions:{[MESHOPT_EXTENSION]:{fallback:true}}});
        }
        target.buffer=fallback;
        target.extensions={...target.extensions,[MESHOPT_EXTENSION]:{buffer:bi,byteOffset:store(encoded),byteLength:encoded.length,byteStride:stride,count:bytes.length/stride,mode,filter:'NONE'}};
        stats.encodedViews++;
      }else{
        target.byteOffset=store(bytes);stats.rawViews++;
      }
    }
    const data=Buffer.concat(chunks),uri=hash(data)+'.bin';
    gltf.buffers[bi]={...original,uri,byteLength:data.length};output.set(uri,{data});
  }
  if(stats.encodedViews){
    for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=[...new Set([...(gltf[key]??[]),MESHOPT_EXTENSION])];
  }
  for(const im of gltf.images??[])if(im.uri)output.set(im.uri,files.get(im.uri));
  const data=Buffer.from(JSON.stringify(gltf)),model=hash(data)+'.gltf';output.set(model,{data});
  return {gltf,model,files:output,stats};
}

/** Offline verification/test adapter: materialize original bytes, never publish. */
export async function decodeMeshoptBuffers(source,files){
  await MeshoptDecoder.ready;
  const gltf=structuredClone(source),output=new Map(files),decoded=new Map();
  for(const view of gltf.bufferViews??[]){
    const ext=view.extensions?.[MESHOPT_EXTENSION];if(!ext)continue;
    assert.equal(ext.filter??'NONE','NONE','Lossy filters are forbidden');
    const bytes=files.get(gltf.buffers[ext.buffer].uri).data;
    const target=new Uint8Array(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(target,ext.count,ext.byteStride,bytes.subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength),ext.mode,ext.filter);
    if(!decoded.has(view.buffer))decoded.set(view.buffer,Buffer.alloc(gltf.buffers[view.buffer].byteLength));
    decoded.get(view.buffer).set(target,view.byteOffset??0);
    delete view.extensions[MESHOPT_EXTENSION];if(!Object.keys(view.extensions).length)delete view.extensions;
  }
  for(const [index,data]of decoded){const uri=hash(data)+'.bin';output.set(uri,{data});gltf.buffers[index]={uri,byteLength:data.length};}
  return {gltf,files:output};
}
