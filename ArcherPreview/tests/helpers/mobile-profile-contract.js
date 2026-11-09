import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {MeshoptDecoder} from 'meshoptimizer';
import {sourcePath,projectRoot} from '../../../Sources/resolve-source.mjs';
import {readAccessor} from '../../scripts/web-geometry.js';
import {APPROVED_SCENERY_CAPS,SCENERY_BUDGET_REVISION,sceneryNativeFingerprint,approvedSceneryVersion,approvedR2SceneryVersion,SCENERY_REVIEW_R2_REVISION,SCENERY_REVIEW_R2_LEDGER_SHA256} from '../../scripts/approved-scenery-policy.mjs';
import {gltfCatalogMetadata} from '../../scripts/asset-catalog-metadata.mjs';
import {approvedVillageExteriorVersion,assertLegacyExteriorWritable} from '../../scripts/approved-village-exterior-policy.mjs';

const assetsBase=new URL('../../public/assets/',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const sceneryCategories=new Set(['tree','rock','prop','plant','defense','fence']);
const protectedIds=new Set(['village-approach','chapel','guardian-bear','hooded-goblin','elena','mourning-elena']);
await MeshoptDecoder.ready;
const registry=JSON.parse(readFileSync(resolve(projectRoot,'Sources/source-inputs.json'))),registered=new Map(registry.inputs.map(input=>[input.path,input]));
function registeredBytes(id,...parts){const path=sourcePath(id,...parts),data=readFileSync(path),entry=registered.get(relative(projectRoot,path).replaceAll('\\','/'));assert.ok(entry,'approved geometry input must be registered: '+id);assert.equal(data.length,entry.bytes,id+' registered byte length');assert.equal(hash(data),entry.sha256,id+' registered hash');return {path,data};}
const approval=JSON.parse(registeredBytes('approved-scenery-budgets','approval.json').data),plans=new Map(approval.assets.map(a=>[a.id,a]));
assert.equal(approval.revision,SCENERY_BUDGET_REVISION);assert.deepEqual(Object.fromEntries(approval.assets.map(a=>[a.id,a.cap])),APPROVED_SCENERY_CAPS);
const application=JSON.parse(readFileSync(new URL('../../reports/approved-scenery-budgets-2026-11-09/application.json',import.meta.url))),results=new Map(application.tierResults.map(t=>[t.id+':'+t.tier,t]));
const beforeRows=new Map;for(const saved of approval.beforeManifests){const {data}=registeredBytes(saved.sourceId);assert.equal(hash(data),saved.sha256,saved.manifest+' immutable before graph');const manifest=JSON.parse(data);for(const [id,asset]of Object.entries(manifest.assets??{}))if(plans.has(id)){if(!beforeRows.has(id))beforeRows.set(id,[]);beforeRows.get(id).push({manifest:saved.manifest,asset});}}
const contentBase=new URL('../../public/assets/content/',import.meta.url),resourceCache=new Map,modelCache=new Map,tierCache=new Map,expectedCache=new Map;
function contentBytes(name){name=basename(name);assert.match(name,/^[a-f0-9]{64}\.[a-z0-9]+$/,'content-addressed source resource');if(!resourceCache.has(name)){const data=readFileSync(new URL(name,contentBase));assert.equal(hash(data),name.split('.')[0],name+' actual content hash');resourceCache.set(name,data);}return resourceCache.get(name);}
export function originalVillageExteriorGraph(asset,id,manifest){
 if(id!=='village-approach'||(manifest&&manifest!=='great-plains.json'))return asset;
 if(!asset.approvedVillageExterior){assertLegacyExteriorWritable(asset);return asset;}
 const bytes=contentBytes(asset.lods[0].model),info=gltfCatalogMetadata(JSON.parse(bytes));
 approvedVillageExteriorVersion(id,asset,{contentHash:hash(bytes),triangles:info.triangles});
 const plan=JSON.parse(registeredBytes('village-exterior-shell-review','runtime','plan.json').data);
 assert.deepEqual(asset,plan.afterAsset,'live exterior is exactly the registered approved config');return structuredClone(plan.beforeAsset);
}
// Return the prior complete config only after the immutable approval, actual
// packed model bytes, each profile resource and full graph have all matched.
export function originalR2AssetGraph(asset,id,manifest){
 const ledgerBytes=registeredBytes('approved-review-r2-2026-11-09','approval.json').data;
 assert.equal(hash(ledgerBytes),SCENERY_REVIEW_R2_LEDGER_SHA256,'immutable R2 ledger hash');const ledger=JSON.parse(ledgerBytes);
 assert.equal(ledger.revision,SCENERY_REVIEW_R2_REVISION);
 const rows=ledger.assets.find(a=>a.id===id)?.applications.filter(a=>!manifest||a.manifest===manifest)??[];
 if(!asset.r2Geometry){if(rows.length)assert.ok(rows.some(a=>isDeepStrictEqual(a.beforeConfig,asset)),id+' R2 replacement requires exact approval marker');return asset;}
 const row=rows.find(a=>isDeepStrictEqual(a.afterConfig,asset));
 assert.ok(row,id+' has no exact registered R2 before/after graph');
 const nearBytes=contentBytes(asset.model??asset.lods[0].model),metadata=gltfCatalogMetadata(JSON.parse(nearBytes));
 approvedR2SceneryVersion(id,asset,{contentHash:hash(nearBytes),triangles:metadata.triangles});
 const references=new Set();const visit=value=>{if(typeof value==='string'&&/^\.\/content\//.test(value))references.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(asset);
 for(const reference of references){const bytes=contentBytes(reference);if(reference.endsWith('.gltf')){const gltf=JSON.parse(bytes);for(const part of [...(gltf.buffers??[]),...(gltf.images??[])])if(part.uri&&!part.uri.startsWith('data:'))contentBytes(part.uri);}}
 return structuredClone(row.beforeConfig);
}
function readGeometry(path,raw){if(modelCache.has(path))return modelCache.get(path);raw??=readFileSync(path);const gltf=JSON.parse(raw),files=new Map;for(const b of gltf.buffers.filter(b=>b.uri))files.set(b.uri,{data:b.uri.startsWith('data:')?Buffer.from(b.uri.split(',')[1],'base64'):readFileSync(resolve(dirname(path),b.uri))});const decoded=structuredClone(gltf),decodedBuffers=new Map;for(const view of decoded.bufferViews??[]){const ext=view.extensions?.EXT_meshopt_compression;if(!ext)continue;assert.equal(ext.filter??'NONE','NONE','approved pack must be lossless');const source=files.get(decoded.buffers[ext.buffer].uri).data,target=new Uint8Array(view.byteLength);MeshoptDecoder.decodeGltfBuffer(target,ext.count,ext.byteStride,source.subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength),ext.mode,ext.filter);if(!decodedBuffers.has(view.buffer))decodedBuffers.set(view.buffer,Buffer.alloc(decoded.buffers[view.buffer].byteLength));decodedBuffers.get(view.buffer).set(target,view.byteOffset??0);delete view.extensions.EXT_meshopt_compression;if(!Object.keys(view.extensions).length)delete view.extensions;}for(const [index,data]of decodedBuffers){const uri='approved-decoded-'+index;files.set(uri,{data});decoded.buffers[index]={uri,byteLength:data.length};}const value={gltf:decoded,packed:gltf,files,raw};modelCache.set(path,value);return value;}
function approvedTier(id,t){const key=id+':'+t.tier;if(tierCache.has(key))return tierCache.get(key);const r=results.get(key);assert.ok(r,key+' applied tier');assert.equal(r.changed,t.changed);assert.equal(r.beforeModel,t.oldModel);assert.equal(r.beforeTriangles,t.beforeTriangles);assert.equal(r.triangles,t.afterTriangles);const oldBytes=contentBytes(t.oldModel);assert.equal(hash(oldBytes),t.oldModelSha256,key+' original model');if(!t.changed){assert.equal(r.model,t.oldModel,key+' preserved URL');const value={...r};tierCache.set(key,value);return value;}
 const source=registeredBytes(t.sourceId);assert.equal(hash(source.data),t.sourceSha256,key+' immutable approved source');const runtime=contentBytes(r.model);assert.equal(hash(runtime),r.modelSha256,key+' packed model hash');const canonical=readGeometry(source.path,source.data),packed=readGeometry(fileURLToPath(new URL(r.model,assetsBase)),runtime);
 const packingKeys=new Set(['buffers','bufferViews','accessors','extensionsUsed','extensionsRequired']);for(const field of new Set([...Object.keys(canonical.packed),...Object.keys(packed.packed)]))if(!packingKeys.has(field))assert.deepEqual(packed.packed[field],canonical.packed[field],key+' canonical '+field);for(const field of ['extensionsUsed','extensionsRequired'])assert.deepEqual((packed.packed[field]??[]).filter(v=>v!=='EXT_meshopt_compression'),canonical.packed[field]??[],key+' extensions');assert.deepEqual(packed.gltf.accessors,canonical.gltf.accessors,key+' accessor metadata');for(let i=0;i<canonical.gltf.accessors.length;i++){const a=readAccessor(canonical.gltf,canonical.files,i),b=readAccessor(packed.gltf,packed.files,i);assert.ok(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),key+' canonical accessor '+i);}
 const references=[...new Set([...packed.packed.buffers.filter(b=>b.uri).map(b=>basename(b.uri)),...(packed.packed.images??[]).map(im=>basename(im.uri)),basename(r.model)])],resources=references.map(n=>'./content/'+n),totalBytes=references.reduce((n,name)=>n+contentBytes(name).length,0);assert.deepEqual(r.resources,resources,key+' exact resource graph');assert.equal(r.bytes,totalBytes,key+' actual resource bytes');
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},indexAccessors=new Set(canonical.gltf.meshes.flatMap(m=>m.primitives.map(p=>p.indices)));let verifiedViews=0;for(let vi=0;vi<canonical.gltf.bufferViews.length;vi++){const v=canonical.gltf.bufferViews[vi],ai=canonical.gltf.accessors.findIndex(a=>a.bufferView===vi),a=canonical.gltf.accessors[ai],stride=v.byteStride??(a?widths[a.type]*sizes[a.componentType]:0),indices=indexAccessors.has(ai);if(a&&!a.sparse&&stride>0&&v.byteLength%stride===0&&(indices?[2,4].includes(stride):stride%4===0&&stride<=256))verifiedViews++;}const encodedViews=packed.packed.bufferViews.filter(v=>v.extensions?.EXT_meshopt_compression).length,compression={encodedViews,rawViews:packed.packed.bufferViews.length-encodedViews,verifiedViews};assert.deepEqual(r.compression,compression,key+' actual compression evidence');const value={...r,model:r.model,resources,bytes:totalBytes,compression};tierCache.set(key,value);return value;
}

