import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene} from '@babylonjs/core';
import {createMapPortal} from '../src/map-travel.js';
import {mapPortals} from '../src/map-route.js';
import {captureVillagePlainsHandoff} from '../src/village-plains-handoff.js';
import {villageToPlains,plainsToVillage} from '../src/village-plains-boundary.js';

test('road arrival remains disarmed indefinitely until the player leaves its trigger with hysteresis',()=>{
 for(const [map,source] of [['village','warrior-plains'],['great-plains','warrior-v3']]){
  const {document}=parseHTML('<button id="portal"></button>'),oldDocument=globalThis.document,oldLocation=globalThis.location;globalThis.document=document;globalThis.location={href:`https://example.test/?character=${map==='village'?'warrior-v3':'warrior-plains'}`};
  const engine=new NullEngine(),scene=new Scene(engine),p=mapPortals(map).find(p=>p.destination===source),state={position:{x:p.x,z:p.z},hp:500,potions:3},calls=[];
  try{
   const button=document.getElementById('portal'),portal=createMapPortal({mapId:map,scene},{button,persistTravel:false,disarmRoadDestination:source,getState:()=>state,onTravel:(url,selected)=>calls.push({url,selected})});
   for(let i=0;i<500;i++)portal.update(.1);button.click();document.dispatchEvent(new document.defaultView.Event('keydown'));assert.equal(calls.length,0);assert.equal(button.disabled,true);
   state.position.x=p.x+p.radius+.49;portal.update();state.position.x=p.x;portal.update();assert.equal(calls.length,0);
   state.position.x=p.x+p.radius+.51;portal.update();state.position.x=p.x;portal.update();assert.equal(calls.length,1);assert.equal(calls[0].selected,p);
   for(let i=0;i<30;i++)portal.update(.1);assert.equal(calls.length,1);portal.dispose();
  }finally{engine.dispose();globalThis.document=oldDocument;globalThis.location=oldLocation;}
 }
});

test('handoff maps only actual village-plains pairs without mutating pose and reverses without drift',()=>{
 const actor={position:{x:1.1,z:74.25},rotation:{y:.73}},camera={alpha:-1.2},pan={x:2,y:.4,z:-3},before=structuredClone({actor,camera,pan});
 const a=captureVillagePlainsHandoff('warrior-v3','warrior-plains',actor,camera,pan);assert.deepEqual(a.position,villageToPlains(actor.position));assert.deepEqual({actor,camera,pan},before);
 const back=plainsToVillage(a.position);assert.ok(Math.hypot(back.x-actor.position.x,back.z-actor.position.z)<1e-12);
 assert.equal(captureVillagePlainsHandoff('warrior-v4','warrior-v5',actor,camera,pan),null);
});
