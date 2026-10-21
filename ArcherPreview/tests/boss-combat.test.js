import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BossBrain,BOSS_MOTIONS,BOSS_ATTACKS } from '../src/boss-spec.js';
import { bladeTouchesCapsule,MeleeContactGate } from '../src/melee-collision.js';
import { NullEngine,Scene,TransformNode,Vector3 } from '@babylonjs/core';
import { PlayerStrikeSampler,shieldIntercepts } from '../src/player-strikes.js';
const asset=JSON.parse(readFileSync(new URL('../public/assets/guardian-bear.json',import.meta.url)));
const durations=Object.fromEntries(asset.catalog.map(c=>[c.name,c.duration]));
test('boss: all 20 source motions are assigned and reachable in actual encounter logic',()=>{
 assert.equal(BOSS_MOTIONS.length,20);assert.equal(BOSS_ATTACKS.length,14);
 assert.deepEqual(new Set(BOSS_MOTIONS.map(m=>m.name)),new Set(Object.keys(asset.animations)));
 const b=new BossBrain(durations,()=>.37);b.update(.1,7);b.update(.1,3);b.update(.1,2);
 for(let t=0;t<240;t+=.05)b.update(.05,2);
 b.hit({heavy:true});for(let t=0;t<11;t+=.05)b.update(.05,2);
 assert.equal(b.visited.size,20,[...b.visited].join(','));
});
test('boss: light hit pauses briefly, flashes boss, then resumes the same original motion',()=>{
 const b=new BossBrain(durations);b.start('Left_Hook_from_Guard','attack');b.time=.15;
 assert.ok(b.hit());assert.equal(b.state,'Left_Hook_from_Guard');assert.equal(b.hp,886);assert.ok(b.flash>0);
 b.update(.1,2);assert.equal(b.time,.15);b.update(.1,2);b.update(.05,2);assert.ok(b.time>.15);assert.equal(b.flash,0);
});
test('boss: heavy hit cancels attack, plays down then stand-up before resuming',()=>{
 const b=new BossBrain(durations);b.start('Axe_Spin_Attack','attack');b.time=.6;
 b.hit({heavy:true,damage:64});assert.equal(b.state,'Knock_Down_1');assert.equal(b.hp,836);
 assert.equal(b.hit({heavy:true}),false);
 b.update(durations.Knock_Down_1+.01,2);assert.equal(b.state,'Stand_Up3');
 b.update(durations.Stand_Up3+.01,2);assert.equal(b.mode,'idle');
});
test('boss: defeat stays down and attacks do not fire during knockdown or stagger',()=>{
 const b=new BossBrain(durations);b.hit({damage:900,heavy:true});for(let i=0;i<100;i++)assert.equal(b.update(.1,2).events.length,0);
 assert.equal(b.hp,0);assert.equal(b.state,'Knock_Down_1');assert.equal(b.time,durations.Knock_Down_1);
});
test('melee: actual blade contact required, miss at distance and sweep catches fast crossing',()=>{
 const capsule=[[0,.3,0],[0,1.7,0]];
 assert.equal(bladeTouchesCapsule(null,[[4,1,0],[5,1,0]],capsule,.4),false);
 assert.equal(bladeTouchesCapsule(null,[[-1,1,0],[1,1,0]],capsule,.4),true);
 assert.equal(bladeTouchesCapsule([[-1,1,-1],[1,1,-1]],[[-1,1,1],[1,1,1]],capsule,.4),true);
});
test('melee: no idle hits or repeated per-frame damage; a new attack can hit again',()=>{
 const g=new MeleeContactGate(),p={actionId:1,blade:[[-1,1,0],[1,1,0]],capsule:[[0,.2,0],[0,1.6,0]],radius:.4};
 assert.equal(g.check({...p,window:null}),false);
 assert.equal(g.check({...p,window:{id:'cut'}}),true);
 for(let i=0;i<90;i++)assert.equal(g.check({...p,window:{id:'cut'}}),false);
 assert.equal(g.check({...p,actionId:2,window:{id:'cut'}}),true);
});

test('shield: push freezes boss for 1.5 seconds; blocked attack pauses without losing health',()=>{
 const b=new BossBrain(durations);b.start('Left_Hook_from_Guard','attack');b.time=.1;
 b.hit({damage:10,stun:1.5});b.update(1.49,2);assert.equal(b.time,.1);assert.equal(b.hp,890);
 b.update(.02,2);b.update(.02,2);assert.ok(b.time>.1);
 const t=b.time;b.parry();b.update(.2,2);assert.equal(b.time,t);assert.equal(b.hp,890);
 b.update(.06,2);b.update(.02,2);assert.ok(b.time>t);
});

test('shield: real transformed front face blocks, a rear contact and nearby miss do not',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),shield=new TransformNode('shield',scene);
 shield.position.set(3,1,2);shield.rotation.y=Math.PI/2;shield.scaling.setAll(.35);shield.computeWorldMatrix(true);
 const at=p=>Vector3.TransformCoordinates(Vector3.FromArray(p),shield.getWorldMatrix());
 assert.equal(shieldIntercepts(at([0,0,1]),at([0,0,-1]),shield),true);
 assert.equal(shieldIntercepts(at([0,0,-1]),at([0,0,1]),shield),false);
 assert.equal(shieldIntercepts(at([1.8,0,1]),at([1.8,0,-1]),shield),false);
 scene.dispose();engine.dispose();
});

test('strike sampling: 2x low-FPS shield contact is retained only inside its authored window',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),shield=new TransformNode('shield',scene),sampler=new PlayerStrikeSampler();
 sampler.sample({state:'shieldPush',actionId:1,clipTime:1.04},null,shield);
 shield.position.x=1;
 const sample=sampler.sample({state:'shieldPush',actionId:1,clipTime:1.24},null,shield);
 assert.equal(sample.window.stun,1.5);
 assert.ok(Math.abs(sample.previous[0][0]-(-.55+.3))<1e-6);
 assert.ok(Math.abs(sample.blade[0][0]-(-.55+.55))<1e-6);
 assert.equal(sampler.sample({state:'shieldPush',actionId:1,clipTime:1.4},null,shield).window,undefined);
 scene.dispose();engine.dispose();
});
