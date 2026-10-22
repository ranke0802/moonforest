import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BossBrain,BOSS_MOTIONS,BOSS_ATTACKS,BOSS_ACTIVE_MOTIONS,bossAttackRange } from '../src/boss-spec.js';
import { bladeTouchesCapsule,MeleeContactGate } from '../src/melee-collision.js';
import { NullEngine,Scene,TransformNode,Vector3,FreeCamera } from '@babylonjs/core';
import { PlayerStrikeSampler,shieldIntercepts } from '../src/player-strikes.js';
import { BossEncounter } from '../src/boss-encounter.js';
import { projectBossHealth } from '../src/boss-health-bar.js';
import { loadPoseAsset } from './helpers/gltf-pose.js';
const asset=JSON.parse(readFileSync(new URL('../public/assets/guardian-bear.json',import.meta.url)));
const durations=Object.fromEntries(asset.catalog.map(c=>[c.name,c.duration]));
test('boss: 20 original clips are retained; 18 active motions exclude both ball projectiles',()=>{
 assert.equal(BOSS_MOTIONS.length,20);assert.equal(BOSS_ATTACKS.length,12);
 assert.deepEqual(new Set(BOSS_MOTIONS.map(m=>m.name)),new Set(Object.keys(asset.animations)));
 const b=new BossBrain(durations,()=>.37);b.update(.1,7);b.update(.1,3);b.update(.1,2);
 for(let t=0;t<240;t+=.05)b.update(.05,2);
 b.hit({heavy:true});for(let t=0;t<11;t+=.05)b.update(.05,2);
 assert.deepEqual(b.visited,new Set(BOSS_ACTIVE_MOTIONS.map(m=>m.name)));
 assert.ok(BOSS_ATTACKS.every(m=>!['rock','magic'].includes(m.kind)));
});
test('boss: light hit pauses briefly, flashes boss, then resumes the same original motion',()=>{
 const b=new BossBrain(durations);b.start('Left_Hook_from_Guard','attack');b.time=.15;
 assert.ok(b.hit());assert.equal(b.state,'Left_Hook_from_Guard');assert.equal(b.hp,886);assert.ok(b.flash>0);
 b.update(.1,2);assert.equal(b.time,.15);b.update(.1,2);b.update(.05,2);assert.ok(b.time>.15);assert.equal(b.flash,0);
});
test('boss: heavy hit cancels attack, plays down then stand-up before resuming',()=>{
 const b=new BossBrain(durations);b.start('Axe_Spin_Attack','attack');b.time=.6;
 b.hit({heavy:true,damage:64});assert.equal(b.state,'Knock_Down_1');assert.equal(b.hp,836);
 b.time=.3;const serial=b.serial;assert.equal(b.hit({heavy:true,damage:20}),true);
 assert.equal(b.hp,816);assert.equal(b.time,.3);assert.equal(b.serial,serial);assert.equal(b.stagger,0);
 b.update(durations.Knock_Down_1+.01,2);assert.equal(b.state,'Stand_Up3');
 b.update(durations.Stand_Up3+.01,2);assert.equal(b.mode,'idle');
});
test('boss: defeat stays down and attacks do not fire during knockdown or stagger',()=>{
 const b=new BossBrain(durations);b.hit({damage:900,heavy:true});for(let i=0;i<100;i++)assert.equal(b.update(.1,2).events.length,0);
 assert.equal(b.hp,0);assert.equal(b.state,'Knock_Down_1');assert.equal(b.time,durations.Knock_Down_1);
});

