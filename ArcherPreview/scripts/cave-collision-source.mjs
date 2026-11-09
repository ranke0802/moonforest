import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {sourcePath} from '../../Sources/resolve-source.mjs';

const base=new URL('../public/assets/',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const modelHash=model=>model.split('/').at(-1).split('.')[0];

// Render-only budget approval does not authorize a new body, sight or camera
// field. Reuse the registered pre-budget near geometry with its native frame.
// Only the explicitly approved geometry is projected; later layout/native or
// unapproved resource changes still invalidate the existing collision epoch.
export function caveCollisionSource(current=JSON.parse(readFileSync(new URL('witch-cave.json',base)))){
 const approvedAssets=Object.entries(current.assets).filter(([,asset])=>asset.geometryBudget);
 if(!approvedAssets.length)return {manifest:structuredClone(current),revision:null,replacements:[]};
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
 return {manifest,revision:approval.revision,beforeManifest:beforePath,beforeManifestSha256:record.sha256,replacements};
}

export function caveCollisionManifest(current){return caveCollisionSource(current).manifest;}
