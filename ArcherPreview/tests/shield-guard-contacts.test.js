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

test('one actual shield sweep knocks down every separately hit enemy once',t=>{
  const a=fixture(t,BossEncounter,'guardian-bear'),b=fixture(t,GoblinEncounter,'hooded-goblin');
  const shield=new TransformNode('sweep-shield',a.scene);shield.position.set(0,1,4.84);
  const sample=new PlayerStrikeSampler().sample({...tap,actionId:42,clipTime:1.12},null,shield);
  for(const {b:enemy,player} of [a,b]){
    enemy.alignPose=()=>{};enemy.contactSeparation=()=>0;enemy.hurtCapsules=()=>[{points:[[0,1,5],[0,2,5]],radius:1}];enemy.skillHurtCapsule=()=>null;enemy.damageNumberPosition=()=>enemy.actor.position;enemy.animator={ensurePoseCurrent(){},reactToHit(){}};
    const hp=enemy.brain.hp;enemy.poseAndContacts(player,{state:'shieldPush'},sample,shield);
    assert.equal(enemy.brain.mode,'down');assert.equal(enemy.knockVelocity.z,8);assert.equal(enemy.brain.hp,hp-10);
    enemy.poseAndContacts(player,{state:'shieldPush'},sample,shield);assert.equal(enemy.brain.hp,hp-10,'the same sweep cannot damage twice');
  }
});

for(const [name,Encounter,asset] of variants){
  test(`${name}: actual heavy and shield contacts apply an outward knockback`,t=>{
    const {b,player}=fixture(t,Encounter,asset);let reactions=0;
    b.alignPose=()=>{};b.contactSeparation=()=>0;b.hurtCapsules=()=>[{points:[[0,1,5],[0,2,5]],radius:1}];b.skillHurtCapsule=()=>null;b.damageNumberPosition=()=>b.actor.position;
    b.animator={ensurePoseCurrent(){},reactToHit(){},reactToKnockback(){reactions++;},transition(){},update(){}};b.ring={isVisible:false};b.warningRing={update(){}};
    for(const [i,window] of [{id:'jump-cut',damage:10,heavy:true},{id:'shield-push',damage:10,stun:1.5}].entries()){
      b.brain=b.createBrain(b.brain.durations);b.gate.reset();b.knockVelocity.setAll(0);
      b.poseAndContacts(player,{state:'idle'}, {actionId:100+i,window,blade:[[0,1,5],[0,2,5]]},null);
      assert.equal(b.knockVelocity.z,8,`${window.id} uses heavy-strike knockback strength`);assert.equal(b.knockVelocity.x,0);
      if(name==='Mourning Elena')assert.ok(b.brain.stagger>0,'large witch uses her authored knockback reaction');
      else assert.equal(b.brain.mode,'down',`${window.id} starts the same fall as a heavy attack`);
      const from=b.actor.position.z;BossEncounter.prototype.update.call(b,1/60,player);assert.ok(b.actor.position.z>from,`${window.id} actually moves the target away`);
      b.actor.position.z=5;
    }
    assert.equal(reactions,2);
    b.brain=b.createBrain(b.brain.durations);b.brain.hp=1;b.gate.reset();b.knockVelocity.setAll(0);
    b.poseAndContacts(player,{state:'idle'},{actionId:103,window:{id:'shield-push',damage:10,stun:1.5},blade:[[0,1,5],[0,2,5]]},null);
    assert.equal(b.brain.hp,0);assert.ok(b.knockVelocity.z>0,'lethal contact still pushes');assert.equal(reactions,2,'death keeps its own animation');
  });
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
