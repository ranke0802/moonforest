// Living cast (2026-11-19): idle fidgets, strolling around home, stopping for
// the player, and turning the whole body toward a conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCastVisuals} from '../src/v03/cast-models.js';

function harness(){
 const observers=[];let clock=0;
 const scene={isDisposed:false,onBeforeRenderObservable:{add(fn){observers.push(fn);return fn;},remove(fn){observers.splice(observers.indexOf(fn),1);}}};
 const records=new Map(),samples=[];
 const npc={
  async add(assetId,{instanceId}){
   const root={position:{x:0,y:0,z:0,copyFromFloats(x,y,z){this.x=x;this.y=y;this.z=z;}},rotationQuaternion:{y:0,w:1,copyFromFloats(x,y,z,w){this.y=y;this.w=w;}},computeWorldMatrix(){}};
   records.set(instanceId,{ready:true,entry:{geometry:{clipDurations:{Idle_Stand:9,Casual_Walk:4.2,Talk_with_Hands_Open:4,Stand_and_Chat:5,Agree_Gesture:13,Listening_Gesture:9}}},sampler:{sample(list){samples.push(list.map(row=>row.clipId).join('+'));}},encounter:{actor:root,asset:{transformNodes:[]}}});
  },
  get:id=>records.get(id),remove(){},setTransform(){},
 };
 const visuals=createCastVisuals({getWorld:()=>({scene}),loadRuntime:()=>npc,now:()=>clock});
 const step=(seconds,dt=.05)=>{for(let t=0;t<seconds;t+=dt){clock+=dt*1000;for(const fn of observers.slice())fn();}};
 return {scene,visuals,step,samples,records};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('a roaming actor strolls within its radius and plays the walk',async()=>{
 const h=harness(),v=h.visuals(h.scene,'innkeeper',{id:'innkeeper'});
 v.place(10,0,10,0);await settle();await settle();
 v.roam({radius:2,free:()=>true,heightAt:()=>0,player:()=>({x:100,y:0,z:100})});
 let moved=0,far=0;for(let i=0;i<60;i++){h.step(1);const p=v.position;moved=Math.max(moved,Math.hypot(p.x-10,p.z-10));far=Math.max(far,Math.hypot(p.x-10,p.z-10));}
 assert.ok(moved>.3,'it walked somewhere');assert.ok(far<=2.05,'and stayed near home');
 assert.ok(h.samples.some(s=>s.includes('Casual_Walk')),'with the walk clip');
 assert.ok(h.samples.some(s=>/Stand_and_Chat|Agree_Gesture|Listening_Gesture/.test(s)),'and an idle fidget now and then');
});
test('the player close by stops the stroll; a conversation turns the body',async()=>{
 const h=harness(),v=h.visuals(h.scene,'innkeeper',{id:'innkeeper'});
 v.place(0,0,0,0);await settle();await settle();
 const player={x:2,y:0,z:0};
 v.roam({radius:2,free:()=>true,heightAt:()=>0,player:()=>player});
 h.step(20);const a=v.position;h.step(5);const b=v.position;
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-6,'stands still while the player is near');
 v.talk(true,()=>player);h.step(2);
 const record=[...h.records.values()][0],q=record.encounter.actor.rotationQuaternion,yaw=2*Math.atan2(q.y,q.w);
 assert.ok(Math.abs(yaw-Math.PI/2)<.1,'faces the player (+x)');
 assert.match(h.samples.at(-1),/Talk_with_Hands_Open|Listening_Gesture/);
});
