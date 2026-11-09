import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertLegacyExteriorWritable,approvedVillageExteriorVersion,VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256} from '../scripts/approved-village-exterior-policy.mjs';
import {approvedSceneryVersion} from '../scripts/approved-scenery-policy.mjs';
import {gltfCatalogMetadata} from '../scripts/asset-catalog-metadata.mjs';
const model=hash=>`./content/${hash}.gltf`;
const original=()=>({lods:[0,1,2].map(level=>({level,model:model(VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256)})),mobileNear:{model:model(VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256)}});
test('legacy exterior writer may only start on the original unapproved complete shell',()=>{
 assert.doesNotThrow(()=>assertLegacyExteriorWritable(original()));
 for(const mutate of [c=>{c.approvedVillageExterior={revision:'approved'};},c=>{c.lods[0].model=model('a'.repeat(64));},c=>{c.lods[2].model=model('b'.repeat(64));},c=>{c.mobileNear.model=model('c'.repeat(64));},c=>{c.lods.pop();},c=>{delete c.lods;},c=>{delete c.mobileNear;}]){const c=original();mutate(c);assert.throws(()=>assertLegacyExteriorWritable(c),/blocked/);}
});
test('legacy exterior guard executes before any report, content, or manifest write',()=>{
 const code=readFileSync(new URL('../scripts/build-plains-village-exterior.mjs',import.meta.url),'utf8'),guard=code.indexOf("assertLegacyExteriorWritable(plains.assets['village-approach'])");assert.ok(guard>0);assert.ok(guard<code.indexOf('await mkdir(report'));assert.ok(guard<code.indexOf('await writeFile('));
});
test('applied exterior retains authoring identity only for the exact registered source and live resource graph',t=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/assets/great-plains.json',import.meta.url))),config=manifest.assets['village-approach'];
 if(!config.approvedVillageExterior)return t.skip('approved exterior not yet applied to the live manifest');
 const raw=readFileSync(new URL(config.lods[0].model,new URL('../public/assets/great-plains.json',import.meta.url))),info={contentHash:createHash('sha256').update(raw).digest('hex'),triangles:gltfCatalogMetadata(JSON.parse(raw)).triangles};
 assert.equal(info.triangles,44828);assert.equal(approvedSceneryVersion('village-approach',config,info),VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256);
 assert.equal(approvedVillageExteriorVersion('village-approach',config,info),VILLAGE_EXTERIOR_ORIGINAL_MODEL_SHA256);
 for(const mutate of [c=>{c.height++;},c=>{c.bounds[1]++;},c=>{c.lods[1].model=model('e'.repeat(64));},c=>{c.mobileNear.textureSize=512;},c=>{c.approvedVillageExterior.sourceAtlasSha256='0'.repeat(64);},c=>{c.approvedVillageExterior.approvalLedgerSha256='0'.repeat(64);}]){const changed=structuredClone(config);mutate(changed);assert.throws(()=>approvedVillageExteriorVersion('village-approach',changed,info),/Invalid approved village exterior/);}
 assert.throws(()=>approvedVillageExteriorVersion('other',config,info),/Invalid approved village exterior/);
 assert.throws(()=>approvedVillageExteriorVersion('village-approach',config,{...info,triangles:44829}),/Invalid approved village exterior/);
 const missing=structuredClone(config);delete missing.approvedVillageExterior;assert.throws(()=>assertLegacyExteriorWritable(missing),/blocked/);
 const path=new URL('../public/assets/great-plains.json',import.meta.url),before=readFileSync(path),run=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/build-plains-village-exterior.mjs',import.meta.url))],{encoding:'utf8'});
 assert.notEqual(run.status,0,'legacy writer refuses applied exterior');assert.match(run.stderr,/Legacy village exterior rebuild is blocked/);assert.ok(readFileSync(path).equals(before),'blocked legacy process must not write the manifest');
});
