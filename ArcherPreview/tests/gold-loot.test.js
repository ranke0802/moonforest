import test from 'node:test';
import assert from 'node:assert/strict';
import {GoldLoot,GOLD_LEDGER_KEY} from '../src/gold-loot.js';
import {EnemyDeath} from '../src/enemy-death.js';

test('deaths fade for exactly ten seconds and award once until reused',()=>{
  const death=new EnemyDeath();assert.equal(death.opacity,1);
  assert.equal(death.advance(2),true);assert.equal(death.advance(3),false);assert.equal(death.opacity,.5);
  death.advance(4.99);assert.equal(death.finished,false);death.advance(.01);assert.equal(death.finished,true);assert.equal(death.opacity,0);
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

test('new drops choose a reachable landing point and fall back safely when blocked',()=>{
 const loot=new GoldLoot(),a=loot.drop('bear',{x:2,y:1,z:3},{canLand:()=>true,heightAt:()=>2});assert.equal(Math.hypot(a.position.x-2,a.position.z-3).toFixed(2),'0.70');assert.equal(a.position.y,2.04);assert.deepEqual(a.origin,{x:2,y:1.04,z:3});
 const b=loot.drop('goblin',{x:9,y:0,z:10},{canLand:()=>false});assert.deepEqual(b.position,b.origin);assert.equal(loot.update(.6,{x:b.position.x,z:b.position.z}).length,1);assert.equal(loot.balance,10);
});

test('a failed pickup leaves the ground pile and retries once while standing on it',()=>{
 const rows=new Map(),notices=[],balances=[],origin={x:0,z:0};
 let writable=true,writes=0;
 const storage={getItem:k=>rows.get(k)??null,setItem(k,v){
  if(k===GOLD_LEDGER_KEY){writes++;if(!writable)throw Error('quota');}
  rows.set(k,v);
 }};
 const gold=new GoldLoot({storage,onPickup:n=>notices.push(n),onBalance:n=>balances.push(n)});
 gold.creditCumulative('base',7);
 const pile=gold.drop('goblin',origin);
 writable=false;
 assert.deepEqual(gold.update(1,origin),[]);assert.equal(gold.balance,7);assert.deepEqual(gold.drops,[pile]);
 for(let i=0;i<600;i++)gold.update(1/60,origin);
 assert.equal(writes,3,'initial credit, failed pickup, one automatic retry');
 assert.deepEqual(notices,[]);assert.deepEqual(balances,[0,7]);assert.equal(new GoldLoot({storage}).balance,7);
 writable=true;gold.update(0,{x:9,z:0});assert.deepEqual(gold.update(0,origin),[pile]);
 assert.deepEqual(gold.update(1,origin),[]);assert.equal(new GoldLoot({storage}).balance,17);
 assert.deepEqual(notices,[10]);assert.deepEqual(balances,[0,7,17]);
});

test('a retry verifies its written pickup once, while another tab’s ledger remains authoritative',()=>{
 const rows=new Map(),notices=[],origin={x:0,z:0};let readbackFails=false,failNextRead=false,writes=0;
 const storage={getItem(k){if(k===GOLD_LEDGER_KEY&&failNextRead){failNextRead=false;throw Error('temporarily unreadable');}return rows.get(k)??null;},
  setItem(k,v){rows.set(k,v);if(k===GOLD_LEDGER_KEY){writes++;failNextRead=readbackFails;}}};
 const gold=new GoldLoot({storage,onPickup:n=>notices.push(n)});
 const pile=gold.drop('goblin',origin);readbackFails=true;
 assert.deepEqual(gold.update(1,origin),[]);assert.equal(gold.balance,0);assert.deepEqual(notices,[]);
 readbackFails=false;assert.deepEqual(gold.update(2,origin),[pile]);
 assert.equal(writes,1);assert.deepEqual(notices,[10]);assert.equal(new GoldLoot({storage}).balance,10);
 const other=new GoldLoot({storage});other.creditCumulative('quest',25);
 const raw=rows.get(GOLD_LEDGER_KEY);gold.drop('bear',origin);
 assert.deepEqual(gold.update(1,origin),[]);assert.equal(gold.saveState,'conflict');assert.equal(gold.drops.length,1);
 assert.deepEqual(notices,[10]);assert.equal(rows.get(GOLD_LEDGER_KEY),raw);assert.equal(writes,2);
});