test('boss: actual collision damages stand-up once, briefly staggers, then continues recovery',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),b=new BossEncounter({scene},()=>{});
 b.active=true;b.brain=new BossBrain(durations);b.brain.hit({heavy:true,damage:64});b.brain.update(durations.Knock_Down_1+.01,2);
 b.brain.time=.3;b.dt=.016;b.groundHeight=0;
 b.actor=new TransformNode('boss',scene);b.actor.position.z=1.5;b.carrier=new TransformNode('carrier',scene);b.carrier.parent=b.actor;
 const boneNames=['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
 b.nodes=Object.fromEntries(boneNames.map(name=>{const node=new TransformNode(name,scene);node.parent=b.carrier;node.position.y=1;return ['mixamorig:'+name,node];}));
 b.config={scale:1,catalog:[{name:'Stand_Up3',groundTrack:[0]}]};
 const player={position:Vector3.Zero()},sample={actionId:5,window:{id:'cut',damage:20},blade:[[-.5,1,1.5],[.5,1,1.5]]};
 b.poseAndContacts(player,{state:'slash',actionId:5},sample,null);b.poseAndContacts(player,{state:'slash',actionId:5},sample,null);
 assert.equal(b.brain.hp,816);assert.equal(b.hitCount,1);assert.equal(b.brain.state,'Stand_Up3');assert.equal(b.brain.time,.3);
 b.brain.mode='down';b.poseAndContacts(player,{state:'slash',actionId:5},sample,null);
 b.brain.mode='recover';b.poseAndContacts(player,{state:'slash',actionId:5},sample,null);
 assert.equal(b.brain.hp,816,'Changing between down/recovery must retain per-action hit deduplication');
 b.brain.update(.2,2);b.brain.update(.1,2);assert.ok(b.brain.time>.3);
 b.brain.hit({damage:900});assert.equal(b.brain.hp,0);assert.equal(b.brain.mode,'down');
 scene.dispose();engine.dispose();
});

test('boss: melee/projectile contact damages warrior, with a short repeat-hit cooldown',()=>{
 const feedback=[],b=new BossEncounter({},()=>{},(...args)=>feedback.push(args));
 b.active=true;b.brain=new BossBrain(durations);b.player={position:Vector3.Zero()};
 assert.equal(b.receiveBossHit({damage:14,bodyContact:false}),false);assert.equal(b.playerHp,500);
 b.receiveBossHit({damage:14,bodyContact:true,action:{state:'attack',actionId:1}});assert.equal(b.playerHp,486);
 b.receiveBossHit({damage:18,bodyContact:true});assert.equal(b.playerHp,486);
 b.playerInvulnerable=0;b.receiveBossHit({damage:18,bodyContact:true});assert.equal(b.playerHp,468);
 assert.deepEqual(feedback.map(f=>f[3]),['player','player']);
});

test('boss: shield push blocks throughout wind-up, impact and recovery, but never at a distance',()=>{
 const feedback=[],b=new BossEncounter({},()=>{},(...args)=>feedback.push(args));
 b.active=true;b.brain=new BossBrain(durations);b.player={position:Vector3.Zero()};
 for(const time of [0,.5,1.12,2.34])for(const damage of [14,18]){
  const action={state:'shieldPush',actionId:1,clipTime:time};
  assert.equal(b.receiveBossHit({damage,action}),false);
  assert.equal(b.receiveBossHit({damage,bodyContact:true,action}),true);assert.equal(b.playerHp,500);
 }
 assert.equal(feedback.length,8);assert.ok(feedback.every(f=>f[3]==='block'));assert.ok(b.brain.stagger>0);
 b.receiveBossHit({damage:14,bodyContact:true,action:{state:'idle',actionId:null}});assert.equal(b.playerHp,486);
 b.playerInvulnerable=0;b.receiveBossHit({damage:18,shieldContact:true,action:{state:'idle'}});assert.equal(b.playerHp,486);
});
test('melee: actual blade contact required, miss at distance and sweep catches fast crossing',()=>{
 const capsule=[[0,.3,0],[0,1.7,0]];
 assert.equal(bladeTouchesCapsule(null,[[4,1,0],[5,1,0]],capsule,.4),false);
 assert.equal(bladeTouchesCapsule(null,[[-1,1,0],[1,1,0]],capsule,.4),true);
 assert.equal(bladeTouchesCapsule([[-1,1,-1],[1,1,-1]],[[-1,1,1],[1,1,1]],capsule,.4),true);
});

test('melee: fast sweep cannot skip a narrow limb between the old eight samples',()=>{
 const before=[[-.3,1,-4],[.3,1,-4]],after=[[-.3,1,4],[.3,1,4]],limb=[[0,.8,.45],[0,1.2,.45]];
 assert.equal(bladeTouchesCapsule(before,after,limb,.06),true);
 assert.equal(bladeTouchesCapsule(before,after,[[2,.8,.45],[2,1.2,.45]],.06),false);
});

