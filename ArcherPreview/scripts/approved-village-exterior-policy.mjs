import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sourcePath} from '../../Sources/resolve-source.mjs';
export const VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256='441f3031c191ff5426478a7f37dd95e77b961f821a8ce6cd38b41a5ee4279c4a';
export const VILLAGE_EXTERIOR_APPROVAL_REVISION='approved-village-exterior-2026-11-09';
export const VILLAGE_EXTERIOR_PLAN_SHA256='1e632a699678042941b62f2aa80d582f2fea94d8d015dfc983ed736044602cfd';
const modelHash=value=>typeof value==='string'?value.split('/').at(-1).match(/^([a-f0-9]{64})\.gltf$/)?.[1]:undefined;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const native=config=>sha(JSON.stringify(Object.fromEntries(['bounds','height','origin','frontYawOffset','category','scale','bodyHeight'].filter(k=>config[k]!==undefined).map(k=>[k,config[k]]))));
const location=(...parts)=>sourcePath('village-exterior-shell-review',...parts);

// This marker is accepted only alongside the immutable registered stage plan,
// source files and exact packed live bytes. It cannot self-authorize a model.
export function approvedVillageExteriorVersion(assetId,config,info){
 const fail=()=>{throw new Error('Invalid approved village exterior identity: '+assetId);};
 const m=config.approvedVillageExterior,planBytes=readFileSync(location('runtime','plan.json'));
 if(sha(planBytes)!==VILLAGE_EXTERIOR_PLAN_SHA256)return fail();
 const plan=JSON.parse(planBytes),before=plan.beforeAsset,after=plan.afterAsset;
 if(assetId!=='village-approach'||!m||config.r2Geometry||config.geometryBudget||plan.assetId!==assetId||plan.manifest!=='great-plains.json'||!same(config,after)||m.revision!==VILLAGE_EXTERIOR_APPROVAL_REVISION||m.assetId!==assetId)return fail();
 if(m.catalogAssetVersion!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256||m.beforeModelSha256!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256||modelHash(before.lods?.[0]?.model)!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256||m.nativeConfigSha256!==native(before)||native(config)!==m.nativeConfigSha256)return fail();
 const original=readFileSync(new URL('../public/assets/content/'+VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256+'.gltf',import.meta.url));
 if(sha(original)!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256||sha(readFileSync(location('candidate.gltf')))!==m.sourceModelSha256||m.sourceModelSha256!==plan.source.modelSha256||sha(readFileSync(location('candidate.bin')))!==plan.source.bufferSha256||sha(readFileSync(location('atlas.png')))!==m.sourceAtlasSha256||m.sourceAtlasSha256!==plan.source.atlasSha256)return fail();
 if(sha(readFileSync(location('runtime','atlas-straight-rgb.png')))!==plan.source.straightRgbPngSha256)return fail();
 if(sha(readFileSync(location('runtime','approval.json')))!==m.approvalLedgerSha256)return fail();
 if(!Array.isArray(config.lods)||config.lods.length!==3||!Array.isArray(before.lods)||before.lods.length!==3||!config.mobileNear||!before.mobileNear||config.height!==config.bounds?.[1]||before.height!==before.bounds?.[1])return fail();
 if(!config.lods.every((tier,i)=>tier.level===before.lods[i].level&&tier.distance===before.lods[i].distance&&modelHash(tier.model)===m.appliedModelSha256&&tier.triangles===plan.geometry.triangles)||modelHash(config.mobileNear.model)!==m.appliedModelSha256||config.mobileNear.level!==before.mobileNear.level||config.mobileNear.distance!==before.mobileNear.distance||config.mobileNear.triangles!==plan.geometry.triangles)return fail();
 if(info.contentHash!==m.appliedModelSha256||info.triangles!==plan.geometry.triangles||info.triangles!==44828)return fail();
 const files=plan.runtimeResources;if(!Array.isArray(files)||!files.length)return fail();
 for(const f of files){if(!/^[a-f0-9]{64}\.(?:gltf|bin|ktx2)$/.test(f.name)||f.name.slice(0,64)!==f.sha256)return fail();const src=readFileSync(location('runtime',f.name)),packed=readFileSync(new URL('../public/assets/content/'+f.name,import.meta.url));if(src.length!==f.bytes||sha(src)!==f.sha256||sha(packed)!==f.sha256)return fail();}
 const refs=files.map(f=>'./content/'+f.name);if(!config.lods.every(tier=>same(tier.resources,refs))||!same(config.mobileNear.resources,refs))return fail();
 return m.catalogAssetVersion;
}

// The legacy batch writer builds a new exterior from village geometry and
// must never silently replace a separately approved or otherwise changed shell.
export function assertLegacyExteriorWritable(config){
 if(config?.approvedVillageExterior||config?.lods?.length!==3||config.lods.some(t=>modelHash(t.model)!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256)||modelHash(config.mobileNear?.model)!==VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256)
  throw new Error('Legacy village exterior rebuild is blocked: preserve the approved or changed shell.');
}
