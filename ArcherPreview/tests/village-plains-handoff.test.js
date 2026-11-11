import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';
import {createMapPortal,roadPortalContains,safeRoadArrival,villageTravelLimit,clampVillageExit,exitRoadX} from '../src/map-travel.js';
import {mapPortals} from '../src/map-route.js';
import {captureVillagePlainsHandoff} from '../src/village-plains-handoff.js';
import {villageToPlains,plainsToVillage} from '../src/village-plains-boundary.js';
import {FOREST_PLAINS_BOUNDARY,forestToPlains,plainsToForest} from '../src/plains-forest-boundary.js';
import {portalHeadingTurn} from '../src/map-route.js';
import {ArenaNavigation} from '../src/navigation.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {TRAINING_OBSTACLES} from '../src/forest-layout.js';
import {FOREST_RADIUS} from '../src/map-route.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {villageHeight} from '../src/village-terrain.js';
import {greatPlainsHeight} from '../src/great-plains-terrain.js';
import {monsterForestHeight} from '../src/monster-forest-terrain.js';
import {createWorld} from '../src/world.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {isVillageBoundaryTree} from '../src/village-plains-boundary.js';

test('village exit corridor edges do not snap the next movement back to the 48 m arena',()=>{
 const navigation=new VillageNavigation([]),radius=.28;
 for(const side of [-1,1]){
  let previous={x:exitRoadX(60)+side*21.99,z:60};
  for(let i=0;i<5;i++){
   const target={x:previous.x+side*.3,z:previous.z},moved=navigation.move(previous,target,radius,villageTravelLimit(previous));
   clampVillageExit(moved,previous);
   assert.equal(villageTravelLimit(moved),80);
   assert.ok(Math.hypot(moved.x-previous.x,moved.z-previous.z)<.31);
   assert.ok(Math.hypot(moved.x,moved.z)>48);
   previous=moved;
  }
 }
});

test('road arrival does not bounce when stationary or moving sideways, and rearms after leaving the strip',()=>{
 for(const [map,source] of [['village','warrior-plains'],['great-plains','warrior-v3'],['monster-forest','warrior-plains'],['great-plains','warrior-v4']]){
  const {document}=parseHTML('<button id="portal"></button>'),oldDocument=globalThis.document,oldLocation=globalThis.location;globalThis.document=document;globalThis.location={href:`https://example.test/?character=${map==='village'?'warrior-v3':map==='monster-forest'?'warrior-v4':'warrior-plains'}`};
  const engine=new NullEngine(),scene=new Scene(engine),p=mapPortals(map).find(p=>p.destination===source),state={position:{x:p.x,z:p.z},hp:500,potions:3},calls=[];
  try{
   const button=document.getElementById('portal'),portal=createMapPortal({mapId:map,scene,camera:{globalPosition:Vector3.Zero()},terrain:{heightAt:()=>0}},{button,persistTravel:false,disarmRoadDestination:source,getState:()=>state,onTravel:(url,selected)=>calls.push({url,selected})});
   for(let i=0;i<500;i++)portal.update(.1);button.click();document.dispatchEvent(new document.defaultView.Event('keydown'));assert.equal(calls.length,0);assert.equal(button.disabled,true);
   const mapPoint=map==='great-plains'?(source==='warrior-v3'?villageToPlains:forestToPlains):q=>q,origin=map==='village'?{x:0,z:76}:map==='monster-forest'?{x:0,z:51}:source==='warrior-v3'?{x:.35,z:76}:{x:0,z:51};
   state.position=mapPoint({...origin,x:origin.x+15});portal.update();state.position={x:p.x,z:p.z};portal.update();assert.equal(calls.length,0);
   state.position=mapPoint({...origin,x:origin.x+25});portal.update();state.position={x:p.x,z:p.z};portal.update();assert.equal(calls.length,1);assert.equal(calls[0].selected,p);
   for(let i=0;i<30;i++)portal.update(.1);assert.equal(calls.length,1);portal.dispose();
  }finally{engine.dispose();globalThis.document=oldDocument;globalThis.location=oldLocation;}
 }
});

