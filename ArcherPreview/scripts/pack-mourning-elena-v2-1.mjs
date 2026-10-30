import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {basisModel} from './pack-village-ktx2.mjs';

const root=resolve(import.meta.dirname,'..'),run=promisify(execFile);
export const R9_CLIPS=['Chimera_Organic_Walk_2p4s','Chimera_Arcane_Cast_3s','Chimera_Prayer_Idle_6s','Chimera_Hit_Reaction_1p3s','Chimera_Death_Lament_5p2s','Soft_Breath_and_Bust','Halo_Slow_Orbit_48s','Halo_Cloth_Gravity_48s'];
export const R9_MORPHS=['Breath_Rise','Bust_Settle','Bust_ArmFollow','Cast_Palm_Cleanup','Cast_Elbow_Form','Hair_Cast_Wind','Death_Scream','Death_Hair_Cry','Death_Hair_Settle','Death_Ground_Contact','Death_Ground_Early'];
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const integer=(b,type,at)=>type===5121?b.readUInt8(at):type===5123?b.readUInt16LE(at):b.readUInt32LE(at);
export function accessorBytes({gltf:g,files},index){
 const a=g.accessors[index],element=sizes[a.componentType]*widths[a.type],out=Buffer.alloc(a.count*element);
 const view=i=>{const v=g.bufferViews[i];return {v,b:files.get(g.buffers[v.buffer].uri).data,at:v.byteOffset??0};};
 if(a.bufferView!==undefined){const {v,b,at}=view(a.bufferView),start=at+(a.byteOffset??0),stride=v.byteStride??element;for(let i=0;i<a.count;i++)b.copy(out,i*element,start+i*stride,start+i*stride+element);}
 if(a.sparse){const s=a.sparse,indices=view(s.indices.bufferView),values=view(s.values.bufferView);for(let i=0;i<s.count;i++){const to=integer(indices.b,s.indices.componentType,indices.at+(s.indices.byteOffset??0)+i*sizes[s.indices.componentType]),from=values.at+(s.values.byteOffset??0)+i*element;values.b.copy(out,to*element,from,from+element);}}
 return out;
}
export function compareBodyCorners(before,after){
 const oldMesh=before.gltf.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a'),newMesh=after.gltf.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a'),a=oldMesh.primitives[0],b=newMesh.primitives[0];
 const ia=accessorBytes(before,a.indices),ib=accessorBytes(after,b.indices),at=before.gltf.accessors[a.indices].componentType,bt=after.gltf.accessors[b.indices].componentType,count=before.gltf.accessors[a.indices].count;
 assert.equal(count,after.gltf.accessors[b.indices].count,'body triangle count changed');const attributes={};
 for(const name of ['POSITION','TEXCOORD_0','JOINTS_0','WEIGHTS_0','NORMAL']){
  const aa=before.gltf.accessors[a.attributes[name]],ba=after.gltf.accessors[b.attributes[name]];
  assert.equal(aa.componentType,ba.componentType);assert.equal(aa.type,ba.type);
  const old=accessorBytes(before,a.attributes[name]),now=accessorBytes(after,b.attributes[name]),stride=sizes[aa.componentType]*widths[aa.type];let differingCorners=0;
  for(let i=0;i<count;i++){const oi=integer(ia,at,i*sizes[at])*stride,ni=integer(ib,bt,i*sizes[bt])*stride;let equal=true;for(let k=0;k<stride;k++)if(old[oi+k]!==now[ni+k]){equal=false;break;}if(!equal)differingCorners++;}
  attributes[name]={corners:count,byteExact:differingCorners===0,differingCorners};
 }
 return {oldVertices:before.gltf.accessors[a.attributes.POSITION].count,newVertices:after.gltf.accessors[b.attributes.POSITION].count,triangles:count/3,attributes,method:'Expand each index in the unchanged triangle order; compare each POSITION/UV/joint/weight corner, allowing exporter vertex splits for corrective normals.'};
}
export function morphTextureEstimate(g,maxTextureSize=4096){
 const meshes=g.meshes.filter(m=>m.primitives[0].targets?.length).map(m=>{const p=m.primitives[0],vertices=g.accessors[p.attributes.POSITION].count,stride=Object.keys(p.targets[0]).length,targets=p.targets.length,width=Math.min(vertices*stride,maxTextureSize),height=Math.ceil(vertices*stride/maxTextureSize);return {mesh:m.name,vertices,targets,attributes:stride,width,height,bytes:width*height*targets*16};});
 return {format:'RGBA32F 2D-array; Babylon 9.31 float texture storage, shared by body/outline',maxTextureSize,meshes,bytes:meshes.reduce((n,m)=>n+m.bytes,0)};
}

