import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {originalAssetGraph,originalManifestText,originalInputText,assertOriginalInputFingerprint} from './helpers/mobile-profile-contract.js';
import {sourcePath} from '../../Sources/resolve-source.mjs';
import {sceneryNativeFingerprint} from '../scripts/approved-scenery-policy.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex'),assets=new URL('../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('monster-forest.json',assets))),baseline=JSON.parse(readFileSync(new URL('../reports/plains-tree-mix-2026-11-03/baseline.json',import.meta.url)));
const id=Object.keys(manifest.assets).find(id=>manifest.assets[id].mobileHighTextures),asset=manifest.assets[id];

test('validated mobile profiles and approved geometry recover the exact historical forest graph and retain its original resources',()=>{
 assert.ok(id,'exercise an actual mobile alternative');
 assert.equal(hash(originalManifestText(JSON.stringify(manifest))),baseline.hashes['public/assets/monster-forest.json']);
 for(const fingerprint of [hash(JSON.stringify(manifest)),baseline.hashes['public/assets/monster-forest.json']])assertOriginalInputFingerprint('public/assets/monster-forest.json',JSON.stringify(manifest),fingerprint);
 const original=JSON.parse(originalManifestText(JSON.stringify(manifest)));assert.deepEqual(original,baseline.manifests.forest);
 const resources=new Set();
 for(const source of Object.values(baseline.manifests.forest.assets))for(const profile of [...source.lods,source.mobileNear,source.highTextures].filter(Boolean))for(const resource of profile.resources??[])resources.add(resource);
 assert.ok(resources.size>20,'check the complete native forest graph rather than one selected mesh');
 for(const resource of resources){const digest=resource.split('/').at(-1).split('.')[0];assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(hash(readFileSync(new URL(resource,assets))),digest,resource+' original model, buffer or texture bytes');}
});

test('all 21 geometry approvals project only exact registered current configurations to their immutable before graphs',()=>{
 const approval=JSON.parse(readFileSync(sourcePath('approved-scenery-budgets','approval.json'))),selected=new Set(approval.assets.map(a=>a.id)),seen=new Set;let occurrences=0;
 for(const saved of approval.beforeManifests){const before=JSON.parse(readFileSync(sourcePath(saved.sourceId))),current=JSON.parse(readFileSync(new URL(saved.manifest,assets)));for(const [id,old]of Object.entries(before.assets)){if(!selected.has(id))continue;const expected=structuredClone(old);delete expected.mobileHighTextures;assert.deepEqual(originalAssetGraph(current.assets[id],id,saved.manifest),expected,saved.manifest+':'+id);seen.add(id);occurrences++;}}
 assert.equal(seen.size,21);assert.equal(occurrences,38);
});

test('approved geometry projection rejects metadata, hashes, native frames, original textures and resource graph tampering',()=>{
 const village=JSON.parse(readFileSync(new URL('village.json',assets))),selectedId='rock-01-mossy-boulder',source=village.assets[selectedId];assert.ok(source.geometryBudget);
 const mutations=[
  ['missing approval',a=>{delete a.geometryBudget;}],['wrong revision',a=>{a.geometryBudget.revision='unreviewed';}],['wrong ID',a=>{a.geometryBudget.assetId='bush';}],['wrong cap',a=>{a.geometryBudget.cap=701;}],
  ['original hash',a=>{a.geometryBudget.beforeModelSha256='0'.repeat(64);}],['target hash',a=>{a.geometryBudget.appliedModelSha256='0'.repeat(64);}],['authoring version',a=>{a.geometryBudget.catalogAssetVersion='0'.repeat(64);}],
  ['fingerprint',a=>{a.geometryBudget.nativeConfigSha256='0'.repeat(64);}],['self-signed native change',a=>{a.height+=.01;a.geometryBudget.nativeConfigSha256=sceneryNativeFingerprint(a);}],['native pivot',a=>{a.origin='center';}],['native bounds',a=>{a.bounds[0]+=.01;}],
  ['model URL',a=>{a.lods[0].model='./content/'+'0'.repeat(64)+'.gltf';}],['lower geometry',a=>{a.lods[1].triangles--;}],['mobile geometry',a=>{a.mobileNear.triangles--;}],['LOD metadata',a=>{a.lods[1].distance=999;}],
  ['extra resource',a=>{a.lods[0].resources.push(a.lods[0].resources[0]);}],['resource byte count',a=>{a.lods[0].bytes++;}],['original texture',a=>{a.highTextures.textures.albedo.url='./content/'+'0'.repeat(64)+'.ktx2';}],
  ['texture resolution',a=>{a.highTextures.textures.albedo.width/=2;}],['texture claim',a=>{a.geometryBudget.texturePixelsUnchanged=false;}],['distance claim',a=>{a.geometryBudget.lodDistancesUnchanged=false;}],['extra metadata',a=>{a.geometryBudget.unapproved=true;}],['unrelated field',a=>{a.name+=' changed';}],
 ];for(const [label,mutate]of mutations){const changed=structuredClone(source);mutate(changed);assert.throws(()=>originalAssetGraph(changed,selectedId,'village.json'),undefined,label);const full=structuredClone(village);full.assets[selectedId]=changed;assert.throws(()=>assertOriginalInputFingerprint('public/assets/village.json',JSON.stringify(full),hash(JSON.stringify(full))),undefined,label+' cannot bypass validation using a raw fingerprint');}
 for(const forbidden of ['tree-01-round-oak','covered-wagon','house-01-cottage','unknown-scenery']){const changed=structuredClone(source);changed.geometryBudget.assetId=forbidden;assert.throws(()=>originalAssetGraph(changed,forbidden),undefined,forbidden);}
});

test('original model, geometry bounds, original texture and unrelated metadata changes still invalidate the legacy fingerprint',()=>{
 const originalHash=hash(originalManifestText(JSON.stringify(manifest)));
 for(const change of [m=>{m.assets[id].bounds[0]+=.01;},m=>{m.assets[id].lods[0].model='./content/'+'0'.repeat(64)+'.gltf';},m=>{m.assets[id].highTextures.textures.albedo.url='./content/'+'0'.repeat(64)+'.ktx2';},m=>{m.mobileHighTextures={unexpected:true};}]){
  const changed=structuredClone(manifest);change(changed);assert.notEqual(hash(originalManifestText(JSON.stringify(changed))),originalHash);assert.throws(()=>assertOriginalInputFingerprint('public/assets/monster-forest.json',JSON.stringify(changed),originalHash));
 }
 assert.equal(originalInputText('src/example.js','const mobileHighTextures = 1;\r\n'),'const mobileHighTextures = 1;\n','source files never receive manifest field exclusions');
});

test('the excluded field must be a bounded color-only alternative and cannot apply to houses or actors',()=>{
 for(const [label,change]of [
  ['normal map',a=>{a.mobileHighTextures.textures.normal={...a.mobileHighTextures.textures.albedo};}],
  ['unsupported size',a=>{a.mobileHighTextures.textures.albedo.width=512;}],
  ['wrong alpha',a=>{a.mobileHighTextures.textures.albedo.alpha=!a.highTextures.textures.albedo.alpha;}],
  ['wrong byte budget',a=>{a.mobileHighTextures.textures.albedo.bytes++;}],
  ['unbounded property',a=>{a.mobileHighTextures.unapproved=true;}],
  ['building',a=>{a.category='building';}],
  ['actor',a=>{a.category='monster';}],
 ]){const changed=structuredClone(asset);change(changed);assert.throws(()=>originalAssetGraph(changed,id),undefined,label);}
 for(const excluded of ['house-01','guardian-bear','elena','mourning-elena'])assert.throws(()=>originalAssetGraph(asset,excluded),undefined,excluded);
 assert.deepEqual(originalAssetGraph(asset,id),baseline.manifests.forest.assets[id]);
});
