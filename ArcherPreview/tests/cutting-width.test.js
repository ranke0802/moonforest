import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix} from '@babylonjs/core';
import {PlayerStrikeSampler,PLAYER_STRIKES} from '../src/player-strikes.js';
import {MeleeContactGate} from '../src/melee-collision.js';
import {GoblinBrain} from '../src/goblin-spec.js';
import {BossBrain} from '../src/boss-spec.js';

const sword={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Translation(0,1,1)};
const sample=(state,time,heading=0)=>new PlayerStrikeSampler().sample({state,actionId:1,clipTime:time},sword,null,true,heading);
const body=(x,z=1,y=.5)=>({points:[[x,y,z],[x,y+.6,z]],radius:.05});

test('both cutting passes hit several neighboring targets once, without extra forward or vertical reach',()=>{
 for(const [state,time] of [['slash',.5],['attack',1.3]]){
  const strike=sample(state,time),gates=[new MeleeContactGate(),new MeleeContactGate(),new MeleeContactGate()];
  for(const [i,x] of [-.32,0,.32].entries()){
   const contact={...strike,capsules:[body(x)]};
   assert.equal(gates[i].collect(contact).hits.length,1,`${state}/${x}`);
   assert.equal(gates[i].collect(contact).hits.length,0,'Each enemy is hit once per pass');
  }
  for(const capsule of [body(.55),body(0,1.4),body(0,1,2)]){
   assert.equal(new MeleeContactGate().collect({...strike,capsules:[capsule]}).hits.length,0);
  }
 }
});
test('thrust, heavy strike and recovery do not inherit the wider cutting sweep',()=>{
 for(const [state,time] of [['attack',.7],['judgment',1],['slash',1.2],['attack',2]]){
  assert.equal(new MeleeContactGate().collect({...sample(state,time),capsules:[body(.32)]}).hits.length,0);
 }
 const rotated=sample('slash',.5,Math.PI/2);
 assert.equal(new MeleeContactGate().collect({...rotated,capsules:[body(0,1.3)]}).hits.length,1);
 assert.equal(new MeleeContactGate().collect({...rotated,capsules:[body(.32)]}).hits.length,0);
});
test('normal hits stagger goblins for 0.3s, but never stagger idle, moving or attacking bosses',()=>{
 const durations={Walking:2,Running:2,Right_Jab_from_Guard:2,Sword_Parry_Backward_2:2,Block6:2,Left_Hook_from_Guard:2};
 for(const strike of [...PLAYER_STRIKES.slash,...PLAYER_STRIKES.attack]){
  const g=new GoblinBrain(durations);g.start('Right_Jab_from_Guard','attack');
  assert.ok(g.hit(strike));assert.equal(g.stagger,.3);assert.equal(g.mode,'hit');
  assert.equal(g.update(.29,1.2).events.length,0);assert.ok(g.stagger>0);
  assert.equal(g.update(.011,1.2).events.length,0);assert.equal(g.stagger,0);
  for(const [state,mode] of [['Block6','idle'],['Walking','move'],['Running','approach'],['Left_Hook_from_Guard','attack']]){
   const b=new BossBrain(durations);b.start(state,mode);b.time=.1;const serial=b.serial;
   assert.ok(b.hit(strike));assert.equal(b.stagger,0);assert.equal(b.state,state);assert.equal(b.time,.1);assert.equal(b.serial,serial);assert.ok(b.flash>0);assert.equal(b.hp,900-strike.damage);
  }
 }
});
