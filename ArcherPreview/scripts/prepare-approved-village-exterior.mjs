// Prepare the user-approved, whole-village exterior without modifying live
// resources. --apply is deliberately separate and checks the current asset,
// content hashes and source registry before changing only great-plains.json.
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {deflateSync,inflateSync} from 'node:zlib';
import {resolve,relative,basename} from 'node:path';
import assert from 'node:assert/strict';
import {sourcePath,projectRoot,toolPath} from '../../Sources/resolve-source.mjs';
import {compressMeshopt,decodeMeshoptBuffers} from './meshopt-lossless.js';
import {readAccessor} from './web-geometry.js';
import {sceneryNativeFingerprint} from './approved-scenery-policy.mjs';

const root=projectRoot, sourceId='village-exterior-shell-review';
const input=name=>sourcePath(sourceId,name), stage=resolve(input('.'),'runtime');
const publicAssets=resolve(root,'ArcherPreview/public/assets'), content=resolve(publicAssets,'content');
const reportDir=resolve(root,'exports/village-exterior-runtime-review-2026-11-09');
const sha=b=>createHash('sha256').update(b).digest('hex'), slash=p=>p.replaceAll('\\','/');
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const run=promisify(execFile), ktx=toolPath('ktx');
const options=new Set(process.argv.slice(2));
for(const x of options)assert.ok(x==='--apply',`Unknown option ${x}`);

// PNGs here are 8-bit noninterlaced RGB/RGBA/grayscale. Decode the actual
// straight channels; alpha is intentionally dropped because the approved
// material is OPAQUE. No compositing, resampling or recoloring is performed.
function decodePng(data){
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let at=8,w,h,depth,color,interlace,parts=[];
  while(at<data.length){const n=data.readUInt32BE(at),type=data.toString('ascii',at+4,at+8),body=data.subarray(at+8,at+8+n);at+=12+n;
    if(type==='IHDR'){w=body.readUInt32BE(0);h=body.readUInt32BE(4);depth=body[8];color=body[9];interlace=body[12];}
    if(type==='IDAT')parts.push(body);if(type==='IEND')break;
  }
  assert.equal(depth,8);assert.equal(interlace,0);const channels={0:1,2:3,6:4}[color];assert.ok(channels,`Unsupported PNG color type ${color}`);
  const stride=w*channels,raw=inflateSync(Buffer.concat(parts));assert.equal(raw.length,h*(stride+1));const out=Buffer.alloc(h*stride);
  for(let y=0;y<h;y++){const src=y*(stride+1),dst=y*stride,filter=raw[src];for(let x=0;x<stride;x++){
    const left=x>=channels?out[dst+x-channels]:0,up=y?out[dst+x-stride]:0,ul=y&&x>=channels?out[dst+x-stride-channels]:0;let pred=0;
    if(filter===1)pred=left;else if(filter===2)pred=up;else if(filter===3)pred=(left+up)>>1;else if(filter===4){const z=left+up-ul,da=Math.abs(z-left),db=Math.abs(z-up),dc=Math.abs(z-ul);pred=da<=db&&da<=dc?left:db<=dc?up:ul;}else assert.equal(filter,0);
    out[dst+x]=(raw[src+1+x]+pred)&255;
  }}return {w,h,channels,pixels:out};
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const t=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);let c=0xffffffff;for(const x of Buffer.concat([t,data]))c=crcTable[(c^x)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([size,t,data,crc]);}
function encodeRgb(png){const {w,h,channels,pixels}=png;assert.ok(channels===3||channels===4);const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*channels,j=y*(w*3+1)+1+x*3;raw[j]=pixels[i];raw[j+1]=pixels[i+1];raw[j+2]=pixels[i+2];}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);}
function colorError(source,decoded,mask){assert.equal(source.w,decoded.w);assert.equal(source.h,decoded.h);assert.equal(mask.w,source.w);assert.equal(mask.h,source.h);let n=0,sum=0,sumSq=0,max=0;const hist=new Uint32Array(256);for(let i=0;i<source.w*source.h;i++){if(mask.pixels[i*mask.channels]<128)continue;for(let c=0;c<3;c++){const e=Math.abs(source.pixels[i*source.channels+c]-decoded.pixels[i*decoded.channels+c]);n++;sum+=e;sumSq+=e*e;max=Math.max(max,e);hist[e]++;}}let count=0,p95=0;for(let i=0;i<256;i++){count+=hist[i];if(count>=n*.95){p95=i;break;}}return {coveredTexels:n/3,meanAbsoluteChannelError:sum/n,p95AbsoluteChannelError:p95,maxAbsoluteChannelError:max,psnrDb:10*Math.log10(255*255/(sumSq/n)),units:'8-bit sRGB channel values; KTX RGBA8 level-0 decode vs approved PNG straight RGB'};}

