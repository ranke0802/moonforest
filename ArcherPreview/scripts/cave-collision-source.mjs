import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {approvedR2SceneryVersion,SCENERY_REVIEW_R2_REVISION,SCENERY_REVIEW_R2_LEDGER_SHA256} from './approved-scenery-policy.mjs';

const base=new URL('../public/assets/',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const modelHash=model=>model.split('/').at(-1).split('.')[0];

// Render-only budget approval does not authorize a new body, sight or camera
// field. Reuse the registered pre-budget near geometry with its native frame.
// Only the explicitly approved geometry is projected; later layout/native or
// unapproved resource changes still invalidate the existing collision epoch.
export function caveCollisionSource(current=JSON.parse(readFileSync(new URL('witch-cave.json',base)))){
 const approvedAssets=Object.entries(current.assets).filter(([,asset])=>asset.geometryBudget);
 const r2Assets=Object.entries(current.assets).filter(([,asset])=>asset.r2Geometry);
 if(!approvedAssets.length&&!r2Assets.length&&SCENERY_REVIEW_R2_LEDGER_SHA256==='PENDING_FINAL_R2_LEDGER')return {manifest:structuredClone(current),revision:null,replacements:[],r2Replacements:[]};
 const approval=JSON.parse(readFileSync(sourcePath('approved-scenery-budgets','approval.json'))),beforePath=sourcePath('approved-scenery-budgets','before-manifests/witch-cave.json'),beforeBytes=readFileSync(beforePath),record=approval.beforeManifests.find(row=>row.manifest==='witch-cave.json');
 assert.equal(sha(beforeBytes),record?.sha256,'Registered cave collision source snapshot changed');
 const application=JSON.parse(readFileSync(new URL('../reports/approved-scenery-budgets-2026-11-09/application.json',import.meta.url)));
 assert.equal(application.revision,approval.revision,'Cave collision render mapping has another approval revision');
 const before=JSON.parse(beforeBytes),manifest=structuredClone(current),replacements=[];
 for(const [id,asset]of approvedAssets){
  const accepted=approval.assets.find(row=>row.id===id),original=before.assets[id],budget=asset.geometryBudget;
  assert.ok(accepted&&original,'Unapproved cave collision source projection: '+id);
  assert.equal(budget.revision,approval.revision,'Unknown cave geometry approval revision');assert.equal(budget.assetId,id);assert.equal(budget.cap,accepted.cap);
  for(const key of ['bounds','height','origin','frontYawOffset','category'])assert.deepEqual(asset[key],original[key],id+' collision native '+key+' changed');
  assert.equal(budget.beforeModelSha256,modelHash(original.lods[0].model),id+' collision source differs from approved before geometry');
  assert.equal(budget.appliedModelSha256,modelHash(asset.lods[0].model),id+' rendered geometry approval metadata differs');
  const acceptedNear=accepted.tiers.find(tier=>tier.tier==='lod0'),appliedNear=application.tierResults.find(tier=>tier.id===id&&tier.tier==='lod0');
  assert.equal(acceptedNear.oldModel,original.lods[0].model,id+' original near source is not registered by approval');
  assert.ok(appliedNear,id+' has no canonical applied near mapping');assert.equal(appliedNear.beforeModel,original.lods[0].model);
  assert.equal(appliedNear.sourceId,acceptedNear.sourceId,id+' applied near uses an unapproved raw source');assert.equal(appliedNear.sourceSha256,acceptedNear.sourceSha256,id+' applied raw source hash differs from approval');
  assert.equal(sha(readFileSync(sourcePath(acceptedNear.sourceId))),acceptedNear.sourceSha256,id+' registered approved raw geometry changed');
  assert.equal(asset.lods[0].model,appliedNear.model,id+' live near model is outside the canonical approved application');
  assert.equal(budget.appliedModelSha256,appliedNear.modelSha256,id+' live near hash is outside the canonical approved application');
  assert.equal(sha(readFileSync(new URL(asset.lods[0].model,base))),appliedNear.modelSha256,id+' applied packed near model bytes changed');
  manifest.assets[id].lods[0]=structuredClone(original.lods[0]);
  replacements.push({id,renderModel:asset.lods[0].model,collisionModel:original.lods[0].model});
 }
 const r2Replacements=[];
 if(SCENERY_REVIEW_R2_LEDGER_SHA256!=='PENDING_FINAL_R2_LEDGER'||r2Assets.length){
  const r2Bytes=readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json'));
  assert.equal(sha(r2Bytes),SCENERY_REVIEW_R2_LEDGER_SHA256,'Registered R2 cave approval ledger changed');
  const r2=JSON.parse(r2Bytes);
  assert.equal(r2.revision,SCENERY_REVIEW_R2_REVISION,'Unknown R2 collision approval revision');
  const snapshot=r2.beforeManifests.find(row=>row.manifest==='witch-cave.json');assert.ok(snapshot,'R2 cave snapshot missing');
  const snapshotBytes=readFileSync(sourcePath(snapshot.sourceId));assert.equal(sha(snapshotBytes),snapshot.sha256,'R2 cave collision source snapshot changed');
  const snapshotManifest=JSON.parse(snapshotBytes);
  for(const entry of r2.assets){
   const app=entry.applications.find(row=>row.manifest==='witch-cave.json');if(!app)continue;
   const live=current.assets[entry.id];assert.ok(live,'R2 cave asset missing: '+entry.id);
   if(!live.r2Geometry)assert.deepEqual(live,app.beforeConfig,entry.id+' R2 render config missing approval metadata or differing from rollback snapshot');
  }
  for(const [id,asset]of r2Assets){
   const accepted=r2.assets.find(row=>row.id===id),application=accepted?.applications.find(row=>row.manifest==='witch-cave.json');
   assert.ok(application,'Unapproved R2 cave collision source projection: '+id);
   assert.deepEqual(application.beforeConfig,snapshotManifest.assets[id],id+' R2 original cave config differs from snapshot');
   assert.deepEqual(asset,application.afterConfig,id+' R2 current cave config differs from registered approval');
   const bytes=readFileSync(new URL(asset.lods[0].model,base)),gltf=JSON.parse(bytes),contentHash=sha(bytes);
   assert.equal(contentHash,modelHash(asset.lods[0].model),id+' R2 packed near model bytes changed');
   const triangles=(gltf.meshes??[]).reduce((sum,mesh)=>sum+(mesh.primitives??[]).reduce((count,p)=>count+(p.indices===undefined?gltf.accessors[p.attributes.POSITION].count:gltf.accessors[p.indices].count)/3,0),0);
   assert.ok(Number.isInteger(triangles)&&triangles>0,id+' R2 invalid triangle count');
   assert.equal(approvedR2SceneryVersion(id,asset,{contentHash,triangles}),asset.r2Geometry.catalogAssetVersion,id+' R2 authoring identity mismatch');
   const original=application.beforeConfig;
   for(const key of ['bounds','height','origin','frontYawOffset','category'])assert.deepEqual(asset[key],original[key],id+' R2 collision native '+key+' changed');
   manifest.assets[id].lods[0]=structuredClone(original.lods[0]);
   r2Replacements.push({id,renderModel:asset.lods[0].model,collisionModel:original.lods[0].model});
  }
 }
 return {manifest,revision:approvedAssets.length?approval.revision:null,beforeManifest:beforePath,beforeManifestSha256:record.sha256,replacements,r2Revision:r2Assets.length?SCENERY_REVIEW_R2_REVISION:null,r2Replacements};
}

export function caveCollisionManifest(current){return caveCollisionSource(current).manifest;}
