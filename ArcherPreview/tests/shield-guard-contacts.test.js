import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {BossEncounter} from '../src/boss-encounter.js';
import {GoblinEncounter} from '../src/goblin-encounter.js';
import {ElenaEncounter} from '../src/elena-encounter.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {GroundSpellTelegraph} from '../src/elena-ground-magic.js';
import {ActionAudio} from '../src/action-audio.js';

const variants=[
  ['bear',BossEncounter,'guardian-bear'],
  ['goblin',GoblinEncounter,'hooded-goblin'],
  ['Elena',ElenaEncounter,'elena'],
  ['Mourning Elena',MourningElenaEncounter,'mourning-elena'],
];
const held={state:'shieldPush',actionId:1,clipTime:59/60,guarding:true,shieldPending:false};
const pending={...held,guarding:false,shieldPending:true,clipTime:.1};
const tap={...held,guarding:false,shieldPending:false};

function fixture(t,Encounter,asset){
  const engine=new NullEngine(),scene=new Scene(engine),feedback=[],world={scene};
  const b=new Encounter(world,()=>{},(...args)=>feedback.push(args));
  const config=JSON.parse(readFileSync(new URL(`../public/assets/${asset}.json`,import.meta.url)));
  b.config={...config,scale:1,catalog:config.catalog.map(c=>({...c,groundTrack:[0]}))};
  b.brain=b.createBrain(Object.fromEntries(config.catalog.map(c=>[c.name,c.duration])));
  b.active=true;b.dt=1/60;b.groundHeight=0;b.asset={meshes:[{}]};
  b.actor=new TransformNode('attacker',scene);b.actor.position.z=5;b.actor.rotation.y=Math.PI;
  b.carrier=new TransformNode('carrier',scene);b.carrier.parent=b.actor;
  const names=['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  b.nodes=Object.fromEntries(names.map(name=>{const n=new TransformNode(name,scene);n.parent=b.carrier;n.position.y=1;return ['mixamorig:'+name,n];}));
  const player=new TransformNode('player',scene);b.player=player;
  b.playerNodes=Object.fromEntries(['RightFoot','Head'].map((name,i)=>{const n=new TransformNode('player-'+name,scene);n.parent=player;n.position.y=i?1.7:.1;return ['mixamorig:'+name,n];}));
  t.after(()=>{b.grab.reset();b.spell?.dispose();scene.dispose();engine.dispose();});
  return {b,player,feedback,scene,world};
}

test('held and pending shields never create an outgoing strike, even across the authored push window',t=>{
  const {b,player,scene}=fixture(t,BossEncounter,'guardian-bear'),shield=new TransformNode('shield',scene),sampler=new PlayerStrikeSampler();
  for(const action of [pending,held])for(const clipTime of [.1,.98,1.10,1.12,1.15,2.4,100]){
    const sample=sampler.sample({...action,clipTime},null,shield);
    assert.equal(sample,null);
    b.poseAndContacts(player,{...action,clipTime},sample,shield);
  }
  assert.equal(b.brain.hp,b.brain.maxHp);assert.equal(b.hitCount,0);assert.equal(b.heavyCount,0);
  assert.equal(b.bossReaction.remaining,0);assert.equal(b.knockVelocity.lengthSquared(),0);
  const sample=sampler.sample({...tap,clipTime:1.12},null,shield);
  assert.equal(sample.window.damage,10);assert.equal(sample.window.stun,1.5,'a released tap retains the original push');
});

for(const [name,Encounter,asset] of variants){
  test(`${name}: held/pending block staggers only on contact, without damage or positional recoil`,t=>{
    const {b,player,feedback}=fixture(t,Encounter,asset),position=b.actor.position.clone();
    for(const action of [pending,held]){
      for(let frame=0;frame<90;frame++)assert.equal(b.receiveBossHit({damage:30,action}),false);
      assert.equal(b.brain.stagger,0);assert.equal(feedback.length,action===pending?0:1);
      const hp=b.brain.hp;
      assert.equal(b.receiveBossHit({damage:30,bodyContact:true,action}),true);
      assert.equal(b.playerHp,500);assert.equal(b.brain.hp,hp);assert.equal(b.brain.stagger,1);
      for(let frame=0;frame<30;frame++)b.bossReaction.update(1/60,b.actor);
      assert.ok(b.actor.position.equals(position));assert.ok(player.position.equals(Vector3.Zero()));
      assert.equal(b.knockVelocity.lengthSquared(),0);
      b.brain.update(.5,5,true);assert.ok(Math.abs(b.brain.stagger-.5)<1e-8);
      for(let frame=0;frame<90;frame++)assert.equal(b.receiveBossHit({damage:30,action}),false);
      assert.ok(Math.abs(b.brain.stagger-.5)<1e-8,'holding alone cannot refresh the stagger');
      b.brain.stagger=0;
    }
    assert.deepEqual(feedback.map(f=>f[3]),['block','block']);
  });

  test(`${name}: a released short tap retains its existing block knockback`,t=>{
    const {b}=fixture(t,Encounter,asset),position=b.actor.position.clone();
    assert.equal(b.receiveBossHit({damage:30,bodyContact:true,action:tap}),true);
    assert.equal(b.playerHp,500);assert.equal(b.brain.stagger,1);
    b.bossReaction.update(.2,b.actor);
    assert.ok(Math.abs(Vector3.Distance(position,b.actor.position)-.28)<1e-8);
    assert.equal(b.knockVelocity.lengthSquared(),0);
  });
}

for(const [name,Encounter,asset] of variants.slice(2))test(`${name}: an already casting ground spell is blocked once by held guard, and release restores damage`,t=>{
  const {b,player,feedback,world}=fixture(t,Encounter,asset),position=b.actor.position.clone();
  b.spell=new GroundSpellTelegraph(world);b.brain.cast();
  for(let frame=0;frame<600&&!feedback.length;frame++){
    b.pendingEvents=b.brain.update(1/60,5,true).events;
    b.poseAndContacts(player,held,null,null);b.bossReaction.update(1/60,b.actor);
  }
  assert.deepEqual(feedback.map(f=>f[3]),['block']);assert.equal(b.playerHp,500);assert.equal(b.brain.hp,b.brain.maxHp);
  assert.equal(b.brain.stagger,1);assert.notEqual(b.brain.mode,'attack');assert.ok(b.actor.position.equals(position));
  for(let frame=0;frame<90;frame++)b.poseAndContacts(player,held,null,null);
  assert.equal(feedback.length,1,'the same spell cannot block again on subsequent frames');assert.equal(b.spell.plan,null);
  b.brain.stagger=0;b.brain.cast();b.pendingEvents=[{kind:'ground'}];
  b.poseAndContacts(player,{state:'idle',actionId:null},null,null);
  assert.equal(feedback.at(-1)[3],'player');assert.ok(b.playerHp<500);
});

test('held guard keeps grabs unblocked and leaves dodge avoidance unchanged',t=>{
  const {b}=fixture(t,BossEncounter,'guardian-bear');
  assert.equal(b.receiveBossHit({damage:30,bodyContact:true,action:{state:'dodge',actionId:2}}),false);
  assert.equal(b.playerHp,500);assert.equal(b.brain.stagger,0);
  assert.equal(b.receiveBossHit({damage:30,bodyContact:true,grab:true,action:held}),true);
  assert.equal(b.grab.active,true);assert.equal(b.brain.stagger,0);
});

test('held guard plays shield-up once and never a push cue; a short tap keeps both authored cues',()=>{
  const calls=[],router=new ActionAudio({play:name=>calls.push(name)}),options={character:'warrior-v2',position:{x:0,z:0}};
  const tick=action=>router.player(action,1/60,options);
  for(const clipTime of [0,.1])tick({...pending,clipTime});
  for(const clipTime of [.2,.6,1,1.12,2,100])tick({...held,clipTime});
  assert.deepEqual(calls,['shield_up']);
  tick({state:'idle',actionId:null,clipTime:0});
  tick({...pending,actionId:2,clipTime:0});tick({...tap,actionId:2,clipTime:.1});
  for(const clipTime of [.98,1,1,1.15,2.4])tick({...tap,actionId:2,clipTime});
  assert.deepEqual(calls,['shield_up','shield_up','slash_heavy']);
});