function expectedGraphs(id){if(expectedCache.has(id))return expectedCache.get(id);const plan=plans.get(id);assert.ok(plan,'unapproved scenery projection '+id);const tiers=new Map(plan.tiers.map(t=>[t.tier,approvedTier(id,t)])),graphs=(beforeRows.get(id)??[]).map(row=>{const asset=structuredClone(row.asset),originalNear=asset.model??asset.lods?.[0]?.model,near=tiers.get('lod0');assert.equal(basename(originalNear),basename(plan.tiers[0].oldModel),id+' immutable source alias');const update=(old,tier)=>{const t=tiers.get(tier);assert.equal(basename(old.model),basename(t.beforeModel),id+' '+tier+' immutable tier alias');return t.changed?{...old,model:t.model,resources:t.resources,bytes:t.bytes,triangles:t.triangles,...(old.compression?{compression:t.compression}:{})}:old;};if(asset.lods)asset.lods=asset.lods.map((old,i)=>update(old,'lod'+(old.level??i)));if(asset.mobileNear)asset.mobileNear=update(asset.mobileNear,'mobileNear');if(asset.model)Object.assign(asset,{model:near.model,resources:near.resources,bytes:near.bytes,triangles:near.triangles});asset.geometryBudget={revision:SCENERY_BUDGET_REVISION,date:approval.date,assetId:id,cap:plan.cap,catalogAssetVersion:plan.catalogAssetVersion,beforeModelSha256:basename(originalNear).split('.')[0],appliedModelSha256:near.modelSha256,nativeConfigSha256:sceneryNativeFingerprint(row.asset),texturePixelsUnchanged:true,lodDistancesUnchanged:true,retention:'Original source and runtime files retained; deletion awaits user decision.',approval:'Category replacement authorized; applied build awaits user inspection.'};if(asset.vertexRelief)asset.vertexRelief.approvedBudgetRevision=SCENERY_BUDGET_REVISION;return {...row,expected:asset};});assert.ok(graphs.length,id+' registered before graph');expectedCache.set(id,graphs);return graphs;}
function historicalApprovedAsset(asset,id,manifest){if(asset.geometryBudget===undefined){if(plans.has(id)){const near=asset.model??asset.lods?.[0]?.model;assert.equal(basename(near??''),basename(plans.get(id).tiers[0].oldModel),id+' replacement geometry requires exact approval metadata');}return asset;}assert.ok(plans.has(id)&&Object.hasOwn(APPROVED_SCENERY_CAPS,id),id+' is not approved for geometry projection');const near=approvedTier(id,plans.get(id).tiers[0]);approvedSceneryVersion(id,asset,{contentHash:near.modelSha256,triangles:near.triangles});const row=expectedGraphs(id).find(row=>(!manifest||row.manifest===manifest)&&isDeepStrictEqual(asset,row.expected));assert.ok(row,id+' current full graph differs from its registered approval/native/texture/resource contract');return structuredClone(row.asset);}

