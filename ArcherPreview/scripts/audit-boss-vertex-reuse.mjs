import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function expanded(gltf,files,a){
  const size=sizes[a.componentType]*widths[a.type],raw=Buffer.alloc(size*a.count);
  const view=id=>{const v=gltf.bufferViews[id];return {v,bytes:files.get(gltf.buffers[v.buffer].uri).data.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)};};
  if(a.bufferView!==undefined){const {v,bytes}=view(a.bufferView),stride=v.byteStride??size;for(let i=0;i<a.count;i++)bytes.copy(raw,i*size,(a.byteOffset??0)+i*stride,(a.byteOffset??0)+i*stride+size);}
  if(a.sparse){const s=a.sparse,indices=view(s.indices.bufferView).bytes,values=view(s.values.bufferView).bytes,step=sizes[s.indices.componentType];for(let i=0;i<s.count;i++){const index=indices.readUIntLE((s.indices.byteOffset??0)+i*step,step),start=(s.values.byteOffset??0)+i*size;values.copy(raw,index*size,start,start+size);}}
  return {raw,offset:0,size,stride:size};
}
const result={generatedAt:new Date().toISOString(),method:'Exact byte identity across all vertex attributes and every morph target. CPU data audit, no simplification or GPU/frame-rate claim.',models:[]};
for(const name of ['elena','mourning-elena']){
  const manifest=new URL('../public/assets/'+name+'.json',import.meta.url),config=JSON.parse(readFileSync(manifest)),url=new URL(config.model,manifest),{gltf,files}=await readRuntimeGltf(url);
  const primitives=[];
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    const accessors=[...Object.values(p.attributes),...(p.targets??[]).flatMap(t=>Object.values(t))].map(i=>gltf.accessors[i]);
    const count=accessors[0].count,streams=accessors.map(a=>expanded(gltf,files,a));
    const unique=new Set();for(let i=0;i<count;i++)unique.add(streams.map(s=>s.raw.subarray(s.offset+i*s.stride,s.offset+i*s.stride+s.size).toString('base64')).join('|'));
    primitives.push({name:mesh.name,vertices:count,exactUnique:unique.size,triangles:gltf.accessors[p.indices].count/3,vertexBytes:streams.reduce((n,s)=>n+s.size*count,0),savableVertexBytes:streams.reduce((n,s)=>n+s.size*(count-unique.size),0)});
  }
  result.models.push({name,model:config.model,primitives});
}
mkdirSync(new URL('../reports/mobile-polish/',import.meta.url),{recursive:true});writeFileSync(new URL('../reports/mobile-polish/vertex-reuse.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
