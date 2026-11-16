import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PLAINS_MONSTER_SPAWNS,PLAINS_MONSTER_SPAWNS_REVISION,PLAINS_MONSTER_GROUPS,PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R3,PLAINS_MONSTER_SPAWNS_R4,createPlainsMonsterSpawns} from '../src/plains-monster-spawns.js';
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
import {plainsCliffObstacles} from '../src/plains-cliff-collision.js';
import {VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';

setWorldCharacter('warrior-plains');
const rows=PLAINS_MONSTER_SPAWNS.maps['great-plains'],navigation=new VillageNavigation([...plainsObstacles(),...plainsCliffObstacles()]),terrain=createGreatPlainsTerrain();
const world={mapId:'great-plains',navigation,terrain},radiusFor=row=>row.definitionId==='guardian-bear.standard'?BEAR_V02_SIZE.radius:ACTOR_DEFINITIONS[row.definitionId].collider.radius;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),round=value=>Math.round(value*1e6)/1e6;
const roadDistance=point=>Math.min(...PLAINS_ROUTES.flatMap(road=>road.samples.map(([x,z])=>Math.hypot(point.x-x,point.z-z)-road.width/2)));
const evidence=[];
const isVillageEncounter=row=>['plains-fox-west','plains-fox-east','plains-village-wolf-south','plains-village-wolf-north'].includes(row.groupId);

test('R5 default plains has nineteen actors in eleven independently editable stable groups and preserves prior evidence',()=>{
 const checked=validateMonsterSpawns(PLAINS_MONSTER_SPAWNS);assert.equal(checked.valid,true,checked.errors.join('\n'));assert.equal(rows.length,19);assert.equal(PLAINS_MONSTER_GROUPS.length,11);
 assert.deepEqual(Object.fromEntries([...new Set(rows.map(row=>row.definitionId))].map(id=>[id,rows.filter(row=>row.definitionId===id).length])),{'fox.r1':2,'boar.r1':2,'gray-wolf.r1':4,'stylized-wolf.r1':6,'wolf-3.r1':2,'alpha-wolf.r8':1,'guardian-bear.standard':2});
 assert.deepEqual(PLAINS_MONSTER_GROUPS.map(group=>group.members.length),[1,1,1,1,3,4,1,1,4,1,1]);assert.equal(new Set(rows.map(row=>row.id)).size,19);
 const copy=createPlainsMonsterSpawns();copy.maps['great-plains'][0].x=999;copy.maps['great-plains'][0].territory.radius=1;assert.equal(rows[0].x,-77);assert.equal(rows[0].territory.radius,8);
 assert.deepEqual([PLAINS_MONSTER_SPAWNS_R1,PLAINS_MONSTER_SPAWNS_R2,PLAINS_MONSTER_SPAWNS_R3].map(doc=>createHash('sha256').update(JSON.stringify(doc)).digest('hex')),['80559275d5205ace570ed13dff7cc2bcbdbdcc2b04db90f8a102143d00d4bf3f','0a3c08f80205cd55905171d69e4e7794cdd9051b109352ba403ef60e9e66151f','e587073af85302f7ff25983cf3ebe99248e80b8ffec1ae9fc4d24ea0a7f53f0f']);
 for(const row of rows){assert.equal(row.spawnMode,'start');assert.equal(row.randomRadius,0);assert.equal(row.respawn,true);assert.equal(row.delaySeconds,45);assert.deepEqual(row.territory,PLAINS_MONSTER_GROUPS.find(group=>group.id===row.groupId).territory);}
});

test('all fixed homes use actual terrain and clear physical navigation, water, roads, arrival and each other',()=>{
 const occupied=[];
 for(const row of rows){
  const radius=radiusFor(row),position={x:row.x,y:row.y,z:row.z},definition=ACTOR_DEFINITIONS[row.definitionId];assert.ok(definition,row.definitionId);
  assert.ok(Math.abs(row.y-terrain.heightAt(row.x,row.z))<1e-6,row.id+' terrain height');assert.ok(navigation.free(position,radius+.25,PLAINS_RADIUS-.5),row.id+' body and quarter-metre obstacle clearance');
  assert.equal(validateActorSpawn({...definition,collider:{...definition.collider,radius}},world,{position,player:{position:PLAINS_SPAWN},occupied}).valid,true,row.id+' real spawn contract');
  const road=roadDistance(row),water=plainsStreamDistance(row.x,row.z),arrival=distance(row,PLAINS_SPAWN);assert.ok(road>radius+.25,row.id+' road corridor');assert.ok(water>radius+4.4,row.id+' water/bank');assert.ok(arrival>(isVillageEncounter(row)?14:45)+radius,row.id+' village arrival safe area');
  for(const other of occupied)assert.ok(distance(position,other.position)>radius+other.radius+.5,row.id+' independent body spacing');occupied.push({position,radius});
  evidence.push({id:row.id,groupId:row.groupId,definitionId:row.definitionId,home:{x:row.x,y:round(row.y),z:row.z},bodyRadius:round(radius),navigationClearanceMargin:.25,roadShoulderDistance:round(road),streamCenterDistance:round(water),villageArrivalDistance:round(arrival),territory:{...row.territory}});
 }
});

