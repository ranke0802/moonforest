// Separate review artifact only; no change to the shipped phase-one model.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {accessorBytes} from './pack-mourning-elena-v2-1.mjs';
import {compressMeshopt} from './meshopt-lossless.js';
import {hash} from './resource-pack.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'reports/saint-50k-2026-11-02'),assets=resolve(root,'public/assets');
const baseline=resolve(out,'manifest-before.json');
const config=JSON.parse(await readFile(existsSync(baseline)?baseline:resolve(assets,'elena.json'),'utf8')),input=await readRuntimeGltf(pathToFileURL(resolve(assets,config.model))),g=input.gltf,h=structuredClone(g),p=g.meshes[0].primitives[0],cp=h.meshes[0].primitives[0];
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const floats=id=>{const b=accessorBytes(input,id);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
function integers(id){const b=accessorBytes(input,id),size=sizes[g.accessors[id].componentType];return Uint32Array.from({length:b.length/size},(_,i)=>size===1?b.readUInt8(i):size===2?b.readUInt16LE(i*2):b.readUInt32LE(i*4));}
const pos=floats(p.attributes.POSITION),normal=floats(p.attributes.NORMAL),uv=floats(p.attributes.TEXCOORD_0),joints=integers(p.attributes.JOINTS_0),weights=floats(p.attributes.WEIGHTS_0),indices=integers(p.indices),count=pos.length/3;
await MeshoptSimplifier.ready;
const parent=new Map();g.nodes.forEach((n,i)=>n.children?.forEach(c=>parent.set(c,i)));
const protectedJoints=new Set(g.skins[0].joints.map((node,j)=>{let cursor=node;while(cursor!==undefined){const name=g.nodes[cursor].name;if(/mixamorig:(Head|HeadTop_End|Neck|LeftHand|RightHand)$/.test(name))return j;cursor=parent.get(cursor);}return -1;}));protectedJoints.delete(-1);
const locks=new Uint8Array(count),positionMap=MeshoptSimplifier.generatePositionRemap(pos,3),seams=new Set(),firstUV=new Map();
for(let v=0;v<count;v++){const key=positionMap[v],previous=firstUV.get(key);if(previous!==undefined&&(Math.abs(uv[v*2]-uv[previous*2])>1e-6||Math.abs(uv[v*2+1]-uv[previous*2+1])>1e-6))seams.add(key);else if(previous===undefined)firstUV.set(key,v);}
// True open boundaries are measured after position welding, independently of
// exporter normal/UV splits. Preserve them and all fine head/hand anatomy.
const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let k=0;k<3;k++){const a=positionMap[indices[i+k]],b=positionMap[indices[i+(k+1)%3]];if(a===b)continue;const key=Math.min(a,b)+':'+Math.max(a,b);edges.set(key,(edges.get(key)??0)+1);}
const boundary=new Set();for(const [key,n]of edges)if(n===1)key.split(':').forEach(v=>boundary.add(Number(v)));
const attrs=new Float32Array(count*13);
for(let v=0;v<count;v++){
 const at=v*13;attrs.set(normal.subarray(v*3,v*3+3),at);attrs.set(uv.subarray(v*2,v*2+2),at+3);
 if(seams.has(positionMap[v]))locks[v]=2;if(boundary.has(positionMap[v]))locks[v]=1;
 for(let k=0;k<4;k++){const j=joints[v*4+k],w=weights[v*4+k];if(w>.12&&protectedJoints.has(j))locks[v]=1;for(let d=0;d<8;d++)attrs[at+5+d]+=w*Math.sin((j+1)*(d+1)*2.399963229728653);}
}
const start=performance.now(),[reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,attrs,13,[.4,.4,.4,1,1,...Array(8).fill(.2)],locks,49998*3,.005,['Permissive']);
const elapsedMs=performance.now()-start,used=Uint32Array.from([...new Set(reduced)].sort((a,b)=>a-b)),remap=new Uint32Array(count).fill(0xffffffff);used.forEach((v,i)=>remap[v]=i);
const attrsData=new Map(),oldAttributeIds=new Set(Object.values(p.attributes));
for(const id of oldAttributeIds){const a=g.accessors[id],bytes=accessorBytes(input,id),stride=bytes.length/a.count,compact=Buffer.alloc(used.length*stride);used.forEach((old,i)=>bytes.copy(compact,i*stride,old*stride,(old+1)*stride));attrsData.set(id,compact);}
attrsData.set(p.indices,Buffer.from(Uint32Array.from(reduced,v=>remap[v]).buffer));
// Repack original animation and inverse-bind streams byte for byte.
h.bufferViews=[];const chunks=[];let offset=0;
for(let id=0;id<h.accessors.length;id++){
 const a=h.accessors[id],bytes=attrsData.get(id)??accessorBytes(input,id),padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
 a.bufferView=h.bufferViews.length;a.byteOffset=0;delete a.sparse;
 if(oldAttributeIds.has(id)){a.count=used.length;delete a.min;delete a.max;}
 if(id===p.indices){a.count=reduced.length;a.componentType=5125;delete a.min;delete a.max;}
 if(id===p.attributes.POSITION){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(const v of used)for(let k=0;k<3;k++){a.min[k]=Math.min(a.min[k],pos[v*3+k]);a.max[k]=Math.max(a.max[k],pos[v*3+k]);}}
 h.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;
}
for(const k of ['extensionsUsed','extensionsRequired'])h[k]=(h[k]??[]).filter(x=>x!=='EXT_meshopt_compression');
const bytes=Buffer.concat(chunks),uri=hash(bytes)+'.bin';h.buffers=[{uri,byteLength:bytes.length}];const files=new Map([[uri,{data:bytes}]]);
for(const im of h.images)files.set(im.uri,{data:await readFile(resolve(assets,'content',im.uri))});
const packed=await compressMeshopt(h,files);await mkdir(resolve(out,'candidate'),{recursive:true});for(const [name,file]of packed.files)await writeFile(resolve(out,'candidate',name),file.data);
await writeFile(resolve(out,'retained-vertices.u32'),Buffer.from(used.buffer));await writeFile(resolve(out,'manifest-before.json'),JSON.stringify(config,null,2)+'\n');
const report={createdAt:new Date().toISOString(),status:reduced.length/3<=50000?'candidate-needs-motion-and-visual-validation':'target-not-reached',source:{model:config.model,triangles:indices.length/3,vertices:count},candidate:{model:packed.model,triangles:reduced.length/3,vertices:used.length,reportedCombinedAttributeError:error,elapsedMs,lockedVertices:locks.filter(x=>x===1).length,seamProtectedVertices:locks.filter(x=>x===2).length},texture:{...config.texture,file:h.images[0].uri,byteExactExistingTexture:true},method:'Attribute-aware simplification across export normal splits; UV seam protection, head/hand/true boundary vertex locks. Retained vertex attributes remain exact. Original skin/animations unchanged.',productionChanged:false};
await writeFile(resolve(out,'candidate-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