// Historical comparison permits only the validated additive mobile albedo and
// these registered geometry replacements. Every current field and resource is
// checked before recovering the immutable graph; arbitrary fields are not lost.
export function originalAssetGraph(asset,id,manifest){
 asset=originalVillageExteriorGraph(asset,id,manifest);
 asset=originalR2AssetGraph(asset,id,manifest);
 const profile=asset.mobileHighTextures;
 if(profile!==undefined){
  assert.ok(sceneryCategories.has(asset.category)&&!protectedIds.has(id)&&!id.startsWith('house'),id+' is excluded from mobile scenery profiles');
  const original=asset.highTextures,albedo=profile.textures?.albedo,source=original?.textures?.albedo;
  assert.equal(original?.shading,'toon-color',id+' original color pipeline');
  assert.deepEqual(Object.keys(profile.textures??{}),['albedo'],id+' alternative must be color only');
  assert.ok([1024,2048].includes(albedo?.width)&&albedo.height===albedo.width,id+' mobile color size must be 1K or 2K');
  assert.ok(albedo.width<source.width&&albedo.height<source.height,id+' must retain the larger original color source');
  assert.deepEqual(Object.keys(albedo).sort(),['url','width','height','bytes','codec','alpha','gpuBlockBytes'].sort(),id+' bounded texture metadata');
  for(const field of ['codec','alpha','gpuBlockBytes'])assert.equal(albedo[field],source[field],id+' '+field+' must retain its source semantics');
  assert.match(albedo.url,/^\.\/content\/[a-f0-9]{64}\.ktx2$/,id+' content-addressed alternative');
  const bytes=readFileSync(new URL(albedo.url,assetsBase));
  assert.equal(bytes.length,albedo.bytes,id+' alternative byte budget');assert.equal(hash(bytes),albedo.url.split('/').at(-1).split('.')[0],id+' alternative content hash');
  assert.deepEqual([...bytes.subarray(0,12)],[0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a],id+' KTX2 header');
  assert.equal(bytes.readUInt32LE(20),albedo.width,id+' actual texture width');assert.equal(bytes.readUInt32LE(24),albedo.height,id+' actual texture height');
  assert.equal(bytes.readUInt32LE(40),Math.floor(Math.log2(albedo.width))+1,id+' complete mip chain');
  assert.deepEqual(profile,{...original,textures:{albedo},resources:[albedo.url],colorResolution:albedo.width,colorEncoding:`KTX2 ${albedo.codec.toUpperCase()} / sRGB / full mip chain / mobile ${albedo.width}`},id+' all other profile metadata remains original');
 }
 const projected=historicalApprovedAsset(asset,id,manifest),{mobileHighTextures,...original}=projected;return original;
}

