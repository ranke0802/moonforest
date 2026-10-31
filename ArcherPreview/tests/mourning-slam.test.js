import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {MourningSlamAdvance} from '../src/mourning-slam.js';
import {MOURNING_SIZE} from '../src/elena-spec.js';
function fixture(){
 const brain={serial:1,hp:1800,mode:'attack',spell:{motion:'cast_slam'},time:0,stagger:0,cancelCast(){this.mode='idle';this.serial++;}},state={blocked:false,resets:0};
 const enemy={brain,active:true,actor:{position:new Vector3(29,6,-25.5),rotation:{y:0}},playerAlive:true,radius:MOURNING_SIZE.radius,home:{x:29,z:-25.5},pendingEvents:[],world:{terrain:{heightAt:()=>6}},movementNavigation:{free:p=>!state.blocked||p.z<=-25.5,segmentClear:(_a,b)=>!state.blocked||b.z<=-25.5},spell:{reset(){state.resets++;}}};
 return {enemy,player:{position:new Vector3(29,6,-20)},state,advance:new MourningSlamAdvance()};
}
test('slam step locks its warned endpoint, advances before impact, and resets for another cast',()=>{
 const {enemy,player,advance}=fixture();advance.update(enemy,player);const landing=advance.target.clone(),start=enemy.actor.position.clone();assert.ok(Math.abs(landing.z-start.z-.9)<1e-6);
 player.position.x=40;
 for(const time of [.15,.4,.8,1,1.65,3]){enemy.brain.time=time;advance.update(enemy,player);assert.ok(advance.target.equals(landing));assert.ok(enemy.actor.position.z>=start.z&&enemy.actor.position.z<=landing.z+1e-6);}
 assert.ok(enemy.actor.position.equals(landing));assert.equal(enemy.pendingEvents.length,0,'movement itself never adds damage');
 enemy.brain.mode='move';advance.update(enemy,player);assert.equal(advance.serial,null);
});
test('a wall gives an in-place slam; a newly blocking wall cancels the old warning without moving through it',()=>{
 let f=fixture();f.state.blocked=true;f.advance.update(f.enemy,f.player);f.enemy.brain.time=1.2;f.advance.update(f.enemy,f.player);assert.equal(f.advance.distance,0);assert.equal(f.enemy.brain.mode,'attack');assert.ok(f.enemy.actor.position.equals(new Vector3(29,6,-25.5)));
 f=fixture();f.advance.update(f.enemy,f.player);f.enemy.brain.time=.5;f.advance.update(f.enemy,f.player);const safe=f.enemy.actor.position.clone();f.state.blocked=true;f.enemy.pendingEvents.push({kind:'ground'});f.enemy.brain.time=1;f.advance.update(f.enemy,f.player);
 assert.equal(f.enemy.brain.mode,'idle');assert.equal(f.enemy.pendingEvents.length,0);assert.equal(f.state.resets,1);assert.ok(f.enemy.actor.position.equals(safe));assert.equal(f.advance.serial,null);
});
test('ordinary cast, death, stagger, hidden actor and close player do not get a forward lunge',()=>{
 for(const setup of [f=>f.enemy.brain.spell.motion='cast',f=>f.enemy.brain.hp=0,f=>f.enemy.brain.stagger=.3,f=>f.enemy.active=false,f=>f.player.position.copyFrom(f.enemy.actor.position)]){
  const f=fixture();setup(f);const start=f.enemy.actor.position.clone();f.enemy.brain.time=1.1;f.advance.update(f.enemy,f.player);assert.ok(f.enemy.actor.position.equals(start));
 }
});
