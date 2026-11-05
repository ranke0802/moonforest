import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {PLACEMENT_MAPS,createBasePlacementManifest,createEmptyPlacementDocument,validatePlacementDocument,PlacementHistory} from '../src/placement-document.js';

const asset=ASSET_CATALOG.entries.find(entry=>entry.assetId==='crate-barrel-cluster');
const instance=id=>({instanceId:id,assetId:asset.assetId,assetVersion:asset.version,transform:{position:[0,0,0],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});
const options=mapId=>({catalog:ASSET_CATALOG,baseManifest:createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG})});

test('four immutable base manifests keep original placement and quest IDs with deterministic revision',()=>{
 const counts=[];
 for(const mapId of PLACEMENT_MAPS){
  const {baseManifest:base}=options(mapId),again=createBasePlacementManifest(mapId,{catalog:ASSET_CATALOG});
  assert.equal(base.baseRevision,again.baseRevision);assert.ok(base.instances.every(row=>row.instanceId===row.source.id&&row.readOnly===!row.editable&&(row.editable?row.reason===null:!!row.reason)));
  if(mapId!=='great-plains')assert.equal(base.baseRevision,{'village':'base-v1-df702ffd5fbba4a6','great-plains':'base-v1-15f4805945d0a75d','monster-forest':'base-v1-00b8ad6c8679e30d','witch-cave':'base-v1-ec3bab9e672e6ec3'}[mapId],'editor capabilities preserve the original immutable-layout revision');
  assert.equal(new Set(base.instances.map(row=>row.instanceId)).size,base.instances.length);counts.push(base.instances.length);
  const doc={...createEmptyPlacementDocument(base),instances:[instance('new-independent-1')]};
  assert.deepEqual(validatePlacementDocument(JSON.parse(JSON.stringify(doc)),{catalog:ASSET_CATALOG,baseManifest:base}),doc);
  doc.instances[0].instanceId=base.instances[0].instanceId;assert.throws(()=>validatePlacementDocument(doc,{catalog:ASSET_CATALOG,baseManifest:base}),/protected/);
 }
 assert.deepEqual(counts,[753,PLAINS_PLACEMENTS.length,891,212]);
});

test('eligible base replacements retain exact IDs/assets, roundtrip through history and cannot forge protected or dependent targets',()=>{
 const opts=options('village'),source=opts.baseManifest.instances.find(row=>row.instanceId==='handcart-25');assert.equal(source.editable,true);
 const item={...instance(source.instanceId),sourceInstanceId:source.instanceId,assetId:source.assetId,assetVersion:source.assetVersion},doc={...createEmptyPlacementDocument(opts.baseManifest),instances:[item]};
 const history=new PlacementHistory(doc,opts);assert.deepEqual(history.document,doc);const moved=history.document;moved.instances[0].transform.position[0]=4;history.commit(moved);assert.equal(history.undo().instances[0].sourceInstanceId,source.instanceId);assert.equal(history.redo().instances[0].instanceId,source.instanceId);assert.deepEqual(new PlacementHistory(JSON.parse(JSON.stringify(history.document)),opts).document,history.document);
 for(const mutate of [row=>row.instanceId='new-copy',row=>row.sourceInstanceId='home-01',row=>row.assetId=asset.assetId,row=>row.assetVersion='other']){const bad=structuredClone(doc);mutate(bad.instances[0]);assert.throws(()=>validatePlacementDocument(bad,opts));}
 const ordinary=structuredClone(item);ordinary.instanceId='duplicate-1';delete ordinary.sourceInstanceId;assert.doesNotThrow(()=>validatePlacementDocument({...doc,instances:[item,ordinary]},opts));
 ordinary.attachment={surface:'wall',normal:[0,0,1],offset:0,supportId:source.instanceId};ordinary.collision='none';assert.throws(()=>validatePlacementDocument({...doc,instances:[item,ordinary]},opts),/지지면/);
 for(const [mapId,id]of [['witch-cave','cavern-149']]){const locked=options(mapId),row=locked.baseManifest.instances.find(row=>row.instanceId===id);assert.equal(row.editable,false);assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(locked.baseManifest),instances:[{...item,instanceId:id,sourceInstanceId:id,assetId:row.assetId,assetVersion:row.assetVersion}]},locked),error=>error.code==='READ_ONLY_BASE');}
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
  row.instances[0].collision='none';row.instances[0].attachment.supportId='new-prop';assert.throws(()=>validatePlacementDocument(row,opts),/support/);
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


test('base removal and native aspect metadata roundtrip strictly without weakening immutable terrain boundaries',()=>{
 const opts=options('village'),base=opts.baseManifest,house=base.instances.find(row=>row.source.kind==='building'&&row.editable),wall=base.instances.find(row=>row.source.kind==='wall'&&row.editable);assert.ok(house&&wall);
 const item={...instance(house.instanceId),sourceInstanceId:house.instanceId,assetId:house.assetId,assetVersion:house.assetVersion};item.transform.aspect=[2,1,.4];item.transform.frontYaw=.7;
 const doc={...createEmptyPlacementDocument(base),revision:7,instances:[item],removedBaseIds:[wall.instanceId]},reopened=validatePlacementDocument(JSON.parse(JSON.stringify(doc)),opts);assert.deepEqual(reopened,doc);
 for(const mutate of [row=>row.removedBaseIds.push(wall.instanceId),row=>row.removedBaseIds.push(house.instanceId),row=>row.removedBaseIds=['not-an-original'],row=>row.instances[0].transform.aspect=[1,0,1],row=>row.instances[0].transform.aspect=[1,Infinity,1],row=>row.instances[0].transform.aspect=[1,1],row=>row.instances[0].transform.frontYaw=NaN]){const bad=structuredClone(doc);mutate(bad);assert.throws(()=>validatePlacementDocument(bad,opts));}
 const attached=instance('wall-decoration');attached.collision='none';attached.attachment={surface:'wall',normal:[0,0,1],offset:0,supportId:wall.instanceId};assert.throws(()=>validatePlacementDocument({...doc,instances:[item,attached]},opts),/removed supports/);
 const cave=options('witch-cave');assert.throws(()=>validatePlacementDocument({...createEmptyPlacementDocument(cave.baseManifest),removedBaseIds:['cavern-149']},cave),/noneditable/);
});


test('native aspects cannot bypass the effective uniform size budget, while length-scaled originals retain their exact native extent',()=>{
 const opts=options('village'),doc={...createEmptyPlacementDocument(opts.baseManifest),instances:[instance('sized-prop')]};doc.instances[0].transform.aspect=[2,1,2];doc.instances[0].transform.scale=6;assert.throws(()=>validatePlacementDocument(doc,opts),/scale range/);doc.instances[0].transform.scale=5;assert.doesNotThrow(()=>validatePlacementDocument(doc,opts));
 const tiny=opts.baseManifest.instances.find(row=>row.editable&&row.source.scale<.1),row={...instance(tiny.instanceId),sourceInstanceId:tiny.instanceId,assetId:tiny.assetId,assetVersion:tiny.assetVersion};row.transform.scale=tiny.source.scale*.5;assert.doesNotThrow(()=>validatePlacementDocument({...doc,instances:[row]},opts));
});