export function originalManifestText(text,manifestName){
 const manifest=JSON.parse(text);let additive=false;
 for(const [id,asset]of Object.entries(manifest.assets??{})){
  additive||=Object.hasOwn(asset,'mobileHighTextures')||Object.hasOwn(asset,'geometryBudget')||Object.hasOwn(asset,'r2Geometry')||Object.hasOwn(asset,'approvedVillageExterior');manifest.assets[id]=originalAssetGraph(asset,id,manifestName);
 }
 // Project to the exact historical authored format only after the complete
 // current contract has validated. These hashes describe that source graph,
 // rather than claiming the new production triangle buffers are unchanged.
 return additive?JSON.stringify(manifest,null,2)+'\n':text.replace(/\r\n?/g,'\n');
}

export function originalInputText(path,text){
 const match=path.match(/(?:^|\/)public\/assets\/([^/]+\.json)$/);return match&&approval.beforeManifests.some(s=>s.manifest===match[1])?originalManifestText(text,match[1]):text.replace(/\r\n?/g,'\n');
}

export function assertOriginalInputFingerprint(path,text,expected){
 const original=hash(originalInputText(path,text)),raw=hash(text.replace(/\r\n?/g,'\n'));
 // Existing masks can refer to the validated historical graph; future rebakes
 // can refer to the exact current graph. Both routes validate approved geometry
 // and profile/resource integrity before accepting either fingerprint.
 assert.ok(original===expected||raw===expected,path+' original geometry inputs do not match the delivered bake');
}
