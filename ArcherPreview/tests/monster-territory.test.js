import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {BossBattle} from '../src/boss-battle.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {regularWolfManifest,isRegularWolf} from '../src/regular-wolf-spec.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {MONSTER_DISENGAGE_SECONDS} from '../src/monster-territory.js';

const prepare=()=>createBossPreparation({incremental:false});
async function fixture(t){
 setWorldCharacter('warrior');const engine=new NullEngine(),scene=new Scene(engine);Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,6,-16),scene);
 const player=new TransformNode('player',scene);player.position.set(0,0,6);const foot=new TransformNode('test-player-foot',scene),head=new TransformNode('test-player-head',scene);foot.parent=head.parent=player;head.position.y=1.6;const playerNodes={'mixamorig:RightFoot':foot,'mixamorig:Head':head};
 const height=(x,z)=>.01*x-.01*z,world={scene,release:'moonforest-0.2',mapId:'great-plains',terrain:{heightAt:height,place:p=>{p.y=height(p.x,p.z);}},navigation:new VillageNavigation([]),shadows:{addShadowCaster(){},removeShadowCaster(){}}};world.terrain.place(player.position);
 const battle=new BossBattle(world,()=>{},()=>{},()=>true),loaders=[],libraries=[];
 const factory=createActorEncounterFactory({world,battle,getPlayer:()=>player,libraryFactory(_scene,id){
  const library={loads:0,async load(){if(this.loads)return;this.loads++;const base=new URL('../public/assets/',import.meta.url),manifest=isRegularWolf(id)?regularWolfManifest(id):id;this.config=JSON.parse(readFileSync(new URL(manifest+'.json',base)));const {gltf,files}=await readRuntimeGltf(new URL(this.config.model,base));
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loaders.push(loader);loader.skipMaterials=true;this.container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of this.container.animationGroups)group.stop();
   const paint=new StandardMaterial(id+'-territory-test',scene);for(const mesh of this.container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  }};libraries.push(library);return {library,owned:false};
 }});
 t.after(async()=>{await factory.dispose();for(const library of libraries)library.container?.dispose();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();setWorldCharacter('warrior');});return {factory,world,battle,player,playerNodes};
}

test('fox, regular wolf, boar, alpha and bear stop outgoing attacks and walk home through their real encounter path',async t=>{
 const f=await fixture(t);
 for(const id of ['fox.r1','gray-wolf.r1','boar.r1','alpha-wolf.r8','guardian-bear.standard']){
  f.player.position.set(0,0,6);f.world.terrain.place(f.player.position);const zone={x:0,z:0,radius:12,combatRadius:4,wanderRadius:0,returnRadius:.4,reengageRadius:10};
  const adapter=f.factory(id);await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});const e=adapter.encounter;
  const publicState=e.territoryState;e.update(.2,f.player);assert.equal(publicState.phase,'watch',id+': outside combat circle only watches');assert.equal(publicState.engaged,false);assert.equal(adapter.snapshot().combat,false);
  if(id!=='boar.r1'&&id!=='guardian-bear.standard')assert.equal(e.brain.state,'Alert_Lie_R5',id+': lying watch retains the actual rest clip');
  assert.equal(e.grab.start(f.player,f.playerNodes,e.brain.serial),false,id+': watch cannot capture');assert.equal(e.ring.isVisible,false);
  e.brain.hit({damage:1});assert.equal(publicState.engaged,true,id+': a real incoming hit engages inside the activity region');
  e.actor.position.set(0,0,8);f.world.terrain.place(e.actor.position);e.brain.hp=e.brain.maxHp-17;const hp=e.brain.hp;e.combat.hp=400;
  if(e.brain.startAction)e.brain.startAction('lunge');else e.brain.start('Skill_02','attack');
  assert.equal(e.grab.start(f.player,f.playerNodes,e.brain.serial),true,id+': owns a native capture before exit');
  e.pendingEvents.push({type:'attack',damage:999});f.player.position.z=20;f.world.terrain.place(f.player.position);const playerPosition=f.player.position.clone();
  const before=e.actor.position.clone();e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.phase,'disengage',id);assert.notEqual(e.brain.mode,'attack',id);assert.equal(e.pendingEvents.length,0,id);assert.equal(e.receiveBossHit({damage:999,bodyContact:true}),false,id);
  assert.equal(e.grab.active,false,id+': exit releases its native capture');assert.equal(e.combat.grabOwner,null,id);
  assert.ok(Vector3.Distance(before,e.actor.position)<.1,id+': return uses bounded walking displacement');assert.equal(e.actor.position.y,f.world.terrain.heightAt(e.actor.position.x,e.actor.position.z));
  f.player.position.z=9;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.phase,'watch',id+': early player reentry resumes cautious watch, not an immediate attack');
  f.player.position.copyFrom(playerPosition);
  for(let frame=0;frame<420&&!adapter.snapshot().territory.arrived;frame++){e.update(1/30,f.player);assert.notEqual(e.brain.mode,'attack',id);}
  assert.equal(adapter.snapshot().territory.arrived,true,id+': reaches its own home');assert.equal(publicState.phase,'ambient',id+': outside player leaves it resting after returning');assert.equal(publicState.engaged,false);
  assert.equal(e.brain.hp,hp,id+': returning never heals');assert.equal(e.combat.hp,400,id+': returning never resets player health');assert.deepEqual(f.player.position.asArray(),playerPosition.asArray(),id+': returning never relocates player');
  f.player.position.z=11;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(publicState.phase,'watch',id+': outer reentry never restarts combat');
  f.player.position.z=9;f.world.terrain.place(f.player.position);e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.returning,false,id);await adapter.dispose();
 }
});

