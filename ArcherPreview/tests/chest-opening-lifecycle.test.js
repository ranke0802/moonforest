import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,FreeCamera,Vector3,HemisphericLight} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createQuestProps} from '../src/chapter-quest-props.js';
import {setupChapterQuests} from '../src/chapter-quest.js';
import {ChapterJourney} from '../src/chapter-quest-state.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {lootRarity} from '../src/loot-rarity.js';
import {readMapContainer} from '../src/map-container.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {AuthoredPlacementRuntime} from '../src/authored-placement-runtime.js';
import {createEmptyPlacementDocument} from '../src/placement-document.js';
const maps=['village','great-plains','monster-forest','witch-cave'],facts=[],base=new URL('../public/assets/',import.meta.url),fullManifest=JSON.parse(readFileSync(new URL('quest-props.json',base))),config=fullManifest.assets['chest-common'],manifest={assets:{'chest-common':config}},profile=config.lods[1],modelUrl=new URL(profile.model,base);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};},tick=()=>new Promise(r=>setImmediate(r));
const storage=()=>{const values=new Map();let writes=0;return{getItem:k=>values.get(k),setItem:(k,v)=>{writes++;values.set(k,v);},get writes(){return writes;}};};
const observers=o=>o.observers.filter(v=>!v._willBeUnregistered).length;
const snapshot=scene=>({meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length,before:observers(scene.onBeforeRenderObservable),after:observers(scene.onAfterRenderObservable),dispose:observers(scene.onDisposeObservable),stages:scene._afterRenderingMeshStage.length});
let model,originalDecoder;
async function prepareModel(){
 await MeshoptDecoder.ready;model=JSON.parse(readFileSync(modelUrl));for(const buffer of model.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,modelUrl)).toString('base64');
 // Exact production mesh/accessor/node bytes. Native images and GPU upload are
 // deliberately omitted; these assertions cover CPU animation and ownership.
 delete model.images;delete model.textures;delete model.samplers;delete model.materials;for(const mesh of model.meshes)for(const p of mesh.primitives)delete p.material;
 for(const k of ['extensionsRequired','extensionsUsed'])model[k]=(model[k]??[]).filter(v=>v!=='KHR_texture_basisu');
}
test.before(async()=>{await prepareModel();originalDecoder=MeshoptCompression._Default;MeshoptCompression._Default={decodeGltfBufferAsync:async(bytes,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,bytes,mode,filter);return out;}};});
function fixture(t,{loadContainer,withUi=false,saved=storage(),collectDrops=true}={}){
 const engine=new NullEngine({renderWidth:960,renderHeight:540});engine.getCaps().instancedArrays=true;const scene=new Scene(engine),camera=new FreeCamera('chest-qa',new Vector3(0,1,-3),scene);camera.setTarget(Vector3.Zero());new HemisphericLight('chest-qa-light',Vector3.Up(),scene);caveFogFallback(scene).getInternalTexture().isReady=true;void scene.defaultMaterial;
 const world={scene,camera,lighting:{direction:Vector3.Up(),shadowsActive:false,registerMeshes(){}},terrain:{heightAt:()=>0},navigation:{findFree:p=>({...p}),segmentClear:()=>true},touchDevice:true,mapId:'village',prefetchResources:async()=>{}},load=()=>readMapContainer(scene,structuredClone(model),base.href,{fileName:modelUrl.pathname.split('/').at(-1)});
 const props=createQuestProps(world,{baseUrl:new URL('https://qa.test/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:loadContainer?()=>loadContainer(load):load});let api,document,window,root,pendingLoad,pointRows;
 const openingEvents=[],effectEvents=[];
 const state={ready:true,map:'village',position:{x:0,z:0},dead:false,combat:false,busy:false};
 if(withUi){({document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="top-actions"></div></main></body></html>'));const create=document.createElement.bind(document);document.createElement=(name,...args)=>{const node=create(name,...args);if(name==='dialog'){Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');}});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}return node;};root=document.getElementById('app');
  api=setupChapterQuests({root,world,storage:saved,getState:()=>state,onChestOpened:event=>openingEvents.push(event),createDropView:()=>({openChest:(position,tier)=>effectEvents.push({position,tier}),sync(){},ready:()=>collectDrops,clear(){},dispose(){}}),createProps:()=>new Proxy(props,{get(target,key){if(key==='load')return points=>{pointRows=points;pendingLoad=target.load(points);return pendingLoad;};const value=target[key];return typeof value==='function'?value.bind(target):value;}})});
 }
 t.after(()=>{api?.dispose();props.dispose();scene.dispose();engine.dispose();});
 return{engine,scene,camera,world,props,api,state,saved,load,openingEvents,effectEvents,async loaded(){await pendingLoad;await props.whenIdle();},get points(){return pointRows;},click(requireVisible=true){const button=root.querySelector('[data-chapter="interact"]');if(requireVisible)assert.ok(!button.hidden);button.dispatchEvent(new window.Event('click',{bubbles:true}));}};
}
function inkFor(f){return f.scene._afterRenderingMeshStage.map(v=>v.component).find(v=>v instanceof VillageOutlines&&v.stats===f.props.stats);}
function assertInk(f,point){const ink=inkFor(f);assert.ok(ink?.tintedMaterial);const meshes=point.visual.getChildMeshes().filter(m=>m.getTotalVertices()>0);assert.ok(meshes.length>=2,'body and moving lid use actual geometry');for(const mesh of meshes){assert.equal(mesh.instancedBuffers.villageInkTint.toHexString().toLowerCase(),lootRarity(point.tier).color);assert.equal(ink.entries.find(v=>v.mesh===mesh)?.inkWidth,.028);}return meshes;}

