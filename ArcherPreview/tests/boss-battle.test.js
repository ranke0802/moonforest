import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, AssetContainer, TransformNode, MeshBuilder, StandardMaterial, Skeleton, Bone, Matrix, Animation, AnimationGroup, Vector3 } from '@babylonjs/core';
import { BossBattle, normalizeBossCount, bossSpawnPositions, separateBosses } from '../src/boss-battle.js';
import { instantiateBossModel } from '../src/boss-models.js';
import { BOSS_MOTIONS } from '../src/boss-spec.js';
import { ActionAudio } from '../src/action-audio.js';

function fixture(t) {
  const engine = new NullEngine(), scene = new Scene(engine), container = new AssetContainer(scene);
  const root = new TransformNode('root', scene);
  const names = ['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  const nodes = names.map(name => { const n = new TransformNode(`mixamorig:${name}`, scene); n.parent = root; n.position.y = name.includes('Foot') ? .1 : 1.5; return n; });
  const mesh = MeshBuilder.CreateBox('body', {}, scene); mesh.parent = root; mesh.material = new StandardMaterial('shared', scene);
  mesh.skeleton = new Skeleton('skeleton', 'skeleton', scene);
  new Bone('hip', mesh.skeleton, null, Matrix.Identity()).linkTransformNode(nodes[0]);
  container.transformNodes = [root, ...nodes]; container.meshes = [mesh]; container.skeletons = [mesh.skeleton]; container.materials = [mesh.material];
  container.animationGroups = BOSS_MOTIONS.map(({name}) => {
    const group = new AnimationGroup(name, scene), animation = new Animation(name, 'position.y', 30, Animation.ANIMATIONTYPE_FLOAT);
    animation.setKeys([{frame:0,value:1.5},{frame:60,value:1.6}]); group.addTargetedAnimation(animation, nodes[0]); return group;
  });
  container.removeAllFromScene();
  const config = {scale:1,animations:Object.fromEntries(BOSS_MOTIONS.map(({name})=>[name,name])),catalog:BOSS_MOTIONS.map(({name})=>({name,duration:2,fps:30,rootTrack:[[0,0,0]],groundTrack:[0]}))};
  const models = {loads:0,async load(){this.loads=1;},async instantiate(){await this.load();return {config,asset:instantiateBossModel(container)};}};
  const player = new TransformNode('player', scene), events = [];
  const battle = new BossBattle({scene,shadows:{addShadowCaster(){}}},()=>{},(...args)=>events.push(args),()=>true,{models});
  battle.playerNodes = Object.fromEntries(['Head','RightFoot'].map(name=>{const n=new TransformNode(name,scene);n.parent=player;n.position.y=name==='Head'?1.8:.1;return [`mixamorig:${name}`,n];}));
  t.after(()=>{battle.hide();scene.dispose();engine.dispose();});
  return {battle,player,events,scene,container};
}

test('spawn count is bounded and five bosses have separate positions inside the arena',()=>{
  assert.deepEqual(['2',0,99,'bad',3.9].map(normalizeBossCount),[2,1,5,1,3]);
  for(const center of [Vector3.Zero(),new Vector3(9,0,9)]) {
    const positions=bossSpawnPositions({position:center,rotation:{y:1}},5);
    for(let i=0;i<5;i++){assert.ok(positions[i].length()<=6.5001);for(let j=i+1;j<5;j++)assert.ok(Vector3.Distance(positions[i],positions[j])>2);}
  }
});

test('summon 3/1/5/2 reuses one model template, shares geometry, clones skeletons and animations, hides unused actors',async t=>{
  const {battle,player}=fixture(t);
  await battle.summon(player,3);
  const [a,b]=battle.encounters;
  assert.equal(a.asset.meshes[0].geometry,b.asset.meshes[0].geometry);
  assert.equal(a.asset.meshes[0].material,b.asset.meshes[0].material);
  assert.notEqual(a.asset.skeletons[0],b.asset.skeletons[0]);
  assert.notEqual(a.asset.animationGroups[0].targetedAnimations[0].target,b.asset.animationGroups[0].targetedAnimations[0].target);
  for(const count of [1,5,2]){await battle.summon(player,count);assert.equal(battle.encounters.length,count);assert.equal(battle.pool.filter(x=>x.actor.isEnabled()).length,count);}
  assert.equal(battle.pool.length,5);assert.equal(battle.models.loads,1);
  assert.ok(battle.pool.slice(2).every(b=>b.animator.active.size===0));
});

test('five bosses share player health, immunity and a single potion clock',async t=>{
  const {battle,player,events}=fixture(t);await battle.summon(player,5);
  for(const b of battle.encounters){b.player=player;b.hitPlayer(80,new Vector3(0,0,2));}
  assert.equal(battle.playerHp,420);
  assert.ok(battle.usePotion());battle.update(.1,player);
  assert.ok(Math.abs(battle.combat.invulnerable-.1)<1e-8);assert.equal(battle.playerHp,420);
  battle.update(.9,player);assert.equal(battle.playerHp,460);assert.equal(events.filter(e=>e[3]==='heal').length,1);
});

test('one swing hits each grounded boss once; recovery stays damageable independently',async t=>{
  const {battle,player}=fixture(t);await battle.summon(player,3);
  battle.encounters.forEach((b,i)=>{b.actor.position.set((i-1)*.8,0,1.6);b.actor.rotation.y=Math.PI;b.brain.start(i===1?'Stand_Up3':'Knock_Down_1',i===1?'recover':'down');b.dt=.016;});
  const sample={actionId:10,elapsed:.5,window:{id:'cut',damage:20},blade:[[-.5,9,1.5],[.5,9,1.5]]};
  for(let i=0;i<2;i++)battle.poseAndContacts(player,{state:'slash',actionId:10},sample,null);
  assert.deepEqual(battle.encounters.map(b=>b.brain.hp),[880,880,880]);
  assert.deepEqual(battle.encounters.map(b=>b.hitCount),[1,1,1]);
  battle.encounters[0].brain.hp=0;assert.notEqual(battle.nearestTarget(player.position),battle.encounters[0]);
});

test('a single boss owns the grab; another boss cannot capture or damage that held player',async t=>{
  const {battle,player}=fixture(t);await battle.summon(player,2);
  const [a,b]=battle.encounters;for(const enemy of battle.encounters)enemy.player=player;
  assert.ok(a.receiveBossHit({damage:300,grab:true,bodyContact:true}));
  assert.equal(battle.combat.grabOwner,a);
  assert.equal(b.receiveBossHit({damage:300,grab:true,bodyContact:true}),false);
  assert.equal(b.receiveBossHit({damage:100,bodyContact:true}),false);
  a.grab.reset();assert.equal(battle.combat.grabOwner,null);
  assert.ok(b.receiveBossHit({damage:300,grab:true,bodyContact:true}));battle.resetBattle();assert.equal(battle.grab.active,false);assert.equal(battle.playerHp,500);
});

test('separation moves overlapping living bosses without dragging a captured player owner',()=>{
  const a={brain:{hp:900,mode:'attack'},actor:{position:Vector3.Zero()}},b={brain:{hp:900,mode:'move'},actor:{position:Vector3.Zero()}};
  separateBosses([a,b],a);assert.equal(a.actor.position.length(),0);assert.ok(Vector3.Distance(a.actor.position,b.actor.position)>=1.6);
});

test('hiding during a pending load cannot reactivate an old summon',async()=>{
  let release;const models={load:()=>new Promise(resolve=>release=resolve)};
  const battle=new BossBattle({},()=>{},()=>{},()=>{},{models}),pending=battle.summon({position:Vector3.Zero(),rotation:{y:0}},5);
  battle.hide();release();assert.equal(await pending,false);assert.equal(battle.active,false);assert.equal(battle.loading,false);assert.equal(battle.pool.length,0);
});

test('multi-boss audio tracks separate attack clocks and plays victory only after the last death',()=>{
  const sounds=[],music=[],audio=new ActionAudio({play:name=>sounds.push(name),setBossMusic:on=>music.push(on)});
  const make=()=>({active:true,actor:{position:Vector3.Zero()},brain:{hp:900,serial:1,state:'Right_Jab_from_Guard',mode:'attack',time:1,durations:{Right_Jab_from_Guard:2}}});
  const bosses=[make(),make()],battle={active:true,playerHp:500,encounters:bosses};
  audio.boss(battle,.016);assert.equal(sounds.filter(s=>s==='slash_heavy').length,2);
  bosses[0].brain.hp=0;audio.boss(battle,.016);assert.equal(sounds.includes('victory'),false);assert.equal(music.at(-1),true);
  bosses[1].brain.hp=0;audio.boss(battle,.016);audio.boss(battle,.016);assert.equal(sounds.filter(s=>s==='victory').length,1);assert.equal(music.at(-1),false);
});
