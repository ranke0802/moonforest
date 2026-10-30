import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {splitGlb,hash} from './resource-pack.js';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {basisModel} from './pack-village-ktx2.mjs';

const run=promisify(execFile),root=resolve(import.meta.dirname,'..'),review=resolve(root,'reports/elena-two-phase');
const source=process.env.MOURNING_ELENA_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/elina-three-model-review/2026-10-30-v1';
const ktx=process.env.KTX_EXE??'C:/Program Files/KTX-Software/bin/ktx.exe';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const audit=await read(resolve(review,'asset-source-audit.json'));
const bytes=await readFile(resolve(source,'models/tripo-1-move/model.glb'));
assert.equal(hash(bytes),audit.sourceSha256,'Source changed after audit');
const input=splitGlb(bytes),g=input.gltf;
const required=['Chimera_Organic_Walk_2p4s','Chimera_Arcane_Cast_3s','Soft_Breath_and_Bust','Halo_Slow_Orbit_48s','Halo_Cloth_Gravity_48s'];
assert.deepEqual(g.animations.map(a=>a.name).sort(),required.slice().sort());
assert.equal(g.skins.reduce((n,s)=>n+s.joints.length,0),255);
assert.equal(g.images.length,1);
const textureAudit=audit.images[0],texturePath=resolve(review,'asset-mourning-color.ktx2');
assert.ok(textureAudit.size.every(v=>v<=4096));
const encodeArgs=['create','--format',textureAudit.alpha?'R8G8B8A8_SRGB':'R8G8B8_SRGB','--encode','basis-lz','--qlevel','255','--clevel','2','--no-endpoint-rdo','--no-selector-rdo','--generate-mipmap','--assign-tf','srgb','--assign-primaries','bt709','--threads','4','--compare-psnr','--compare-ssim',textureAudit.png,texturePath];
console.log('Encoding original-resolution ETC1S texture...');
const enc=await run(ktx,encodeArgs,{maxBuffer:8*1024*1024,windowsHide:true});
await writeFile(resolve(review,'asset-texture-encode.log'),enc.stdout+enc.stderr);
await run(ktx,['extract','--transcode','rgba8','--level','0',texturePath,resolve(review,'asset-decoded-texture-0.png')],{windowsHide:true});
const texture=await readFile(texturePath),textureName=hash(texture)+'.ktx2';
assert.equal(texture.readUInt32LE(20),textureAudit.size[0]);assert.equal(texture.readUInt32LE(24),textureAudit.size[1]);
assert.equal(texture.readUInt32LE(40),13,'Expected full 4K mip chain');
input.files.set(textureName,{data:texture});
const packed=await compressMeshopt(basisModel(g,[{name:g.images[0].name,uri:textureName,mimeType:'image/ktx2'}]),input.files);
const decoded=await decodeMeshoptBuffers(packed.gltf,packed.files);
const viewBytes=(model,files,v)=>files.get(model.buffers[v.buffer].uri).data.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
assert.equal(g.bufferViews.length,decoded.gltf.bufferViews.length);
const views=[];
for(let i=0;i<g.bufferViews.length;i++){
  const a=viewBytes(g,input.files,g.bufferViews[i]),b=viewBytes(decoded.gltf,decoded.files,decoded.gltf.bufferViews[i]);
  assert.ok(a.equals(b),'Changed buffer view '+i);views.push({index:i,bytes:a.length,sha256:hash(a)});
}
for(const key of ['accessors','nodes','meshes','skins','animations','scenes','scene'])assert.deepEqual(packed.gltf[key],g[key],key+' changed');
const content=resolve(root,'public/assets/content');await mkdir(content,{recursive:true});
for(const [name,file]of packed.files)await writeFile(resolve(content,name),file.data);
const fps=30,scale=audit.scale,center=audit.bounds.center;
const stateClips={idle:'Chimera_Organic_Walk_2p4s',walk:'Chimera_Organic_Walk_2p4s',cast:'Chimera_Arcane_Cast_3s',dead:'Chimera_Organic_Walk_2p4s'};
const config={version:'Mourning Elena · r7-shoulder-led-upper-arm-cast',id:'mourning-elena',displayName:'비탄의 마녀',scale,forwardYaw:0,fps,
  sourceHeight:audit.sourceHeight,sourceCenter:center,height:3.2,gaitSeconds:2.4,distanceSourcePerCycle:0.2285714285714286,rigRevision:'r7-shoulder-led-upper-arm-cast',centerOffset:[-center[0],0,-center[2]],modelOffset:[-center[0]*scale,0,-center[2]*scale],
  animations:stateClips,catalog:Object.entries(stateClips).map(([name,clip])=>{const a=audit.animations.find(a=>a.name===clip);return {name,clip,duration:a.duration,frames:Math.round(a.duration*fps)+1,fps,rootTrack:Array.from({length:Math.round(a.duration*fps)+1},()=>[0,0,0]),groundTrack:Array.from({length:Math.round(a.duration*fps)+1},()=>0)};}),sourceClips:audit.animations,
  model:'./content/'+packed.model,resources:[...packed.files.keys()].map(n=>'./content/'+n),sourceSha256:audit.sourceSha256,
  texture:{width:4096,height:4096,codec:'ETC1S',quality:255,endpointRdo:false,selectorRdo:false,mipmaps:true,alpha:textureAudit.alpha},
  geometry:{triangles:audit.triangles,originalTopology:true,lossless:true,deformBones:255,skins:2,morphTargets:5},
  motion:{rigRevision:'r7-shoulder-led-upper-arm-cast',gaitSeconds:2.4,castSeconds:3,distanceSourcePerCycle:0.2285714285714286,baseWalkSpeed:0.2285714285714286*scale/2.4,defaultGaitRate:2},
  style:{pbr:false,outlinePixels:.5,internalLineStrength:.2,brightness:1.35,contactGround:true}};