test('all road arrivals allow an immediate intentional return, without triggering on continued forward movement',()=>{
 const roads=[
  {map:'village',character:'warrior-v3',source:'warrior-plains',common:{x:.35,z:75},point:p=>p,outward:1},
  {map:'great-plains',character:'warrior-plains',source:'warrior-v3',common:{x:.35,z:75},point:villageToPlains,outward:-1},
  {map:'monster-forest',character:'warrior-v4',source:'warrior-plains',common:{x:0,z:51},point:p=>p,outward:1},
  {map:'great-plains',character:'warrior-plains',source:'warrior-v4',common:{x:0,z:51},point:forestToPlains,outward:-1},
 ];
 for(const road of roads)for(const forwardFirst of [false,true]){
  const {document}=parseHTML('<button id="portal"></button>'),oldDocument=globalThis.document,oldLocation=globalThis.location;
  globalThis.document=document;globalThis.location={href:`https://example.test/?character=${road.character}`};
  const engine=new NullEngine(),scene=new Scene(engine),button=document.getElementById('portal'),calls=[];
  const state={position:road.point(road.common),hp:500,potions:3},world={mapId:road.map,scene,camera:{globalPosition:Vector3.Zero()},terrain:{heightAt:()=>0}};
  const portal=createMapPortal(world,{button,persistTravel:false,disarmRoadDestination:road.source,getState:()=>state,onTravel:(url,selected)=>calls.push({url,selected})});
  const move=(dz,dx=0)=>{state.position=road.point({x:road.common.x+dx,z:road.common.z+dz});portal.update(1/60);};
  try{
   for(let i=0;i<120;i++)portal.update(1/60);
   move(road.outward*.15);move(0,1);move(0);assert.equal(calls.length,0,`${road.map} ${road.source}: no stationary/sideways/jitter bounce`);
   if(forwardFirst){for(let i=1;i<=6;i++)move(-road.outward*i*.1);assert.equal(calls.length,0,`${road.map} ${road.source}: continuing into the new map`);}
   const start=forwardFirst?-.6:0;
   for(let i=1;i<=4;i++)move(road.outward*(start+i*.1));
   assert.equal(calls.length,1,`${road.map} ${road.source}: reverse direction`);
   assert.equal(calls[0].selected.destination,road.source);
   for(let i=0;i<20;i++)portal.update(1/60);assert.equal(calls.length,1);
  }finally{portal.dispose();engine.dispose();globalThis.document=oldDocument;globalThis.location=oldLocation;}
 }
});

test('all four broad road boundaries include both sides and retain matching terrain',()=>{
 const rows=[
  ['village','warrior-plains',x=>({x,z:74}),villageToPlains,villageHeight,greatPlainsHeight],
  ['great-plains','warrior-v3',x=>villageToPlains({x,z:77}),plainsToVillage,greatPlainsHeight,villageHeight],
  ['monster-forest','warrior-plains',x=>({x,z:50}),forestToPlains,monsterForestHeight,greatPlainsHeight],
  ['great-plains','warrior-v4',x=>forestToPlains({x,z:53}),plainsToForest,greatPlainsHeight,monsterForestHeight],
 ];
 for(const [map,destination,point,transform,sourceHeight,targetHeight] of rows){
  const portal=mapPortals(map).find(p=>p.destination===destination);
  for(let x=-16;x<=16;x+=2){const before=point(x),after=transform(before);assert.ok(roadPortalContains(map,portal,before),`${map} ${destination} ${x}`);assert.ok(Math.abs(sourceHeight(before.x,before.z)-targetHeight(after.x,after.z))<.03,`uneven boundary ${map} ${x}`);}
 }
});