test('actual GLB: visible cutting passes register once; idle cannot deal damage',()=>{
 const source=loadPoseAsset(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));
 for(const [state,clip,time] of [['attack','Thrust_Slash',1.5],['slash','Right_Hand_Sword_Slash',.76],['judgment','Sword_Judgment',1.02]]){
  const sampler=new PlayerStrikeSampler(),gate=new MeleeContactGate();let matrix;
  const sword={computeWorldMatrix(){},getWorldMatrix(){return matrix;}};
  for(const t of [time-.016,time]){matrix=source.pose(clip,t).Golden_Oathblade;sampler.sample({state,actionId:1,clipTime:t},sword,null);}
  const sample=sampler.sample({state,actionId:1,clipTime:time},sword,null),tip=Vector3.FromArray(sample.blade[1]);
  const capsule=[tip.add(new Vector3(0,-.08,0)).asArray(),tip.add(new Vector3(0,.08,0)).asArray()];
  assert.ok(sample.window,`${state} ${time}: missing strike window`);
  assert.equal(gate.check({...sample,capsule,radius:.06}),true);assert.equal(gate.check({...sample,capsule,radius:.06}),false);
  assert.equal(gate.check({...sample,blade:sample.blade.map(p=>[p[0]+5,p[1],p[2]]),previous:null,actionId:2,capsule,radius:.06}),false);
  assert.equal(sampler.sample({state:'idle',actionId:null,clipTime:time},sword,null),null);
 }
});