test('all29 authored rewards remain atomic and exactly once through repeated input and storage failure',()=>{
 const saved=storage();let journey=new ChapterJourney(saved);for(const point of CHAPTER_POINTS.filter(p=>p.tier)){const writes=saved.writes,reward=openSavedChest(journey,point);assert.ok(reward);assert.equal(saved.writes,writes+1);const serialized=JSON.stringify(journey.value);for(let i=0;i<5;i++)assert.equal(openSavedChest(journey,point),null);assert.equal(JSON.stringify(journey.value),serialized);journey=new ChapterJourney(saved);assert.equal(openSavedChest(journey,point),null);}assert.equal(journey.value.seen.filter(v=>v.startsWith('point:')).length,29);
 const volatile=new ChapterJourney({getItem:()=>null,setItem(){throw Error('quota');}}),point=CHAPTER_POINTS.find(p=>p.tier);assert.ok(openSavedChest(volatile,point));assert.equal(volatile.volatile,true);assert.equal(openSavedChest(volatile,point),null);facts.push({case:'reward-storage',authoredChests:29,synchronousSingleWrite:true,duplicateRewards:0,unavailableStorageSessionSafe:true});
});

function configureMap(f,map){
 const data={village:['warrior-v3',villageObstacles,createVillageTerrain,48],'great-plains':['warrior-plains',plainsObstacles,createGreatPlainsTerrain,105],'monster-forest':['warrior-v4',forestObstacles,createMonsterForestTerrain,55],'witch-cave':['warrior-v5',caveObstacles,createWitchCaveTerrain,64]}[map];
 setWorldCharacter(data[0]);Object.assign(f.world,{mapId:map,plains:map==='great-plains',forest:map==='monster-forest',cave:map==='witch-cave',terrain:data[2](),navigation:map==='witch-cave'?new CaveNavigation(data[1]()):new VillageNavigation(data[1]())});f.state.map=map;return data[3];
}
const openSavedChest=(journey,point)=>journey.openChest(point,{origin:{x:point.x,y:0,z:point.z},position:{x:point.x,y:0,z:point.z}});
const transforms=point=>point.visual.getChildMeshes().filter(m=>m.getTotalVertices()>0).map(mesh=>({mesh,matrix:Array.from(mesh.computeWorldMatrix(true).m)}));
const maxDelta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
function approach(f,point,limit){const placed=f.world.navigation.findFree(point,.65,limit),position=Array.from({length:16},(_,i)=>({x:placed.x+Math.sin(i*Math.PI/8)*1.4,z:placed.z+Math.cos(i*Math.PI/8)*1.4})).find(p=>f.world.navigation.free(p,.29,limit)&&f.world.navigation.segmentClear(p,placed,.05));assert.ok(position,point.id);f.state.position=position;const height=f.world.terrain.heightAt(point.x,point.z);f.camera.position.set(point.x,height+1,point.z-3);f.camera.setTarget(new Vector3(point.x,height+.3,point.z));}

