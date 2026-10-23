import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GoblinBrain,GOBLIN_MOTIONS,goblinDamage } from '../src/goblin-spec.js';
const catalog=JSON.parse(readFileSync(new URL('../assets/goblin/config.json',import.meta.url),'utf8')).catalog;
const durations=Object.fromEntries(catalog.map(c=>[c.name,c.duration]));
test('all twelve authored goblin clips are mapped to gameplay roles',()=>{
 assert.equal(catalog.length,12);assert.deepEqual(GOBLIN_MOTIONS.map(x=>x.name).sort(),catalog.map(x=>x.name).sort());
 for(const c of catalog){assert.equal(c.rootTrack.length,c.frames);assert.equal(c.groundTrack.length,c.frames);assert.ok(c.duration>0);}
});
test('goblin damage covers each integer 15 through 33, excluding out-of-range results',()=>{
 assert.deepEqual(Array.from({length:19},(_,i)=>goblinDamage(()=>(i+.5)/19)),Array.from({length:19},(_,i)=>i+15));
 assert.equal(goblinDamage(()=>0),15);assert.equal(goblinDamage(()=>1),33);
});
test('goblin quickly chases, uses both dodges while moving, and taunts only at long range',()=>{
 const b=new GoblinBrain(durations,()=>.1);b.evadeCooldown=100;b.tauntCooldown=100;
 assert.equal(b.update(.1,8).speed,5.2);
 for(const expected of ['Dodge_Roll','Parkour_Vault_with_Roll']){
  b.start('Running','move');b.evadeCooldown=0;b.decision=0;b.update(.01,5);assert.equal(b.state,expected);assert.equal(b.defense,'evade');
 }
 b.start('Running','move');b.tauntCooldown=0;b.evadeCooldown=10;b.decision=0;b.update(.01,8);assert.equal(b.state,'Gangnam_Groove');
 b.update(.1,3);assert.notEqual(b.mode,'taunt');
});
test('close goblin attacks, guard, knockdown, reverse recovery and death use source clips',()=>{
 const b=new GoblinBrain(durations,()=>.5),events=[];
 for(let i=0;i<1500;i++)events.push(...b.update(.02,1.2).events);
 for(const n of ['Right_Jab_from_Guard','Sword_Judgment','Sword_Parry_Backward_2'])assert.ok(b.visited.has(n),n);
 assert.ok(events.length>3);assert.ok(events.every(e=>e.damage>=15&&e.damage<=33));
 b.start('Walking','idle');b.hit({damage:20,heavy:true});assert.equal(b.mode,'down');
 const hp=b.hp;b.hit({damage:20});assert.equal(b.hp,hp-20);assert.equal(b.mode,'down');
 for(let i=0;i<140;i++)b.update(.02,8);assert.equal(b.mode,'recover');
 b.hit({damage:20});assert.equal(b.mode,'recover');
 for(let i=0;i<100;i++)b.update(.02,8);assert.notEqual(b.mode,'recover');
 b.hit({damage:1000});assert.equal(b.state,'Fall_Dead_from_Abdominal_Injury');assert.equal(b.hp,0);
 assert.equal(b.update(10,1).events.length,0);
});

test('goblin closes inside player sword reach before beginning its close attack',()=>{
 const b=new GoblinBrain(durations,()=>.5);b.wait=0;b.evadeCooldown=100;b.tauntCooldown=100;
 assert.ok(b.update(.016,1.45).speed>0);assert.equal(b.mode,'move');
 b.update(.016,1.18);assert.equal(b.mode,'attack');
});
test('all living reactions can be interrupted by shield stun and blocked attacks recover in one second',()=>{
 const b=new GoblinBrain(durations,()=>.5);b.start('Sword_Judgment','attack');b.hit({damage:10,stun:1.5});
 assert.equal(b.stagger,1.5);assert.equal(b.flashDuration,.75);assert.equal(b.mode,'hit');
 b.update(1.4,1);assert.ok(b.stagger>0);assert.equal(b.update(.11,1).events.length,0);assert.equal(b.stagger,0);
 b.start('Right_Jab_from_Guard','attack');b.parry();assert.equal(b.stagger,1);b.update(1,1);assert.equal(b.mode,'idle');
});
