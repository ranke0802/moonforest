import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {originalAssetGraph,originalManifestText,originalInputText,assertOriginalInputFingerprint} from './helpers/mobile-profile-contract.js';

const hash=value=>createHash('sha256').update(value).digest('hex'),assets=new URL('../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('monster-forest.json',assets))),baseline=JSON.parse(readFileSync(new URL('../reports/plains-tree-mix-2026-11-03/baseline.json',import.meta.url)));
const id=Object.keys(manifest.assets).find(id=>manifest.assets[id].mobileHighTextures),asset=manifest.assets[id];

test('additive mobile color metadata preserves the exact historical forest manifest and every referenced original resource',()=>{
 assert.ok(id,'exercise an actual mobile alternative');
 assert.equal(hash(originalManifestText(JSON.stringify(manifest))),baseline.hashes['public/assets/monster-forest.json']);
 for(const fingerprint of [hash(JSON.stringify(manifest)),baseline.hashes['public/assets/monster-forest.json']])assertOriginalInputFingerprint('public/assets/monster-forest.json',JSON.stringify(manifest),fingerprint);
 const original=JSON.parse(originalManifestText(JSON.stringify(manifest)));assert.deepEqual(original,baseline.manifests.forest);
 const resources=new Set();
 for(const source of Object.values(baseline.manifests.forest.assets))for(const profile of [...source.lods,source.mobileNear,source.highTextures].filter(Boolean))for(const resource of profile.resources??[])resources.add(resource);
 assert.ok(resources.size>20,'check the complete native forest graph rather than one selected mesh');
 for(const resource of resources){const digest=resource.split('/').at(-1).split('.')[0];assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(hash(readFileSync(new URL(resource,assets))),digest,resource+' original model, buffer or texture bytes');}
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
