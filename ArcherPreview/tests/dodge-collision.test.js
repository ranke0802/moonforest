import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainDodge } from '../src/dodge-collision.js';
import { dodgeSeparation } from '../src/enemy-collision.js';
const enemy=(x,z,radius=.7,mode='idle')=>({active:true,actor:{position:{x,z}},radius,brain:{hp:100,mode}});
const near=(a,b,t=.006)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function roll({enemies=[],obstacles=[],from={x:0,z:0},delta={x:0,z:3},fps=60}={}){
 const p={...from},path=[{...p}],before=enemies.map(e=>({...e.actor.position}));
 for(let i=0;i<fps;i++){
  const start={...p};p.x+=delta.x/fps;p.z+=delta.z/fps;
  constrainDodge(p,start,{obstacles},enemies);path.push({...p});
  assert.ok(Math.hypot(p.x-start.x,p.z-start.z)<=Math.hypot(delta.x,delta.z)/fps+1e-8,'sliding cannot add roll distance');
  for(const e of enemies)if(e.brain.hp>0&&e.brain.mode==='idle'){
   assert.ok(Math.hypot(p.x-e.actor.position.x,p.z-e.actor.position.z)>=Math.min(dodgeSeparation(e),Math.hypot(start.x-e.actor.position.x,start.z-e.actor.position.z))-1e-7,'enemy overlap must not deepen');
  }
  for(const o of obstacles)assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=o.radius+.32-1e-7,'tree remains solid');
 }
 assert.deepEqual(enemies.map(e=>e.actor.position),before,'rolling must never push enemies');
 return {p,path};
}

test('a head-on roll skirts a stationary bear or goblin without passing through or moving it',()=>{
 for(const radius of [.34,.7]){
  const monster=enemy(0,1.5,radius);
  const {p}=roll({enemies:[monster]});
  assert.ok(p.z>2,'the player escapes past the shoulder');
  assert.ok(p.x>=dodgeSeparation(monster),'the path passes outside the body');
 }
});

test('oblique contacts preserve the requested side of escape',()=>{
 for(const x of [-.22,.22]){
  const {p}=roll({enemies:[enemy(x,1.5,.34)]});
  assert.ok(p.x*x<0);assert.ok(p.z>2.5);
 }
});

test('the gap between two goblins is usable instead of blocked by their old wide volumes',()=>{
 const {p}=roll({enemies:[enemy(-.7,1.3,.34),enemy(.7,1.3,.34)]});
 near(p.x,0);near(p.z,3);
});

test('head-on assistance chooses the open shoulder when a tree blocks the other',()=>{
 const {p}=roll({enemies:[enemy(0,1.5,.34)],obstacles:[{x:.45,z:.86,radius:.1}]});
 assert.ok(p.x<-.59);assert.ok(p.z>2);
});

test('sealed crowds and a wall behind enemies cannot be tunneled through',()=>{
 const line=Array.from({length:11},(_,i)=>enemy((i-5)*.8,1.5,.34));
 const {p}=roll({enemies:line});assert.ok(p.z<1.5);
 const wall=Array.from({length:11},(_,i)=>({x:(i-5)*.65,z:2,radius:.5}));
 const blocked=roll({enemies:[enemy(0,1,.34)],obstacles:wall}).p;
 assert.ok(blocked.z<1.3);
});

test('downed, recovering, dead and inactive enemies are passable; walls still block',()=>{
 for(const radius of [.34,.7])for(const mode of ['down','recover','dead']){
  const monster=enemy(0,1.5,radius,mode);
  near(roll({enemies:[monster]}).p.z,3);
  const {p}=roll({enemies:[monster],obstacles:[{x:0,z:3,radius:.5}],delta:{x:0,z:5}});
  assert.ok(p.z>2&&p.z<2.18);
 }
 const inactive=enemy(0,1.5);inactive.active=false;
 const dead=enemy(0,1.5);dead.brain.hp=0;
 for(const monster of [inactive,dead]){const p={x:0,z:3};constrainDodge(p,{x:0,z:0},{obstacles:[]},[monster]);near(p.z,3);}
});

test('existing overlaps can escape sideways or away without deepening; arena stays solid',()=>{
 const monster=enemy(0,.7);
 near(roll({enemies:[monster],delta:{x:0,z:-2}}).p.z,-2);
 const {p}=roll({enemies:[monster],delta:{x:0,z:2}});
 assert.ok(p.x>.5,'an already crowded player has a lateral escape');
 const edge=roll({from:{x:0,z:10},delta:{x:0,z:4}}).p;
 assert.ok(edge.z<=11);near(edge.z,11);
});

test('30/60 FPS and a single delayed frame produce the same detour',()=>{
 for(const radius of [.34,.7]){
  const ends=[1,30,60,120].map(fps=>roll({enemies:[enemy(0,1.5,radius)],fps}).p);
  for(const p of ends){near(p.x,ends[0].x,.025);near(p.z,ends[0].z,.025);}
 }
});
