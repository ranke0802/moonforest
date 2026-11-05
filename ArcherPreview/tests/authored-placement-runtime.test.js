import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,AssetContainer,MeshBuilder,StandardMaterial,Vector3,TransformNode} from '@babylonjs/core';
import {createWorld} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {AuthoredPlacementRuntime} from '../src/authored-placement-runtime.js';
import {createEmptyPlacementDocument} from '../src/placement-document.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {villageObstacles} from '../src/village-layout.js';
import {caveFogRootEnabled} from '../src/cave-fog-of-war.js';

const asset={assetId:'test-prop',version:'approved-test-version',reviewStatus:'approved',runtime:{manifest:'assets/test.json',assetKey:'test-prop',model:'assets/content/test-0.gltf'},units:{metersPerSourceUnit:1},pivot:{offset:[0,0,0]},forwardYaw:0,placement:{supported:true,baked:false,collision:'independent-static',scaleMin:.1,scaleMax:10,surfaces:['ground','wall','ceiling']}};
const levels=[0,1,2].map(level=>({level,model:`content/test-${level}.gltf`,resources:[],textureSize:1}));
const manifest={assets:{'test-prop':{geometryLod:true,category:'prop',height:1,bounds:[2,1,1],lods:levels,mobileNear:levels[0]}}};
const row=(x=3,z=0)=>({instanceId:'overlay-1',assetId:asset.assetId,assetVersion:asset.version,transform:{position:[x,0,z],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'solid'});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),get resolve(){return resolve;}};};
async function fixture(t,{loadContainer,publish=true,editableBase,nativeAspect=[1,1,1],singleModel=false,placement=asset.placement}={}){
 const engine=new NullEngine();engine.getCaps().instancedArrays=true;const world=createWorld(engine,{village:true,touchDevice:true});world.navigation=new VillageNavigation([]);world.terrain.heightAt=()=>0;
 caveFogFallback(world.scene).getInternalTexture().isReady=true;
 world.placements=[{id:'base-support',asset:'test-prop',x:0,z:6,yaw:0,scale:1,kind:'wall'}];
 const support=MeshBuilder.CreateBox('base-support',{width:4,height:4,depth:1},world.scene);support.position.set(0,4,6);support.computeWorldMatrix(true);world.villageRenderRecords=[{placement:world.placements[0],meshes:[support]}];
 let baseRecord;if(editableBase){const root=new TransformNode('native-'+editableBase.id,world.scene),facing=new TransformNode(root.name+'-front',world.scene),mesh=MeshBuilder.CreateBox('native-body',{width:2,height:1,depth:1},world.scene);facing.parent=root;mesh.parent=facing;mesh.position.y=.5;root.position.set(editableBase.x,-.025,editableBase.z);root.rotation.y=editableBase.yaw;root.scaling.copyFromFloats(...nativeAspect.map(value=>value*editableBase.scale));facing.rotation.y=.4;mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;baseRecord={root,facing,meshes:[mesh],placement:editableBase,min:box.minimumWorld.clone(),max:box.maximumWorld.clone()};world.placements.push(editableBase);world.villageRenderRecords.push(baseRecord);world.navigation=new VillageNavigation([...villageObstacles([editableBase]),{id:'retained-unrelated',x:-30,z:0,radius:1,height:2}]);world.camera.setTarget(new Vector3(editableBase.x,.5,editableBase.z));world.camera.radius=8;}
 let loads=0;
 const load=async()=>{
  loads++;const container=new AssetContainer(world.scene),source=MeshBuilder.CreateBox('source',{width:2,height:1,depth:1},world.scene);source.position.y=.5;source.material=new StandardMaterial('prop-paint',world.scene);
  container.meshes.push(source);container.materials.push(source.material);container.rootNodes.push(source);container.removeAllFromScene();return container;
 };
 const options={catalog:{entries:[{...asset,placement}]},publish,baseUrl:'https://placement.test/',initialize:async()=>{},readManifest:async()=>singleModel?{assets:{'test-prop':{category:'prop',model:'content/test-0.gltf'}}}:manifest,loadContainer:loadContainer?((...args)=>loadContainer(load,...args)):load},createRuntime=()=>new AuthoredPlacementRuntime(world,options),runtime=createRuntime();
 t.after(()=>{runtime.dispose();world.scene.dispose();engine.dispose();});return {runtime,world,engine,loads:()=>loads,baseRecord,createRuntime};
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

const baseProp={id:'existing-handcart',asset:'test-prop',x:3,z:0,yaw:.35,scale:1.2,kind:'prop',colliderFootprint:[2,2],colliderParts:[{x:0,z:0,footprint:[2,1]},{x:-.6,z:1,footprint:[.2,1]},{x:.6,z:1,footprint:[.2,1]}]};
test('same-ID base edits preserve native visual/collision on adoption, move every collider part, suppress visibility and restore on undo/reopen/dispose',async t=>{
 const f=await fixture(t,{editableBase:baseProp}),original=f.world.navigation,source=f.baseRecord,oldFrame=source.facing.getWorldMatrix().clone(),oldParts=structuredClone(original.obstacles),visibility=new VillageVisibility(f.world,[source],{touch:true});f.world.villageVisibility=visibility;t.after(()=>visibility.dispose());
 const instance=f.runtime.createBaseOverride(baseProp.id);assert.equal(instance.instanceId,baseProp.id);assert.equal(instance.sourceInstanceId,baseProp.id);assert.ok(Math.abs(instance.attachment.offset+.025)<1e-6);assert.equal(instance.collision,'solid');assert.equal(f.runtime.records.size,0,'selecting a source produces data without allocating a replacement');
 let document={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[instance]};await f.runtime.apply(document);const replacement=f.runtime.records.get(baseProp.id),actual=replacement.facing.getWorldMatrix();for(let i=0;i<16;i++)assert.ok(Math.abs(actual.m[i]-oldFrame.m[i])<1e-5,'first adoption retains native source pivot, facing, normalization and pose');assert.equal(replacement.obstacles.length,3);assert.deepEqual(f.world.navigation.obstacles.filter(o=>o.id!=='retained-unrelated').map(({instanceId,...part})=>part),oldParts.filter(o=>o.id!=='retained-unrelated'));assert.equal(source.authoredSuppressed,true);assert.equal(source.root.isEnabled(),false);visibility.update(f.world.camera.globalPosition,new Vector3(3,0,0),.3);assert.equal(source.root.isEnabled(),false);assert.equal(caveFogRootEnabled(source),false);assert.equal(visibility.shadowCandidates({x:3,z:0}).includes(source),false);
 document=structuredClone(document);document.revision=2;document.instances[0].transform.position=[20,0,0];await f.runtime.apply(document);assert.equal(f.world.navigation.free({x:3,z:0},.1),true);assert.equal(f.world.navigation.free({x:20,z:0},.1),false);assert.equal(original.free({x:3,z:0},.1),false);assert.equal(f.world.navigation.obstacles.filter(o=>o.id.startsWith(baseProp.id+'-')).length,3);assert.equal(f.world.navigation.obstacles.some(o=>o.id==='retained-unrelated'),true);
 const saved=JSON.parse(JSON.stringify(document));await f.runtime.apply({...document,revision:3,instances:[]});assert.equal(f.world.navigation,original);assert.equal(source.authoredSuppressed,undefined);assert.equal(caveFogRootEnabled(source),true);assert.equal(source.root.isEnabled(),true);assert.equal(source.root.isDisposed(),false);
 f.runtime.dispose();const reopened=f.createRuntime();await reopened.apply(saved);assert.equal(reopened.records.get(baseProp.id).instance.sourceInstanceId,baseProp.id);assert.equal(source.authoredSuppressed,true);reopened.dispose();assert.equal(source.authoredSuppressed,undefined);assert.equal(source.root.isDisposed(),false);assert.equal(f.world.navigation,original);
});

test('failed base adoption leaves original visibility, all collider parts and native source resources untouched',async t=>{
 const f=await fixture(t,{editableBase:baseProp}),original=f.world.navigation,frame=f.baseRecord.facing.getWorldMatrix().clone(),instance=f.runtime.createBaseOverride(baseProp.id),prepare=VillageOutlines.prototype.prepare;VillageOutlines.prototype.prepare=async()=>{throw new Error('base prepare failure');};
 try{await assert.rejects(f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[instance]}),/base prepare failure/);}finally{VillageOutlines.prototype.prepare=prepare;}
 assert.equal(f.world.navigation,original);assert.equal(f.baseRecord.authoredSuppressed,undefined);assert.equal(f.baseRecord.root.isEnabled(),true);assert.equal(f.baseRecord.root.isDisposed(),false);assert.deepEqual(f.baseRecord.facing.getWorldMatrix().asArray(),frame.asArray());assert.equal(f.runtime.records.size,0);assert.equal(f.runtime.assets.size,0);
});

