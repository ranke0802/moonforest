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
function fixture(t,{loadContainer,withUi=false,saved=storage()}={}){
 const engine=new NullEngine({renderWidth:960,renderHeight:540});engine.getCaps().instancedArrays=true;const scene=new Scene(engine),camera=new FreeCamera('chest-qa',new Vector3(0,1,-3),scene);camera.setTarget(Vector3.Zero());new HemisphericLight('chest-qa-light',Vector3.Up(),scene);caveFogFallback(scene).getInternalTexture().isReady=true;void scene.defaultMaterial;
 const world={scene,camera,lighting:{direction:Vector3.Up(),shadowsActive:false,registerMeshes(){}},terrain:{heightAt:()=>0},navigation:{findFree:p=>({...p}),segmentClear:()=>true},touchDevice:true,mapId:'village',prefetchResources:async()=>{}},load=()=>readMapContainer(scene,structuredClone(model),base.href,{fileName:modelUrl.pathname.split('/').at(-1)});
 const props=createQuestProps(world,{baseUrl:new URL('https://qa.test/assets/quest-props.json'),readManifest:async()=>manifest,loadContainer:loadContainer?()=>loadContainer(load):load});let api,document,window,root,pendingLoad,pointRows;
 const state={ready:true,map:'village',position:{x:0,z:0},dead:false,combat:false,busy:false};
 if(withUi){({document,window}=parseHTML('<html><body><main id="app"><canvas id="viewport"></canvas><div class="top-actions"></div></main></body></html>'));const create=document.createElement.bind(document);document.createElement=(name,...args)=>{const node=create(name,...args);if(name==='dialog'){Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');}});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}return node;};root=document.getElementById('app');
  api=setupChapterQuests({root,world,storage:saved,getState:()=>state,createProps:()=>new Proxy(props,{get(target,key){if(key==='load')return points=>{pointRows=points;pendingLoad=target.load(points);return pendingLoad;};const value=target[key];return typeof value==='function'?value.bind(target):value;}})});
 }
 t.after(()=>{api?.dispose();props.dispose();scene.dispose();engine.dispose();});
 return{engine,scene,camera,world,props,api,state,saved,load,async loaded(){await pendingLoad;await props.whenIdle();},get points(){return pointRows;},click(requireVisible=true){const button=root.querySelector('[data-chapter="interact"]');if(requireVisible)assert.ok(!button.hidden);button.dispatchEvent(new window.Event('click',{bubbles:true}));}};
}
function inkFor(f){return f.scene._afterRenderingMeshStage.map(v=>v.component).find(v=>v instanceof VillageOutlines&&v.stats===f.props.stats);}
function assertInk(f,point){const ink=inkFor(f);assert.ok(ink?.tintedMaterial);const meshes=point.visual.getChildMeshes().filter(m=>m.getTotalVertices()>0);assert.ok(meshes.length>=2,'body and moving lid use actual geometry');for(const mesh of meshes){assert.equal(mesh.instancedBuffers.villageInkTint.toHexString().toLowerCase(),lootRarity(point.tier).color);assert.equal(ink.entries.find(v=>v.mesh===mesh)?.inkWidth,.028);}return meshes;}

test('all29 authored rewards remain atomic and exactly once through repeated input and storage failure',()=>{
 const saved=storage();let journey=new ChapterJourney(saved);for(const point of CHAPTER_POINTS.filter(p=>p.tier)){const writes=saved.writes,reward=journey.openChest(point);assert.ok(reward);assert.equal(saved.writes,writes+1);const serialized=JSON.stringify(journey.value);for(let i=0;i<5;i++)assert.equal(journey.openChest(point),null);assert.equal(JSON.stringify(journey.value),serialized);journey=new ChapterJourney(saved);assert.equal(journey.openChest(point),null);}assert.equal(journey.value.seen.filter(v=>v.startsWith('point:')).length,29);
 const volatile=new ChapterJourney({getItem:()=>null,setItem(){throw Error('quota');}}),point=CHAPTER_POINTS.find(p=>p.tier);assert.ok(volatile.openChest(point));assert.equal(volatile.volatile,true);assert.equal(volatile.openChest(point),null);facts.push({case:'reward-storage',authoredChests:29,synchronousSingleWrite:true,duplicateRewards:0,unavailableStorageSessionSafe:true});
});

function configureMap(f,map){
 const data={village:['warrior-v3',villageObstacles,createVillageTerrain,48],'great-plains':['warrior-plains',plainsObstacles,createGreatPlainsTerrain,105],'monster-forest':['warrior-v4',forestObstacles,createMonsterForestTerrain,55],'witch-cave':['warrior-v5',caveObstacles,createWitchCaveTerrain,64]}[map];
 setWorldCharacter(data[0]);Object.assign(f.world,{mapId:map,plains:map==='great-plains',forest:map==='monster-forest',cave:map==='witch-cave',terrain:data[2](),navigation:map==='witch-cave'?new CaveNavigation(data[1]()):new VillageNavigation(data[1]())});f.state.map=map;return data[3];
}
const transforms=point=>point.visual.getChildMeshes().filter(m=>m.getTotalVertices()>0).map(mesh=>({mesh,matrix:Array.from(mesh.computeWorldMatrix(true).m)}));
const maxDelta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
function approach(f,point,limit){const placed=f.world.navigation.findFree(point,.65,limit),position=Array.from({length:16},(_,i)=>({x:placed.x+Math.sin(i*Math.PI/8)*1.4,z:placed.z+Math.cos(i*Math.PI/8)*1.4})).find(p=>f.world.navigation.free(p,.29,limit)&&f.world.navigation.segmentClear(p,placed,.05));assert.ok(position,point.id);f.state.position=position;const height=f.world.terrain.heightAt(point.x,point.z);f.camera.position.set(point.x,height+1,point.z-3);f.camera.setTarget(new Vector3(point.x,height+.3,point.z));}

test('actual chapter buttons and shipped geometry keep opening, tier ink and saved open state through all four map lifecycles',async t=>{
 const f=fixture(t,{withUi:true}),trips=[];let time=1,warmed;
 t.after(()=>setWorldCharacter('warrior'));
 for(const map of maps){
  const limit=configureMap(f,map),source=CHAPTER_POINTS.filter(p=>p.map===map&&p.tier&&!p.requires).sort((a,b)=>b.tier-a.tier)[0];approach(f,source,limit);f.api.update(time);await f.loaded();f.api.update(time+=.2);
  const point=f.points.find(p=>p.id===source.id);assert.equal(point.opened,false);assert.equal(point.marker.isEnabled(),true);const meshes=assertInk(f,point),closed=transforms(point);assert.equal([...new Set(meshes.map(m=>m.geometry))].reduce((n,g)=>n+g.getTotalIndices()/3,0),4487,'original4479 plus8 interior wall triangles');
  const before=f.api.journey.value.bag[lootRarity(point.tier).item]??0,writes=f.saved.writes;f.click();assert.equal(point.opened,true);assert.equal(f.api.journey.value.bag[lootRarity(point.tier).item],before+1);assert.equal(f.saved.writes,writes+1,'loot commits synchronously, before lid motion completes');
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
 for(let i=0;i<10;i++)f.api.update(1.4+i*.2);await f.props.whenIdle();assert.equal(calls,1,'no failed-source retry loop on every update');f.api.releaseMap();f.api.update(4);await f.loaded();f.api.update(4.2);f.click();assert.equal(f.api.journey.value.bag[lootRarity(5).item],1);f.click(false);assert.equal(f.api.journey.value.bag[lootRarity(5).item],1);facts.push({case:'visible-ready-reward-gate',failedAttempts:1,explicitReentryRetry:1,failedAttemptRewards:0,successfulRewards:1});
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
