import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,realpath,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {NullEngine} from '@babylonjs/core';
import {ASSET_CATALOG,getCatalogAsset} from '../src/asset-catalog.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from '../src/placement-document.js';
import {authoredMapStorageKey,authoredMapDraftKey,loadAuthoredMap} from '../src/authored-map-loader.js';
import {applyAuthoredMap} from '../scripts/apply-authored-map.mjs';
import {createWorld} from '../src/world.js';

const CURRENT='base-v1-6fc3db2cf9acf956',LEGACY=['base-v1-b2818f0d0797c28a','base-v1-765c947dda5b0795'];
const base=()=>createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG});
const conflict=error=>error?.code==='BASE_REVISION_CONFLICT';
const run=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function numericJitter(value,delta){
  if(typeof value==='number'&&Number.isFinite(value))return value+delta;
  if(Array.isArray(value))return value.map(item=>numericJitter(item,delta));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,numericJitter(item,delta)]));
  return value;
}
function work(previous=LEGACY[0]){
  const native=base(),document={...createEmptyPlacementDocument(native),baseRevision:previous,revision:9000},asset=getCatalogAsset('crate-barrel-cluster');
  document.removedBaseIds=[native.instances.find(row=>row.editable).instanceId];
  document.instances.push({instanceId:'revision-precision-probe',assetId:asset.assetId,assetVersion:asset.version,
    transform:{position:[1.123456789012345,2.123456789012345,3.987654321098765],rotation:[0,Math.sin(.123456789012345/2),0,Math.cos(.123456789012345/2)],scale:.875123456789,aspect:[1.1,1,.9],frontYaw:.123456789012345},
    attachment:{surface:'free',normal:[0,1,0],offset:.123456789012345},collision:'none'});
  return document;
}
async function temporary(t){
  const path=await mkdtemp(join(tmpdir(),'mf-plains-revision-'));
  t.after(async()=>{const actual=await realpath(path),parent=await realpath(tmpdir());assert.equal(dirname(actual),parent);assert.ok(basename(actual).startsWith('mf-plains-revision-'));assert.equal((await lstat(actual)).isSymbolicLink(),false);await rm(actual,{recursive:true,force:true});});
  return path;
}

test('plains fingerprints ignore 1e-12 numeric jitter including actual half-micro-unit source ties',()=>{
  const original=structuredClone(PLAINS_PLACEMENTS),native=base();assert.equal(native.baseRevision,CURRENT);assert.equal(native.instances.length,1424);
  assert.ok(PLAINS_PLACEMENTS.some(source=>source.yOffset===-.2130625),'keep the real exact-rounding-boundary regression');
  for(const delta of [-1e-12,1e-12]){
    const placements=numericJitter(PLAINS_PLACEMENTS,delta),jittered=createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG,placements});
    assert.equal(jittered.baseRevision,CURRENT,`all-source jitter ${delta}`);
    assert.deepEqual(jittered.instances[0].source,placements[0],'hashing must not rewrite the supplied source values');
  }
  assert.deepEqual(PLAINS_PLACEMENTS,original,'fingerprinting cannot mutate native geometry inputs');
});

test('material placement, stable-ID and used-asset version changes invalidate both legacy aliases',()=>{
  const moved=structuredClone(PLAINS_PLACEMENTS);moved[0].x+=1e-4;
  const renamed=structuredClone(PLAINS_PLACEMENTS);renamed[0].id+='-changed';
  const catalog=structuredClone(ASSET_CATALOG),used=PLAINS_PLACEMENTS[0].asset;
  for(const entry of catalog.entries)if(entry.assetId===used)entry.version+='-changed';
  const manifests=[createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG,placements:moved}),createBasePlacementManifest('great-plains',{catalog:ASSET_CATALOG,placements:renamed}),createBasePlacementManifest('great-plains',{catalog})];
  for(const manifest of manifests){
    assert.notEqual(manifest.baseRevision,CURRENT);
    for(const previous of LEGACY)assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(manifest),baseRevision:previous},{catalog:ASSET_CATALOG,baseManifest:manifest}),conflict);
  }
});

