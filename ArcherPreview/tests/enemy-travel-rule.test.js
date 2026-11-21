import test from 'node:test';
import assert from 'node:assert/strict';
import {setWorldCharacter,ARENA_RADIUS,ENEMY_ARENA_RADIUS,setEnemyTravelRule,enemyLimitAt,clampEnemyTravel} from '../src/world-limits.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {villageTravelLimit,clampVillageExit,exitRoadX} from '../src/map-travel.js';

// The rule main.js sets for 0.3 on the village map.
const villageRule=()=>({
 limit:(position,normal)=>villageTravelLimit(position,normal+.5)-.5,
 clamp:(position,previous)=>{clampVillageExit(position,previous);},
 outside:(point,limit)=>limit>ARENA_RADIUS&&Math.hypot(point.x,point.z)>ARENA_RADIUS&&villageTravelLimit(point,0)===0,
});
const walk=(nav,from,goal,radius=.5,steps=400,speed=.35)=>{
 const p={x:from.x,z:from.z},route={};let far=0;
 for(let i=0;i<steps;i++){
  const target=nav.steer(p,goal,radius,route,.1)??goal,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(Math.hypot(goal.x-p.x,goal.z-p.z)<1)break;
  const before={x:p.x,z:p.z};if(d>1e-6){p.x+=dx/d*Math.min(speed,d);p.z+=dz/d*Math.min(speed,d);}
  nav.constrain(p,before,radius,enemyLimitAt(before));clampEnemyTravel(p,before);far=Math.max(far,Math.hypot(p.x,p.z));
 }
 return {p,far};
};

test('without a rule monsters stay inside the map circle (0.2)',t=>{
 setWorldCharacter('warrior-v3');t.after(()=>setWorldCharacter('warrior'));setEnemyTravelRule(null);
 const nav=new VillageNavigation([]),road={x:exitRoadX(58),z:58};
 assert.equal(enemyLimitAt(road),ENEMY_ARENA_RADIUS);assert.equal(nav.free(road,.5,enemyLimitAt(road)),false);
 const out=walk(nav,{x:0,z:40},road);assert.ok(out.far<=ENEMY_ARENA_RADIUS+1e-6,'stops at the rim: '+out.far);
});

test('0.3: monsters use the road out of the village, and only the road',t=>{
 setWorldCharacter('warrior-v3');setEnemyTravelRule(villageRule());t.after(()=>{setEnemyTravelRule(null);setWorldCharacter('warrior');});
 const nav=new VillageNavigation([]),road={x:exitRoadX(58),z:58};
 assert.equal(enemyLimitAt({x:0,z:30}),ENEMY_ARENA_RADIUS,'inside the village: the circle');
 assert.equal(enemyLimitAt(road),79.5,'on the exit road: as far as the player may go');
 assert.equal(nav.free(road,.5,enemyLimitAt(road)),true,'a monster can stand on the road outside the village');
 assert.equal(nav.free({x:45,z:55},.5,79.5),false,'but not beside it, outside the circle and off the strip');
 // The raid: goblins appear on the road and come in to the player at the palisade.
 const raid=walk(nav,road,{x:0,z:28});assert.ok(Math.hypot(raid.p.x,raid.p.z-28)<1.2,'reaches the player: '+JSON.stringify(raid.p));
 // And a monster inside follows a player out along the road.
 const chase=walk(nav,{x:0,z:38},{x:exitRoadX(66),z:66});assert.ok(chase.p.z>64,'follows out: '+JSON.stringify(chase.p));assert.ok(chase.far>ARENA_RADIUS);
 // Pushed sideways off the strip it is held at the edge, not thrown back to the circle.
 const edge={x:exitRoadX(60)+30,z:60},before={x:exitRoadX(60)+21,z:60};clampEnemyTravel(edge,before);
 assert.ok(Math.abs(edge.x-(exitRoadX(60)+22))<1e-6);assert.equal(edge.z,60);
});