test('actual chapter buttons and shipped geometry keep opening, tier ink and saved open state through all four map lifecycles',async t=>{
 const f=fixture(t,{withUi:true}),trips=[];let time=1,warmed;
 t.after(()=>setWorldCharacter('warrior'));
 for(const map of maps){
  const limit=configureMap(f,map),source=CHAPTER_POINTS.filter(p=>p.map===map&&p.tier&&!p.requires).sort((a,b)=>b.tier-a.tier)[0];approach(f,source,limit);f.api.update(time);await f.loaded();f.api.update(time+=.2);
  const point=f.points.find(p=>p.id===source.id);assert.equal(point.opened,false);assert.equal(point.marker.isEnabled(),true);const meshes=assertInk(f,point),closed=transforms(point);assert.equal([...new Set(meshes.map(m=>m.geometry))].reduce((n,g)=>n+g.getTotalIndices()/3,0),4487,'original4479 plus8 interior wall triangles');
  const before=f.api.journey.value.bag[lootRarity(point.tier).item]??0,writes=f.saved.writes;f.click();assert.equal(point.opened,true);assert.equal(f.api.journey.value.bag[lootRarity(point.tier).item]??0,before);assert.equal(f.saved.writes,writes+1,'chest and uncollected loot persist in one write');const drop=f.api.journey.value.pendingDrops.find(d=>d.id==='chest:'+point.id);assert.ok(drop);f.state.position=drop.position;f.api.update(time+=.05);assert.equal(f.api.journey.value.bag[lootRarity(point.tier).item],before+1);
  const reward=JSON.stringify(f.api.journey.value);for(let i=0;i<4;i++)f.click(false);assert.equal(JSON.stringify(f.api.journey.value),reward);f.api.update(time+=.25);const partial=transforms(point);assert.ok(partial.some((v,i)=>maxDelta(v.matrix,closed[i].matrix)>1e-4),'a real lid matrix must move');assert.ok(partial.some((v,i)=>maxDelta(v.matrix,closed[i].matrix)<1e-7),'the body must stay stationary');assert.equal(point.marker.isEnabled(),false);assert.equal(point.visual.isEnabled(),true);assertInk(f,point);
  f.state.ready=false;f.api.update(time+100);const paused=transforms(point);assert.deepEqual(paused.map(v=>v.matrix),partial.map(v=>v.matrix));f.state.ready=true;
  for(let i=0;i<30;i++)f.api.update(time+=.05);const opened=transforms(point);f.api.update(time+=2);assert.deepEqual(transforms(point).map(v=>v.matrix),opened.map(v=>v.matrix),'completed lid must stop changing');assertInk(f,point);f.scene.render();
  f.world.caveFog={allowsPoint:()=>false};f.api.update(time+=.2);assert.equal(point.visual.isEnabled(),false,'opened does not bypass fog eligibility');delete f.world.caveFog;f.api.update(time+=.2);assert.equal(point.visual.isEnabled(),true);assert.equal(point.marker.isEnabled(),false);
  f.api.releaseMap();await tick();const released=snapshot(f.scene);if(!warmed)warmed=released;else assert.deepEqual(released,warmed,'all map-owned derived meshes/materials/geometry/hooks return to the same plateau');
  f.api.update(time+=1);await f.loaded();f.api.update(time+=.2);const restored=f.points.find(p=>p.id===point.id);assert.equal(restored.opened,true);assert.equal(restored.marker.isEnabled(),false);assert.equal(restored.visual.isEnabled(),true);assert.deepEqual(transforms(restored).map(v=>v.matrix),opened.map(v=>v.matrix),'re-entry starts at the saved final pose without replay');assertInk(f,restored);f.click(false);assert.equal(f.api.journey.value.bag[lootRarity(point.tier).item],before+1);
  f.api.releaseMap();await tick();assert.deepEqual(snapshot(f.scene),warmed);trips.push({map,id:point.id,tier:point.tier,openingVisible:true,bodyStable:true,reentryImmediateOpen:true});time+=1;
 }
 const reload=fixture(t,{withUi:true,saved:f.saved}),limit=configureMap(reload,'witch-cave'),source=CHAPTER_POINTS.find(p=>p.tier===5);approach(reload,source,limit);reload.api.update(1);await reload.loaded();reload.api.update(1.2);const reloaded=reload.points.find(p=>p.id===source.id);assert.equal(reloaded.opened,true);assert.equal(reloaded.marker.isEnabled(),false);assert.equal(reloaded.visual.isEnabled(),true);assert.equal(reload.props.inspect().openingChests,0);reload.click(false);assert.equal(reload.api.journey.value.bag[lootRarity(5).item],1);
 facts.push({case:'four-map-actual-ui-sdk',maps:trips,visits:8,sourceTriangles:4479,runtimeTriangles:4487,additionalInteriorTriangles:8,exactResourcePlateau:warmed,imagesDecoded:false});
});

