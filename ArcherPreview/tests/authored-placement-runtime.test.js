import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,AssetContainer,MeshBuilder,StandardMaterial,Vector3} from '@babylonjs/core';
import {createWorld} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {AuthoredPlacementRuntime} from '../src/authored-placement-runtime.js';
import {createEmptyPlacementDocument} from '../src/placement-document.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {VillageOutlines} from '../src/village-outlines.js';

const asset={assetId:'test-prop',version:'approved-test-version',reviewStatus:'approved',runtime:{manifest:'assets/test.json',assetKey:'test-prop',model:'assets/content/test-0.gltf'},units:{metersPerSourceUnit:1},pivot:{offset:[0,0,0]},forwardYaw:0,placement:{supported:true,baked:false,collision:'independent-static',scaleMin:.1,scaleMax:10,surfaces:['ground','wall','ceiling']}};
const levels=[0,1,2].map(level=>({level,model:`content/test-${level}.gltf`,resources:[],textureSize:1}));
const manifest={assets:{'test-prop':{geometryLod:true,category:'prop',height:1,bounds:[2,1,1],lods:levels,mobileNear:levels[0]}}};
const row=(x=3,z=0)=>({instanceId:'overlay-1',assetId:asset.assetId,assetVersion:asset.version,transform:{position:[x,0,z],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),get resolve(){return resolve;}};};
async function fixture(t,{loadContainer,publish=true}={}){
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;const world=createWorld(engine,{village:true,touchDevice:true});world.navigation=new VillageNavigation([]);world.terrain.heightAt=()=>0;
 caveFogFallback(world.scene).getInternalTexture().isReady=true;
 world.placements=[{id:'base-support',asset:'test-prop',x:0,z:6,yaw:0,scale:1,kind:'wall'}];
 const support=MeshBuilder.CreateBox('base-support',{width:4,height:4,depth:1},world.scene);support.position.set(0,4,6);support.computeWorldMatrix(true);world.villageRenderRecords=[{placement:world.placements[0],meshes:[support]}];
 let loads=0;
 const load=async()=>{
  loads++;const container=new AssetContainer(world.scene),source=MeshBuilder.CreateBox('source',{width:2,height:1,depth:1},world.scene);source.position.y=.5;source.material=new StandardMaterial('prop-paint',world.scene);
  container.meshes.push(source);container.materials.push(source.material);container.rootNodes.push(source);container.removeAllFromScene();return container;
 };
 const runtime=new AuthoredPlacementRuntime(world,{catalog:{entries:[asset]},publish,baseUrl:'https://placement.test/',initialize:async()=>{},readManifest:async()=>manifest,loadContainer:loadContainer?((...args)=>loadContainer(load,...args)):load});
 t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});return {runtime,world,engine,loads:()=>loads};
}

test('preview changes one instance without navigation/revision work; commits move exact solid bounds and restore base navigation',async t=>{
 const f=await fixture(t),original=f.world.navigation;
 const preview=await f.runtime.preview(row());assert.equal(f.loads(),1);assert.equal(f.world.navigation,original);assert.equal(f.world.placementRevision,undefined);
 for(let i=0;i<20;i++)await f.runtime.preview(row(3+i*.01));
 assert.equal(f.loads(),1);assert.equal(f.runtime.stats.instancesCreated,1);assert.equal(f.runtime.previewRecord,preview);
 const identity=row();identity.instanceId='overlay-identity';await f.runtime.preview(identity);
 assert.equal(preview.placement.id,'overlay-identity');assert.ok(preview.meshes.every(mesh=>mesh.metadata.placementInstanceId==='overlay-identity'));
 let doc={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[row()]};await f.runtime.apply(doc);
 assert.equal(f.world.navigation.free({x:3,z:0},.2),false);assert.equal(original.free({x:3,z:0},.2),true);assert.equal(f.world.placementRevision,1);
 assert.equal(f.world.navigation.segmentClear({x:1,z:0},{x:5,z:0},.2),false);
 assert.ok(f.world.navigation.move({x:1,z:0},{x:5,z:0},.2).x<3);
 doc=structuredClone(doc);doc.revision=2;doc.instances[0].transform.position=[8,0,0];doc.instances[0].transform.rotation=[Math.sin(Math.PI/8),0,0,Math.cos(Math.PI/8)];doc.instances[0].transform.scale=1.5;
 await f.runtime.apply(doc);
 assert.equal(f.world.navigation.free({x:3,z:0},.2),true);assert.equal(f.world.navigation.free({x:8,z:0},.2),false);assert.equal(f.loads(),1);
 const record=f.runtime.records.get('overlay-1');assert.deepEqual(record.root.rotationQuaternion.asArray(),doc.instances[0].transform.rotation);assert.ok(Math.abs(record.min.y)<1e-6);
 f.runtime.leaveMap();assert.equal(f.world.navigation,original);assert.equal(original.obstacles.length,0);assert.equal(f.runtime.assets.size,0);
});

