// 2026-11-24 (user): an opened chest disappears 5 seconds later and a looted chest
// never appears again. 0.3 only (vanishOpenedAfter); 0.2 keeps opened chests open.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,PBRMaterial,HemisphericLight} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createQuestProps} from '../src/chapter-quest-props.js';
import {CHAPTER_POINTS} from '../src/chapter-quest-points.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {parseHTML} from 'linkedom';
import {createTownEconomy} from '../src/v03/town-economy.js';
import {GoldLoot} from '../src/gold-loot.js';
import {CHEST_VANISH_SECONDS,createTownTreasure} from '../src/v03/town-treasure.js';
const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('quest-props.json',base))).assets['chest-common'];let packed;
async function chests(t,options){
 packed??=readRuntimeGltf(new URL(config.lods[1].model,base));const source=await packed,engine=new NullEngine({renderWidth:960,renderHeight:540});engine.getCaps().instancedArrays=true;const scene=new Scene(engine),camera=new FreeCamera('qa-camera',new Vector3(0,1.2,-3),scene);camera.target=new Vector3(0,.35,0);camera.setTarget(camera.target);new HemisphericLight('qa-light',Vector3.Up(),scene);caveFogFallback(scene).getInternalTexture().isReady=true;
 const world={scene,camera,terrain:{heightAt:()=>0},lighting:{direction:Vector3.Up(),shadowsActive:false,registerMeshes(){}},touchDevice:true,mapId:'village'};
 const load=async()=>{const json=structuredClone(source.gltf);for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');for(const key of ['extensionsUsed','extensionsRequired'])json[key]=(json[key]??[]).filter(name=>!['KHR_texture_basisu','EXT_meshopt_compression'].includes(name));delete json.images;delete json.textures;delete json.materials;for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json},''),material=new PBRMaterial('original-chest',scene);container.materials.push(material);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=material;for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;return container;};
 const props=createQuestProps(world,{baseUrl:new URL('https://qa.test/assets/quest-props.json'),readManifest:async()=>({assets:{'chest-common':config}}),loadContainer:load,...options});
 t.after(()=>{props.dispose();scene.dispose();engine.dispose();});
 return {props,scene};
}
const village=(looted=[])=>CHAPTER_POINTS.filter(p=>p.map==='village'&&p.treasure).map(p=>({...p,opened:looted.includes(p.id),wasLooted:looted.includes(p.id)}));
test('an authored chest shares the five-second rule and keeps uncollected drops across visits and separate saves',()=>{
 const {document}=parseHTML('<main></main>');
 const position={x:0,y:0,z:0},id='a'.repeat(120);
 let hidden=new Set(),opened=0,interactions=0,coverage=1;
 const placements={
  records:new Map([[id,{instance:{assetId:'chest-common',chest:{tier:1}},chestOpening:{setCoverage(value){coverage=value;}},root:{isEnabled:()=>!hidden.has(id),getAbsolutePosition:()=>position}}]]),
  setLootedChests(ids){hidden=new Set(ids);},openChest(){opened++;},
 };
 const world={v03:{playing:true},mapId:'village',authoredPlacements:placements,terrain:{heightAt:()=>0}};
 const persisted=()=>{const m=new Map();return {getItem:key=>m.get(key)??null,setItem:(k,v)=>m.set(k,v)};};
 const first=persisted(),second=persisted();
 const priorChests=Array.from({length:140},(_,i)=>'placed:village:previous-'+i);
 const initialWallet=new GoldLoot({storage:first});
 assert.ok(initialWallet.tradeTown(0,{opened:priorChests}));
 const noop=()=>{};
 function resume(storage){
  const economy=createTownEconomy(new GoldLoot({storage}));
  const view=createTownTreasure({world,root:document.querySelector('main'),economy,player:()=>position,canInteract:()=>{interactions++;return true;},notify:noop,sound:noop,
   fieldChestsEnabled:false,props:{stats:{modelFailures:0},release:noop,dispose:noop,load(){throw Error('field chests disabled');}},
   makeDrops:()=>({openChest:noop,clear:noop,dispose:noop,ready:()=>false,sync:noop})});
  return {view,economy};
 }
 let visit=resume(first);
 visit.view.tick(.1);assert.equal(interactions,0,'no interaction check without a nearby unopened field chest');
 assert.ok(world.openAuthoredChest(id));assert.equal(opened,1);
 const prizes=structuredClone(visit.economy.state.drops);assert.ok(prizes.length);
 visit.view.tick(4);assert.equal(coverage,1);
 visit.view.tick(.5);assert.ok(Math.abs(coverage-.5)<1e-8);assert.equal(world.openAuthoredChest(id),false);
 visit.view.tick(.49);assert.ok(coverage<.01);assert.ok(!hidden.has(id));
 visit.view.tick(.02);assert.ok(hidden.has(id));
 assert.equal(world.openAuthoredChest(id),false);
 assert.deepEqual(visit.economy.state.drops,prizes);
 visit.view.dispose();
 visit=resume(second);visit.view.tick(.1);assert.ok(!hidden.has(id),'new slot');
 assert.ok(world.openAuthoredChest(id));visit.view.tick(1);visit.view.dispose();
 visit=resume(second);visit.view.tick(.1);assert.ok(hidden.has(id),'reload before expiry');
 world.mapId='great-plains';visit.view.tick(.25);assert.ok(!hidden.has(id));
 world.mapId='village';visit.view.tick(.25);assert.ok(hidden.has(id),'return to region');
 visit.view.dispose();
 visit=resume(first);visit.view.tick(.1);assert.deepEqual(visit.economy.state.drops,prizes);
 assert.deepEqual(visit.economy.state.opened,[...priorChests,'placed:village:'+id]);
 assert.ok(hidden.has(id),'a full-length ID survives reloading a slot with over 128 historical chests');
 const ids=prizes.map(drop=>drop.id);assert.ok(visit.economy.collect(ids));assert.equal(visit.economy.collect(ids),null);
 visit.view.dispose();
});
async function show(props,points,near){await props.load(points);props.update(points,near,()=>true);await props.whenIdle();props.update(points,near,()=>true);}

test('only the opened chest body, lid and their rarity outlines fade during the last second',async t=>{
 const {props,scene}=await chests(t,{vanishOpenedAfter:5});
 const points=[-.5,.5].map((x,i)=>({...village()[0],id:'fade-'+i,x,z:0}));
 await show(props,points,points[0]);
 const parts=point=>point.visual.getChildMeshes().filter(mesh=>mesh.getTotalVertices()>0);
 const [first,other]=points.map(parts);
 assert.equal(first.length,2);assert.equal(other.length,2);
 assert.equal(first[0].material,other[0].material);
 assert.ok(first.every(mesh=>mesh.material.pluginManager.getPlugin('MoonforestTreeCoverage')));
 props.animate(0);props.openChest(points[0]);
 for(const [time,expected] of [[3.9,1],[4,1],[4.25,.84375],[4.5,.5],[4.75,.15625]]){
  props.animate(time);scene.render();
  for(const mesh of first){assert.equal(mesh.instancedBuffers.treeCoverage,expected);assert.equal(mesh.instancedBuffers.villageInk.x,expected);}
  for(const mesh of other){assert.equal(mesh.instancedBuffers.treeCoverage,1);assert.equal(mesh.instancedBuffers.villageInk.x,1);}
  assert.equal(first[0].material.alpha,1);
 }
 props.animate(5);assert.equal(points[0].visual.isEnabled(),false);assert.equal(points[1].visual.isEnabled(),true);
});

test('0.3: an opened chest disappears five seconds after opening and a looted one is never shown or loaded again',async t=>{
 assert.equal(CHEST_VANISH_SECONDS,5);
 const {props}=await chests(t,{vanishOpenedAfter:CHEST_VANISH_SECONDS}),points=village(),chest=points[0];
 await show(props,points,chest);assert.equal(chest.visual?.isEnabled(),true,'shown before it is opened');
 props.animate(10);chest.opened=true;props.openChest(chest);
 for(let time=10;time<14.9;time+=1/30)props.animate(time);
 assert.equal(chest.visual.isEnabled(),true,'still there while the five seconds run');
 props.animate(15.01);assert.equal(chest.gone,true);assert.equal(chest.visual.isEnabled(),false,'gone after five seconds');
 props.update(points,chest,()=>true);assert.equal(chest.visual.isEnabled(),false,'staying near does not bring it back');
 // The next visit (or a reload): a looted chest has no model instance at all.
 const again=village([chest.id]);await show(props,again,again[0]);
 assert.equal(again[0].gone,true);assert.equal(again[0].visual,undefined,'not instantiated');assert.equal(again[0].marker?.isEnabled()??false,false);
 // With every chest of the map looted the chest model is not even requested.
 const loads=props.stats.modelLoads,allLooted=village(village().map(p=>p.id));await show(props,allLooted,allLooted[0]);
 assert.equal(props.stats.modelLoads,loads,'no model load for chests that will never show');assert.ok(allLooted.every(p=>p.visual===undefined));
});

test('0.2: opened chests stay where they are (no vanishing without the option)',async t=>{
 const {props}=await chests(t,{}),points=village(),chest=points[0];
 await show(props,points,chest);props.animate(0);chest.opened=true;props.openChest(chest);
 for(let time=0;time<20;time+=.25)props.animate(time);
 assert.equal(chest.gone,undefined);assert.equal(chest.visual.isEnabled(),true);
 const again=village([chest.id]);await show(props,again,again[0]);assert.equal(again[0].visual?.isEnabled(),true,'shown open on the next visit');
});