test('all five rarity outlines remain on both shared parts during and after simultaneous lid animation',async t=>{
 const f=fixture(t),points=Array.from({length:5},(_,i)=>({...CHAPTER_POINTS.find(p=>p.tier===i+1),x:i*2,z:0,opened:false}));f.camera.position.set(4,4,-12);f.camera.setTarget(new Vector3(4,.4,0));await f.props.load(points);f.props.update(points,{x:4,z:0},()=>true);await f.props.whenIdle();f.props.animate(0);
 const geometries=new Set();for(const p of points){for(const mesh of assertInk(f,p))geometries.add(mesh.geometry);p.opened=true;assert.notEqual(f.props.openChest(p),false);}assert.equal(geometries.size,2,'ten parts share exactly two derived source geometries');
 const ink=inkFor(f),calls=[];for(const source of ink.sources){const original=source._processRendering;source._processRendering=function(mesh,sub,effect,fill,batch,...rest){calls.push({source,ink:ink.drawing,instances:[...(batch.visibleInstances[sub._id]??[])]});return original.call(this,mesh,sub,effect,fill,batch,...rest);};}
 for(let i=1;i<=8;i++)f.props.animate(i/20);assert.equal(f.props.inspect().openingChests,5);for(const p of points)assertInk(f,p);ink.next=0;f.scene.render();assert.ok(calls.some(v=>v.ink));for(let i=0;i<calls.length;i++)if(calls[i].ink){assert.equal(calls[i-1]?.ink,false);assert.equal(calls[i].source,calls[i-1].source);assert.ok(calls[i].instances.every(mesh=>calls[i-1].instances.includes(mesh)),'moving lid ink only follows its exact successful base batch');}
 for(let i=9;i<=30;i++)f.props.animate(i/20);assert.equal(f.props.inspect().openingChests,0);assert.equal(f.props.inspect().openedChests,5);for(const p of points){assertInk(f,p);assert.equal(p.marker.isEnabled(),false);assert.equal(p.visual.isEnabled(),true);const hinge=p.visual.getChildTransformNodes().find(n=>n.metadata?.chestLidHinge);assert.ok(hinge?.isWorldMatrixFrozen);assert.ok(hinge.getDescendants().every(n=>n.isWorldMatrixFrozen),'completed moving subtree returns to frozen matrices');}
 const target=points.at(-1);let checkedVertices=0;for(const entry of ink.entries.filter(e=>e.record.point===target)){const mesh=entry.mesh,positions=mesh.getVerticesData('position'),world=mesh.getWorldMatrix(),box=mesh.getBoundingInfo().boundingBox;for(let i=0;i<positions.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),world);for(const axis of ['x','y','z'])assert.ok(p[axis]>=box.minimumWorld[axis]-1e-5&&p[axis]<=box.maximumWorld[axis]+1e-5,'actual frustum bounds contain every open vertex: '+mesh.name);checkedVertices++;}}
 facts.push({case:'five-rarity-shared-geometry',rarities:5,parts:10,sharedSourceGeometries:geometries.size,inkThickness:.028,allColoursPreserved:true,actualBaseAndInkSubmissionsCoupled:true,finalMatricesFrozen:true,verticesInsideActualFrustumBounds:checkedVertices});
});

