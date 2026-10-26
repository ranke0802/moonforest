import test from 'node:test';
import assert from 'node:assert/strict';
import {GoldLoot} from '../src/gold-loot.js';
import {EnemyDeath} from '../src/enemy-death.js';

test('deaths fade for exactly five seconds and award once until reused',()=>{
  const death=new EnemyDeath();assert.equal(death.opacity,1);
  assert.equal(death.advance(1),true);assert.equal(death.advance(1.5),false);assert.equal(death.opacity,.5);
  death.advance(2.49);assert.equal(death.finished,false);death.advance(.01);assert.equal(death.finished,true);assert.equal(death.opacity,0);
  assert.equal(death.advance(1),false);death.reset();assert.equal(death.opacity,1);assert.equal(death.advance(0),true);
});
test('10G goblin / 100G bear loot is collected nearby once, persisted, and survives battle reset',()=>{
  const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},balances=[];
  const loot=new GoldLoot({storage,onBalance:value=>balances.push(value)});
  loot.drop('goblin',{x:0,z:0});loot.drop('bear',{x:4,z:0});
  assert.equal(loot.update(.59,{x:0,z:0}).length,0);
  assert.equal(loot.update(.01,{x:0,z:0}).length,1);assert.equal(loot.balance,10);
  assert.equal(loot.update(2,{x:0,z:0}).length,0);
  assert.equal(loot.update(.01,{x:4,z:0},false).length,0,'dead/captured cannot collect');
  assert.equal(loot.update(.01,{x:4,z:0},true,()=>false).length,0,'no collection through walls');
  assert.equal(loot.update(.01,{x:4,z:0}).length,1);assert.equal(loot.balance,110);
  loot.drop('bear',{x:0,z:0});loot.clearDrops();assert.equal(loot.balance,110);assert.equal(loot.drops.length,0);
  assert.equal(new GoldLoot({storage}).balance,110);assert.deepEqual(balances,[0,10,110]);
});
test('coincident loot and repeated summons keep all gold while bounding visual piles',()=>{
  const loot=new GoldLoot();loot.drop('goblin',{x:0,z:0});loot.drop('bear',{x:0,z:0});assert.equal(loot.drops[0].amount,110);
  for(let i=1;i<=100;i++)loot.drop('goblin',{x:i*2,z:0});
  assert.equal(loot.drops.length,64);assert.equal(loot.drops.reduce((s,d)=>s+d.amount,0),1110);
});
test('unavailable or invalid saved gold does not break gameplay',()=>{
  for(const value of ['NaN','-10','4.5','Infinity'])assert.equal(new GoldLoot({storage:{getItem:()=>value}}).balance,0);
  const loot=new GoldLoot({storage:{getItem(){throw Error();},setItem(){throw Error();}}});
  loot.drop('goblin',{x:0,z:0});loot.update(1,{x:0,z:0});assert.equal(loot.balance,10);
});
