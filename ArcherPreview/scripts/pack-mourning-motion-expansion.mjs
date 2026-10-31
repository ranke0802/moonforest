import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {basisModel} from './pack-village-ktx2.mjs';
import {R9_CLIPS,R9_MORPHS,accessorBytes,compareBodyCorners,morphTextureEstimate} from './pack-mourning-elena-v2-1.mjs';

export const R10_CAST_CLIPS={cast:'Chimera_Arcane_Cast_3s',cast_slam:'Chimera_Advance_Slam_3s',cast_alternate:'Chimera_Alternating_Cast_3s'};
export const R10_CLIPS=[...R9_CLIPS,R10_CAST_CLIPS.cast_slam,R10_CAST_CLIPS.cast_alternate];
const root=resolve(import.meta.dirname,'..'),review=resolve(root,'reports/elena-motion-expansion');
const source=process.env.MOURNING_MOTION_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elena-motion-expansion/2026-10-31';
const original='C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1/models/tripo-1-move-v2-1/model.glb';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
function unchangedClip(before,after,name){
 const channels=(input)=>{const g=input.gltf,a=g.animations.find(a=>a.name===name);assert.ok(a,name);return new Map(a.channels.map(c=>{const s=a.samplers[c.sampler];return [g.nodes[c.target.node].name+':'+c.target.path,{interpolation:s.interpolation??'LINEAR',time:accessorBytes(input,s.input),value:accessorBytes(input,s.output)}];}));};
 const a=channels(before),b=channels(after);assert.equal(a.size,b.size,name+' channel count');
 for(const [key,value]of a){const next=b.get(key);assert.ok(next,name+'/'+key);assert.equal(next.interpolation,value.interpolation);assert.ok(value.time.equals(next.time),name+'/'+key+' time');assert.ok(value.value.equals(next.value),name+'/'+key+' output');}
 return {name,channels:a.size,byteExact:true};
}
function pruneUnusedAnimationStreams(g){
 const used=new Set();for(const m of g.meshes)for(const p of m.primitives){for(const a of Object.values(p.attributes))used.add(a);if(p.indices!==undefined)used.add(p.indices);for(const t of p.targets??[])for(const a of Object.values(t))used.add(a);}
 for(const skin of g.skins)if(skin.inverseBindMatrices!==undefined)used.add(skin.inverseBindMatrices);
 for(const a of g.animations)for(const s of a.samplers){used.add(s.input);used.add(s.output);}
 const ids=[...used].sort((a,b)=>a-b),map=new Map(ids.map((n,i)=>[n,i]));
 for(const m of g.meshes)for(const p of m.primitives){for(const key in p.attributes)p.attributes[key]=map.get(p.attributes[key]);if(p.indices!==undefined)p.indices=map.get(p.indices);for(const t of p.targets??[])for(const key in t)t[key]=map.get(t[key]);}
 for(const s of g.skins)if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=map.get(s.inverseBindMatrices);
 for(const a of g.animations)for(const s of a.samplers){s.input=map.get(s.input);s.output=map.get(s.output);}
 const removedAccessors=g.accessors.length-ids.length;g.accessors=ids.map(i=>g.accessors[i]);
 const views=new Set();for(const a of g.accessors){if(a.bufferView!==undefined)views.add(a.bufferView);if(a.sparse){views.add(a.sparse.indices.bufferView);views.add(a.sparse.values.bufferView);}}
 const vid=[...views].sort((a,b)=>a-b),vm=new Map(vid.map((n,i)=>[n,i]));
 for(const a of g.accessors){if(a.bufferView!==undefined)a.bufferView=vm.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=vm.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=vm.get(a.sparse.values.bufferView);}}
 const removedViews=g.bufferViews.length-vid.length;g.bufferViews=vid.map(i=>g.bufferViews[i]);
 const buffers=[...new Set(g.bufferViews.map(v=>v.buffer))].sort((a,b)=>a-b),bm=new Map(buffers.map((n,i)=>[n,i]));
 g.buffers=buffers.map(i=>g.buffers[i]);for(const v of g.bufferViews)v.buffer=bm.get(v.buffer);
 return {removedAccessors,removedViews};
}
export async function packMourningExpansion(){
 await mkdir(review,{recursive:true});
 const previous=await read(resolve(review,'runtime-before.json'));assert.equal(previous.rigRevision,'r9-attack-shape-repair');
 const originalBytes=await readFile(original);assert.equal(hash(originalBytes),'9673c3aa680f521c8d861001458e41e98dabc6edb046cf726c13540acc31f061');
 const baseline=splitGlb(originalBytes),bytes=await readFile(resolve(source,'models/model.glb')),input=splitGlb(bytes),g=input.gltf;
 const handoff=await read(resolve(source,'handoff.json'));assert.equal(handoff.revision,'r10-attack-variants-knee');assert.equal(hash(bytes),handoff.sourceSha256);assert.equal(bytes.length,handoff.sourceBytes);
 assert.deepEqual(g.animations.map(a=>a.name).sort(),[...R10_CLIPS].sort());
 const bodyComparison=compareBodyCorners(baseline,input);
 for(const key of ['POSITION','TEXCOORD_0','NORMAL','JOINTS_0','WEIGHTS_0'])assert.equal(bodyComparison.attributes[key].byteExact,true,'source '+key);
 const skinNames=input=>input.gltf.skins.map(s=>({name:s.name,joints:s.joints.map(i=>input.gltf.nodes[i].name)}));
 assert.deepEqual(skinNames(baseline),skinNames(input));assert.equal(g.skins.reduce((n,s)=>n+s.joints.length,0),255);
 const body=g.meshes.find(m=>m.name==='tripo_mesh_b9a89d0a');assert.deepEqual(body.extras.targetNames,R9_MORPHS);
 const preservedClips=R9_CLIPS.filter(n=>n!=='Chimera_Death_Lament_5p2s').map(n=>unchangedClip(baseline,input,n));
 const pruned=pruneUnusedAnimationStreams(g);
 const oldGltf=await read(resolve(root,'public/assets',previous.model)),textureName=oldGltf.images[0].uri;
 const texture=await readFile(resolve(root,'public/assets/content',textureName));assert.equal(hash(texture)+'.ktx2',textureName);assert.equal(g.images.length,1);
 input.files.set(textureName,{data:texture});
 const packed=await compressMeshopt(basisModel(g,[{name:g.images[0].name,uri:textureName,mimeType:'image/ktx2'}]),input.files),decoded=await decodeMeshoptBuffers(packed.gltf,packed.files);
 const viewBytes=(input,v)=>input.files.get(input.gltf.buffers[v.buffer].uri).data.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 for(let i=0;i<g.bufferViews.length;i++)assert.ok(viewBytes(input,g.bufferViews[i]).equals(viewBytes(decoded,decoded.gltf.bufferViews[i])),'meshopt view '+i);
 const clips=g.animations.map(a=>({name:a.name,duration:Math.max(...a.samplers.map(s=>g.accessors[s.input].max[0])),channels:a.channels.length}));
 const triangles=g.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);assert.equal(triangles,previous.geometry.triangles);
 const stateClips={...previous.animations,cast_slam:R10_CAST_CLIPS.cast_slam,cast_alternate:R10_CAST_CLIPS.cast_alternate};
 for(const name of Object.values(R10_CAST_CLIPS))assert.ok(Math.abs(clips.find(c=>c.name===name).duration-3)<1e-6);
 const config={...previous,version:'Mourning Elena · r10-attack-variants-knee',rigRevision:'r10-attack-variants-knee',animations:stateClips,
  catalog:Object.entries(stateClips).map(([name,clip])=>{const duration=clips.find(c=>c.name===clip).duration,frames=Math.round(duration*30)+1;return {name,clip,duration,frames,fps:30,rootTrack:Array.from({length:frames},()=>[0,0,0]),groundTrack:Array(frames).fill(0)};}),sourceClips:clips,sourceSha256:hash(bytes),model:'./content/'+packed.model,resources:[...packed.files.keys()].map(n=>'./content/'+n),
  motion:{...previous.motion,rigRevision:'r10-attack-variants-knee',castVariants:R10_CAST_CLIPS,alternateReach:handoff.castAlternate.palmReach,slamAdvanceMetres:.9,slamImpactSeconds:1.65,alternatingImpactSeconds:1.65}};
 await mkdir(resolve(root,'public/assets/content'),{recursive:true});for(const [name,file]of packed.files)if(name!==textureName)await writeFile(resolve(root,'public/assets/content',name),file.data);
 assert.equal(hash(await readFile(original)),hash(originalBytes));
 await writeFile(resolve(root,'public/assets/mourning-elena.json'),JSON.stringify(config,null,2)+'\n');
 const result={source:resolve(source,'models/model.glb'),sourceSha256:hash(bytes),baselineSha256:hash(originalBytes),bodyComparison,preservedClips,pruned,jointOrderPreserved:true,textureReused:textureName,triangles,clips,morphMemoryBefore:morphTextureEstimate(baseline.gltf),morphMemoryAfter:morphTextureEstimate(g),packedBytes:[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),originalUnchanged:true};
 await writeFile(resolve(review,'pack-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({triangles,clips:clips.length,packedBytes:result.packedBytes,sourceSha256:result.sourceSha256}));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await packMourningExpansion();
