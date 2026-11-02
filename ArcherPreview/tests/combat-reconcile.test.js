import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,AssetContainer,TransformNode,MeshBuilder,StandardMaterial,Skeleton,Bone,Matrix,Animation,AnimationGroup,Vector3} from '@babylonjs/core';
import {BossBattle,separateBosses} from '../src/boss-battle.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {BOSS_MOTIONS} from '../src/boss-spec.js';
import {ArenaNavigation} from '../src/navigation.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {TerrainHeightField} from '../src/terrain.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter,ENEMY_ARENA_RADIUS} from '../src/world-limits.js';

// Exact pre-optimization battle orchestration is the behavioral oracle.
function oldUpdate(battle,dt,player){
 if(!battle.active)return;battle.currentPlayer=player;battle.combat.update(dt,player,battle.onDamage);battle.updating=true;
 for(const boss of battle.encounters)boss.update(dt,player);
 if(battle.world.prefetchResources&&battle.residentPhase===1&&battle.encounters.some(b=>b.kind==='elena'&&b.engaged))battle.preloadMourning();
 const running=battle.frameEncounters;running.length=0;
 for(const boss of battle.encounters)if(boss.active&&!boss.corpseGone){(boss.separationFrom??=new Vector3()).copyFrom(boss.actor.position);running.push(boss);}
 if(running.length>1)separateBosses(running,battle.combat.grabOwner);
 for(const boss of running){(boss.movementNavigation??battle.world.navigation)?.constrain(boss.actor.position,boss.separationFrom,boss.radius,ENEMY_ARENA_RADIUS);battle.world.terrain?.place(boss.actor.position);boss.warningRing.update(boss.actor.position,boss.attackRange(boss.motionSpec(boss.brain.state)));}
 battle.updating=false;battle.onChange(battle);
}
function oldContacts(battle,player,result,sample,shield){
 if(!battle.active)return 0;let hitStop=0;const version=battle.actionVersion;
 for(const boss of battle.encounters){if(!boss.active||boss.corpseGone)continue;const canceled=version!==battle.actionVersion||battle.grab.active;
  hitStop=Math.max(hitStop,boss.poseAndContacts(player,canceled?{state:'idle',actionId:null}:result,canceled?null:sample,shield)||0);
 }return hitStop;
}
const maps=[
 {id:'village',character:'warrior-v3',terrain:createVillageTerrain,obstacles:villageObstacles,spawn:[0,6]},
 {id:'great-plains',character:'warrior-plains',terrain:createGreatPlainsTerrain,obstacles:plainsObstacles,spawn:[-87,-32]},
 {id:'monster-forest',character:'warrior-v4',terrain:createMonsterForestTerrain,obstacles:forestObstacles,spawn:[0,0]},
 {id:'witch-cave',character:'warrior-v5',terrain:createWitchCaveTerrain,obstacles:caveObstacles,spawn:[-42,43],cave:true},
];
const boneNames=['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
async function fixture(map,count){
 const engine=new NullEngine(),scene=new Scene(engine),container=new AssetContainer(scene),root=new TransformNode('root',scene);
 const nodes=boneNames.map(name=>{const n=new TransformNode(`mixamorig:${name}`,scene);n.parent=root;n.position.y=name.includes('Foot')?.1:1.5;return n;});
 const mesh=MeshBuilder.CreateBox('body',{},scene);mesh.parent=root;mesh.material=new StandardMaterial('body-paint',scene);mesh.skeleton=new Skeleton('skel','skel',scene);new Bone('hip',mesh.skeleton,null,Matrix.Identity()).linkTransformNode(nodes[0]);
 container.transformNodes=[root,...nodes];container.meshes=[mesh];container.skeletons=[mesh.skeleton];container.materials=[mesh.material];
 container.animationGroups=BOSS_MOTIONS.map(({name})=>{const group=new AnimationGroup(name,scene),a=new Animation(name,'position.y',30,Animation.ANIMATIONTYPE_FLOAT);a.setKeys([{frame:0,value:1.5},{frame:60,value:1.6}]);group.addTargetedAnimation(a,nodes[0]);return group;});container.removeAllFromScene();
 const config={scale:1,animations:Object.fromEntries(BOSS_MOTIONS.map(({name})=>[name,name])),catalog:BOSS_MOTIONS.map(({name})=>({name,duration:2,fps:30,rootTrack:[[0,0,0]],groundTrack:[0]}))};
 const models={loads:0,async load(){this.loads=1;},async instantiate(){return {config,asset:instantiateBossModel(container)};}};
 const terrain=map.terrain(),navigation=new (map.cave?CaveNavigation:VillageNavigation)(map.obstacles()),world={scene,mapId:map.id,cave:!!map.cave,terrain,navigation,shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const player=new TransformNode('player',scene);player.position.set(map.spawn[0],0,map.spawn[1]);terrain.place(player.position);
 const events=[],battle=new BossBattle(world,()=>{},(...args)=>events.push(args.slice(1,6)),()=>true,{models});
 battle.playerNodes=Object.fromEntries(['Head','RightFoot'].map(name=>{const n=new TransformNode(name,scene);n.parent=player;n.position.y=name==='Head'?1.8:.1;return [`mixamorig:${name}`,n];}));
 await battle.summon(player,count);for(const boss of battle.encounters)boss.brain.random=()=>.37;
 return {engine,scene,world,player,battle,events,dispose(){battle.hide();scene.dispose();engine.dispose();}};
}
const snap=f=>({player:f.player.position.asArray(),rotation:f.player.rotation.asArray(),quaternion:f.player.rotationQuaternion?.asArray()??null,hp:f.battle.playerHp,grab:f.battle.grab.active,events:f.events,actors:f.battle.encounters.map(b=>({position:b.actor.position.asArray(),rotation:b.actor.rotation.asArray(),mode:b.brain.mode,state:b.brain.state,time:b.brain.time,hp:b.brain.hp,serial:b.brain.serial,hitCount:b.hitCount,velocity:b.knockVelocity.asArray(),ring:b.ring.isVisible,ringPosition:b.ring.position.asArray()}))});
const counts=new WeakMap(),track=(f)=>{const c={constrain:0,place:0,playerMatrix:0};counts.set(f.world.navigation,c);counts.set(f.world.terrain,c);counts.set(f.player,c);return c;};
const originalConstrain=ArenaNavigation.prototype.constrain,originalPlace=TerrainHeightField.prototype.place,originalMatrix=TransformNode.prototype.computeWorldMatrix;
const results=[];
test.before(()=>{
 ArenaNavigation.prototype.constrain=function(...args){const c=counts.get(this);if(c)c.constrain++;return originalConstrain.apply(this,args);};
 TerrainHeightField.prototype.place=function(...args){const c=counts.get(this);if(c)c.place++;return originalPlace.apply(this,args);};
 TransformNode.prototype.computeWorldMatrix=function(...args){const c=counts.get(this);if(c&&args[0]===true)c.playerMatrix++;return originalMatrix.apply(this,args);};
});
test.after(()=>{ArenaNavigation.prototype.constrain=originalConstrain;TerrainHeightField.prototype.place=originalPlace;TransformNode.prototype.computeWorldMatrix=originalMatrix;mkdirSync('reports/repeated-work-2026-11-03',{recursive:true});writeFileSync('reports/repeated-work-2026-11-03/combat-validation.json',JSON.stringify({scope:'Real Babylon NullEngine, synthetic animated bear rigs, actual four map terrain and navigation; prior battle orchestration oracle. No browser, visual GPU, phone FPS or thermal test.',playerPoseSharing:'Deferred: same-frame player terrain and forced matrix calls retain the original behavior.',cases:results},null,2)+'\n');});

test('four actual map navigators preserve prior combat outcomes while reducing duplicate work',async()=>{
 for(const map of maps)for(const scenario of ['single','separated','overlap','knockback','wall','postmove','grab','player-dirty','player-observer','map-change',...(['village','witch-cave'].includes(map.id)?['terrain-swap','nav-swap','custom-terrain']:[])]){
  setWorldCharacter(map.character);const n=scenario==='single'?1:3,a=await fixture(map,n),b=await fixture(map,n);
  try{
   for(const f of [a,b]){
    const first=f.battle.encounters[0].actor.position.clone();
    if(scenario==='overlap')for(const enemy of f.battle.encounters)enemy.actor.position.copyFrom(first);
    if(scenario==='knockback'){const enemy=f.battle.encounters[0];enemy.brain.hit({heavy:true,damage:64});enemy.knockVelocity.set(1,0,.6);}
    if(scenario==='wall'){const obstacle=f.world.navigation.obstacles.find(o=>Math.hypot(o.x-f.player.position.x,o.z-f.player.position.z)<20)??f.world.navigation.obstacles[0];f.battle.encounters[0].actor.position.set(obstacle.x,0,obstacle.z);}
    if(scenario==='postmove'){const enemy=f.battle.encounters[0],update=enemy.update.bind(enemy);enemy.update=(...args)=>{update(...args);enemy.actor.position.x+=.02;};}
    if(scenario==='grab'){const enemy=f.battle.encounters[0];enemy.brain.start('Skill_02','attack');assert.equal(enemy.grab.start(f.player,f.battle.playerNodes,enemy.brain.serial),true);}
    if(scenario==='player-dirty'){const enemy=f.battle.encounters[1],contacts=enemy.poseAndContacts.bind(enemy);enemy.poseAndContacts=(player,...args)=>{player.rotation.y+=.005;player.markAsDirty();return contacts(player,...args);};}
    if(scenario==='player-observer')f.player.onAfterWorldMatrixUpdateObservable.add(()=>{});
    if(scenario==='map-change'){const enemy=f.battle.encounters[0],update=enemy.update.bind(enemy);enemy.update=(...args)=>{update(...args);f.world.mapId=f.world.mapId===map.id?map.id+'-replacement':map.id;};}
    if(scenario==='terrain-swap'){const enemy=f.battle.encounters[0],update=enemy.update.bind(enemy);let changed=false;enemy.update=(...args)=>{update(...args);if(!changed){changed=true;f.world.terrain.heights=f.world.terrain.heights.slice();}};}
    if(scenario==='nav-swap'){const enemy=f.battle.encounters[0],update=enemy.update.bind(enemy);let changed=false;enemy.update=(...args)=>{update(...args);if(!changed){changed=true;const previous=f.world.navigation;f.world.navigation=new previous.constructor(previous.obstacles);const c=counts.get(previous);if(c)counts.set(f.world.navigation,c);}};}
    if(scenario==='custom-terrain')f.world.terrain.surfaceHeight=(_x,_z,ground)=>ground;
   }
   const before=track(a),after=track(b);
   for(let frame=0;frame<12;frame++){
    oldUpdate(a.battle,1/30,a.player);b.battle.update(1/30,b.player);
    a.scene._animate(0);b.scene._animate(0);
    const action={state:frame===4?'dodge':'idle',actionId:null},left=oldContacts(a.battle,a.player,action,null,null),right=b.battle.poseAndContacts(b.player,action,null,null);
    assert.equal(right,left,`${map.id}/${scenario}/hitstop/${frame}`);assert.deepEqual(snap(b),snap(a),`${map.id}/${scenario}/frame ${frame}`);
   }
   assert.ok(after.constrain<=before.constrain);assert.ok(after.place<=before.place);assert.ok(after.playerMatrix<=before.playerMatrix);
   if(scenario==='single'||scenario==='separated')assert.ok(after.constrain<before.constrain,`${map.id}/${scenario} should remove redundant navigation calls`);
   assert.equal(after.playerMatrix,before.playerMatrix,'player world matrix refresh remains unchanged');
   if(scenario==='custom-terrain'){assert.equal(after.constrain,before.constrain);assert.equal(after.playerMatrix,before.playerMatrix);}
   results.push({map:map.id,scenario,frames:12,baseline:{...before},optimized:{...after},equal:true});
  }finally{a.dispose();b.dispose();}
 }
});

test('paired NullEngine update timing records guard overhead without making a device FPS claim',async()=>{
 const map=maps[1];setWorldCharacter(map.character);const a=await fixture(map,3),b=await fixture(map,3);
 try{
  for(const f of [a,b])for(const enemy of f.battle.encounters)enemy.brain.wait=1000;
  const timings=[];
  for(let round=0;round<8;round++){
   const row={};for(const name of round%2?['optimized','baseline']:['baseline','optimized']){
    const start=performance.now();for(let i=0;i<100;i++)if(name==='baseline')oldUpdate(a.battle,0,a.player);else b.battle.update(0,b.player);
    row[name]=performance.now()-start;
   }timings.push(row);
  }
  const median=name=>timings.map(row=>row[name]).sort((a,b)=>a-b)[4];
  results.push({scenario:'local-paired-update-timing',scope:'8 alternating 100-call batches, two warm NullEngine scenes with three synthetic bosses and dt=0; not device or GPU timing',timings,medianMsPer100:{baseline:median('baseline'),optimized:median('optimized')}});
 }finally{a.dispose();b.dispose();}
});
