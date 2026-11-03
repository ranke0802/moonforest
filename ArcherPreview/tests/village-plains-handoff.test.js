import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';
import {createMapPortal} from '../src/map-travel.js';
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

test('road arrival remains disarmed indefinitely until the player leaves its trigger with hysteresis',()=>{
 for(const [map,source] of [['village','warrior-plains'],['great-plains','warrior-v3'],['monster-forest','warrior-plains'],['great-plains','warrior-v4']]){
  const {document}=parseHTML('<button id="portal"></button>'),oldDocument=globalThis.document,oldLocation=globalThis.location;globalThis.document=document;globalThis.location={href:`https://example.test/?character=${map==='village'?'warrior-v3':map==='monster-forest'?'warrior-v4':'warrior-plains'}`};
  const engine=new NullEngine(),scene=new Scene(engine),p=mapPortals(map).find(p=>p.destination===source),state={position:{x:p.x,z:p.z},hp:500,potions:3},calls=[];
  try{
   const button=document.getElementById('portal'),portal=createMapPortal({mapId:map,scene,camera:{globalPosition:Vector3.Zero()},terrain:{heightAt:()=>0}},{button,persistTravel:false,disarmRoadDestination:source,getState:()=>state,onTravel:(url,selected)=>calls.push({url,selected})});
   for(let i=0;i<500;i++)portal.update(.1);button.click();document.dispatchEvent(new document.defaultView.Event('keydown'));assert.equal(calls.length,0);assert.equal(button.disabled,true);
   state.position.x=p.x+p.radius+.49;portal.update();state.position.x=p.x;portal.update();assert.equal(calls.length,0);
   state.position.x=p.x+p.radius+.51;portal.update();state.position.x=p.x;portal.update();assert.equal(calls.length,1);assert.equal(calls[0].selected,p);
   for(let i=0;i<30;i++)portal.update(.1);assert.equal(calls.length,1);portal.dispose();
  }finally{engine.dispose();globalThis.document=oldDocument;globalThis.location=oldLocation;}
 }
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
