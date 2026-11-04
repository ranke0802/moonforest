import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {PLACEMENT_MAPS,createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from '../src/placement-document.js';

const asset=ASSET_CATALOG.entries.find(entry=>entry.assetId==='crate-barrel-cluster');
const instance=id=>({instanceId:id,assetId:asset.assetId,assetVersion:asset.version,transform:{position:[0,0,0],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});
const options=mapId=>({catalog:ASSET_CATALOG,baseManifest:createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG})});

test('four immutable base manifests keep original placement and quest IDs with deterministic revision',()=>{
 const counts=[];
 for(const mapId of PLACEMENT_MAPS){
  const {baseManifest:base}=options(mapId),again=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG});
  assert.equal(base.baseRevision,again.baseRevision);assert.ok(base.instances.every(row=>row.instanceId===row.source.id&&row.readOnly&&row.reason));
  assert.equal(new Set(base.instances.map(row=>row.instanceId)).size,base.instances.length);counts.push(base.instances.length);
  const doc={...createEmptyPlacementDocument(base),instances:[instance('new-independent-1')]};
  assert.deepEqual(validatePlacementDocument(JSON.parse(JSON.stringify(doc)),{catalog:ASSET_CATALOG,baseManifest:base}),doc);
  doc.instances[0].instanceId=base.instances[0].instanceId;assert.throws(()=>validatePlacementDocument(doc,{catalog:ASSET_CATALOG,baseManifest:base}),/protected/);
 }
 assert.deepEqual(counts,[753,1424,891,212]);
});

test('strict documents reject unknown fields, nonfinite transforms, nonunit quaternions, unsafe scale and versions',()=>{
 const opts=options('village'),doc={...createEmptyPlacementDocument(opts.baseManifest),instances:[instance('new-prop')]};
 const changes=[d=>d.instances[0].transform.position[0]=NaN,d=>d.instances[0].transform.rotation=[0,0,0,2],d=>d.instances[0].transform.scale=-1,d=>d.instances[0].transform.scale=[1,1,1],d=>d.instances[0].assetVersion='wrong',d=>d.instances[0].instanceId='../path',d=>d.instances[0].geometry='data:base64',d=>d.absolutePath='C:/private',d=>d.instances.push(structuredClone(d.instances[0])),d=>d.version=2,d=>d.coordinateSystem='LH',d=>d.baseRevision='base-v1-0000000000000000'];
 for(const change of changes){const bad=structuredClone(doc);change(bad);assert.throws(()=>validatePlacementDocument(bad,opts));}
});

test('surface references are immutable, typed and cannot retain arbitrary payloads; only ground can be solid',()=>{
 const opts=options('village'),doc={...createEmptyPlacementDocument(opts.baseManifest),instances:[instance('new-prop')]};
 for(const surface of ['wall','ceiling']){
  const row=structuredClone(doc);row.instances[0].attachment={surface,normal:surface==='wall'?[0,0,1]:[0,-1,0],offset:0,supportId:opts.baseManifest.instances[0].instanceId};row.instances[0].collision='none';
  assert.doesNotThrow(()=>validatePlacementDocument(row,opts));row.instances[0].collision='solid';assert.throws(()=>validatePlacementDocument(row,opts),/ground/);
  row.instances[0].collision='none';row.instances[0].attachment.supportId='new-prop';assert.throws(()=>validatePlacementDocument(row,opts),/immutable/);
 }
 for(const supportId of ['https://remote.invalid',{},['terrain']]){
  const row=structuredClone(doc);row.instances[0].attachment={surface:'free',normal:[0,1,0],offset:0,supportId};row.instances[0].collision='none';assert.throws(()=>validatePlacementDocument(row,opts),/support/);
 }
});

test('history keeps stable IDs through move duplicate delete undo redo save and reopen, with monotonic revisions',()=>{
 const opts=options('witch-cave'),history=new PlacementHistory(createEmptyPlacementDocument(opts.baseManifest),opts);
 let doc=history.document;doc.instances.push(instance('stable-a'));doc=history.commit(doc);assert.equal(doc.revision,1);
 doc.instances.push({...instance('stable-b'),transform:{position:[1,2,3],rotation:[0,0,0,1],scale:2}});doc=history.commit(doc);assert.equal(doc.revision,2);
 doc.instances.shift();doc=history.commit(doc);assert.deepEqual(doc.instances.map(row=>row.instanceId),['stable-b']);
 doc=history.undo();assert.equal(doc.revision,4);assert.deepEqual(doc.instances.map(row=>row.instanceId),['stable-a','stable-b']);
 doc=history.redo();assert.equal(doc.revision,5);assert.deepEqual(doc.instances.map(row=>row.instanceId),['stable-b']);
 const reopened=new PlacementHistory(JSON.parse(JSON.stringify(doc)),opts);assert.deepEqual(reopened.document,doc);
 assert.throws(()=>history.commit(doc,{expectedRevision:2}),/revision conflict/);
 const copied=history.document;copied.instances.length=0;assert.equal(history.document.instances.length,1);
});
