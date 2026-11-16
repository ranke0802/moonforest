import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PLAINS_MONSTER_SPAWNS,PLAINS_MONSTER_SPAWNS_REVISION,PLAINS_MONSTER_GROUPS,createPlainsMonsterSpawns} from '../src/plains-monster-spawns.js';
import {validateMonsterSpawns} from '../src/monster-spawn-document.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from '../src/actor-definitions.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_LOOKOUT,PLAINS_RADIUS,PLAINS_SPAWN,plainsObstacles,plainsStreamDistance} from '../src/great-plains-layout.js';
import {BEAR_V02_SIZE} from '../src/bear-size.js';
import {WOLF_V02_ACTIONS} from '../src/wolf-v02-spec.js';
import {regularWolfSize} from '../src/regular-wolf-spec.js';
import {BOSS_MOTIONS,bossAttackRange} from '../src/boss-spec.js';
import {setWorldCharacter} from '../src/world-limits.js';

setWorldCharacter('warrior-plains');
const rows=PLAINS_MONSTER_SPAWNS.maps['great-plains'],navigation=new VillageNavigation(plainsObstacles()),terrain=createGreatPlainsTerrain();
const world={mapId:'great-plains',navigation,terrain},radiusFor=row=>row.definitionId==='guardian-bear.standard'?BEAR_V02_SIZE.radius:ACTOR_DEFINITIONS[row.definitionId].collider.radius;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=value=>Math.round(value*1e6)/1e6;
const roadDistance=point=>Math.min(...PLAINS_ROUTES.flatMap(road=>road.samples.map(([x,z])=>Math.hypot(point.x-x,point.z-z)-road.width/2)));
const evidence=[];

test('default plains document has exactly fourteen actors in seven independently editable stable groups',()=>{
 const checked=validateMonsterSpawns(PLAINS_MONSTER_SPAWNS);assert.equal(checked.valid,true,checked.errors.join('\n'));assert.equal(rows.length,14);assert.equal(PLAINS_MONSTER_GROUPS.length,7);
 assert.deepEqual(Object.fromEntries([...new Set(rows.map(row=>row.definitionId))].map(id=>[id,rows.filter(row=>row.definitionId===id).length])),{'fox.r1':4,'boar.r1':2,'gray-wolf.r1':2,'stylized-wolf.r1':2,'wolf-3.r1':2,'alpha-wolf.r8':1,'guardian-bear.standard':1});
 assert.deepEqual(PLAINS_MONSTER_GROUPS.map(group=>group.members.length),[2,2,1,1,3,4,1]);assert.equal(new Set(rows.map(row=>row.id)).size,14);
 const copy=createPlainsMonsterSpawns();copy.maps['great-plains'][0].x=999;copy.maps['great-plains'][0].territory.radius=1;assert.equal(rows[0].x,6.6);assert.equal(rows[0].territory.radius,8);
 for(const row of rows){assert.equal(row.spawnMode,'start');assert.equal(row.randomRadius,0);assert.equal(row.respawn,true);assert.equal(row.delaySeconds,45);assert.deepEqual(row.territory,PLAINS_MONSTER_GROUPS.find(group=>group.id===row.groupId).territory);}
});

test('all fixed homes use actual terrain and clear physical navigation, water, roads, arrival and each other',()=>{
 const occupied=[];
 for(const row of rows){
  const radius=radiusFor(row),position={x:row.x,y:row.y,z:row.z},definition=ACTOR_DEFINITIONS[row.definitionId];assert.ok(definition,row.definitionId);
  assert.ok(Math.abs(row.y-terrain.heightAt(row.x,row.z))<1e-6,row.id+' terrain height');assert.ok(navigation.free(position,radius+.25,PLAINS_RADIUS-.5),row.id+' body and quarter-metre obstacle clearance');
  assert.equal(validateActorSpawn({...definition,collider:{...definition.collider,radius}},world,{position,player:{position:PLAINS_SPAWN},occupied}).valid,true,row.id+' real spawn contract');
  const road=roadDistance(row),water=plainsStreamDistance(row.x,row.z),arrival=distance(row,PLAINS_SPAWN);assert.ok(road>radius+.25,row.id+' road corridor');assert.ok(water>radius+4.4,row.id+' water/bank');assert.ok(arrival>45+radius,row.id+' village arrival safe area');
  for(const other of occupied)assert.ok(distance(position,other.position)>radius+other.radius+.5,row.id+' independent body spacing');occupied.push({position,radius});
  evidence.push({id:row.id,groupId:row.groupId,definitionId:row.definitionId,home:{x:row.x,y:round(row.y),z:row.z},bodyRadius:round(radius),navigationClearanceMargin:.25,roadShoulderDistance:round(road),streamCenterDistance:round(water),villageArrivalDistance:round(arrival),territory:{...row.territory}});
 }
});

