import test from 'node:test';
import assert from 'node:assert/strict';
import {PassiveHealthRegen,PASSIVE_HEALTH_REGEN} from '../src/passive-health-regen.js';
import {PlayerCombat} from '../src/player-combat.js';
import {createDamageNumbers} from '../src/damage-numbers.js';
import {playerDimensions} from '../src/player-dimensions.js';
import {Vector3} from '@babylonjs/core';
import {parseHTML} from 'linkedom';

test('passive HP pulses only after two active seconds and clamp to the missing HP',()=>{
  const regen=new PassiveHealthRegen();assert.deepEqual(PASSIVE_HEALTH_REGEN,{amount:5,interval:2});
  for(let frame=0;frame<119;frame++)assert.equal(regen.update(1/60,450,500),0);
  assert.equal(regen.update(1/60,450,500),5);assert.equal(regen.elapsed,0);
  assert.equal(regen.update(1.99,499,500),0);assert.equal(regen.update(.01,499,500),1);
});

test('full HP does not bank recovery time for a later hit',()=>{
  const regen=new PassiveHealthRegen();assert.equal(regen.update(1.9,450,500),0);
  assert.equal(regen.update(600,500,500),0);assert.equal(regen.elapsed,0);
  assert.equal(regen.update(.1,400,500),0);
});

test('death, inactive loading/pause and a new life reset the clock',()=>{
  const regen=new PassiveHealthRegen();
  for(const [hp,active]of [[0,true],[450,false]]){
    assert.equal(regen.update(1.9,450,500),0);assert.equal(regen.update(600,hp,500,active),0);
    assert.equal(regen.elapsed,0);assert.equal(regen.update(.1,450,500),0);regen.reset();
  }
  regen.update(1.9,450,500);regen.reset();assert.equal(regen.update(.1,450,500),0);
});

test('long frames never replay missed pulses or leave catch-up debt',()=>{
  const regen=new PassiveHealthRegen();assert.equal(regen.update(600,300,500),5);
  assert.equal(regen.elapsed,0);assert.equal(regen.update(.1,305,500),0);
  for(const dt of [NaN,Infinity,-1,0])assert.equal(regen.update(dt,305,500),0);
});

test('frame fractions preserve the exact two-second cadence at non-divisor frame rates',()=>{
  const regen=new PassiveHealthRegen();let hp=300,pulses=0;
  for(let frame=0;frame<200;frame++){const gain=regen.update(.09,hp,500);hp+=gain;if(gain)pulses++;}
  assert.equal(pulses,9,'18 active seconds produce nine pulses even when a frame crosses the boundary');assert.equal(hp,345);assert.ok(regen.elapsed<1e-8);
});

test('large active gaps retain only a fractional phase, while pause/death/full still discard all debt',()=>{
  const regen=new PassiveHealthRegen();assert.equal(regen.update(600.5,300,500),5);assert.equal(regen.elapsed,.5);
  assert.equal(regen.update(1.4,305,500),0);assert.equal(regen.update(.1,305,500),5);
  for(const [hp,active]of [[0,true],[500,true],[305,false]]){regen.update(1.9,305,500);assert.equal(regen.update(600.5,hp,500,active),0);assert.equal(regen.elapsed,0);}
});

test('actual HP owner uses the potion floating style and exact existing player feedback anchor',t=>{
  const {document}=parseHTML('<html><body><div id="numbers"></div></body></html>'),previous=globalThis.document;globalThis.document=document;t.after(()=>{globalThis.document=previous;});
  const combat=new PlayerCombat(),player={position:new Vector3(2,3,4)},host=document.getElementById('numbers'),numbers=createDamageNumbers(null,host),positions=[];
  const show=(...args)=>{positions.push(args);numbers.show(...args);},projection={project:p=>({visible:true,x:100+p.x,y:200-p.y})};
  combat.hp=400;assert.equal(combat.recover(1,player,show),0);assert.equal(host.children.length,0);
  assert.equal(combat.recover(1,player,show),5);assert.equal(combat.hp,405);numbers.update(0,projection);
  const passive=host.lastElementChild,transform=passive.style.transform;
  assert.equal(passive.className,'damage-number heal');assert.equal(passive.textContent,'+5');
  assert.deepEqual(positions[0][0].asArray(),[2,3+playerDimensions(player).feedbackHeight,4]);
  assert.equal(combat.potions.use(combat.hp,combat.maxHp),true);combat.update(1,player,show);numbers.update(0,projection);
  assert.equal(host.lastElementChild.className,passive.className);assert.equal(host.lastElementChild.textContent,'+40');assert.equal(host.lastElementChild.style.transform,transform);
  assert.deepEqual(positions[1][0].asArray(),positions[0][0].asArray());numbers.dispose();
});

test('real HP owner cannot heal dead/full/inactive lives or carry a pre-travel pulse into the next life',()=>{
  const combat=new PlayerCombat(),player={position:Vector3.Zero()},events=[],show=(...args)=>events.push(args);
  combat.hp=499;assert.equal(combat.recover(2,player,show),1);assert.equal(combat.hp,500);assert.equal(events[0][1],'+1');
  assert.equal(combat.recover(600,player,show),0);combat.hp=400;combat.recover(1.9,player,show);
  assert.equal(combat.recover(600,player,show,false),0);assert.equal(combat.recover(.1,player,show),0);
  combat.hp=0;assert.equal(combat.recover(600,player,show),0);assert.equal(combat.hp,0);
  combat.reset();combat.hp=400;assert.equal(combat.recover(.1,player,show),0);assert.equal(events.length,1);
});
