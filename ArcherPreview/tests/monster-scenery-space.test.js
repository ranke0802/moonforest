import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {VillageNavigation} from '../src/village-navigation.js';
import {monsterSceneryRadius,monsterScenerySpace,safeMonsterSceneryHome} from '../src/monster-scenery-space.js';
import {PLAINS_PLACEMENTS,plainsObstacles,PLAINS_SPAWN} from '../src/great-plains-layout.js';
import {plainsCliffObstacles} from '../src/plains-cliff-collision.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {placementBounds} from '../src/village-demand.js';
import {createPlainsMonsterSpawns} from '../src/plains-monster-spawns.js';
import {setWorldCharacter} from '../src/world-limits.js';

test('whole-body scenery space protects the rendered rock boundary without changing combat or player collision',()=>{
 const world={mapId:'great-plains',navigation:new VillageNavigation([{id:'small-proxy',x:0,z:0,radius:.4,height:2}]),villageRenderRecords:[{placement:{id:'large-rock',kind:'rock'},min:{x:-1.4,y:0,z:-1.4},max:{x:1.4,y:2,z:1.4}}]},p={x:2,z:0};
 assert.equal(world.navigation.free(p,.536,Infinity),true);const space=monsterScenerySpace(world);assert.equal(space.free(p,monsterSceneryRadius('gray-wolf.r1')),false);assert.strictEqual(monsterScenerySpace(world),space,'unchanged map reuses one index');
 assert.equal(world.navigation.obstacles.length,1);assert.equal(world.navigation.free(p,.536,Infinity),true,'player/combat navigator is unchanged');
 world.villageRenderRecords[0].authoredSuppressed=true;world.placementRevision=1;const edited=monsterScenerySpace(world);assert.notStrictEqual(edited,space);assert.equal(edited.free({x:4,z:0},1.62),true);
 world.authoredPlacementRecords=[{placement:{id:'moved-rock',kind:'rock'},min:{x:3,y:0,z:-1},max:{x:5,y:2,z:1},instance:{collision:'solid'}}];world.placementRevision++;assert.equal(monsterScenerySpace(world).free({x:4,z:0},1.62),false,'edited transformed rock bounds are honored');
 world.authoredPlacementRecords[0].instance.collision='none';world.placementRevision++;assert.equal(monsterScenerySpace(world).free({x:4,z:0},1.62),true,'explicit non-solid dressing stays traversable');
});

test('a bounded initial home correction stays inside its territory and cannot teleport across a real barrier',()=>{
 const world={mapId:'great-plains',navigation:new VillageNavigation([{id:'rock',x:0,z:0,radius:.5,height:3}]),terrain:{heightAt:()=>2}},row={definitionId:'gray-wolf.r1',territory:{x:0,z:0,radius:8}},requested={x:1,z:0,y:2};
 const safe=safeMonsterSceneryHome(world,row,requested);assert.ok(safe);assert.ok(monsterScenerySpace(world).free(safe,1.62));assert.ok(Math.hypot(safe.x-requested.x,safe.z-requested.z)<=3);assert.equal(safe.y,2);assert.deepEqual(requested,{x:1,z:0,y:2});
 world.navigation={free:()=>false,segmentClear:()=>false};assert.equal(safeMonsterSceneryHome(world,row,requested),null);assert.equal(safeMonsterSceneryHome(world,{definitionId:'hooded-goblin.standard'},requested),requested,'unrelated actors retain their original path');
});

test('all nineteen R5 authored homes and peaceful wander footprints clear current production rock bounds and navigation',()=>{
 setWorldCharacter('warrior-plains');const terrain=createGreatPlainsTerrain(),manifest=JSON.parse(readFileSync(new URL('../public/assets/great-plains.json',import.meta.url))),world={mapId:'great-plains',terrain,navigation:new VillageNavigation([...plainsObstacles(),...plainsCliffObstacles()])};
 world.villageRenderRecords=PLAINS_PLACEMENTS.filter(p=>p.kind==='rock').map(placement=>({placement,...placementBounds(world,placement,manifest.assets[placement.asset])}));
 const rows=createPlainsMonsterSpawns().maps['great-plains'],space=monsterScenerySpace(world),proof=[];
 for(const row of rows){const radius=monsterSceneryRadius(row.definitionId),requested={x:row.x,y:row.y,z:row.z},home=safeMonsterSceneryHome(world,row,requested,p=>Math.hypot(p.x-PLAINS_SPAWN.x,p.z-PLAINS_SPAWN.z)>10);assert.ok(home,row.id+' has a safe whole-body home');
  if(!radius)continue;assert.ok(space.free(home,radius),row.id+' body/head/tail safe at rest');let clear=0;
  for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:home.x+Math.cos(a)*row.territory.wanderRadius,z:home.z+Math.sin(a)*row.territory.wanderRadius};if(space.free(p,radius)&&space.segmentClear(home,p,radius))clear++;}
  assert.ok(clear>=3,row.id+' has at least three safe wander choices');proof.push({id:row.id,radius,requested,actualHome:home,shift:Math.hypot(home.x-row.x,home.z-row.z),safeWanderDirections:clear});
 }
 const directory=new URL('../reports/monster-awareness-scenery-r6-2026-11-16/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('scenery-clearance.json',directory),JSON.stringify({passed:true,scope:'Production transforms and conservative rendered-rock bounds; no browser/device raster claim',rows:proof},null,2)+'\n');setWorldCharacter('warrior');
});