export async function packMourningR9(){
 const source=process.env.MOURNING_ELENA_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1',review=resolve(root,'reports/elena-motion-v2-1'),content=resolve(root,'public/assets/content');
 const read=async p=>JSON.parse(await readFile(p,'utf8'));await mkdir(review,{recursive:true});
 const handoff=await read(resolve(source,'rigging/tripo-1-move-v2-1/handoff-manifest.json'));
 assert.equal(handoff.revision,'r9-attack-shape-repair');assert.equal(handoff.files.length,11);
 const inventory=async()=>{const result=[];for(const f of handoff.files){const bytes=await readFile(f.path),sha256=hash(bytes);assert.equal(bytes.length,f.bytes,f.path);assert.equal(sha256,f.sha256,f.path);result.push({path:f.path,bytes:bytes.length,sha256});}return result;};
 const sourceBefore=await inventory();
 const baselineText=(await run('git',['show','ed9a376:ArcherPreview/public/assets/mourning-elena.json'],{cwd:root,windowsHide:true,maxBuffer:1024*1024})).stdout;
 const previous=JSON.parse(baselineText);assert.equal(previous.rigRevision,'r8-v2-cast-wind-idle-hit');
 await writeFile(resolve(review,'runtime-r8-before.json'),baselineText);
 const originalPath=resolve(source,'models/tripo-1-move-v2-1/model.glb'),bytes=await readFile(originalPath),input=splitGlb(bytes),g=input.gltf;
 const r8=splitGlb(await readFile(resolve(source,'models/tripo-1-move-v2/model.glb')));
 const bodyComparison=compareBodyCorners(r8,input);
 for(const name of ['POSITION','TEXCOORD_0','JOINTS_0','WEIGHTS_0'])assert.equal(bodyComparison.attributes[name].byteExact,true,'r8 body '+name+' changed at triangle corners');
 assert.deepEqual(g.animations.map(a=>a.name).sort(),[...R9_CLIPS].sort());
 assert.equal(g.skins.reduce((n,s)=>n+s.joints.length,0),255);assert.equal(g.images.length,1);
 const body=g.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a'),mouth=g.meshes.find(m=>m.name==='Lament_Mouth_Interior');
 assert.deepEqual(body.extras.targetNames,R9_MORPHS);assert.deepEqual(mouth.extras.targetNames,['Death_Scream']);
 const mouthPositions=accessorBytes(input,mouth.primitives[0].attributes.POSITION);let mouthNeutralMaxDelta=0;for(let i=0;i<mouthPositions.length;i+=4)mouthNeutralMaxDelta=Math.max(mouthNeutralMaxDelta,Math.abs(mouthPositions.readFloatLE(i)-mouthPositions.readFloatLE(i%12)));assert.equal(mouthNeutralMaxDelta,0,'mouth must collapse to one rest point');
 const preservedSkinNames=g.skins.map(s=>({name:s.name,joints:s.joints.map(i=>g.nodes[i].name)}));
 assert.deepEqual(preservedSkinNames,r8.gltf.skins.map(s=>({name:s.name,joints:s.joints.map(i=>r8.gltf.nodes[i].name)})));
 const oldGltf=await read(resolve(root,'public/assets',previous.model)),textureName=oldGltf.images[0].uri,texture=await readFile(resolve(content,textureName));
 assert.ok(textureName.endsWith('.ktx2'));assert.equal(hash(texture)+'.ktx2',textureName);
 assert.ok(input.files.get(g.images[0].uri).data.equals(r8.files.get(r8.gltf.images[0].uri).data),'r9 painted image changed; do not silently encode a replacement');
 assert.equal(texture.readUInt32LE(20),4096);assert.equal(texture.readUInt32LE(24),4096);assert.equal(texture.readUInt32LE(40),13);
 input.files.set(textureName,{data:texture});
 const packed=await compressMeshopt(basisModel(g,[{name:g.images[0].name,uri:textureName,mimeType:'image/ktx2'}]),input.files),decoded=await decodeMeshoptBuffers(packed.gltf,packed.files);
 const viewBytes=(model,files,v)=>files.get(model.buffers[v.buffer].uri).data.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength),views=[];
 assert.equal(g.bufferViews.length,decoded.gltf.bufferViews.length);
 for(let i=0;i<g.bufferViews.length;i++){const a=viewBytes(g,input.files,g.bufferViews[i]),b=viewBytes(decoded.gltf,decoded.files,decoded.gltf.bufferViews[i]);assert.ok(a.equals(b),'nonlossless view '+i);views.push({index:i,bytes:a.length,sha256:hash(a)});}
 for(const key of ['accessors','nodes','meshes','skins','animations','scenes','scene','materials'])assert.deepEqual(packed.gltf[key],g[key],key+' changed during compression');
 let floatComponents=0;for(let i=0;i<g.accessors.length;i++)if(g.accessors[i].componentType===5126){const b=accessorBytes(input,i);for(let j=0;j<b.length;j+=4){assert.ok(Number.isFinite(b.readFloatLE(j)),'nonfinite accessor '+i);floatComponents++;}}
 const clips=g.animations.map(a=>{const duration=Math.max(...a.samplers.map(s=>g.accessors[s.input].max[0]));return {name:a.name,duration,channels:a.channels.length};});
 const meshInventory=g.meshes.map(m=>({name:m.name,targets:m.extras?.targetNames??[],primitives:m.primitives.map(p=>({vertices:g.accessors[p.attributes.POSITION].count,triangles:g.accessors[p.indices].count/3,material:p.material,skin:g.nodes.find(n=>g.meshes[n.mesh]===m)?.skin??null}))}));
 const triangles=meshInventory.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+p.triangles,0),0);assert.equal(triangles,143228);
 const stateClips={...previous.animations,dead:'Chimera_Death_Lament_5p2s'},fps=previous.fps;
 const config={...previous,version:'Mourning Elena · r9-attack-shape-repair',rigRevision:handoff.revision,animations:stateClips,catalog:Object.entries(stateClips).map(([name,clip])=>{const a=clips.find(a=>a.name===clip),frames=Math.round(a.duration*fps)+1;return {name,clip,duration:a.duration,frames,fps,rootTrack:Array.from({length:frames},()=>[0,0,0]),groundTrack:Array(frames).fill(0)};}),sourceClips:clips,model:'./content/'+packed.model,resources:[...packed.files.keys()].map(n=>'./content/'+n),sourceSha256:hash(bytes),geometry:{...previous.geometry,triangles,renderMeshes:4,materials:2,morphTargets:11,morphManagerTargets:12,mouthTriangles:96},motion:{...previous.motion,rigRevision:handoff.revision,deathSeconds:5.2,deathBlendSeconds:.18,deathClamp:true,deathHaloStopSeconds:2.8,castWindMorph:'Hair_Cast_Wind'}};
 await mkdir(content,{recursive:true});for(const [name,file]of packed.files){if(name===textureName)continue;await writeFile(resolve(content,name),file.data);}
 const sourceAfter=await inventory();assert.deepEqual(sourceBefore,sourceAfter,'handoff originals changed during packing');
 const oldTextureMemory=morphTextureEstimate(r8.gltf),newTextureMemory=morphTextureEstimate(g);
 const report={generatedAt:new Date().toISOString(),baseline:'ed9a376',source:{path:originalPath,sha256:hash(bytes),bytes:bytes.length,handoffFiles:11,allHandoffHashesVerified:true,readOnlyPreserved:true},bodyComparison,skinJointNamesAndOrderPreserved:true,sourcePackageClaims:await read(resolve(source,'rigging/tripo-1-move-v2-1/package-audit.json')),meshes:meshInventory,runtime:{model:packed.model,files:packed.files.size,bytes:[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),triangles,clips,skinCount:2,joints:255,morphTargetNames:11,morphManagerTargets:12},texture:{path:'public/assets/content/'+textureName,sha256:hash(texture),bytes:texture.length,width:4096,height:4096,mips:13,codec:'ETC1S q255 non-RDO',sourceJpegUnchanged:true,exactExistingKtx2Reused:true,newTextureFiles:0},losslessVerification:{bufferViewsCompared:views.length,accessors:g.accessors.length,floatComponents,allSourceBufferViewBytesEqual:true,allNodesMeshesSkinsAnimationsMaterialsIdentical:true,reordering:false,quantization:false,simplification:false},gpuEstimate:{morphBefore:oldTextureMemory,morphAfter:newTextureMemory,additionalMorphBytes:newTextureMemory.bytes-oldTextureMemory.bytes,draws:{beforeBody:3,afterBody:4,maximumBodyOutlineShadowPassesBefore:9,maximumBodyOutlineShadowPassesAfter:12,mouthAdditionalTrianglesPerPass:96,mouthAtRest:'all 280 vertices coincident; zero rasterized area, but one submitted draw unless runtime suppresses it'},limits:'Allocation estimates from Babylon 9.31 source, maxTextureSize4096, POSITION+NORMAL arrays. Actual WebGL caps/transcode target vary. Body/outline share managers; no GPU timings measured. Attribute-only fallback cannot assume 11 simultaneous position+normal targets fit a 16-attribute limit.'},views,files:[...packed.files].map(([name,f])=>({path:'public/assets/content/'+name,bytes:f.data.length,sha256:hash(f.data)}))};
 report.gpuEstimate.draws={beforeBody:3,packedBody:4,runtimeLivingBody:3,runtimeScreamingBody:4,outlineMeshes:3,maximumLivingBodyOutlineShadowPasses:9,maximumScreamingBodyOutlineShadowPasses:11,mouthAdditionalTrianglesPerPass:96,mouthAdditionalTrianglesWithShadow:192,mouthAtRest:'all 280 vertices coincident; runtime disables the mesh while Death_Scream<=.0001; mouth has no outline',verification:'scripts/audit-mourning-r9-morphs.mjs reads actual packed/runtime binding data; draw counts are pass upper bounds, not GPU measurements'};
 await writeFile(resolve(review,'source-inventory.json'),JSON.stringify({before:sourceBefore,after:sourceAfter},null,2)+'\n');
 await writeFile(resolve(review,'asset-pack-report.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile(resolve(root,'public/assets/mourning-elena.json'),JSON.stringify(config,null,2)+'\n');
 console.log(JSON.stringify({model:config.model,source:report.source,runtime:report.runtime,texture:report.texture,bodyComparison,gpuEstimate:report.gpuEstimate,verification:report.losslessVerification}));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packMourningR9();
