import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,FreeCamera,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';

const base=new URL('../public/assets/',import.meta.url),reports=[];
const maps=[['village',createVillageTerrain,villageObstacles],['great-plains',createGreatPlainsTerrain,plainsObstacles],['monster-forest',createMonsterForestTerrain,forestObstacles],['witch-cave',createWitchCaveTerrain,caveObstacles]];
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
async function fixture(t,id,map){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const config=JSON.parse(readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial('paint',scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const models=new BossModelLibrary(scene,id);models.config=config;models.container=container;models.load=async()=>{};
 const original=models.instantiate.bind(models),cloneTimes=[];models.instantiate=async()=>{const start=performance.now();const result=await original();cloneTimes.push(performance.now()-start);return result;};
 const [mapId,terrainFn,obstacles]=map,terrain=terrainFn(),navigation=new (mapId==='witch-cave'?CaveNavigation:VillageNavigation)(obstacles());
 const casters=new Set(),world={scene,mapId,terrain,navigation,shadows:{addShadowCaster(mesh){casters.add(mesh);},removeShadowCaster(mesh){casters.delete(mesh);}}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>true,id==='guardian-bear'?{models}:{goblinModels:models});
 const player=new TransformNode('player',scene);player.position.set(0,0,6);terrain.place(player.position);
 t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
 return {battle,player,world,models,cloneTimes,casters};
}
test.after(()=>{mkdirSync('reports/loading-stutter-2026-11-03',{recursive:true});writeFileSync('reports/loading-stutter-2026-11-03/boss-incremental-summon.json',JSON.stringify({scope:'Actual packed assets and four map navigation/terrain in Babylon NullEngine; no mobile GPU or FPS measurement.',cases:reports},null,2)+'\n');});

test('actual bear and goblin assets prepare incrementally on all four maps and warm reuse preserves actors',async t=>{
 for(const map of maps)for(const id of ['guardian-bear','hooded-goblin'])await t.test(`${map[0]} ${id}`,async t=>{
  const f=await fixture(t,id,map),kind=id==='guardian-bear'?'bear':'goblin';let frames=0;f.battle.preparationOptions={frame:async()=>{frames++;}};
  assert.equal(await f.battle.summon(f.player,1,kind),true);const e=f.battle.encounters[0],stats=e.preparationStats;
  assert.ok(frames>2);assert.ok(stats.blocks>0);assert.equal(e.actor.isEnabled(),true);assert.equal(e.assetPrepared,true);
  const outlines=e.asset.meshes.filter(mesh=>mesh.metadata?.moonforestOutline);assert.ok(outlines.length>0);
  for(const mesh of outlines){assert.strictEqual(mesh.geometry,mesh.parent.geometry);assert.strictEqual(mesh.skeleton,mesh.parent.skeleton);}
  const Encounter=kind==='bear'?BossEncounter:GoblinEncounter,oracle=new Encounter(f.world,()=>{},()=>{},()=>true,{loadAsset:()=>f.models.instantiate()});
  const baseline=createBossPreparation({incremental:false}),started=performance.now();await oracle.summon(f.player,{position:e.actor.position.clone(),rotationY:e.actor.rotation.y,preparation:baseline});const syncDesktopMs=performance.now()-started;
  assert.equal(oracle.brain.hp,e.brain.hp);assert.deepEqual(oracle.actor.position.asArray(),e.actor.position.asArray());assert.equal(oracle.actor.rotation.y,e.actor.rotation.y);
  assert.deepEqual(oracle.asset.meshes.map(m=>[m.name,m.getTotalVertices(),m.getTotalIndices(),m.numBoneInfluencers,m.metadata?.moonforestOutline===true]),e.asset.meshes.map(m=>[m.name,m.getTotalVertices(),m.getTotalIndices(),m.numBoneInfluencers,m.metadata?.moonforestOutline===true]));
  assert.deepEqual(oracle.asset.animationGroups.map(g=>g.name),e.asset.animationGroups.map(g=>g.name));assert.deepEqual(oracle.animator.durations,e.animator.durations);oracle.hide();
  const meshes=e.asset.meshes.length,clones=f.cloneTimes.length,brain=e.brain.hp;assert.equal(await f.battle.summon(f.player,1,kind),true);
  assert.strictEqual(f.battle.encounters[0],e);assert.equal(f.cloneTimes.length,clones);assert.equal(e.asset.meshes.length,meshes);assert.equal(e.brain.hp,brain);
  reports.push({map:map[0],kind,frames,cloneDesktopMs:f.cloneTimes,syncReferenceTotalDesktopMs:syncDesktopMs,stats:{yields:stats.yields,blocks:stats.blocks,maxSliceMs:stats.maxSliceMs,steps:stats.steps}});
 });
});

test('cancel a yielded real bear preparation, then retry without duplicated assets or late actor activation',async t=>{
 const f=await fixture(t,'guardian-bear',maps[0]),gate=deferred(),entered=deferred();let blocked=false;
 f.battle.preparationOptions={maxBlocks:1,frame:async()=>{const e=f.battle.pool[0];if(!blocked&&e?.assetPreparationStep===2){blocked=true;entered.resolve();await gate.promise;}}};
 const old=f.battle.summon(f.player,1);await entered.promise;const e=f.battle.pool[0];assert.equal(e.actor.isEnabled(),false);
 f.battle.hide();assert.equal(await old,false);gate.resolve();await Promise.resolve();assert.equal(e.actor.isEnabled(),false);
 f.battle.preparationOptions={frame:async()=>{},maxBlocks:1};assert.equal(await f.battle.summon(f.player,1),true);assert.strictEqual(f.battle.encounters[0],e);
 assert.equal(f.cloneTimes.length,1);const silhouettes=e.asset.meshes.filter(mesh=>mesh.metadata?.moonforestOutline);assert.ok(silhouettes.length>0);assert.equal(new Set(e.asset.meshes).size,e.asset.meshes.length);
 for(const shell of silhouettes)assert.equal(shell.parent.getChildMeshes(true).filter(child=>child.metadata?.moonforestOutline).length,1);
 reports.push({case:'cancel-resume',clones:f.cloneTimes.length,silhouettes:silhouettes.length});
});

test('map change invalidates a waiting summon, and a fresh request can resume safely',async t=>{
 const f=await fixture(t,'guardian-bear',maps[0]),gate=deferred(),entered=deferred();let blocked=false;
 f.battle.preparationOptions={frame:async()=>{const e=f.battle.pool[0];if(!blocked&&e?.assetPreparationStep===2){blocked=true;entered.resolve();await gate.promise;}}};
 const old=f.battle.summon(f.player,1);await entered.promise;const e=f.battle.pool[0];f.world.mapId='great-plains';
 assert.equal(await old,false);gate.resolve();await Promise.resolve();assert.equal(e.actor.isEnabled(),false);assert.equal(f.battle.encounters.length,0);
 f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.summon(f.player,1),true);assert.strictEqual(f.battle.encounters[0],e);assert.equal(f.cloneTimes.length,1);
 reports.push({case:'map-change-resume',clones:f.cloneTimes.length,oldActorHidden:true});
});

test('five actual bears each yield their own cold preparation while retaining independent rigs',async t=>{
 const f=await fixture(t,'guardian-bear',maps[1]);f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.summon(f.player,2),true);
 const previous=[...f.battle.encounters];let frames=0;f.battle.preparationOptions={frame:async()=>{frames++;
  for(const e of f.battle.pool){assert.equal(e.active,false);if(e.actor)assert.equal(e.actor.isEnabled(),false);for(const mesh of e.asset?.meshes??[])assert.equal(f.casters.has(mesh),false);}
  assert.ok(previous.every(e=>!e.active),'existing encounters cannot run while their group is prepared');
 }};
 assert.equal(await f.battle.summon(f.player,5),true);const actors=f.battle.encounters;
 assert.equal(actors.length,5);assert.equal(f.cloneTimes.length,5);assert.equal(new Set(actors.map(e=>e.asset.skeletons[0])).size,5);assert.strictEqual(actors[0],previous[0]);
 assert.ok(actors.every(e=>e.actor.isEnabled()&&e.assetPrepared&&e.brain.hp===actors[0].brain.hp));assert.ok(frames>5);
 const counts=()=>({meshes:f.world.scene.meshes.length,geometries:f.world.scene.geometries.length,materials:f.world.scene.materials.length,skeletons:f.world.scene.skeletons.length,groups:f.world.scene.animationGroups.length,nodes:f.world.scene.transformNodes.length});
 const before=counts();assert.equal(await f.battle.summon(f.player,2),true);assert.equal(await f.battle.summon(f.player,5),true);assert.equal(f.cloneTimes.length,5);assert.deepEqual(counts(),before);
 reports.push({case:'five-actual-bears',frames,clones:f.cloneTimes.length,independentSkeletons:5,warmTwoFiveReusesAll:true,resources:before});
});