test('boss HP bar: projects to feet, follows camera orbit, hides behind camera, respects render scale',()=>{
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
 const camera=new FreeCamera('camera',new Vector3(0,2,-6),scene);camera.setTarget(new Vector3(0,1,0));scene.render();
 const ground=new Vector3(1,0,0),above=new Vector3(1,2,0);
 const p=projectBossHealth(scene,ground,640,360),head=projectBossHealth(scene,above,640,360);
 assert.ok(p.visible);assert.ok(p.y>head.y);assert.ok(p.x>320);
 camera.position.set(6,2,0);camera.setTarget(new Vector3(0,1,0));scene.render();
 const moved=projectBossHealth(scene,ground,640,360);assert.ok(Math.abs(moved.x-p.x)>5);
 assert.equal(projectBossHealth(scene,new Vector3(20,0,0),640,360).visible,false);
 scene.dispose();engine.dispose();
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

function collisionEncounter(mode){
 const engine=new NullEngine(),scene=new Scene(engine),feedback=[],b=new BossEncounter({scene},()=>{},(...args)=>feedback.push(args));
 b.active=true;b.brain=new BossBrain(durations);b.brain.start(mode==='down'?'Knock_Down_1':mode==='guard'?'Block6':'Backflip',mode);b.brain.time=.3;b.dt=.016;b.groundHeight=0;
 b.actor=new TransformNode('boss',scene);b.actor.position.z=1.5;b.carrier=new TransformNode('carrier',scene);b.carrier.parent=b.actor;
 const boneNames=['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
 b.nodes=Object.fromEntries(boneNames.map(name=>{const node=new TransformNode(name,scene);node.parent=b.carrier;node.position.y=.3;return ['mixamorig:'+name,node];}));
 b.config={scale:1,catalog:[{name:b.brain.state,groundTrack:[0]}]};b.asset={meshes:[{}]};
 const player={position:Vector3.Zero()},sample={actionId:1,window:{id:'cut',damage:20},blade:[[-.5,.3,1.5],[.5,.3,1.5]]};
 return {b,feedback,player,sample,close(){scene.dispose();engine.dispose();}};
}

test('downed boss: real low blade contact deals normal and three heavy hits without restarting fall',()=>{
 const {b,player,sample,feedback,close}=collisionEncounter('down'),serial=b.brain.serial;
 b.poseAndContacts(player,{state:'slash',actionId:1},sample,null);
 b.poseAndContacts(player,{state:'slash',actionId:1},sample,null);assert.equal(b.brain.hp,880);
 const burst={...sample,actionId:2,window:{id:'jump-cut',damage:64,heavy:true,burst:[20,20,24],interval:.055}};
 for(const elapsed of [0,.055,.11])b.poseAndContacts(player,{state:'judgment',actionId:2},{...burst,elapsed},null);
 assert.equal(b.brain.hp,816);assert.equal(b.hitCount,4);assert.equal(b.heavyCount,0);
 assert.equal(b.brain.serial,serial);assert.equal(b.brain.time,.3);assert.equal(b.brain.stagger,0);
 assert.deepEqual(feedback.map(f=>f[1]),[20,20,20,24]);assert.ok(b.asset.meshes[0].renderOverlay);
 b.poseAndContacts(player,{}, {...sample,actionId:3,blade:[[5,.3,1.5],[6,.3,1.5]]},null);assert.equal(b.brain.hp,816,'Distant swings remain misses');
 b.brain.update(durations.Knock_Down_1,2);assert.equal(b.brain.mode,'recover');close();
});

test('boss defense: roll says 회피, guard says BLOCK; prevented bursts cannot damage later',()=>{
 for(const [mode,label] of [['evade','회피'],['guard','BLOCK']]){
  const {b,player,sample,feedback,close}=collisionEncounter(mode);
  const burst={...sample,window:{id:'jump-cut',damage:64,heavy:true,burst:[20,20,24],interval:.055}};
  for(const elapsed of [0,.055,.11])b.poseAndContacts(player,{}, {...burst,elapsed},null);
  assert.equal(b.brain.hp,900);assert.equal(feedback.length,1);assert.equal(feedback[0][1],label);assert.equal(b.gate.pending.length,0);
  b.brain.mode='idle';b.poseAndContacts(player,{}, {...burst,elapsed:.2},null);assert.equal(b.brain.hp,900);
  b.poseAndContacts(player,{}, {...sample,actionId:2},null);assert.equal(b.brain.hp,880);close();
 }
});

test('boss aggression: expanded range, quicker pursuit and shorter gaps retain an impact windup',()=>{
 for(const spec of BOSS_ATTACKS)assert.equal(bossAttackRange(spec),spec.range*1.2);
 const b=new BossBrain(durations,()=>.37);assert.ok(b.update(.1,5).speed>2.65);assert.ok(b.update(.1,3).speed>1.05);
 b.update(.66,2.5);assert.equal(b.mode,'attack');assert.equal(b.time,0);
 const spec=BOSS_ATTACKS.find(m=>m.name===b.state),impact=durations[b.state]*spec.impact/1.12;
 assert.equal(b.update(impact-.001,2.5).events.length,0);assert.equal(b.update(.002,2.5).events.length,1);
 b.update(10,2.5);assert.equal(b.mode,'idle');assert.equal(b.wait,.3);
 b.update(.31,2.5);assert.equal(b.mode,'attack');
});

test('source GLBs: normal sword passes damage the actual lying boss skeleton',()=>{
 const bear=loadPoseAsset(new URL('../public/assets/guardian-bear.glb',import.meta.url));
 const warrior=loadPoseAsset(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));
 for(const phase of [1.5,3])for(const [state,clip,damage] of [['slash','Right_Hand_Sword_Slash',20],['attack','Thrust_Slash',38]]){
  const {b,player,close}=collisionEncounter('down'),pose=bear.pose('Knock_Down_1',phase);
  b.brain.time=phase;b.actor.scaling.setAll(asset.scale);b.actor.rotation.y=Math.PI;b.config=asset;
  b.groundHeight=asset.catalog.find(c=>c.name==='Knock_Down_1').groundTrack[Math.floor(phase*30)];
  for(const [name,node] of Object.entries(b.nodes))node.position.copyFrom(pose[name].getTranslation());
  const sampler=new PlayerStrikeSampler();let matrix;const sword={computeWorldMatrix(){},getWorldMatrix(){return matrix;}};
  for(let t=0;t<2;t+=1/60){
   matrix=warrior.pose(clip,t).Golden_Oathblade;
   b.poseAndContacts(player,{state,actionId:1},sampler.sample({state,actionId:1,clipTime:t},sword,null),null);
  }
  assert.equal(b.brain.hp,900-damage,`${state}, down phase ${phase}`);assert.equal(b.brain.time,phase);close();
 }
});
