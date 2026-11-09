import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {approvedVillageExteriorVersion} from './approved-village-exterior-policy.mjs';

export const SCENERY_BUDGET_REVISION='approved-scenery-budget-v1';
export const SCENERY_REVIEW_R2_REVISION='approved-review-r2-2026-11-09';
// Immutable approved inputs and full per-manifest configs, not a self-signed marker.
export const SCENERY_REVIEW_R2_LEDGER_SHA256='50810e4bebd88cc7b3ca3adadab653f81db8b0ec21b5a8fa7d015ad7dc00be5b';
export const APPROVED_SCENERY_CAPS=Object.freeze({
 'rock-01-mossy-boulder':700,'rock-02-jagged-outcrop':700,'grass-tuft':1500,
 bush:2500,'forest-05-thorn-bramble':2500,'rail-fence':1500,
 'wall-01-straight':2500,'wall-02-corner':2500,'wall-03-breached':2500,
 handcart:2500,'cave-13-votive-lantern':1500,
 'cave-01-eroded-wall':2000,'cave-02-rock-ledge':2000,'cave-03-great-column':2000,
 'cave-04-natural-arch':2000,'cave-05-stalagmites':2000,'cave-06-stalactite-canopy':2000,
 'cave-07-scree-ramp':2000,'cave-s01-solid-cliff-base':2000,'cave-s03-dry-spillway-rock':2000,
 'forest-06-witch-cave-mouth':2000,
});
export function sceneryNativeFingerprint(config){
 const fields=['bounds','height','origin','frontYawOffset','category','scale','bodyHeight'];
 return createHash('sha256').update(JSON.stringify(Object.fromEntries(fields.filter(k=>config[k]!==undefined).map(k=>[k,config[k]])))).digest('hex');
}

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=/^[a-f0-9]{64}$/;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const modelHash=value=>typeof value==='string'?value.split('/').at(-1).match(/^([a-f0-9]{64})\.gltf$/)?.[1]:undefined;

// The signed ledger lists the exact source and each approved before/after
// manifest entry. A self-described r2Geometry object is never authorization.
export function validateR2SceneryAgainstLedger(assetId,config,info,ledger){
 const b=config.r2Geometry;
 const fail=()=>{throw new Error('Invalid approved R2 scenery identity: '+assetId);};
 if(!b||config.geometryBudget||ledger.version!==1||ledger.revision!==SCENERY_REVIEW_R2_REVISION||b.revision!==SCENERY_REVIEW_R2_REVISION||b.assetId!==assetId)return fail();
 const matches=ledger.assets.filter(a=>a.id===assetId);if(matches.length!==1)return fail();
 const a=matches[0],application=a.applications.find(row=>same(row.afterConfig,config));
 if(!application||!Number.isInteger(a.requestedCap)||!Number.isInteger(a.actualTriangles)||a.actualTriangles<=0||b.requestedCap!==a.requestedCap||b.actualTriangles!==a.actualTriangles||info.triangles!==a.actualTriangles)return fail();
 const before=application.beforeConfig,near=modelHash(config.model??config.lods?.[0]?.model),beforeNear=modelHash(before.model??before.lods?.[0]?.model);
 if(!hex.test(near??'')||!hex.test(beforeNear??'')||near!==info.contentHash||b.appliedModelSha256!==near||b.beforeModelSha256!==beforeNear||b.catalogAssetVersion!==beforeNear||b.nativeConfigSha256!==sceneryNativeFingerprint(config)||sceneryNativeFingerprint(before)!==b.nativeConfigSha256)return fail();
 if(!Array.isArray(config.lods)||config.lods.length!==3||!Array.isArray(before.lods)||before.lods.length!==3||!same(b.lodModels,config.lods.map(x=>modelHash(x.model)))||!same(config.lods.slice(1),before.lods.slice(1))||b.mobileNearModelSha256!==modelHash(config.mobileNear?.model)||!hex.test(b.mobileNearModelSha256??'')||b.lodDistancesUnchanged!==true)return fail();
 const fixedTierFields=['level','distance','textureSize','normalMap'];
 if(![0].every(i=>fixedTierFields.every(key=>same(config.lods[i][key],before.lods[i][key])))||!fixedTierFields.every(key=>same(config.mobileNear?.[key],before.mobileNear?.[key])))return fail();
 if(!config.lods.every((lod,i)=>lod.distance===before.lods[i].distance)||config.mobileNear?.triangles!==config.lods[0].triangles||config.lods[0].triangles!==a.actualTriangles)return fail();
 if(typeof b.texturePixelsUnchanged!=='boolean'||b.texturePixelsUnchanged!==a.reviewedR1||!hex.test(a.sourceModelSha256??'')||!a.sourceModelId||!hex.test(b.catalogAssetVersion??''))return fail();
 if(b.texturePixelsUnchanged?(b.derivedAtlasSourceSha256!==null||a.sourceTextureId!==null||a.sourceTextureSha256!==null):(!a.sourceTextureId||b.derivedAtlasSourceSha256!==a.sourceTextureSha256))return fail();
 if(sha(readFileSync(sourcePath(a.sourceModelId)))!==a.sourceModelSha256)return fail();
 if(a.sourceTextureId&&(!hex.test(a.sourceTextureSha256??'')||sha(readFileSync(sourcePath(a.sourceTextureId)))!==a.sourceTextureSha256))return fail();
 if(a.sourceRgbId&&(!hex.test(a.sourceRgbSha256??'')||sha(readFileSync(sourcePath(a.sourceRgbId)))!==a.sourceRgbSha256))return fail();
 return b.catalogAssetVersion;
}
export function approvedR2SceneryVersion(assetId,config,info){
 const bytes=readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json'));
 if(sha(bytes)!==SCENERY_REVIEW_R2_LEDGER_SHA256)throw new Error('Registered R2 approval ledger hash differs');
 return validateR2SceneryAgainstLedger(assetId,config,info,JSON.parse(bytes));
}

// Saved .moonmap/cinematic placements use an asset's authoring identity. This
// narrowly approved geometry-only replacement changes contentHash, never that
// identity or native placement contract. Unknown/mutated approvals fail closed.
export function approvedSceneryVersion(assetId,config,info){
 if(config.approvedVillageExterior)return approvedVillageExteriorVersion(assetId,config,info);
 if(config.r2Geometry)return approvedR2SceneryVersion(assetId,config,info);
 const b=config.geometryBudget;if(!b)return info.contentHash;
 if(!Object.hasOwn(APPROVED_SCENERY_CAPS,assetId)||b.revision!==SCENERY_BUDGET_REVISION||b.assetId!==assetId||b.cap!==APPROVED_SCENERY_CAPS[assetId]
  ||!hex.test(b.catalogAssetVersion??'')||!hex.test(b.beforeModelSha256??'')
  ||b.appliedModelSha256!==info.contentHash||b.nativeConfigSha256!==sceneryNativeFingerprint(config)
  ||!Number.isInteger(info.triangles)||info.triangles<=0||info.triangles>b.cap)
  throw new Error('Invalid approved scenery identity: '+assetId);
 return b.catalogAssetVersion;
}