test('territory capture release is actor-owned; wall routing, reactions and dormant reuse keep native state',async t=>{
 const f=await fixture(t),adapter=f.factory('gray-wolf.r1'),zone={x:0,z:0,radius:12,returnRadius:.4,reengageRadius:10};
 await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});const e=adapter.encounter;
 e.brain.hit({damage:1});
 f.world.navigation=new VillageNavigation([{id:'territory-wall',x:0,z:4,radius:.8,height:3}]);e.actor.position.set(0,0,8);e.brain.startAction('pin');
 assert.equal(e.grab.start(f.player,{},e.brain.serial),true);assert.strictEqual(e.combat.grabOwner,e);f.player.position.z=20;f.world.terrain.place(f.player.position);const playerBefore=f.player.position.clone();e.update(1/30,f.player);
 assert.equal(e.grab.active,false);assert.equal(e.combat.grabOwner,null);assert.deepEqual(f.player.position.asArray(),playerBefore.asArray());
 let sideStep=false;for(let frame=0;frame<480&&!adapter.snapshot().territory.arrived;frame++){e.update(1/30,f.player);sideStep||=Math.abs(e.actor.position.x)>.3;assert.ok(f.world.navigation.free(e.actor.position,e.radius));}
 assert.equal(sideStep,true,'return follows the existing route around the real wall');assert.equal(adapter.snapshot().territory.arrived,true);
 e.brain.hit({damage:10,heavy:true});assert.equal(e.brain.mode,'down');e.update(1/30,f.player);assert.equal(e.brain.mode,'down','return does not overwrite a real knockdown');
 const other={id:'another-grabber'};e.combat.grabOwner=other;adapter.hide();assert.strictEqual(e.combat.grabOwner,other,'retiring this actor never resets another capture owner');e.combat.grabOwner=null;
 f.world.navigation=new VillageNavigation([]);f.player.position.set(0,0,6);await adapter.activate({position:new Vector3(5,0,0),row:{territory:{x:5,z:0,radius:4,returnRadius:.3,reengageRadius:3}}},{preparation:prepare()});
 assert.equal(adapter.snapshot().territory.x,5);assert.equal(adapter.snapshot().territory.home.x,5,'a pooled life adopts the new group territory and home');
 e.actor.position.x=10;e.combat.grabOwner=other;e.update(1/30,f.player);assert.equal(adapter.snapshot().territory.phase,'disengage');assert.strictEqual(e.combat.grabOwner,other,'territory exit never releases another actor grab');e.combat.grabOwner=null;
 adapter.hide();await adapter.activate({position:new Vector3()},{preparation:prepare()});assert.equal(adapter.snapshot().territory.enabled,false,'a row without territory disables the previous group leash');
 await adapter.dispose();const manual=f.factory('gray-wolf.r1');await manual.activate({position:new Vector3()},{preparation:prepare()});assert.equal(manual.snapshot().territory,undefined);assert.strictEqual(manual.encounter.update,Object.getPrototypeOf(manual.encounter).update,'manual summons keep their original encounter update');
 await manual.dispose();f.world.release='moonforest-0.1';const legacy=f.factory('guardian-bear.standard');await legacy.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});assert.equal(legacy.snapshot().territory,undefined,'0.1 never enables authored territory behavior');assert.strictEqual(legacy.encounter.update,Object.getPrototypeOf(legacy.encounter).update);
});