test('a current chest load failure cannot grant invisible loot and one explicit map re-entry recovers the same reward once',async t=>{
 let calls=0;const f=fixture(t,{withUi:true,loadContainer:async load=>{if(++calls===1)throw Error('controlled chest source unavailable');return load();}}),limit=configureMap(f,'witch-cave'),source=CHAPTER_POINTS.find(p=>p.tier===5);approach(f,source,limit);f.api.update(1);await f.loaded();f.api.update(1.2);assert.equal(f.props.inspect().modelFailures,1);f.click(false);assert.equal(f.api.journey.value.bag[lootRarity(5).item],undefined);assert.equal(f.api.journey.seen.has('point:'+source.id),false);
 for(let i=0;i<10;i++)f.api.update(1.4+i*.2);await f.props.whenIdle();assert.equal(calls,1,'no failed-source retry loop on every update');f.api.releaseMap();f.api.update(4);await f.loaded();f.api.update(4.2);f.click();const drop=f.api.journey.value.pendingDrops.find(d=>d.id==='chest:'+source.id);assert.ok(drop);f.state.position=drop.position;f.api.update(4.3);assert.equal(f.api.journey.value.bag[lootRarity(5).item],1);f.click(false);assert.equal(f.api.journey.value.bag[lootRarity(5).item],1);facts.push({case:'visible-ready-reward-gate',failedAttempts:1,explicitReentryRetry:1,failedAttemptRewards:0,successfulRewards:1});
});

test('late old-map chest completion is disposed and cannot attach a closed or moving lid to a fresh map',async t=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const f=fixture(t,{loadContainer:async load=>{if(++calls===1){entered.resolve();return gate.promise;}return load();}}),point=()=>({...CHAPTER_POINTS.find(p=>p.tier===5),x:0,z:0,opened:false});
 const old=point();await f.props.load([old]);f.props.update([old],old,()=>true);await entered.promise;f.props.release();
 const next=point();next.opened=true;await f.props.load([next]);f.props.update([next],next,()=>true);await f.props.whenIdle();const completed=transforms(next);assert.equal(next.marker.isEnabled(),false);assertInk(f,next);
 const late=await f.load(),lateMeshes=[...late.meshes];gate.resolve(late);await tick();await tick();assert.ok(lateMeshes.every(m=>m.isDisposed()));assert.equal(old.visual,undefined);f.props.animate(100);assert.deepEqual(transforms(next).map(v=>v.matrix),completed.map(v=>v.matrix));assert.equal(f.props.inspect().modelFailures,0);
 const before=snapshot(f.scene);for(let i=0;i<6;i++){f.props.release();const p=point();await f.props.load([p]);f.props.update([p],p,()=>true);await f.props.whenIdle();p.opened=true;f.props.openChest(p);f.props.animate(200+i);f.props.release();await tick();}assert.ok(snapshot(f.scene).meshes<before.meshes);assert.equal(inkFor(f),undefined);facts.push({case:'abandoned-decode-and-mid-opening-release',lateMeshesDisposed:lateMeshes.length,releases:7,oldVisualResurrections:0});
});

