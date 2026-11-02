// Isolated feasibility candidate. Never writes public/ or production manifests.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {MeshoptSimplifier} from 'meshoptimizer';
import {splitGlb,hash} from './resource-pack.js';
import {accessorBytes,morphTextureEstimate} from './pack-mourning-elena-v2-1.mjs';
import {compressMeshopt} from './meshopt-lossless.js';
import {basisModel} from './pack-village-ktx2.mjs';

const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'reports/mourning-50k-2026-11-02');
const sourcePath='C:/Users/ryank/Documents/ChatGPT/MM Project/output/elena-motion-expansion/2026-10-31/models/model.glb';
const sourceBytes=await readFile(sourcePath),config=JSON.parse(await readFile(existsSync(resolve(out,'manifest-before.json'))?resolve(out,'manifest-before.json'):resolve(root,'public/assets/mourning-elena.json'),'utf8'));
assert.equal(hash(sourceBytes),config.sourceSha256,'Use exactly the shipped revision');
const input=splitGlb(sourceBytes),g=input.gltf,candidate=structuredClone(g),files=new Map(input.files);
const meshIndex=g.meshes.findIndex(m=>m.name==='tripo_mesh_b9a89d0a'),p=g.meshes[meshIndex].primitives[0],cp=candidate.meshes[meshIndex].primitives[0];
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function floats(id){const b=accessorBytes(input,id);return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function integers(id){const b=accessorBytes(input,id),a=g.accessors[id],stride=sizes[a.componentType];return Uint32Array.from({length:b.length/stride},(_,i)=>stride===1?b.readUInt8(i):stride===2?b.readUInt16LE(i*2):b.readUInt32LE(i*4));}
const positions=floats(p.attributes.POSITION),normals=floats(p.attributes.NORMAL),uv=floats(p.attributes.TEXCOORD_0),joints=integers(p.attributes.JOINTS_0),weights=floats(p.attributes.WEIGHTS_0),indices=integers(p.indices);
const vertices=positions.length/3,skin=g.skins[g.nodes.find(n=>n.mesh===meshIndex).skin],names=skin.joints.map(i=>g.nodes[i].name);
// Preserve all head/neck, prayer-hand, finger and toe vertices. Palms/forearms
// retain their exact source weights and corrective deltas on retained vertices.
const locks=new Uint8Array(vertices),lockPattern=/^DEF_(Head|Neck)$|^DEF_Prayer_|_Finger\d|_Toe\d/;
const important=['Cast_Palm_Cleanup','Cast_Elbow_Form','Death_Ground_Contact','Death_Ground_Early'];
const morphs=important.map(name=>floats(p.targets[g.meshes[meshIndex].extras.targetNames.indexOf(name)].POSITION));
const stride=25,attrs=new Float32Array(vertices*stride);
for(let v=0;v<vertices;v++){
  let offset=v*stride;attrs.set(normals.subarray(v*3,v*3+3),offset);offset+=3;
  attrs.set(uv.subarray(v*2,v*2+2),offset);offset+=2;
  for(const m of morphs){attrs.set(m.subarray(v*3,v*3+3),offset);offset+=3;}
  for(let k=0;k<4;k++){
    const j=joints[v*4+k],w=weights[v*4+k];
    if(w>.12&&lockPattern.test(names[j]))locks[v]=1;
    // Smooth hashed projection of the skin-weight vector: equal bones stay
    // equal; unlike raw numeric joint IDs it does not invent ordinal distance.
    for(let d=0;d<8;d++)attrs[offset+d]+=w*Math.sin((j+1)*(d+1)*2.399963229728653);
  }
}
await MeshoptSimplifier.ready;
const otherTriangles=g.meshes.filter((_,i)=>i!==meshIndex).reduce((n,m)=>n+g.accessors[m.primitives[0].indices].count/3,0);
const start=performance.now();
const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attrs,stride,[.2,.2,.2,1,1,...Array(12).fill(3),...Array(8).fill(.12)],locks,(50000-otherTriangles)*3,.008,['LockBorder']);
const elapsedMs=performance.now()-start;
// Consistent compact remapping for every source attribute and morph stream.
const used=Uint32Array.from([...new Set(reduced)].sort((a,b)=>a-b)),remap=new Uint32Array(vertices).fill(0xffffffff);
used.forEach((old,i)=>remap[old]=i);
const reducedIndices=Uint32Array.from(reduced,i=>remap[i]);
const chunks=[];let byteOffset=0;const bufferIndex=candidate.buffers.length,verified=[];
function appendAccessor(data,definition){const padding=(4-byteOffset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteOffset+=padding;}const view=candidate.bufferViews.length;candidate.bufferViews.push({buffer:bufferIndex,byteOffset,byteLength:data.length});chunks.push(data);byteOffset+=data.length;const id=candidate.accessors.length;const a={...definition,bufferView:view,byteOffset:0};delete a.sparse;candidate.accessors.push(a);return id;}
const originalIds=new Set([...Object.values(p.attributes),...p.targets.flatMap(t=>Object.values(t))]);
const accessors=new Map();
for(const id of originalIds){
  const a=g.accessors[id],element=sizes[a.componentType]*widths[a.type],before=accessorBytes(input,id),after=Buffer.alloc(used.length*element);
  used.forEach((old,i)=>before.copy(after,i*element,old*element,(old+1)*element));
  // Exact source entries, no resampling of normals/UV/skin/morph data.
  for(let i=0;i<used.length;i++)assert.ok(after.subarray(i*element,(i+1)*element).equals(before.subarray(used[i]*element,(used[i]+1)*element)));
  const definition={...a,count:used.length};delete definition.min;delete definition.max;
  if(id===p.attributes.POSITION){definition.min=[Infinity,Infinity,Infinity];definition.max=[-Infinity,-Infinity,-Infinity];for(const old of used)for(let k=0;k<3;k++){definition.min[k]=Math.min(definition.min[k],positions[old*3+k]);definition.max[k]=Math.max(definition.max[k],positions[old*3+k]);}}
  accessors.set(id,appendAccessor(after,definition));verified.push({id,elements:used.length,byteExactAtRetainedVertices:true});
}
for(const key in cp.attributes)cp.attributes[key]=accessors.get(p.attributes[key]);
cp.targets=p.targets.map(t=>Object.fromEntries(Object.entries(t).map(([key,id])=>[key,accessors.get(id)])));
cp.indices=appendAccessor(Buffer.from(reducedIndices.buffer),{componentType:5125,count:reducedIndices.length,type:'SCALAR'});
const buffer=Buffer.concat(chunks),bufferName=hash(buffer)+'.bin';candidate.buffers.push({uri:bufferName,byteLength:buffer.length});files.set(bufferName,{data:buffer});
// Repack just referenced accessors: no dead full-resolution body data retained.
const referenced=new Set();for(const m of candidate.meshes)for(const q of m.primitives){Object.values(q.attributes).forEach(i=>referenced.add(i));referenced.add(q.indices);q.targets?.forEach(t=>Object.values(t).forEach(i=>referenced.add(i)));}for(const s of candidate.skins)referenced.add(s.inverseBindMatrices);for(const a of candidate.animations)for(const s of a.samplers){referenced.add(s.input);referenced.add(s.output);}
const ids=[...referenced].sort((a,b)=>a-b),idmap=new Map(ids.map((id,i)=>[id,i]));const rawChunks=[];let cursor=0;const oldViews=candidate.bufferViews,oldAccessors=candidate.accessors,oldBuffers=candidate.buffers;
const reducedInput={gltf:structuredClone(candidate),files};candidate.bufferViews=[];candidate.accessors=[];
for(const id of ids){const a=oldAccessors[id],data=accessorBytes(reducedInput,id),padding=(4-cursor%4)%4;if(padding){rawChunks.push(Buffer.alloc(padding));cursor+=padding;}const view=candidate.bufferViews.length;candidate.bufferViews.push({buffer:0,byteOffset:cursor,byteLength:data.length});rawChunks.push(data);cursor+=data.length;const clean={...a,bufferView:view,byteOffset:0};delete clean.sparse;candidate.accessors.push(clean);}
for(const m of candidate.meshes)for(const q of m.primitives){for(const k in q.attributes)q.attributes[k]=idmap.get(q.attributes[k]);q.indices=idmap.get(q.indices);for(const t of q.targets??[])for(const k in t)t[k]=idmap.get(t[k]);}for(const s of candidate.skins)s.inverseBindMatrices=idmap.get(s.inverseBindMatrices);for(const a of candidate.animations)for(const s of a.samplers){s.input=idmap.get(s.input);s.output=idmap.get(s.output);}
const raw=Buffer.concat(rawChunks),rawName=hash(raw)+'.bin';candidate.buffers=[{uri:rawName,byteLength:raw.length}];const rawFiles=new Map([[rawName,{data:raw}]]);
const runtime=JSON.parse(await readFile(resolve(root,'public/assets',config.model),'utf8')),textureName=runtime.images[0].uri,texture=await readFile(resolve(root,'public/assets/content',textureName));rawFiles.set(textureName,{data:texture});
const basis=basisModel(candidate,[{name:g.images[0].name,uri:textureName,mimeType:'image/ktx2'}]),packed=await compressMeshopt(basis,rawFiles);
await mkdir(resolve(out,'candidate'),{recursive:true});for(const [name,file]of packed.files)await writeFile(resolve(out,'candidate',name),file.data);
await writeFile(resolve(out,'retained-vertices.u32'),Buffer.from(used.buffer));
const report={createdAt:new Date().toISOString(),status:reduced.length/3+otherTriangles<=50000?'candidate-needs-visual-validation':'target-not-reached',source:{path:sourcePath,sha256:hash(sourceBytes),runtimeModel:config.model,triangles:indices.length/3+otherTriangles,vertices:g.meshes.reduce((n,m)=>n+g.accessors[m.primitives[0].attributes.POSITION].count,0)},candidate:{model:packed.model,triangles:reduced.length/3+otherTriangles,bodyTriangles:reduced.length/3,vertices:used.length+g.meshes.filter((_,i)=>i!==meshIndex).reduce((n,m)=>n+g.accessors[m.primitives[0].attributes.POSITION].count,0),bodyVertices:used.length,elapsedMs,reportedCombinedAttributeError:error,targetError:.008,protectedVertices:locks.reduce((a,b)=>a+b,0),protected:'head, neck, prayer arms/hands, fingers and toes',otherMeshesUnchanged:true},texture:{sha256:hash(texture),file:textureName,bytes:texture.length,width:texture.readUInt32LE(20),height:texture.readUInt32LE(24),byteExactExistingTexture:true},preserved:{nodes:JSON.stringify(g.nodes)===JSON.stringify(candidate.nodes),skinBonesAndOrder:true,animationChannelsAndKeys:true,morphNames:g.meshes[meshIndex].extras.targetNames,attributes:verified},morphMemory:{before:morphTextureEstimate(g),after:morphTextureEstimate(candidate)},limits:['Triangle reduction is lossy geometry simplification, not lossless compression.','Retained vertices are exact, but surface interpolation may differ.','Not deployed; visual and motion evaluation pending.']};
assert.equal(hash(await readFile(sourcePath)),config.sourceSha256);
await writeFile(resolve(out,'candidate-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,source:report.source,candidate:report.candidate,texture:report.texture,morphBytesBefore:report.morphMemory.before.bytes,morphBytesAfter:report.morphMemory.after.bytes}));