test('ambient walking uses native rise; resting watch confirms inner presence with game dt and keeps outer combat hysteresis',async t=>{
 const f=await fixture(t);f.world.mapId='village';f.player.position.set(0,0,20);
 const adapter=f.factory('gray-wolf.r1'),zone={x:0,z:0,radius:12,combatRadius:4,wanderRadius:2,returnRadius:.4,reengageRadius:10};
 await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});const e=adapter.encounter,publicState=e.territoryState;e.brain.random=()=>.5;e.actor.rotation.y=-2;
 e.update(.1,f.player);assert.equal(e.actor.rotation.y,-2,'ambient idle preserves yaw instead of snapping toward the distant player');
 let sawRise=false,sawWalk=false;
 for(let frame=0;frame<160&&!sawWalk;frame++){e.update(.1,f.player);const status=adapter.snapshot().territory;sawRise||=e.brain.state==='Rise_From_Lie_R5';sawWalk||=e.brain.state==='Wolf_Walk_R5';assert.equal(publicState.phase,'ambient');assert.equal(publicState.engaged,false);assert.notEqual(e.brain.mode,'attack');assert.equal(e.ring.isVisible,false);if(status.ambientMoving)assert.ok(Math.hypot(status.target.x-status.home.x,status.target.z-status.home.z)<=2+1e-6);}
 assert.equal(sawRise,true,'a lying wolf plays the existing complete rise before ambient walking');assert.equal(sawWalk,true);
 adapter.hide();f.player.position.set(8,0,0);await adapter.activate({position:new Vector3(),row:{territory:zone}},{preparation:prepare()});e.actor.rotation.y=-Math.PI/2;
 const yaw=e.actor.rotation.y;e.update(.1,f.player);assert.strictEqual(e.territoryState,publicState);assert.equal(publicState.phase,'watch');assert.equal(e.brain.state,'Alert_Lie_R5');assert.equal(e.actor.rotation.y,yaw,'rest watch keeps the body heading and leaves gaze to the head pose');
 for(let frame=0;frame<15;frame++)e.update(.1,f.player);assert.equal(publicState.engaged,false,'outer presence never attacks');assert.equal(adapter.snapshot().combat,false);
 f.player.position.set(0,0,3);for(let frame=0;frame<8;frame++)e.update(.1,f.player);assert.equal(publicState.engaged,false);
 const clock=adapter.snapshot().territory.innerTime;for(let frame=0;frame<12;frame++)e.update(0,f.player);assert.equal(adapter.snapshot().territory.innerTime,clock,'pause advances no awareness clock');
 e.update(.1,f.player);e.update(.1,f.player);assert.equal(publicState.phase,'combat');assert.equal(publicState.engaged,true);assert.equal(e.brain.state,'Rise_From_Lie_R5','combat preparation rises rather than blending directly from lying into standing');
 const riseTime=e.brain.time;e.brain.hit({damage:1});assert.equal(adapter.snapshot().territory.rising,true,'a minor hit during the rise cannot skip its remaining source pose');e.update(.1,f.player);assert.ok(e.brain.time>riseTime);
 for(let frame=0;frame<60&&adapter.snapshot().territory.rising;frame++)e.update(.1,f.player);assert.equal(adapter.snapshot().territory.rising,false);
 f.player.position.z=11;e.update(.1,f.player);assert.equal(publicState.phase,'combat','engaged combat persists through the outer watch ring');
 f.player.position.z=20;e.update(.1,f.player);assert.equal(publicState.engaged,false);assert.equal(e.ring.isVisible,false);
});