test.after(()=>{MeshoptCompression._Default=originalDecoder;const dir=new URL('../reports/chest-opening-2026-11-03/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('independent-validation.json',dir),JSON.stringify({passed:facts.length===5,expectedCases:5,scope:'Actual chapter DOM event/ChapterJourney storage plus shipped chest Meshopt geometry, native Babylon instances, moving world matrices, typed ink and lifetime cancellation.',cases:facts,limitations:['Node/Babylon NullEngine has no GPU rasterization, deviceFPS or hardware upload timing.','Original4479 chest geometry is partitioned once in memory and8 interior wall triangles are added; images/texture upload and unrelated map scenery are omitted. Terrain and navigation use authored map sources.','This is independent lifecycle/integration QA, not visual certification of the opening sculpture.'],browserAutomation:false},null,2)+'\n');});
import {listEditableActorHandles} from '../src/live-actor-handles.js';
import {nearbyEditableObjects} from '../src/nearby-editor.js';

test('a visible quest chest is listed for nearby editing and its interaction follows an edited position',async t=>{
 const f=fixture(t,{withUi:true,collectDrops:false}),limit=configureMap(f,'great-plains'),source=CHAPTER_POINTS.find(p=>p.map==='great-plains'&&p.tier&&!p.requires);t.after(()=>setWorldCharacter('warrior'));approach(f,source,limit);f.api.update(1);await f.loaded();f.api.update(1.2);
 const point=f.points.find(p=>p.id===source.id),handles=listEditableActorHandles(f.world,{encounters:[]}),chest=handles.find(row=>row.root===point.visual);
 assert.ok(chest);assert.equal(chest.source,'quest-chest');assert.equal(nearbyEditableObjects(f.world,{x:point.x,z:point.z},{actors:handles})[0].instanceId,chest.id);
 chest.encounter.chestVisualState='open';assert.equal(point.opened,true);assert.equal(f.api.journey.seen.has('point:'+point.id),false);chest.encounter.chestVisualState='auto';assert.equal(point.opened,false);assert.equal(f.api.journey.seen.has('point:'+point.id),false);
 const moved={x:point.x+1,z:point.z+1};point.visual.unfreezeWorldMatrix();point.visual.position.x=moved.x;point.visual.position.z=moved.z;point.visual.computeWorldMatrix(true);chest.encounter.onEdited();point.visual.freezeWorldMatrix();assert.equal(point.x,moved.x);assert.equal(point.z,moved.z);assert.equal(point.marker.position.x,moved.x);assert.equal(point.marker.position.z,moved.z);
 f.state.position=moved;f.api.update(1.4);f.click();assert.equal(point.opened,true);assert.ok(f.api.journey.seen.has('point:'+point.id));
 const factsBefore={...f.api.journey.value.facts};chest.encounter.chestVisualState='closed';chest.encounter.onEditApplied();f.api.update(1.6);assert.equal(point.visual.isEnabled(),true);assert.equal(point.marker.isEnabled(),true,'applying closed re-arms interaction');assert.equal(point.opened,false);assert.equal(point.openCycle,1);f.click();assert.equal(point.opened,true);assert.equal(f.api.journey.value.pendingDrops.length,2,'previous uncollected loot is preserved');assert.equal(new Set(f.api.journey.value.pendingDrops.map(d=>d.id)).size,2);assert.deepEqual(f.api.journey.value.facts,factsBefore,'editor re-opening cannot inflate quest progress');
 f.api.releaseMap();f.api.update(2);await f.loaded();f.api.update(2.2);const restored=f.points.find(p=>p.id===point.id);assert.equal(restored.opened,true);assert.equal(restored.visual.isEnabled(),true);assert.equal(restored.marker.isEnabled(),false,'a reload never re-arms the same editor reward cycle');const before=JSON.stringify(f.api.journey.value);f.click(false);assert.equal(JSON.stringify(f.api.journey.value),before);f.api.releaseMap();assert.equal(listEditableActorHandles(f.world,{encounters:[]}).length,0);
});

test('a placed chest uses the shipped opening geometry and preserves its opened state on map reload',async t=>{
 const f=fixture(t,{withUi:true}),entry=ASSET_CATALOG.entries.find(v=>v.assetId==='chest-common');configureMap(f,'great-plains');t.after(()=>setWorldCharacter('warrior'));f.world.placements=[];f.world.villageRenderRecords=[];
 const profile={level:0,model:entry.runtime.model.replace(/^assets\//,''),resources:[]},data={assets:{'chest-common':{...config,geometryLod:false,lods:[profile]}}};
 const runtime=new AuthoredPlacementRuntime(f.world,{catalog:ASSET_CATALOG,baseUrl:'https://qa.test/',initialize:async()=>{},readManifest:async()=>data,loadContainer:f.load});f.world.authoredPlacements=runtime;t.after(()=>runtime.dispose());
 const row={instanceId:'authored-test-chest',assetId:'chest-common',assetVersion:entry.version,transform:{position:[3,f.world.terrain.heightAt(3,0),0],rotation:[0,0,0,1],scale:1},attachment:{surface:'ground',normal:[0,1,0],offset:0,supportId:'terrain'},collision:'none',chest:{tier:3,item:'apple'}};
 const doc={...createEmptyPlacementDocument(runtime.baseManifest),revision:1,instances:[row]};await runtime.apply(doc);const chest=runtime.records.get(row.instanceId);assert.ok(chest.chestOpening);assert.equal(chest.meshes.length,2);assert.equal(chest.placement.lootTier,3);f.state.position={x:3,z:0};f.api.update(1);assert.equal(f.world.openAuthoredChest(row.instanceId),true);assert.equal(chest.chestOpening.state.opened,true);assert.deepEqual(f.api.journey.value.pendingDrops[0].rewards,{gold:70,apple:1});for(let i=0;i<30;i++)runtime.update(.05);assert.ok(chest.chestOpening.state.angle<0);
 runtime.leaveMap();const fresh=new AuthoredPlacementRuntime(f.world,{catalog:ASSET_CATALOG,baseUrl:'https://qa.test/',initialize:async()=>{},readManifest:async()=>data,loadContainer:f.load});f.world.authoredPlacements=fresh;t.after(()=>fresh.dispose());await fresh.apply(doc);const restored=fresh.records.get(row.instanceId);assert.equal(restored.chestOpening.state.opened,true);assert.equal(f.world.openAuthoredChest(row.instanceId),false);
});


test('all four maps keep grade, ink, closed editor rewards and one-shot cycles through re-entry',async t=>{
 const f=fixture(t,{withUi:true,collectDrops:false});t.after(()=>setWorldCharacter('warrior'));let time=1;
 for(const map of maps){
  const limit=configureMap(f,map),source=CHAPTER_POINTS.find(p=>p.map===map&&p.tier&&!p.requires);approach(f,source,limit);f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);let point=f.points.find(p=>p.id===source.id);f.click();const factsBefore={...f.api.journey.value.facts};
  for(const tier of [1,2,3,4,5]){
   const handle=listEditableActorHandles(f.world,{encounters:[]}).find(row=>row.root===point.visual),resources=snapshot(f.scene);handle.encounter.chestTier=tier;assertInk(f,point);assert.deepEqual(snapshot(f.scene),resources,'grade updates reuse existing materials, geometry and observers');handle.encounter.chestVisualState='closed';handle.encounter.onEditApplied();
   const config=JSON.parse(f.saved.getItem('moonforest-chest-drop-settings-v1'))[map][point.id];assert.equal(config.tier,tier);assert.equal(config.openCycle,tier);
   f.api.releaseMap();f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);point=f.points.find(p=>p.id===source.id);assert.equal(point.opened,false);assert.equal(point.marker.isEnabled(),true);assert.equal(point.tier,tier);assertInk(f,point);f.click();const drop=f.api.journey.value.pendingDrops.find(d=>d.id==='chest:'+point.id+':cycle:'+tier);assert.ok(drop);assert.equal(drop.rewards[lootRarity(tier).item],1);assert.equal(drop.rewards.gold,lootRarity(tier).gold);assert.deepEqual(f.api.journey.value.facts,factsBefore);const before=JSON.stringify(f.api.journey.value);f.click(false);assert.equal(JSON.stringify(f.api.journey.value),before);
  }
  f.api.releaseMap();f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);assert.equal(f.points.find(p=>p.id===source.id).opened,true);f.click(false);f.api.releaseMap();
 }
});

test('legacy saved visual-only closed chests migrate once and a reopened game keeps the new claim',async t=>{
 const saved=storage(),point=CHAPTER_POINTS.find(p=>p.map==='great-plains'&&p.tier&&!p.requires),journey=new ChapterJourney(saved);assert.ok(openSavedChest(journey,point));saved.setItem('moonforest-chest-drop-settings-v1',JSON.stringify({'great-plains':{[point.id]:{assetId:'',effectEnabled:false,visualOpened:false}}}));
 const f=fixture(t,{withUi:true,collectDrops:false,saved}),limit=configureMap(f,'great-plains');t.after(()=>setWorldCharacter('warrior'));approach(f,point,limit);f.api.update(1);await f.loaded();f.api.update(1.2);const restored=f.points.find(p=>p.id===point.id);assert.equal(restored.openCycle,1);assert.equal(restored.opened,false);f.click();assert.equal(restored.opened,true);assert.equal(f.api.journey.value.pendingDrops.length,2);assert.equal(new ChapterJourney(saved).seen.has('point:'+point.id+':cycle:1'),true);
 for(let i=0;i<3;i++){f.api.releaseMap();f.api.update(2+i);await f.loaded();f.api.update(2.2+i);assert.equal(f.points.find(p=>p.id===point.id).openCycle,1);assert.equal(f.points.find(p=>p.id===point.id).opened,true);}
 const reopened=fixture(t,{withUi:true,collectDrops:false,saved});const end=configureMap(reopened,'great-plains');approach(reopened,point,end);reopened.api.update(1);await reopened.loaded();reopened.api.update(1.2);assert.equal(reopened.points.find(p=>p.id===point.id).opened,true);assert.equal(reopened.api.journey.value.pendingDrops.length,2);
});


test('closing an unopened chest preserves its original claim and changing grade never re-arms an opened chest',async t=>{
 const f=fixture(t,{withUi:true,collectDrops:false}),limit=configureMap(f,'great-plains'),source=CHAPTER_POINTS.find(p=>p.map==='great-plains'&&p.tier&&!p.requires);t.after(()=>setWorldCharacter('warrior'));approach(f,source,limit);f.api.update(1);await f.loaded();f.api.update(1.2);const point=f.points.find(p=>p.id===source.id),handle=listEditableActorHandles(f.world,{encounters:[]}).find(row=>row.root===point.visual);handle.encounter.chestVisualState='closed';handle.encounter.onEditApplied();assert.equal(point.openCycle,0);f.api.update(1.4);f.click();assert.equal(f.api.journey.value.pendingDrops[0].id,'chest:'+point.id);handle.encounter.chestTier=5;handle.encounter.onEditApplied();assert.equal(point.openCycle,0);f.api.update(1.6);f.click(false);assert.equal(f.api.journey.value.pendingDrops.length,1);assert.equal(point.opened,true);f.api.releaseMap();f.api.update(2);await f.loaded();f.api.update(2.2);assert.equal(f.points.find(p=>p.id===source.id).opened,true);assert.equal(f.points.find(p=>p.id===source.id).tier,5);
});


test('edited built-in chest item lists save, re-enter and create only their selected models on all four maps',async t=>{
 const f=fixture(t,{withUi:true,collectDrops:false});t.after(()=>setWorldCharacter('warrior'));let time=1;
 for(const map of maps){
  const limit=configureMap(f,map),source=CHAPTER_POINTS.find(p=>p.map===map&&p.tier&&!p.requires);approach(f,source,limit);f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);const point=f.points.find(p=>p.id===source.id),handle=listEditableActorHandles(f.world,{encounters:[]}).find(row=>row.root===point.visual),items=[{id:'apple',count:3},{id:'locket',count:2}];handle.encounter.chestItems=items;handle.encounter.onEditApplied();assert.deepEqual(JSON.parse(f.saved.getItem('moonforest-chest-drop-settings-v1'))[map][point.id].items,items);f.api.releaseMap();f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);assert.deepEqual(f.points.find(p=>p.id===source.id).chestItems,items);f.click();const drops=f.api.journey.value.pendingDrops.filter(drop=>drop.mapId===map);assert.deepEqual(drops.map(drop=>drop.model),['apple','apple','apple','memory-locket','memory-locket']);assert.deepEqual(drops.map(drop=>drop.rewards),[{apple:1},{apple:1},{apple:1},{locket:1},{locket:1}]);for(const drop of drops){assert.ok(f.world.navigation.segmentClear({x:point.x,z:point.z},drop.position,.05));assert.ok(Math.abs(drop.position.y-f.world.terrain.heightAt(drop.position.x,drop.position.z)-.04)<1e-5);}f.api.releaseMap();
 }
 assert.equal(f.api.journey.value.pendingDrops.length,20);
});


