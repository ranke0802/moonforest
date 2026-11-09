import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {originalR2AssetGraph} from './helpers/mobile-profile-contract.js';

test('all approved R2 profiles project to their exact original per-map config and reject forged metadata',()=>{
 const ledger=JSON.parse(readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json')));let count=0;
 for(const asset of ledger.assets)for(const row of asset.applications){
  assert.deepEqual(originalR2AssetGraph(row.afterConfig,asset.id,row.manifest),row.beforeConfig,asset.id+' '+row.manifest);count++;
  const missing=structuredClone(row.afterConfig);delete missing.r2Geometry;
  assert.throws(()=>originalR2AssetGraph(missing,asset.id,row.manifest),/requires exact approval marker/);
  const changed=structuredClone(row.afterConfig);changed.lods[1].model='./content/'+'0'.repeat(64)+'.gltf';
  assert.throws(()=>originalR2AssetGraph(changed,asset.id,row.manifest),/no exact registered R2/);
 }
 assert.equal(ledger.assets.length,20);assert.equal(count,29);
});

test('live manifest entries match the registered approved R2 graph before historical projection',()=>{
 const ledger=JSON.parse(readFileSync(sourcePath('approved-review-r2-2026-11-09','approval.json'))),cache=new Map();let count=0;
 for(const asset of ledger.assets)for(const row of asset.applications){
  if(!cache.has(row.manifest))cache.set(row.manifest,JSON.parse(readFileSync(new URL('../public/assets/'+row.manifest,import.meta.url))));
  const current=cache.get(row.manifest).assets[asset.id];assert.deepEqual(current,row.afterConfig,asset.id+' '+row.manifest+' live config');
  assert.deepEqual(originalR2AssetGraph(current,asset.id,row.manifest),row.beforeConfig,asset.id+' live projection');count++;
 }
 assert.equal(count,29);
});
