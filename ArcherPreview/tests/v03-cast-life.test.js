// Living cast (2026-11-19): idle fidgets, strolling around home, stopping for
// the player, and turning the whole body toward a conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCastVisuals} from '../src/v03/cast-models.js';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {AmbientView} from '../src/ambient-view.js';

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

test('off-camera village walk keeps time and renders the current foot phase on the first frame back',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine),cam=new FreeCamera('test',new Vector3(0,1,-18),scene);
 t.after(()=>{scene.dispose();engine.dispose();});
 const random=Math.random;Math.random=()=>.1;t.after(()=>{Math.random=random;});
 const look=front=>cam.setTarget(new Vector3(0,1,front?0:-40)),rows=[];
 for(const optimized of [false,true]){
  const h=harness();h.scene.activeCamera=cam;
  // Missing light information takes the old, conservative distance-only path.
  h.scene.shadowsEnabled=optimized?false:true;
  const v=h.visuals(h.scene,'innkeeper');v.place(0,0,0,0);await v.settled;
  let moves=0;v.roam({radius:40,free:()=>true,heightAt:()=>{moves++;return 0;}});
  const frame=()=>{cam.getViewMatrix();cam.getProjectionMatrix();h.step(.016667,.016667);};
  look(true);for(let i=0;i<1000&&v.position.z<.7;i++)frame();
  assert.ok(v.position.z>=.7);
  const start={...v.position},data=[];
  for(let second=0;second<10;second++){
   look(second<2||second>=7);
   const prev=moves,samples=h.samples.length;
   for(let i=0;i<60;i++){
    frame();
    if(second===7&&i===0&&optimized){
     assert.ok(h.samples.length>samples);assert.match(h.samples.at(-1),/Casual_Walk/);
     const root=[...h.records.values()][0].encounter.actor;
     assert.equal(root.position.z,v.position.z);
    }
   }
   data.push({logic:moves-prev,pose:h.samples.length-samples});
  }
  assert.ok(Math.abs(Math.hypot(v.position.x-start.x,v.position.z-start.z)-.95*10)<.06);
  rows.push(data);v.dispose();
 }
 assert.equal(rows[1][3].logic,2);assert.equal(rows[1][3].pose,0);
 assert.ok(rows[0][3].logic>15);t.diagnostic('castAB '+JSON.stringify(rows));
});

test('keep the moving pose when only its projected shadow could reach the view',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),cam=new FreeCamera('test',new Vector3(0,2,0),scene);
 try{
  cam.setTarget(new Vector3(0,2,10));
  const world={scene,lighting:{key:{direction:new Vector3(0,-1,0)}}},view=new AmbientView();
  view.prepare(world);assert.equal(view.hidden(15,2,5,2),true);
  world.lighting.key.direction.set(-1,-.05,0);view.prepare(world);
  assert.equal(view.hidden(15,2,5,2),false);
 }finally{scene.dispose();engine.dispose();}
});

test('a roaming actor strolls within its radius and plays the walk',async t=>{
 // Seeded: walks and fidgets are random draws, and an unlucky minute had no fidget (CI 2026-11-20).
 let seed=7;const random=Math.random;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);t.after(()=>{Math.random=random;});
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

test('a cast visual says when its model is on stage; a failed load settles too',async()=>{
 const h=harness(),v=h.visuals(h.scene,'innkeeper',{id:'innkeeper'});
 let done=false;v.settled.then(()=>{done=true;});
 await settle();assert.equal(done,false,'it waits for its place');
 v.place(1,0,1,0);await v.settled;assert.equal(done,true);assert.equal(h.records.size,1);
 const scene=h.scene,broken=createCastVisuals({getWorld:()=>({scene}),loadRuntime:()=>({async add(){throw new Error('offline');},get(){},remove(){},setTransform(){}}),fallback:()=>({place(){},dispose(){}})});
 const warn=console.warn;console.warn=()=>{};
 try{const lost=broken(scene,'innkeeper',{id:'lost'});lost.place(0,0,0,0);await lost.settled;lost.dispose?.();}finally{console.warn=warn;}
});