await writeFile(resolve(root,'public/assets/mourning-elena.json'),JSON.stringify(config,null,2)+'\n');
const total=[...packed.files.values()].reduce((n,f)=>n+f.data.length,0),mipPixels=Array.from({length:13},(_,i)=>Math.max(1,4096>>i)**2).reduce((a,b)=>a+b,0),blocks=Array.from({length:13},(_,i)=>Math.ceil(Math.max(1,4096>>i)/4)**2).reduce((a,b)=>a+b,0);
const report={source:{path:resolve(source,'models/tripo-1-move/model.glb'),sha256:audit.sourceSha256,bytes:bytes.length,triangles:audit.triangles},runtime:{config:'public/assets/mourning-elena.json',model:packed.model,files:packed.files.size,bytes:total,reductionPercent:(1-total/bytes.length)*100,triangles:audit.triangles,clips:required,skinCount:2,joints:255,morphTargets:5},compression:{meshopt:packed.stats,texture:{bytes:texture.length,sourceEncodedBytes:textureAudit.sourceEncodedBytes,codec:'ETC1S',quality:255,rdo:false,width:4096,height:4096,mipLevels:13,alpha:false}},textureMemory:{sourceRGBA8WithMips:mipPixels*4,etcRGBWithMips:blocks*8,etcRGBAWithMips:blocks*16,note:'GPU allocation depends on supported transcode target; opaque ETC1/BC1 uses 8 bytes per 4x4 block; RGBA/BC7 uses 16.'},losslessVerification:{bufferViewsCompared:views.length,accessorsIdentical:g.accessors.length,allSourceBufferViewBytesEqual:true,allNodesSkinsMeshesAnimationsIdentical:true,quantization:false,reordering:false,simplification:false},views,files:[...packed.files].map(([name,f])=>({path:'public/assets/content/'+name,bytes:f.data.length}))};
await writeFile(resolve(review,'asset-pack-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runtime:report.runtime,compression:report.compression,textureMemory:report.textureMemory,verification:report.losslessVerification}));
