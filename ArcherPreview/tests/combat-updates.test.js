import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Vector3 } from '@babylonjs/core';
import { WarriorV2Controller } from '../src/warrior-v2.js';
import { BossBrain } from '../src/boss-spec.js';
import { BossEncounter } from '../src/boss-encounter.js';
import { PlayerStrikeSampler } from '../src/player-strikes.js';

const durations={idle:2,run:1,attack:3,slash:1.5,judgment:4,shieldPush:2.4,dodge:2.4666667};
test('updated defaults accelerate thrust/slash and dodge without changing the other clips',()=>{
 const c=new WarriorV2Controller({durations});
 assert.equal(c.playbackRate('attack'),1.8*1.6);assert.equal(c.playbackRate('slash'),1.8);
 assert.equal(c.playbackRate('dodge'),1.7);assert.equal(c.playbackRate('idle'),1);
 c.dodge();assert.equal(c.update(.1).rollTo,.17);
});
test('blocking judgment overrides super armor, cancels queued damage and recoils without HP loss',()=>{
 const c=new WarriorV2Controller({durations}),b=new BossEncounter({},()=>{},()=>{},(duration,options)=>c.hit(duration,options));
 b.actor={position:new Vector3(0,0,2)};b.player={position:Vector3.Zero()};
 c.startAttack('judgment');assert.equal(c.hit(),false);
 b.gate.pending=[{}];b.playerBlocked();
 assert.equal(c.action,null);assert.equal(c.staggerRemaining,1);assert.equal(b.playerHp,500);assert.equal(b.gate.pending.length,0);
 b.playerReaction.update(.2,b.player);assert.ok(b.player.position.z<-.27);
 assert.ok(b.playerReaction.flashRemaining>0);assert.equal(c.update(.99).staggered,true);assert.equal(c.update(.02).state,'idle');
});
test('boss block reaction lasts one second and never resumes the interrupted attack',()=>{
 const b=new BossBrain({Right_Jab_from_Guard:2,Block6:2});b.start('Right_Jab_from_Guard','attack');b.time=.2;
 b.parry();assert.equal(b.stagger,1);assert.equal(b.hp,900);assert.ok(b.flash>0);
 assert.equal(b.update(.99,2).events.length,0);assert.equal(b.mode,'attack');
 assert.equal(b.update(.02,2).events.length,0);assert.equal(b.mode,'idle');
});
test('only one-hand slash extends the blade contact length by ten percent',()=>{
 const node={computeWorldMatrix(){},getWorldMatrix:()=>Matrix.Identity()},sampler=new PlayerStrikeSampler();
 const length=(state,time)=>{const sample=sampler.sample({state,actionId:state,clipTime:time},node,null);return Vector3.Distance(...sample.blade.map(p=>Vector3.FromArray(p)));};
 assert.ok(Math.abs(length('slash',.5)/length('attack',.7)-1.1)<1e-9);
});