test('territories remain distinct and contain group homes with current body and attack reach allowances',()=>{
 const alphaReach=Math.max(...WOLF_V02_ACTIONS.map(action=>action.maxDistance)),bearReach=Math.max(...BOSS_MOTIONS.filter(motion=>motion.role==='attack'&&!motion.disabled).map(motion=>bossAttackRange(motion)*BEAR_V02_SIZE.attackRangeScale));
 for(let i=0;i<PLAINS_MONSTER_GROUPS.length;i++){
  const group=PLAINS_MONSTER_GROUPS[i],circle=group.territory;assert.ok(Math.hypot(circle.x,circle.z)+circle.radius<PLAINS_RADIUS);
  assert.ok(circle.returnRadius>0&&circle.returnRadius<circle.radius);assert.ok(circle.reengageRadius<circle.radius);
  for(let j=i+1;j<PLAINS_MONSTER_GROUPS.length;j++){const other=PLAINS_MONSTER_GROUPS[j].territory;assert.ok(distance(circle,other)>circle.radius+other.radius+1,group.id+' separate territory');}
  for(const row of rows.filter(row=>row.groupId===group.id)){
   const radius=radiusFor(row),reach=row.definitionId==='guardian-bear.standard'?bearReach:row.definitionId==='alpha-wolf.r8'?alphaReach:alphaReach*regularWolfSize(row.definitionId.replace(/\.r1$/,'')).spatialScale;
   assert.ok(distance(row,circle)+radius+reach<circle.radius,row.id+' home/body/attack allowance');
  }
 }
});

test('fox homes use existing forest canopies, boars use dry river banks and the bear stands on the real high summit',()=>{
 const forestTrees=PLAINS_PLACEMENTS.filter(p=>p.kind==='tree'&&(p.forestBoundary||p.grove?.startsWith('forest')));
 for(const row of rows.filter(row=>row.definitionId==='fox.r1'))assert.ok(Math.min(...forestTrees.map(tree=>distance(row,tree)))<6,row.id+' existing forest trees');
 for(const row of rows.filter(row=>row.definitionId==='boar.r1')){const water=plainsStreamDistance(row.x,row.z);assert.ok(water>10&&water<15,row.id+' bank proximity');assert.ok(row.x<75,'western dry bank');}
 const bear=rows.find(row=>row.definitionId==='guardian-bear.standard'),bodyRadius=radiusFor(bear);assert.ok(bear.y>8);assert.ok(Math.hypot((bear.x-PLAINS_LOOKOUT.x)/PLAINS_LOOKOUT.stretchX,bear.z-PLAINS_LOOKOUT.z)+bodyRadius<PLAINS_LOOKOUT.capRadius);
 for(let i=0;i<24;i++){const angle=i*Math.PI/12;assert.ok(terrain.heightAt(bear.x+bodyRadius*Math.cos(angle),bear.z+bodyRadius*Math.sin(angle))>8,'bear full body footprint remains on summit');}
 const directory=new URL('../reports/plains-monster-population-2026-11-16/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('placement-validation.json',directory),JSON.stringify({revision:PLAINS_MONSTER_SPAWNS_REVISION,actors:rows.length,groups:PLAINS_MONSTER_GROUPS.length,passed:true,groupSummary:PLAINS_MONSTER_GROUPS.map(group=>({id:group.id,label:group.label,count:group.members.length,territory:group.territory})),homes:evidence,notes:['Static production terrain/navigation checks only; no browser, GPU, FPS, heat or play-feel measurement.','Homes avoid the roads; territories retain existing terrain/obstacles and actors still use ordinary navigation. The lookout territory includes summit approaches/slopes.','The current group scheduler has game-time respawn and staged group publication. Distance-based actor activation is not supplied by this preset.','Source geometry, textures, LOD, animation and combat contact rules are unchanged.']},null,2)+'\n');
});