test('new trees collide by certified trunk rather than crown and tilted trunks conservatively cover their changed body',async t=>{
 const f=await fixture(t,{placement:{...asset.placement,sourceKind:'tree',body:{shape:'trunk-capsule',radius:.32,height:8,offset:[0,0,0]}}}),instance=row(),document={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[instance]};await f.runtime.apply(document);const record=f.runtime.records.get(instance.instanceId);assert.equal(record.placement.kind,'tree');assert.equal(record.obstacle.radius,.32);assert.equal(record.obstacle.source,'existing-certified-tree-trunk');assert.equal(f.world.navigation.free({x:3.7,z:0},.1),true,'the crown/model box is not a ground obstacle');assert.equal(f.world.navigation.free({x:3.2,z:0},.1),false);
 const tilted=structuredClone(document);tilted.revision=2;tilted.instances[0].transform.rotation=[0,0,Math.sin(Math.PI/8),Math.cos(Math.PI/8)];await f.runtime.apply(tilted);assert.equal(record.obstacle.shape,'box');assert.equal(record.obstacle.source,'conservative-tilted-tree-trunk');assert.ok(record.obstacle.halfWidth>2);assert.equal(f.world.navigation.free({x:0,z:0},.1),false);
});


test('a nonuniform original fence preserves its native aspect, analytic collider thickness and actual delete/undo ownership',async t=>{
 const source={...baseProp,id:'existing-fence',kind:'fence',scale:1,colliderParts:[{x:0,z:0,footprint:[4,.3]}]},f=await fixture(t,{editableBase:source,nativeAspect:[2,1,.6]}),base=f.world.navigation,original=f.baseRecord.facing.getWorldMatrix().clone(),item=f.runtime.createBaseOverride(source.id);assert.ok(Math.abs(item.transform.aspect[0]-2)<1e-6);assert.ok(Math.abs(item.transform.aspect[2]-.6)<1e-6);
 const doc={...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[item]};await f.runtime.apply(doc);const matrix=f.runtime.records.get(source.id).facing.getWorldMatrix();for(let i=0;i<16;i++)assert.ok(Math.abs(matrix.m[i]-original.m[i])<1e-5);
 const moved=structuredClone(doc);moved.revision=2;moved.instances[0].transform.position[0]+=12;await f.runtime.apply(moved);const part=f.runtime.records.get(source.id).obstacles[0],old=base.obstacles.find(row=>row.id===part.id);assert.ok(Math.abs(part.halfWidth-old.halfWidth)<1e-5);assert.ok(Math.abs(part.halfDepth-old.halfDepth)<1e-5,'moving a wall retains its thin collider instead of expanding rotated bounds');assert.ok(Math.abs(part.x-old.x-12)<1e-5);
 await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:3,removedBaseIds:[source.id]});assert.equal(f.runtime.records.size,0);assert.equal(f.baseRecord.root.isEnabled(),false);assert.equal(f.world.navigation.obstacles.some(row=>row.id===old.id),false);assert.ok(f.world.navigation.obstacles.some(row=>row.id==='retained-unrelated'));
 await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:4});assert.equal(f.world.navigation,base);assert.equal(f.baseRecord.root.isEnabled(),true);
});