test('R2 outer watch and inner combat ranges expand around the same homes with bounded home wandering',()=>{
 const alphaReach=Math.max(...WOLF_V02_ACTIONS.map(action=>action.maxDistance)),bearReach=Math.max(...BOSS_MOTIONS.filter(motion=>motion.role==='attack'&&!motion.disabled).map(motion=>bossAttackRange(motion)*BEAR_V02_SIZE.attackRangeScale));
 const unchanged=row=>!['plains-alpha-pack','plains-wolf-meadow','plains-fox-west','plains-fox-east','plains-village-wolf-south','plains-village-wolf-north','plains-riverbank-bear','plains-stylized-wolf-pack'].includes(row.groupId);assert.deepEqual(rows.filter(unchanged).map(({territory,...row})=>row),PLAINS_MONSTER_SPAWNS_R1.maps['great-plains'].filter(unchanged).map(({territory,...row})=>row));
 for(let i=0;i<PLAINS_MONSTER_GROUPS.length;i++){
  const group=PLAINS_MONSTER_GROUPS[i],circle=group.territory;assert.ok(Math.hypot(circle.x,circle.z)+circle.radius<PLAINS_RADIUS);
  const oldGroup=group.id==='plains-alpha-pack'?'plains-wolf-meadow':group.id==='plains-wolf-meadow'?'plains-alpha-pack':group.id,old=PLAINS_MONSTER_SPAWNS_R1.maps['great-plains'].find(row=>row.groupId===oldGroup)?.territory;if(old&&!isVillageEncounter({groupId:group.id})){assert.ok(circle.radius>=old.radius*1.4);assert.ok(circle.radius<=old.radius*1.8);}
  assert.ok(circle.combatRadius>=circle.radius*.5&&circle.combatRadius<=circle.radius*.65);assert.ok(circle.wanderRadius>=2&&circle.wanderRadius<=5);
  for(const other of PLAINS_MONSTER_GROUPS.slice(i+1))assert.ok(distance(circle,other.territory)>circle.radius+other.territory.radius,group.id+' nonoverlapping outer territory');
  assert.ok(circle.returnRadius>0&&circle.returnRadius<circle.radius);assert.ok(circle.reengageRadius<circle.radius);
  for(const row of rows.filter(row=>row.groupId===group.id)){
   const radius=radiusFor(row),reach=row.definitionId==='guardian-bear.standard'?bearReach:row.definitionId==='alpha-wolf.r8'?alphaReach:alphaReach*regularWolfSize(row.definitionId.replace(/\.r1$/,'')).spatialScale;
   assert.ok(distance(row,circle)+radius+reach<circle.radius,row.id+' home/body/attack allowance');
   assert.ok(distance(row,circle)+radius+circle.wanderRadius<circle.radius,row.id+' bounded home wandering');
  }
 }
});

test('R3 leader pack occupies the farther former wolf territory and the ordinary pack takes its former homes',()=>{
 const alpha=PLAINS_MONSTER_GROUPS.find(group=>group.id==='plains-alpha-pack'),regular=PLAINS_MONSTER_GROUPS.find(group=>group.id==='plains-wolf-meadow'),r2=PLAINS_MONSTER_SPAWNS_R2.maps['great-plains'];
 assert.deepEqual(alpha.territory,r2.find(row=>row.groupId==='plains-wolf-meadow').territory);assert.deepEqual(regular.territory,r2.find(row=>row.groupId==='plains-alpha-pack').territory);
 assert.ok(distance(alpha.territory,VILLAGE_PLAINS_BOUNDARY.plainsPortal)>distance(regular.territory,VILLAGE_PLAINS_BOUNDARY.plainsPortal)+20);assert.equal(alpha.members.length,4);assert.equal(regular.members.length,3);
 assert.ok(distance(rows.find(row=>row.definitionId==='alpha-wolf.r8'),alpha.territory)<1);
});

