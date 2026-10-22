import test from 'node:test';
import assert from 'node:assert/strict';
import { HealingPotion } from '../src/healing-potion.js';
import { BossEncounter } from '../src/boss-encounter.js';

test('one potion restores 40 on each of four one-second ticks, at different frame rates',()=>{
 for(const dt of [1/144,1/60,.1,1,4]){
   const potion=new HealingPotion();let hp=100;const heals=[];
   assert.equal(potion.use(hp,500),true);assert.equal(potion.remaining,2);
   assert.deepEqual(potion.update(0,hp,500),{hp:100,heals:[]});
   for(let time=0;time<4-1e-7;time+=dt){const result=potion.update(dt,hp,500);hp=result.hp;heals.push(...result.heals);}
   assert.equal(hp,260);assert.deepEqual(heals,[40,40,40,40]);assert.equal(potion.active,false);
   assert.deepEqual(potion.update(100,hp,500),{hp:260,heals:[]});
 }
});
test('three uses total, rapid duplicate presses do not consume another use, reset refills',()=>{
 const potion=new HealingPotion();
 for(let i=0;i<3;i++){
   assert.equal(potion.use(100,500),true);assert.equal(potion.use(100,500),false);assert.equal(potion.remaining,2-i);
   potion.update(4,100,500);
 }
 assert.equal(potion.use(100,500),false);potion.reset();assert.equal(potion.remaining,3);assert.equal(potion.active,false);
});
test('healing respects max HP and full-health/dead players cannot consume potions',()=>{
 const potion=new HealingPotion();
 assert.equal(potion.use(500,500),false);assert.equal(potion.use(0,500),false);assert.equal(potion.remaining,3);
 potion.use(450,500);assert.deepEqual(potion.update(4,450,500),{hp:500,heals:[40,10]});
});
test('death cancels pending healing and a paused game does not advance healing',()=>{
 const potion=new HealingPotion();potion.use(100,500);potion.update(.9,100,500);
 assert.deepEqual(potion.update(0,100,500),{hp:100,heals:[]});
 assert.deepEqual(potion.update(.2,0,500),{hp:0,heals:[]});assert.equal(potion.active,false);
 assert.deepEqual(potion.update(10,0,500),{hp:0,heals:[]});
});
test('encounter forbids potion use while captured/loading and clears the effect on exit',()=>{
 const b=new BossEncounter({},()=>{});b.playerHp=100;
 assert.equal(b.usePotion(),false);b.active=true;b.loading=true;assert.equal(b.usePotion(),false);
 b.loading=false;b.grab.phase='holding';assert.equal(b.usePotion(),false);assert.equal(b.potions.remaining,3);
 b.grab.phase=null;assert.equal(b.usePotion(),true);assert.equal(b.potions.remaining,2);
 b.hide();assert.equal(b.potions.active,false);assert.equal(b.canUsePotion,false);
});
test('death restart restores HP and all three potions, removes the boss and pending damage',()=>{
 let enabled=true;const b=new BossEncounter({},()=>{});b.active=true;b.playerHp=100;
 b.actor={setEnabled:value=>enabled=value};b.ring={isVisible:true};b.usePotion();b.playerHp=0;
 b.pendingEvents=[{type:'attack'}];b.gate.pending=[{damage:300}];b.playerInvulnerable=1;
 b.resetBattle();assert.equal(b.active,false);assert.equal(enabled,false);assert.equal(b.ring.isVisible,false);
 assert.equal(b.playerHp,500);assert.equal(b.playerInvulnerable,0);assert.equal(b.potions.remaining,3);assert.equal(b.potions.active,false);
 assert.equal(b.pendingEvents.length,0);assert.equal(b.gate.pending.length,0);assert.equal(b.canUsePotion,false);
});