test('only the two audited aliases normalize, with every saved pose and removal ID unchanged',()=>{
  const native=base();
  for(const previous of LEGACY){
    const input=work(previous),before=structuredClone(input),normalized=validatePlacementDocument(input,{catalog:ASSET_CATALOG,baseManifest:native});
    assert.equal(normalized.baseRevision,CURRENT);assert.deepEqual(input,before,'caller data remains untouched');assert.notEqual(normalized,input);
    assert.deepEqual(normalized,{...before,baseRevision:CURRENT});assert.deepEqual(normalized.instances,before.instances);assert.deepEqual(normalized.removedBaseIds,before.removedBaseIds);
    const history=new PlacementHistory(input,{catalog:ASSET_CATALOG,baseManifest:native});assert.equal(history.document.baseRevision,CURRENT);assert.deepEqual(history.document.instances,before.instances);
  }
  for(const previous of ['base-v1-0000000000000000','base-v1-6fc3db2cf9acf957'])assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(native),baseRevision:previous},{catalog:ASSET_CATALOG,baseManifest:native}),conflict);
});

test('other map revisions remain unchanged and cannot consume a plains-only alias',()=>{
  const expected={village:'base-v1-df702ffd5fbba4a6','monster-forest':'base-v1-00b8ad6c8679e30d','witch-cave':'base-v1-ec3bab9e672e6ec3'};
  for(const [mapId,revision]of Object.entries(expected)){
    const native=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG});assert.equal(native.baseRevision,revision);
    for(const previous of LEGACY)assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(native),baseRevision:previous},{catalog:ASSET_CATALOG,baseManifest:native}),conflict);
    const document=createEmptyPlacementDocument(native);assert.deepEqual(validatePlacementDocument(document,{catalog:ASSET_CATALOG,baseManifest:native}),document);
  }
});

test('loading an old browser-applied map normalizes only memory and preserves both stored applied work and draft',async t=>{
  for(const previous of LEGACY){
    const engine=new NullEngine();engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
    const world=createWorld(engine,{plains:true,touchDevice:false});t.after(()=>engine.dispose());
    const applied=JSON.stringify({...createEmptyPlacementDocument(base()),baseRevision:previous,revision:7}),draft=JSON.stringify(work(previous)),saved=new Map([[authoredMapStorageKey('great-plains'),applied],[authoredMapDraftKey('great-plains'),draft]]),writes=[];
    const storage={getItem:key=>saved.get(key)??null,setItem:(...args)=>writes.push(['set',...args]),removeItem:(...args)=>writes.push(['remove',...args])};
    const runtime=await loadAuthoredMap(world,{storage,registry:{version:1,maps:{}},runtimeOptions:{initialize:async()=>{throw Error('empty saved maps must not fetch models');}}});
    assert.equal(runtime.document.baseRevision,CURRENT);assert.equal(world.placementOverlay.baseRevision,CURRENT);assert.equal(runtime.document.revision,7);
    assert.equal(saved.get(authoredMapStorageKey('great-plains')),applied);assert.equal(saved.get(authoredMapDraftKey('great-plains')),draft);assert.deepEqual(writes,[]);
    const restoredDraft=new PlacementHistory(JSON.parse(draft),{catalog:ASSET_CATALOG,baseManifest:base()});assert.equal(restoredDraft.document.baseRevision,CURRENT);assert.deepEqual(restoredDraft.document.instances,JSON.parse(draft).instances);assert.deepEqual(writes,[]);
    runtime.dispose();world.scene.dispose();engine.dispose();
  }
});

test('real CLI dry-run and registration hash the normalized deployed header without changing the source moonmap',async t=>{
  const directory=await temporary(t),input=join(directory,'old-browser-work.moonmap'),document=work(),source=JSON.stringify(document,null,2)+'\n';await writeFile(input,source);
  const {stdout}=await run(process.execPath,[resolve('scripts/apply-authored-map.mjs'),input],{cwd:resolve('.'),windowsHide:true});
  const cli=JSON.parse(stdout);assert.equal(cli.dryRun,true);assert.equal(cli.normalizedBaseRevision,true);assert.equal(cli.entry.baseRevision,CURRENT);assert.equal(cli.sourceUnmodified,true);
  const result=await applyAuthoredMap(input,{projectRoot:directory,dryRun:false}),bytes=await readFile(result.target),deployed=JSON.parse(bytes),registry=JSON.parse(await readFile(result.indexPath,'utf8'));
  assert.equal(result.normalizedBaseRevision,true);assert.equal(deployed.baseRevision,CURRENT);assert.deepEqual(deployed,{...document,baseRevision:CURRENT});assert.equal(await readFile(input,'utf8'),source);
  assert.deepEqual(registry.maps['great-plains'],result.entry);assert.equal(result.entry.baseRevision,CURRENT);assert.equal(result.entry.sha256,hash(bytes));assert.equal(cli.entry.sha256,result.entry.sha256);assert.notEqual(result.entry.sha256,hash(source));
});