test('every home has reachable ambient wander choices away from roads, water and village arrival',()=>{
 for(const row of rows){const radius=radiusFor(row),home={x:row.x,z:row.z};let usable=0;
  for(let i=0;i<24;i++){const angle=i*Math.PI/12,r=row.territory.wanderRadius,point={x:row.x+Math.cos(angle)*r,z:row.z+Math.sin(angle)*r};
   if(navigation.free(point,radius+.25,PLAINS_RADIUS-.5)&&navigation.segmentClear(home,point,radius)&&roadDistance(point)>radius+.25&&plainsStreamDistance(point.x,point.z)>radius+4.4&&distance(point,PLAINS_SPAWN)>(isVillageEncounter(row)?14:45)+radius)usable++;
  }
  assert.ok(usable>=3,row.id+' usable bounded wander choices: '+usable);
 }
});

test('fox homes use existing forest canopies, boars use dry river banks and the bear stands on the real high summit',()=>{
 const forestTrees=PLAINS_PLACEMENTS.filter(p=>p.kind==='tree'&&(p.forestBoundary||p.grove?.startsWith('forest')));
 for(const row of rows.filter(row=>row.definitionId==='fox.r1')){const trees=PLAINS_PLACEMENTS.filter(p=>p.kind==='tree');assert.ok(Math.min(...trees.map(tree=>distance(row,tree)))<10,row.id+' existing forest trees');}
 for(const row of rows.filter(row=>row.definitionId==='boar.r1')){const water=plainsStreamDistance(row.x,row.z);assert.ok(water>10&&water<15,row.id+' bank proximity');assert.ok(row.x<75,'western dry bank');}
 const bear=rows.find(row=>row.definitionId==='guardian-bear.standard'),bodyRadius=radiusFor(bear);assert.ok(bear.y>8);assert.ok(Math.hypot((bear.x-PLAINS_LOOKOUT.x)/PLAINS_LOOKOUT.stretchX,bear.z-PLAINS_LOOKOUT.z)+bodyRadius<PLAINS_LOOKOUT.capRadius);
 for(let i=0;i<24;i++){const angle=i*Math.PI/12;assert.ok(terrain.heightAt(bear.x+bodyRadius*Math.cos(angle),bear.z+bodyRadius*Math.sin(angle))>8,'bear full body footprint remains on summit');}
 const directory=new URL('../reports/plains-village-encounters-r5-2026-11-16/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('placement-validation.json',directory),JSON.stringify({revision:PLAINS_MONSTER_SPAWNS_REVISION,actors:rows.length,groups:PLAINS_MONSTER_GROUPS.length,passed:true,groupSummary:PLAINS_MONSTER_GROUPS.map(group=>({id:group.id,label:group.label,count:group.members.length,territory:group.territory})),homes:evidence,notes:['Static production terrain/navigation checks only; no browser, GPU, FPS, heat or play-feel measurement.','Homes avoid the roads; territories retain existing terrain/obstacles and actors still use ordinary navigation. The lookout territory includes summit approaches/slopes.','The current group scheduler has game-time respawn and staged group publication. Distance-based actor activation is not supplied by this preset.','Source geometry, textures, LOD, animation and combat contact rules are unchanged.']},null,2)+'\n');
});

test('four single village encounters precede the relocated four-wolf pack without entering the arrival corridor',()=>{
 const near=PLAINS_MONSTER_GROUPS.filter(g=>isVillageEncounter({groupId:g.id})),pack=PLAINS_MONSTER_GROUPS.find(g=>g.id==='plains-stylized-wolf-pack'),old=PLAINS_MONSTER_SPAWNS_R4.maps['great-plains'].find(r=>r.groupId===pack.id);
 assert.equal(near.length,4);assert.ok(near.every(g=>g.members.length===1));assert.equal(near.filter(g=>g.members[0][0]==='fox.r1').length,2);assert.equal(near.filter(g=>g.members[0][0]==='gray-wolf.r1').length,2);
 assert.ok(distance(pack.territory,PLAINS_SPAWN)>distance(old.territory,PLAINS_SPAWN)+15);
 for(const group of near){assert.ok(distance(group.territory,PLAINS_SPAWN)<42);assert.ok(distance(group.territory,PLAINS_SPAWN)-group.territory.radius>14);assert.ok(distance(pack.territory,PLAINS_SPAWN)>distance(group.territory,PLAINS_SPAWN)+25);}
});