test('blocked wide-boundary arrivals choose a nearby traversable point rather than inside a tree',()=>{
 const navigations={village:new VillageNavigation(villageObstacles()),'great-plains':new VillageNavigation(plainsObstacles()),'monster-forest':new VillageNavigation(forestObstacles())};
 for(const [map,position] of [['village',{x:10,z:74}],['great-plains',villageToPlains({x:10,z:74})],['monster-forest',{x:-10,z:50}],['great-plains',forestToPlains({x:-10,z:50})]]){
  const world={mapId:map,navigation:navigations[map]},limit=p=>map==='village'?villageTravelLimit(p,48):map==='monster-forest'?62:106;
  const result=safeRoadArrival(world,position,WARRIOR_DIMENSIONS.moveRadius,limit);assert.ok(world.navigation.free(result,WARRIOR_DIMENSIONS.moveRadius,limit(result)));assert.ok(Math.hypot(result.x-position.x,result.z-position.z)<=10);
 }
 const blocked={mapId:'great-plains',navigation:{free:p=>Math.hypot(p.x,p.z)>.9}},result=safeRoadArrival(blocked,{x:0,z:0},.3,()=>106);assert.ok(Math.hypot(result.x,result.z)>.9&&Math.hypot(result.x,result.z)<1.3);
});

test('the widened village exit retains collision for its formerly non-playable boundary tree trunks',()=>{
 const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true});try{
  const trees=VILLAGE_PLACEMENTS.filter(p=>isVillageBoundaryTree(p)&&Math.hypot(p.x,p.z)>=50&&p.z>=43&&Math.abs(p.x)<26);assert.ok(trees.length>0);
  for(const tree of trees){const obstacle=world.navigation.obstacles.find(row=>row.id===tree.id);assert.ok(obstacle,tree.id);assert.equal(world.navigation.free(obstacle,.34,80),false);}
 }finally{world.scene.dispose();engine.dispose();}
});

test('forest-plains portal anchors, metre distances and camera turns all use the same rigid transform',()=>{
 assert.deepEqual(forestToPlains({x:0,z:51}),{x:65,z:-72});
 assert.ok(Math.abs(FOREST_PLAINS_BOUNDARY.yaw-portalHeadingTurn('warrior-v4','warrior-plains'))<1e-12);
 for(const x of [-3,-1,0,1,3])for(const z of [48,50,51,52,54]){
  const source={x,z},target=forestToPlains(source),roundtrip=plainsToForest(target);
  assert.ok(Math.hypot(roundtrip.x-x,roundtrip.z-z)<1e-12);assert.ok(Math.abs(Math.hypot(x,z-51)-Math.hypot(target.x-65,target.z+72))<1e-12);
  const actor={position:source,rotation:{y:.4}},camera={alpha:-1},h=captureVillagePlainsHandoff('warrior-v4','warrior-plains',actor,camera,null);assert.deepEqual(h.position,target);
  const back=captureVillagePlainsHandoff('warrior-plains','warrior-v4',{position:target,rotation:actor.rotation},camera,null);assert.ok(Math.hypot(back.position.x-x,back.position.z-z)<1e-12);
 }
});

test('every sampled forest portal arrival is legal in the unchanged forest navigation',()=>{
 const nav=new ArenaNavigation([...forestObstacles(),...TRAINING_OBSTACLES]);let sampled=0;
 for(let x=-3;x<=3;x+=.25)for(let z=48;z<=54;z+=.25){
  if(Math.hypot(x,z-51)>3)continue;
  const source=forestToPlains({x,z}),arrival=plainsToForest(source);
  assert.equal(nav.free(arrival,WARRIOR_DIMENSIONS.moveRadius,FOREST_RADIUS),true,JSON.stringify({source,arrival}));sampled++;
 }
 assert.ok(sampled>400);
});

test('handoff maps only actual village-plains pairs without mutating pose and reverses without drift',()=>{
 const actor={position:{x:1.1,z:74.25},rotation:{y:.73}},camera={alpha:-1.2},pan={x:2,y:.4,z:-3},before=structuredClone({actor,camera,pan});
 const a=captureVillagePlainsHandoff('warrior-v3','warrior-plains',actor,camera,pan);assert.deepEqual(a.position,villageToPlains(actor.position));assert.deepEqual({actor,camera,pan},before);
 const back=plainsToVillage(a.position);assert.ok(Math.hypot(back.x-actor.position.x,back.z-actor.position.z)<1e-12);
 assert.equal(captureVillagePlainsHandoff('warrior-v4','warrior-v5',actor,camera,pan),null);
});
