import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombatTarget,TARGET_REACH,TARGET_FAR,TARGET_IDLE,CHAIN_HOLD} from '../src/v03/combat-target.js';
import {STARFALL_REACH_SCALE,strikeAimRange} from '../src/v03/strike-approach.js';

const foe=(id,x,z,hp=10)=>({id,active:true,brain:{hp},actor:{position:{x,y:0,z}}});
const me={x:0,y:0,z:0};

test('Starfall scales both acquisition ranges without extending a later guard or ordinary strike',()=>{
 const aim=createCombatTarget(),near=foe('near',1,0),tracked=foe('tracked',13.5,0);
 assert.equal(strikeAimRange(near),4);assert.equal(strikeAimRange(near,0,STARFALL_REACH_SCALE),6);
 near.meleeAimDistance=5;assert.equal(strikeAimRange(near),5);assert.equal(strikeAimRange(near,0,STARFALL_REACH_SCALE),7.5);
 aim.note('enemy',tracked);
 assert.equal(aim.aim(me,near,true,STARFALL_REACH_SCALE),tracked);
 assert.equal(aim.reach,13.5);assert.equal(aim.chainFoe,tracked);
 assert.equal(strikeAimRange(tracked,aim.reach,STARFALL_REACH_SCALE),13.5);
 assert.equal(aim.aim(me,near,false),near);assert.equal(aim.reach,0);
 assert.equal(aim.aim(me,near,true),near);
 // The foe chosen at the first swing moved, so only the extended chain can follow it.
 near.actor.position.x=13.49;tracked.actor.position.x=2;
 assert.equal(aim.aim(me,tracked,true,STARFALL_REACH_SCALE),near);
 near.actor.position.x=13.51;
 assert.equal(aim.aim(me,tracked,true,STARFALL_REACH_SCALE),tracked);
});

test('combat target: the foe that hit me or that I hit; let go when dead, far or idle',()=>{
 const target=createCombatTarget(),a=foe('a',2,0),b=foe('b',1,0);
 target.update(.016,'idle',me,'plains');
 assert.equal(target.foe,null);assert.equal(target.aim(me,b,false),b,'no target yet: the nearest foe, as before');assert.equal(target.reach,0);
 target.note('player',a);assert.equal(target.foe,a,'its attack reached me');
 target.note('enemy',b);assert.equal(target.foe,b,'my hit landed on another one');
 target.note('heal',a);target.note('evade',a);assert.equal(target.foe,b,'other feedback changes nothing');
 target.note('block',a);assert.equal(target.foe,a,'a blocked attack counts as being attacked');
 // Without a direction the action turns to the target even when another foe is nearer.
 assert.equal(target.aim(me,b,false),a);assert.equal(target.reach,TARGET_REACH);
 a.actor.position.x=TARGET_REACH+1;assert.equal(target.aim(me,b,false),b,'beyond reach: the nearest again');assert.equal(target.reach,0);
 a.actor.position.x=TARGET_FAR+1;target.update(.016,'idle',me,'plains');assert.equal(target.foe,null,'too far: let go');
 target.note('enemy',a);a.brain.hp=0;assert.equal(target.foe,null,'dead: let go');a.brain.hp=10;a.actor.position.x=2;
 target.note('enemy',a);for(let t=0;t<TARGET_IDLE+.5;t+=.25)target.update(.25,'idle',me,'plains');assert.equal(target.foe,null,'nothing landed for a while: let go');
 target.note('enemy',a);target.update(.016,'idle',me,'village');assert.equal(target.foe,null,'a new map drops it');
});

test('combat target: a chain keeps the foe of its first swing',()=>{
 const target=createCombatTarget(),a=foe('a',3,0),b=foe('b',1,0);
 target.update(.016,'idle',me,'plains');
 // First swing with no target: the nearest foe starts the chain.
 assert.equal(target.aim(me,b),b);assert.equal(target.chainFoe,b);
 target.update(.3,'slash',me,'plains');
 // The other one bites in between: the chain stays on its foe.
 target.note('player',a);assert.equal(target.foe,null);assert.equal(target.chainFoe,b);
 target.note('enemy',b);assert.equal(target.foe,b);
 // Second and third swing: a is nearer now, the chain still faces b.
 b.actor.position.x=4;a.actor.position.x=1;
 assert.equal(target.aim(me,a),b);target.update(.3,'attack',me,'plains');
 assert.equal(target.aim(me,a),b);target.update(.3,'judgment',me,'plains');
 // A short pause, then the heavy one: still the same foe.
 target.update(CHAIN_HOLD-.2,'idle',me,'plains');assert.equal(target.chainFoe,b);assert.equal(target.aim(me,a),b);
 // The guard only turns: it neither starts nor ends a chain.
 target.update(.1,'judgment',me,'plains');assert.equal(target.aim(me,a,false),b);assert.equal(target.chainFoe,b);
 // The chain ends after the pause; the target itself stays until it is idle.
 target.update(CHAIN_HOLD+.1,'idle',me,'plains');assert.equal(target.chainFoe,null);assert.equal(target.foe,b);
 // A chain whose foe dies is over at once.
 assert.equal(target.aim(me,a),b);b.brain.hp=0;assert.equal(target.chainFoe,null);assert.equal(target.aim(me,a),a);assert.equal(target.chainFoe,a);
 target.reset();assert.deepEqual(target.inspect(),{target:null,chain:null,idle:0});
});