test('real mesh wall and ceiling anchors preserve normal offset and add no ground collision',async t=>{
 const f=await fixture(t),original=f.world.navigation;
 for(const [surface,position,normal]of [['wall',[0,4,5.5],[0,0,-1]],['ceiling',[0,2,6],[0,-1,0]]]){
  const instance=row();instance.transform.position=position;instance.attachment={surface,normal,offset:.1,supportId:'base-support'};instance.collision='none';
  const record=await f.runtime.preview(instance),n=Vector3.FromArray(normal),anchor=Vector3.FromArray(position).add(n.scale(.1));let min=Infinity;
  for(const mesh of record.meshes)for(const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)min=Math.min(min,Vector3.Dot(corner.subtract(anchor),n));
  assert.ok(Math.abs(min)<1e-5);assert.equal(f.world.navigation,original);
 }
 const invalid=row();invalid.attachment={surface:'wall',normal:[0,0,-1],offset:0,supportId:'base-support'};invalid.transform.position=[20,4,5.5];invalid.collision='none';
 await assert.rejects(f.runtime.preview(invalid),/support geometry/);
 invalid.transform.position=[0,4,5.5];invalid.attachment.normal=[0,0,1];await assert.rejects(f.runtime.preview(invalid),/outward/);
});

test('map departure cancels a selected source and disposes its exact late container without an actor or obstacle',async t=>{
 const gate=deferred(),entered=deferred();let late,disposed=0;
 const f=await fixture(t,{loadContainer:async load=>{late=await load();const dispose=late.dispose.bind(late);late.dispose=()=>{disposed++;dispose();};entered.resolve();await gate.promise;return late;}});
 const pending=f.runtime.preview(row());await entered.promise;f.runtime.leaveMap();await assert.rejects(pending,{name:'AbortError'});gate.resolve();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.runtime.records.size,0);assert.equal(f.runtime.assets.size,0);assert.equal(f.world.navigation.obstacles.length,0);assert.equal(disposed,1);
});

test('failed staged outline preparation preserves the committed document transform navigation revision and owner',async t=>{
 const f=await fixture(t),doc={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[row()]};await f.runtime.apply(doc);
 const record=f.runtime.records.get('overlay-1'),position=record.root.position.clone(),navigation=f.world.navigation,outlines=f.runtime.outlines,revision=f.world.placementRevision;
 const prepare=VillageOutlines.prototype.prepare;VillageOutlines.prototype.prepare=async()=>{throw new Error('injected preparation failure');};
 try{const moved=structuredClone(doc);moved.revision=2;moved.instances[0].transform.position=[12,0,0];await assert.rejects(f.runtime.apply(moved),/injected preparation failure/);}
 finally{VillageOutlines.prototype.prepare=prepare;}
 assert.deepEqual(f.runtime.document,doc);assert.deepEqual(record.root.position.asArray(),position.asArray());assert.equal(f.world.navigation,navigation);assert.equal(f.runtime.outlines,outlines);assert.equal(f.world.placementRevision,revision);
 assert.equal(navigation.free({x:3,z:0},.2),false);assert.equal(navigation.free({x:12,z:0},.2),true);
});

test('the last source owner releases admitted high textures before disposing its material container',async t=>{
 const f=await fixture(t);await f.runtime.preview(row());const key=f.runtime.previewRecord.entry.key;
 f.runtime.textureStreaming.resident.set(key,{textures:{},originals:[],bytes:16});
 f.runtime.clearPreview();assert.equal(f.runtime.textureStreaming.resident.size,0);assert.equal(f.runtime.assets.size,0);
 assert.equal(f.runtime.stats.highTextureReleases,1);
});

test('committed target preview crosses cells without ghosts or navigation edits and cancels to the exact saved transform',async t=>{
 const f=await fixture(t),doc={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[row()]};await f.runtime.apply(doc);
 const record=f.runtime.records.get('overlay-1'),navigation=f.world.navigation,root=record.root,created=f.runtime.stats.instancesCreated,revision=f.world.placementRevision;
 const moved=structuredClone(doc.instances[0]);moved.transform.position=[32,0,16];
 assert.equal(await f.runtime.previewExisting(moved),record);f.runtime.update(.2);
 assert.equal(record.root,root);assert.equal(root.isEnabled(),true);assert.equal(record.visibilityKey,'2:1');assert.ok(f.runtime.visibility.cells.get('2:1').records.includes(record));
 assert.equal(f.runtime.stats.instancesCreated,created);assert.equal(f.runtime.previewRecord,null);assert.equal(f.world.navigation,navigation);assert.deepEqual(f.runtime.document,doc);assert.equal(f.world.placementRevision,revision);
 assert.equal(navigation.free({x:3,z:0},.2),false);assert.equal(navigation.free({x:32,z:16},.2),true);
 f.runtime.clearExistingPreview();assert.equal(record.visibilityKey,'0:0');assert.equal(root.position.x,3);assert.equal(root.position.z,0);assert.equal(f.world.navigation,navigation);assert.deepEqual(f.runtime.document,doc);
});

test('nonpublishing cinematic visuals sample multiple free transforms without overwriting world placement state',async t=>{
 const f=await fixture(t,{publish:false}),navigation=f.world.navigation,overlay={retained:true};f.world.placementOverlay=overlay;f.world.placementRevision=7;
 const first=row();first.collision='none';first.attachment={surface:'free',normal:[0,1,0],offset:0};const second=structuredClone(first);second.instanceId='overlay-2';
 await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[first,second]});
 f.runtime.sampleFreeTransforms([{instanceId:'overlay-1',position:[1,5,2],rotation:[0,0,0,1],scale:2},{instanceId:'overlay-2',position:[3,6,4],rotation:[0,0,0,1],scale:1}]);
 assert.equal(f.runtime.records.get('overlay-1').root.position.y,5);assert.equal(f.runtime.records.get('overlay-2').root.position.y,6);assert.equal(f.world.navigation,navigation);assert.equal(f.world.placementRevision,7);assert.equal(f.world.placementOverlay,overlay);
 f.runtime.dispose();assert.equal(f.world.placementRevision,7);assert.equal(f.world.placementOverlay,overlay);
});
