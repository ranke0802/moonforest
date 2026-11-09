import {createHash} from 'node:crypto';

export const SCENERY_BUDGET_REVISION='approved-scenery-budget-v1';
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

// Saved .moonmap/cinematic placements use an asset's authoring identity. This
// narrowly approved geometry-only replacement changes contentHash, never that
// identity or native placement contract. Unknown/mutated approvals fail closed.
export function approvedSceneryVersion(assetId,config,info){
 const b=config.geometryBudget;if(!b)return info.contentHash;
 const hex=/^[a-f0-9]{64}$/;
 if(!Object.hasOwn(APPROVED_SCENERY_CAPS,assetId)||b.revision!==SCENERY_BUDGET_REVISION||b.assetId!==assetId||b.cap!==APPROVED_SCENERY_CAPS[assetId]
  ||!hex.test(b.catalogAssetVersion??'')||!hex.test(b.beforeModelSha256??'')
  ||b.appliedModelSha256!==info.contentHash||b.nativeConfigSha256!==sceneryNativeFingerprint(config)
  ||!Number.isInteger(info.triangles)||info.triangles<=0||info.triangles>b.cap)
  throw new Error('Invalid approved scenery identity: '+assetId);
 return b.catalogAssetVersion;
}