test('a static single-model catalog asset remains addable without requesting nonexistent reduced tiers',async t=>{
 const f=await fixture(t,{singleModel:true});await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[row()]});const entry=[...f.runtime.assets.values()][0];assert.equal(entry.levels.length,1);assert.equal(entry.baseLevel,0);assert.equal(f.runtime.streaming.has({id:entry.key,level:1}),true);assert.equal(f.runtime.streaming.has({id:entry.key,level:2}),true);assert.equal(f.loads(),1);
});


test('nonuniform new tree trunks cover both enlarged horizontal axes',async t=>{
 const body={shape:'trunk-capsule',radius:.2,height:1,offset:[0,0,0]},f=await fixture(t,{placement:{...asset.placement,body}}),item=row();item.transform.aspect=[2,1,3];await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[item]});assert.ok(Math.abs(f.runtime.records.get(item.instanceId).obstacle.radius-.6)<1e-6);assert.equal(f.world.navigation.free({x:3.5,z:0},.05),false);
});


test('legacy native records without a facing property retain their actual child facing on adoption',async t=>{
 const f=await fixture(t,{editableBase:baseProp}),expected=f.baseRecord.facing.getWorldMatrix().clone();delete f.baseRecord.facing;const item=f.runtime.createBaseOverride(baseProp.id);assert.ok(Math.abs(item.transform.frontYaw-.4)<1e-6);await f.runtime.apply({...createEmptyPlacementDocument(f.runtime.baseManifest),revision:1,instances:[item]});const actual=f.runtime.records.get(baseProp.id).facing.getWorldMatrix();for(let i=0;i<16;i++)assert.ok(Math.abs(actual.m[i]-expected.m[i])<1e-5);
});