async function requireRegistered(path){const reg=await readJson(resolve(root,'Sources/source-inputs.json'));const rel=slash(relative(root,path)),record=reg.inputs.find(x=>x.path===rel);assert.ok(record,`Source not registered: ${rel}`);const bytes=await readFile(path);assert.equal(bytes.length,record.bytes,rel);assert.equal(sha(bytes),record.sha256,rel);return bytes;}
async function writeStable(path,data){if(existsSync(path))assert.ok((await readFile(path)).equals(data),`Existing staged file differs: ${path}`);else await writeFile(path,data);}
async function apply(){
  const planPath=resolve(stage,'plan.json');await requireRegistered(planPath);const plan=await readJson(planPath);assert.equal(plan.assetId,'village-approach');assert.equal(plan.manifest,'great-plains.json');
  for(const item of plan.stagedFiles){const path=resolve(stage,item.name),data=await requireRegistered(path);assert.equal(sha(data),item.sha256);}
  const manifestPath=resolve(publicAssets,plan.manifest),before=await readFile(manifestPath),manifest=JSON.parse(before),current=manifest.assets[plan.assetId];
  const isBefore=JSON.stringify(current)===JSON.stringify(plan.beforeAsset),isAfter=JSON.stringify(current)===JSON.stringify(plan.afterAsset);assert.ok(isBefore||isAfter,'village-approach changed concurrently or differs from prepared plan');
  await mkdir(content,{recursive:true});for(const item of plan.runtimeResources){const data=await readFile(resolve(stage,item.name)),dest=resolve(content,item.name);if(existsSync(dest))assert.ok((await readFile(dest)).equals(data),'Content hash collision');else await writeFile(dest,data);}
  if(!isAfter){manifest.assets[plan.assetId]=plan.afterAsset;const result=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),tmp=manifestPath+'.village-exterior-staged';await writeFile(tmp,result);assert.ok((await readFile(manifestPath)).equals(before),'Manifest changed while preparing write');await rename(tmp,manifestPath);}
  await mkdir(reportDir,{recursive:true});await writeFile(resolve(reportDir,'apply-result.json'),JSON.stringify({assetId:plan.assetId,manifest:plan.manifest,status:isAfter?'already-applied':'applied',oldModel:plan.beforeAsset.lods[0].model,newModel:plan.afterAsset.lods[0].model,otherManifestEntriesPreserved:true},null,2)+'\n');console.log(JSON.stringify({status:isAfter?'already-applied':'applied',manifest:plan.manifest}));
}
async function prepare(){
  await mkdir(stage,{recursive:true});await mkdir(reportDir,{recursive:true});
  const modelBytes=await requireRegistered(input('candidate.gltf')),bufferBytes=await requireRegistered(input('candidate.bin')),atlasBytes=await requireRegistered(input('atlas.png')),coverageBytes=await requireRegistered(input('coverage-final4096.png'));
  const accepted=JSON.parse(modelBytes),p=accepted.meshes[0].primitives[0];assert.equal(accepted.meshes.length,1);assert.equal(accepted.meshes[0].primitives.length,1);assert.equal(accepted.accessors[p.indices].count/3,44828);assert.equal(accepted.materials.length,1);assert.equal(accepted.materials[0].alphaMode??'OPAQUE','OPAQUE');assert.equal(accepted.samplers[0].wrapS,33071);assert.equal(accepted.samplers[0].wrapT,33071);
  const original=decodePng(atlasBytes),mask=decodePng(coverageBytes);assert.deepEqual([original.w,original.h],[4096,4096]);const rgb=encodeRgb(original),rgbCheck=decodePng(rgb);for(let i=0;i<original.w*original.h;i++)for(let c=0;c<3;c++)assert.equal(rgbCheck.pixels[i*3+c],original.pixels[i*original.channels+c]);await writeStable(resolve(stage,'atlas-straight-rgb.png'),rgb);
  const textureTemp=resolve(reportDir,'atlas-uastc4.ktx2'),createArgs=['create','--format','R8G8B8_SRGB','--assign-tf','srgb','--assign-primaries','bt709','--assign-texcoord-origin','top-left','--generate-mipmap','--encode','uastc','--uastc-quality','4','--zstd','6','--threads','4',resolve(stage,'atlas-straight-rgb.png'),textureTemp];
  if(!existsSync(textureTemp)){console.log(JSON.stringify({stage:'encoding',codec:'UASTC',resolution:4096,quality:4}));await run(ktx,createArgs,{maxBuffer:4*1024*1024});}
  await run(ktx,['validate',textureTemp]);const info=JSON.parse((await run(ktx,['info','--format','mini-json',textureTemp],{maxBuffer:4*1024*1024})).stdout);assert.equal(info.header.pixelWidth,4096);assert.equal(info.header.pixelHeight,4096);const texture=await readFile(textureTemp),textureName=sha(texture)+'.ktx2';await writeStable(resolve(stage,textureName),texture);
  const extract=resolve(reportDir,'uastc-level0-rgba.png');await run(ktx,['extract','--transcode','rgba8','--level','0',textureTemp,extract],{maxBuffer:4*1024*1024});const decodedTexture=decodePng(await readFile(extract)),quality=colorError(original,decodedTexture,mask);
  const gltf=structuredClone(accepted);gltf.images=[{name:'approved exterior color',uri:textureName,mimeType:'image/ktx2'}];for(const t of gltf.textures){const source=t.source;delete t.source;t.extensions={...t.extensions,KHR_texture_basisu:{source}};}for(const k of ['extensionsUsed','extensionsRequired'])gltf[k]=[...new Set([...(gltf[k]??[]),'KHR_texture_basisu'])];
  const files=new Map([[gltf.buffers[0].uri,{data:bufferBytes}],[textureName,{data:texture}]]),packed=await compressMeshopt(gltf,files),roundtrip=await decodeMeshoptBuffers(packed.gltf,packed.files);for(let i=0;i<gltf.accessors.length;i++)assert.deepEqual(readAccessor(roundtrip.gltf,roundtrip.files,i),readAccessor(gltf,files,i),`Accessor ${i} differs`);
  const resources=[];for(const [name,{data}] of packed.files){await writeStable(resolve(stage,name),data);resources.push({name,sha256:sha(data),bytes:data.length});}assert.equal(resources.length,3);
  const manifest=await readJson(resolve(publicAssets,'great-plains.json')),currentAsset=manifest.assets['village-approach'],existingPlan=existsSync(resolve(stage,'plan.json'))?await readJson(resolve(stage,'plan.json')):null,beforeAsset=structuredClone(existingPlan?.beforeAsset??currentAsset);assert.ok(beforeAsset&&beforeAsset.geometryLod&&beforeAsset.lods.length===3&&beforeAsset.mobileNear);if(existingPlan)assert.ok(JSON.stringify(currentAsset)===JSON.stringify(existingPlan.beforeAsset)||JSON.stringify(currentAsset)===JSON.stringify(existingPlan.afterAsset),'village-approach changed since staging');else for(const level of [...beforeAsset.lods,beforeAsset.mobileNear])assert.equal(basename(level.model),'441f3031c191ff5426478a7f37dd95e77b961f821a8ce6cd38b41a5ee4279c4a.gltf','Unexpected exterior source model');const afterAsset=structuredClone(beforeAsset),runtimeProfile={model:'./content/'+packed.model,resources:resources.map(x=>'./content/'+x.name),triangles:44828,textureSize:4096,normalMap:false,bytes:resources.reduce((s,x)=>s+x.bytes,0)};
  afterAsset.lods=afterAsset.lods.map(l=>({...l,...runtimeProfile}));afterAsset.mobileNear={...afterAsset.mobileNear,...runtimeProfile};
  const beforeModelSha256='441f3031c191ff5426478a7f37dd95e77b961f821a8ce6cd38b41a5ee4279c4a',nativeConfigSha256=sceneryNativeFingerprint(beforeAsset),appliedModelSha256=basename(packed.model,'.gltf');
  const approval={version:1,revision:'approved-village-exterior-2026-11-09',assetId:'village-approach',catalogAssetVersion:beforeModelSha256,beforeModelSha256,sourceModelSha256:sha(modelBytes),sourceAtlasSha256:sha(atlasBytes),nativeConfigSha256,appliedModelSha256,sourceRegistryId:sourceId,runtimeResources:resources,profiles:{levels:beforeAsset.lods.map(x=>x.level),mobileNear:true,sharedModelAllProfiles:true,textureSize:4096},shapeContract:{height:beforeAsset.height,bounds:beforeAsset.bounds,origin:beforeAsset.origin,frontYawOffset:beforeAsset.frontYawOffset},triangles:44828};
  const approvalBytes=Buffer.from(JSON.stringify(approval,null,2)+'\n'),approvalLedgerSha256=sha(approvalBytes);await writeStable(resolve(stage,'approval.json'),approvalBytes);
  afterAsset.approvedVillageExterior={revision:approval.revision,assetId:approval.assetId,catalogAssetVersion:beforeModelSha256,beforeModelSha256,sourceModelSha256:approval.sourceModelSha256,sourceAtlasSha256:approval.sourceAtlasSha256,nativeConfigSha256,appliedModelSha256,approvalLedgerSourceId:sourceId,approvalLedgerFile:'runtime/approval.json',approvalLedgerSha256};
  const plan={version:1,status:'staged-not-applied',assetId:'village-approach',manifest:'great-plains.json',sourceRegistryId:sourceId,source:{modelSha256:sha(modelBytes),bufferSha256:sha(bufferBytes),atlasSha256:sha(atlasBytes),straightRgbPngSha256:sha(rgb),rgbChannelsByteExact:true,alphaDroppedForOpaqueMaterial:true},texture:{name:textureName,sha256:sha(texture),width:4096,height:4096,codec:'UASTC',quality:4,rdo:false,zstd:6,fullMipChain:true,srgb:true,texcoordOrigin:'top-left',gpuBlockBytes:16,encodingLossy:true,quality},geometry:{triangles:44828,vertices:accepted.accessors[p.attributes.POSITION].count,primitives:1,losslessMeshopt:packed.stats,allAccessorValuesRoundTripExact:true,positionBounds:accepted.accessors[p.attributes.POSITION].min&&{min:accepted.accessors[p.attributes.POSITION].min,max:accepted.accessors[p.attributes.POSITION].max}},runtimeResources:resources,stagedFiles:[...resources,{name:'atlas-straight-rgb.png',sha256:sha(rgb),bytes:rgb.length},{name:'approval.json',sha256:approvalLedgerSha256,bytes:approvalBytes.length}],beforeAsset,afterAsset,limitations:['Prepared but not applied; no live manifest, catalog, deployment, or registry was modified.','One 4096 texture is used for every pre-existing LOD and mobile profile to avoid resampling the approved atlas. This can increase GPU residency; device memory/FPS/thermal behavior is unmeasured.','UASTC encoding is lossy; the decoded-image error is measured, not asserted pixel-identical.','The accepted shell retains the previously reviewed spike and baked UV limitations.','Application requires parent-coordinated registration of every staged file and catalog/version reconciliation.']};
  const planBytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');await writeStable(resolve(stage,'plan.json'),planBytes);await writeFile(resolve(reportDir,'staging-report.json'),JSON.stringify({status:plan.status,source:plan.source,texture:plan.texture,geometry:plan.geometry,runtimeResources:resources,manifest:plan.manifest,limitations:plan.limitations},null,2)+'\n');console.log(JSON.stringify({status:plan.status,model:packed.model,texture:textureName,triangles:44828,bytes:runtimeProfile.bytes,quality,plan:slash(relative(root,resolve(stage,'plan.json')))}));
}
if(options.has('--apply'))await apply();else await prepare();