test('opening effects follow the saved chest grade once, do not replay on re-entry, and honor the active editor toggle',async t=>{
 const f=fixture(t,{withUi:true,collectDrops:false});t.after(()=>setWorldCharacter('warrior'));let time=1;
 for(const map of maps){const limit=configureMap(f,map),source=CHAPTER_POINTS.find(p=>p.map===map&&p.tier&&!p.requires);approach(f,source,limit);f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);const point=f.points.find(p=>p.id===source.id),handle=listEditableActorHandles(f.world,{encounters:[]}).find(row=>row.root===point.visual),before=f.openingEvents.length;handle.encounter.chestTier=4;handle.encounter.onEditApplied();f.api.update(time+=.2);f.click();assert.equal(f.openingEvents.length,before+1);assert.equal(f.openingEvents.at(-1).tier,4);assert.equal(f.effectEvents.at(-1).tier,4);assert.ok(f.api.journey.value.pendingDrops.filter(p=>p.mapId===map).every(p=>p.effectEnabled));f.click(false);assert.equal(f.openingEvents.length,before+1);f.api.releaseMap();f.api.update(time+=.2);await f.loaded();f.api.update(time+=.2);assert.equal(f.openingEvents.length,before+1);
 const restored=f.points.find(p=>p.id===source.id),edit=listEditableActorHandles(f.world,{encounters:[]}).find(row=>row.root===restored.visual);edit.encounter.dropEffectEnabled=false;edit.encounter.chestVisualState='closed';edit.encounter.onEditApplied();f.api.update(time+=.2);f.click();assert.equal(f.openingEvents.length,before+1,'disabled animation does not play a sound or burst');assert.equal(f.effectEvents.length,before+1);assert.equal(JSON.parse(f.saved.getItem('moonforest-chest-drop-settings-v1'))[map][point.id].effectsVersion,1);f.api.releaseMap();}
});