test('a wall or cliff between an inner-ring player and the monster keeps the encounter in watch until the approach is clear',async t=>{
 const f=await fixture(t);f.player.position.set(0,0,3);f.world.terrain.place(f.player.position);
 f.world.navigation=new VillageNavigation([{id:'cliff-between',x:0,z:1.5,radius:.4,height:10}]);
 const adapter=f.factory('gray-wolf.r1');await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:4,wanderRadius:2}}},{preparation:prepare()});
 for(let frame=0;frame<40;frame++)adapter.encounter.update(.1,f.player);
 assert.equal(adapter.encounter.territoryState.phase,'watch');assert.equal(adapter.snapshot().combat,false);
 f.world.navigation=new VillageNavigation([]);for(let frame=0;frame<10;frame++)adapter.encounter.update(.1,f.player);
 assert.equal(adapter.encounter.territoryState.phase,'combat');assert.equal(adapter.snapshot().combat,true);await adapter.dispose();
});

test('a walking canine can settle back into lying rest using its real rise keys in reverse without changing rig scale',async t=>{
 const f=await fixture(t);f.world.mapId='village';f.player.position.set(0,0,40);
 const adapter=f.factory('gray-wolf.r1');await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:4,wanderRadius:2}}},{preparation:prepare()});
 const e=adapter.encounter;e.brain.random=()=>.5;
 const scales=e.asset.transformNodes.map(node=>[node,node.scaling.clone()]);let sawWalk=false,sawSettle=false,restored=false,previous=null;
 for(let frame=0;frame<450&&!restored;frame++){
  e.update(.1,f.player);e.alignPose();const status=adapter.snapshot().territory;
  sawWalk||=e.brain.state==='Wolf_Walk_R5';
  if(status.settling){assert.ok(sawWalk);assert.equal(e.brain.state,'Rise_From_Lie_R5');if(previous!==null)assert.ok(e.brain.time<previous,'the actual source clock samples backward');previous=e.brain.time;sawSettle=true;}
  if(sawSettle&&!status.settling&&e.brain.state==='Rest_Lie_R5')restored=true;
  for(const [node,scale]of scales)assert.ok(node.scaling.equalsWithEpsilon(scale,1e-5),node.name+' retains its rig scale');
  assert.equal(status.phase,'ambient');assert.equal(status.engaged,false);assert.equal(e.ring.isVisible,false);
 }
 assert.equal(sawSettle,true);assert.equal(restored,true,'rest recurs after wandering instead of remaining standing forever');await adapter.dispose();
});

test('all territorial species hold their body heading while watching and wait in game time before turning home',async t=>{
 const f=await fixture(t);
 for(const id of ['fox.r1','gray-wolf.r1','boar.r1','alpha-wolf.r8','guardian-bear.standard']){
  f.player.position.set(7,0,0);f.world.terrain.place(f.player.position);
  const adapter=f.factory(id);await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:3,wanderRadius:0,returnRadius:.4}}},{preparation:prepare()});
  const e=adapter.encounter;e.actor.rotation.y=.4;
  const scales=e.asset.transformNodes.map(node=>[node,node.scaling.clone()]);
  for(let frame=0;frame<8;frame++){
   e.update(.1,f.player);e.alignPose();assert.ok(Math.abs(e.actor.rotation.y-.4)<1e-6,id+': stationary body never follows the watch target');
   for(const [node,scale]of scales)assert.ok(node.scaling.equalsWithEpsilon(scale,1e-5),node.name+': watch never scales the rig');
  }
  e.actor.position.set(0,0,5);f.world.terrain.place(e.actor.position);f.player.position.set(0,0,20);f.world.terrain.place(f.player.position);
  const before=e.actor.position.clone(),yaw=e.actor.rotation.y;e.update(.1,f.player);
  assert.equal(e.territoryState.phase,'disengage');assert.equal(adapter.snapshot().territory.disengageRemaining,MONSTER_DISENGAGE_SECONDS);assert.equal(adapter.snapshot().combat,false);
  for(let check=0;check<20;check++)e.update(0,f.player);
  assert.equal(adapter.snapshot().territory.disengageRemaining,MONSTER_DISENGAGE_SECONDS,'paused checks cannot consume the delay');
  for(let frame=0;frame<24;frame++){e.update(.1,f.player);e.alignPose();assert.equal(e.territoryState.phase,'disengage');assert.ok(Vector3.Distance(e.actor.position,before)<1e-5,id+': no premature homeward displacement');assert.ok(Math.abs(e.actor.rotation.y-yaw)<1e-6,id+': does not immediately turn its back');}
  e.update(.1,f.player);assert.equal(e.territoryState.phase,'return',id+': returns only after the cautious pause');await adapter.dispose();
 }
});

