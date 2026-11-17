// Tekken-style recoverable health: a part of each hit comes back after a pause,
// healing from elsewhere fills that part first, and the trail drains away.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVitality} from '../src/v03/vitality.js';
const run=(life,state,seconds,{alive=true}={})=>{let owed=0;for(let t=0;t<seconds;t+=1/60){owed+=life.step(1/60,state.hp,state.max,alive);const w=Math.floor(owed);if(w>0){owed-=w;state.hp+=w;life.applied(w);}}};
test('a hit leaves a recoverable part that flows back after the delay',()=>{
 const life=createVitality({ratio:.4,delay:2,rate:.2}),s={hp:500,max:500};life.step(1/60,s.hp,s.max);
 s.hp=400;life.step(1/60,s.hp,s.max);
 assert.equal(life.recoverable,40);let v=life.view();assert.equal(v.hp,.8);assert.equal(v.recoverable,.88);assert.equal(v.trail,1,'the trail shows the whole loss');
 run(life,s,1.5);assert.equal(s.hp,400,'nothing comes back during the pause');assert.ok(life.view().trail<1,'the trail drains');
 run(life,s,4);assert.ok(s.hp>=439&&s.hp<=440,String(s.hp));assert.ok(life.recoverable<1);
});
test('a new hit restarts the pause; healing fills the recoverable part first; death clears it',()=>{
 const life=createVitality({ratio:.5,delay:1,rate:.5}),s={hp:300,max:300};life.step(1/60,s.hp,s.max);
 s.hp=200;life.step(1/60,s.hp,s.max);run(life,s,.8);s.hp=150;life.step(1/60,s.hp,s.max);
 assert.equal(life.recoverable,75);run(life,s,.8);assert.equal(s.hp,150,'the second hit restarted the pause');
 s.hp=180;life.step(1/60,s.hp,s.max);assert.equal(life.recoverable,45,'a potion fills the recoverable part first');
 s.hp=0;life.step(1/60,0,s.max,false);assert.equal(life.recoverable,0);run(life,s,3,{alive:false});assert.equal(s.hp,0,'the dead do not recover');
});