test('noticing the player during an ambient rise returns to lying watch instead of finishing the stand-up',async t=>{
 const f=await fixture(t);f.world.mapId='village';
 for(const id of ['gray-wolf.r1','stylized-wolf.r1','wolf-3.r1','alpha-wolf.r8','fox.r1']){
  f.player.position.set(0,0,40);const adapter=f.factory(id);await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:4,wanderRadius:2}}},{preparation:prepare()});const e=adapter.encounter;e.brain.random=()=>.5;
  e.alignPose();const resting=e.nodes.pelvis.getAbsolutePosition().y-e.actor.position.y;
  for(let frame=0;frame<80&&!adapter.snapshot().territory.rising;frame++)e.update(.1,f.player);
  assert.equal(adapter.snapshot().territory.rising,true,id);for(let frame=0;frame<7;frame++)e.update(.1,f.player);e.alignPose();const raised=e.nodes.pelvis.getAbsolutePosition().y-e.actor.position.y;
  f.player.position.set(8,0,0);const body=e.actor.rotation.y,location=e.actor.position.clone();let highest=-Infinity;
  for(let frame=0;frame<80;frame++){e.update(.1,f.player);e.alignPose();const status=adapter.snapshot().territory;assert.equal(status.phase,'watch');assert.equal(status.rising,false);assert.equal(status.engaged,false);assert.ok(Math.abs(e.actor.rotation.y-body)<1e-6);assert.ok(Vector3.Distance(e.actor.position,location)<1e-5,JSON.stringify({id,frame,from:location.asArray(),to:e.actor.position.asArray(),state:e.brain.state,time:e.brain.time}));highest=Math.max(highest,e.nodes.pelvis.getAbsolutePosition().y-e.actor.position.y);}
  assert.equal(e.brain.state,'Alert_Lie_R5',id+': lies while watching');assert.ok(highest<=raised+.025,id+': notice does not finish standing');assert.ok(Math.abs(e.nodes.pelvis.getAbsolutePosition().y-e.actor.position.y-resting)<.025,id+': actual pelvis returns to its lying height');await adapter.dispose();
 }
});

test('ambient walk advances in world space and follows accepted travel; a blocked route stops its gait',async t=>{
 const f=await fixture(t);f.world.mapId='village';f.player.position.set(0,0,40);const adapter=f.factory('gray-wolf.r1');await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:4,wanderRadius:2}}},{preparation:prepare()});const e=adapter.encounter;e.brain.random=()=>.5;
 for(let frame=0;frame<100&&e.brain.mode!=='move';frame++)e.update(.1,f.player);
 assert.equal(e.brain.mode,'move');const start=e.actor.position.clone();for(let frame=0;frame<5;frame++)e.update(.1,f.player);assert.ok(Vector3.Distance(e.actor.position,start)>.4,'walking must move the actor, not only its feet');
 const original=f.world.navigation.constrain,beforePhase=e.brain.time,duration=e.brain.durations.Wolf_Walk_R5;
 f.world.navigation.constrain=(position,previous)=>{position.x=previous.x+(position.x-previous.x)*.5;position.z=previous.z+(position.z-previous.z)*.5;return position;};e.update(.1,f.player);assert.ok(Math.abs((e.brain.time-beforePhase+duration)%duration-.05*(e.balance.locomotionPlaybackRate??1))<1e-5,'half the accepted travel advances only half the foot phase');
 f.world.navigation.constrain=(position,previous)=>position.copyFrom(previous);const blocked=e.actor.position.clone();e.update(.1,f.player);assert.ok(Vector3.Distance(e.actor.position,blocked)<1e-6);assert.notEqual(e.brain.mode,'move');assert.notEqual(e.brain.state,'Wolf_Walk_R5');
 for(let frame=0;frame<15;frame++){e.update(.1,f.player);assert.notEqual(e.brain.state,'Wolf_Walk_R5','a blocked actor waits instead of walking in place');}
 f.world.navigation.constrain=original;await adapter.dispose();
});

test('actual quadruped watch faces stay clear of the chest in lying, standing and settling poses',async t=>{
 const f=await fixture(t);let poses=0;
 for(const id of ['alpha-wolf.r8','gray-wolf.r1','stylized-wolf.r1','wolf-3.r1','fox.r1','boar.r1']){
  f.player.position.set(0,0,8);const adapter=f.factory(id);await adapter.activate({position:new Vector3(),row:{territory:{x:0,z:0,radius:12,combatRadius:3,wanderRadius:0}}},{preparation:prepare()});const e=adapter.encounter;
  for(const [clip,time]of [['Rest_Lie_R5',0],['Circle_Watch_R5',0],['Rise_From_Lie_R5',1.1]]){
   e.v02Pose?.restore();e.brain.start(clip,'idle');e.brain.time=time;e.brain.behavior='rest';e.player=f.player;e.dt=1/60;e.animator.transition(clip,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.alignPose();
   const source=new Map(e.asset.transformNodes.map(n=>[n,{position:n.position.clone(),scale:n.scaling.clone(),rotation:n.rotationQuaternion?.clone()}])),head=e.nodes.head,neck=e.nodes.neck,chest=e.nodes.chest,jaw=e.nodes.jaw,offset=e.contactShape('jaw','maul').offset;
   const headDistance=Vector3.Distance(head.getAbsolutePosition(),chest.getAbsolutePosition()),muzzle=Vector3.TransformCoordinates(offset,jaw.getWorldMatrix()),muzzleDistance=Vector3.Distance(muzzle,chest.getAbsolutePosition());
   for(const [x,y,z]of [[0,0,2],[0,0,-2],[4,0,0],[-4,0,0],[0,-2,.2],[0,8,-1]]){
    e.v02Pose.restore();e.v02Pose.watchActive=false;f.player.position.set(x,y,z);
    for(let frame=0;frame<40;frame++){
     e.v02Pose.restore();e.animator.transition(clip,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);e.brain.behavior='territory-watch';e.alignPose();
     const origin=head.getAbsolutePosition(),towards=chest.getAbsolutePosition().subtract(origin).normalize(),forward=Vector3.TransformNormal(Vector3.Up(),head.getWorldMatrix()).normalize(),teeth=Vector3.TransformCoordinates(offset,jaw.getWorldMatrix());
     assert.ok(Vector3.Dot(forward,towards)<0,JSON.stringify({id,clip,target:[x,y,z],frame,reason:'face must not look into the chest'}));assert.ok(Vector3.Distance(origin,chest.getAbsolutePosition())>=headDistance*.94-1e-5);assert.ok(Vector3.Distance(teeth,chest.getAbsolutePosition())>=muzzleDistance*.94-1e-5);
     for(const [node,before]of source){assert.ok(node.position.equalsWithEpsilon(before.position,1e-6));assert.ok(node.scaling.equalsWithEpsilon(before.scale,1e-6));if(node!==head&&node!==neck&&before.rotation)assert.ok(node.rotationQuaternion.equalsWithEpsilon(before.rotation,1e-5),node.name+': head attention must not change the body');}
    }
    const once=head.rotationQuaternion.clone();e.alignPose();assert.ok(head.rotationQuaternion.equalsWithEpsilon(once,1e-5),'repeated pose queries cannot accelerate attention');poses++;
   }
  }
  await adapter.dispose();
 }
 t.diagnostic(poses+' real model/pose/target conditions; no skin/texture/LOD edits or GPU claim');
});
