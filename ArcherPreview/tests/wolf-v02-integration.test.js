import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WolfV02Encounter} from '../src/wolf-v02-encounter.js';
import {WOLF_V02_ACTIONS,WOLF_V02_BY_ID,WOLF_V02_BRACE,WOLF_V02_DEATH} from '../src/wolf-v02-spec.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';
import {WOLF_V02_AUTHORED_CLIPS} from '../src/wolf-v02-authored-clips.js';

const base=new URL('../public/assets/',import.meta.url),rows=[];
const maps=[['village',createVillageTerrain,villageObstacles],['great-plains',createGreatPlainsTerrain,plainsObstacles],['monster-forest',createMonsterForestTerrain,forestObstacles],['witch-cave',createWitchCaveTerrain,caveObstacles]];
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
async function fixture(t,map=maps[1],release='moonforest-0.2'){
 setWorldCharacter({'village':'warrior-v3','great-plains':'warrior-plains','monster-forest':'warrior-v4','witch-cave':'warrior-v5'}[map[0]]);t.after(()=>setWorldCharacter('warrior'));
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const config=JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 container.animationGroups.forEach(g=>g.stop());const paint=new StandardMaterial('paint',scene);for(const m of container.meshes)if(m.getTotalVertices())m.material=paint;
 const models=new BossModelLibrary(scene,'alpha-wolf');models.config=config;models.container=container;models.load=async()=>{};
 let instances=0;const instantiate=models.instantiate.bind(models);models.instantiate=async()=>{instances++;return instantiate();};
 const [mapId,terrainFn,obstacles]=map,terrain=terrainFn(),navigation=new (mapId==='witch-cave'?CaveNavigation:VillageNavigation)(obstacles());
 const casters=new Set(),world={scene,mapId,release,terrain,navigation,shadows:{addShadowCaster(mesh){casters.add(mesh);},removeShadowCaster(mesh){casters.delete(mesh);}}};
 const battle=new BossBattle(world,()=>{},()=>{},()=>{},{wolfModels:models}),player=new TransformNode('player',scene);player.metadata={playerDimensions:WARRIOR_DIMENSIONS};player.position.set(0,0,6);terrain.place(player.position);
 battle.preparationOptions={frame:async()=>{},maxBlocks:4};
 t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});return {battle,player,world,models,config,scene,casters,get instances(){return instances;}};
}
const counts=scene=>({meshes:scene.meshes.length,geometry:scene.geometries.length,materials:scene.materials.length,skeletons:scene.skeletons.length,groups:scene.animationGroups.length,morph:scene.morphTargetManagers.length,textures:scene.textures.length,nodes:scene.transformNodes.length,activeAnimatables:scene._activeAnimatables.length,observers:Object.fromEntries(Object.keys(scene).filter(k=>k.endsWith('Observable')&&scene[k]?.observers).map(k=>[k,scene[k].observers.length]))});
const plainWorld=f=>{f.world.navigation=null;f.world.terrain={place(v){v.y=0;},heightAt(){return 0;}};};
async function begin(f,id,speed=1){
 assert.equal(await f.battle.summon(f.player,1,'wolf'),true);const e=f.battle.encounters[0],action=WOLF_V02_BY_ID[id];
 e.actor.position.set(0,0,0);e.actor.rotation.y=0;f.player.position.set(0,0,action.preferredDistance);f.player.rotation.y=Math.PI;
 e.brain.configureAttacks({custom:true,sequence:[id],speed});e.brain.startAction(id);e.playerHp=500;e.playerInvulnerable=0;
 return e;
}
function frame(f,e,dt,action={state:'idle'},sample=null,shield=null){
 f.battle.update(dt,f.player);const before=e.playerHp,behavior=e.brain.behavior;f.battle.poseAndContacts(f.player,action,sample,shield);
 if(['anticipation','recovery'].includes(behavior))assert.equal(e.playerHp,before,`${behavior} cannot deal damage`);
}
test.after(()=>{fs.mkdirSync('reports/wolf-v02-validation',{recursive:true});fs.writeFileSync('reports/wolf-v02-validation/integration.json',JSON.stringify({scope:'Actual packed R8 geometry/rig, authored sampler and Babylon NullEngine with real four-map terrain/navigation for lifecycle. Materials are replaced for CPU-only tests. GPU, physical-device FPS/heat and visual animation approval remain unmeasured.',cases:rows},null,2)+'\n');});

test('only the explicit 0.2 world selects the new wolf encounter and 0.1/default retain the original class',async t=>{
 for(const release of ['moonforest-0.1',undefined,'moonforest-0.2']){
  const f=await fixture(t,maps[1],release);if(release===undefined)delete f.world.release;
  const e=f.battle.manualEncounter('wolf',0);assert.strictEqual(e.constructor,release==='moonforest-0.2'?WolfV02Encounter:WolfEncounter);
  plainWorld(f);f.player.position.set(0,0,0);
  const factory=createActorEncounterFactory({world:f.world,battle:f.battle,getPlayer:()=>f.player,libraryFactory:()=>({library:f.models,owned:false})}),adapter=factory('alpha-wolf.r8');
  try{assert.strictEqual(adapter.encounter.constructor,release==='moonforest-0.2'?WolfV02Encounter:WolfEncounter);await adapter.activate({position:new Vector3(0,0,9)});const animator=adapter.encounter.animator,before=counts(f.scene);adapter.hide();await adapter.activate({position:new Vector3(0,0,9)});assert.strictEqual(adapter.encounter.animator,animator);assert.deepEqual(counts(f.scene),before);}finally{await factory.dispose();}
 }
 rows.push({case:'release-routing',manualSummonAndAuthoredActor:true,legacyAndDefaultUseOriginal:true,onlyExplicitV02UsesVariant:true});
});

test('0.2 preserves all twelve approved R8 local poses, root pitch and lunge body height',async t=>{
 const f=await fixture(t);plainWorld(f);const e=await begin(f,'lunge'),oracle=new WolfEncounter(f.world,()=>{},()=>{},()=>{},{loadAsset:()=>f.models.instantiate()});
 await oracle.summon(f.player,{position:Vector3.Zero(),rotationY:0});let checked=0;const lungeHeights=[];
 for(const clip of f.config.catalog)for(const time of [...new Set([0,clip.duration*.37,clip.duration*.73,clip.duration,...(clip.name===WOLF_CLIPS.lunge?[2.02]:[])])]){
  // Compare the unchanged source sampler/carrier before the intentional live
  // head-attention/foot layer, which has its own actual-world integration gate.
  e.v02Pose?.restore();e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.start(clip.name,'idle');e.brain.time=time;e.animator.transition(clip.name,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(0);WolfEncounter.prototype.alignPose.call(e);
  oracle.actor.position.setAll(0);oracle.actor.rotation.y=0;oracle.brain.start(clip.name,'idle');oracle.brain.time=time;oracle.animator.transition(clip.name,{clipTime:time,actionId:oracle.brain.serial,blendDuration:0});oracle.animator.update(0);oracle.alignPose();
  for(const name of ['root','pelvis','chest','head','jaw','fore.L.paw','fore.R.paw']){
   const a=name==='root'?e.animator.root:e.nodes[name],b=name==='root'?oracle.animator.root:oracle.nodes[name];
   assert.ok(Vector3.Distance(a.position,b.position)<1e-6);assert.ok(Vector3.Distance(a.scaling,b.scaling)<1e-6);assert.ok(Math.abs(Math.abs(a.rotationQuaternion.dot(b.rotationQuaternion))-1)<1e-6);
   assert.ok(Vector3.Distance(a.getAbsolutePosition(),b.getAbsolutePosition())<1e-5);
  }
  const root=e.animator.root.getAbsolutePosition();assert.ok(Math.abs(root.x-e.actor.position.x)<1e-5&&Math.abs(root.z-e.actor.position.z)<1e-5,'sampled planar root is cancelled exactly once');
  if(clip.name===WOLF_CLIPS.lunge)lungeHeights.push({time,pelvis:e.nodes.pelvis.getAbsolutePosition().y});checked++;
 }
 assert.ok(Math.max(...lungeHeights.map(p=>p.pelvis))-Math.min(...lungeHeights.map(p=>p.pelvis))>.5,'authored jump body height remains present');oracle.hide();
 rows.push({case:'source-pose-preservation',sampledPoses:checked,unchangedNodeScale:true,pitchAndBodyJumpPreserved:true,lungeHeights});
});

test('actual 0.2 attacks land at their authored contact poses once at 30/60 Hz and 0.5/1/2 speed',async t=>{
 const f=await fixture(t);plainWorld(f);
 for(const fps of [30,60])for(const speed of [.5,1,2])for(const action of WOLF_V02_ACTIONS){
  const e=await begin(f,action.id,speed),initial=f.player.position.clone(),serialHits=new Map();let impacts=0,totalDamage=0,captured=false,frames=0,hitPos=null;
  const original=e.hitPlayer.bind(e);e.hitPlayer=(...args)=>{const before=e.playerHp;original(...args);if(e.playerHp<before){impacts++;totalDamage+=before-e.playerHp;serialHits.set(e.brain.serial,(serialHits.get(e.brain.serial)??0)+1);hitPos={actor:e.actor.position.asArray(),sourceTime:e.brain.time,behavior:e.brain.behavior};}};
  try{while(frames++<1800&&(e.brain.mode==='attack'||e.brain.behavior==='recovery'||e.grab.active)){frame(f,e,1/fps);captured||=e.grab.active;}}
  finally{e.hitPlayer=original;}
  assert.ok(frames<1800,'attack and recovery must finish');assert.equal(impacts,action.chain?2:1,JSON.stringify({id:action.id,speed,fps,actor:e.actor.position.asArray(),player:f.player.position.asArray(),brain:e.brain.inspect?.(),hitPos}));assert.ok([...serialHits.values()].every(n=>n===1),'each independent strike serial may damage once');
  assert.equal(captured,action.capture,action.id+' capture policy');assert.deepEqual(f.player.position.asArray(),initial.asArray(),'authored proxy root cannot teleport the player');
  if(action.id==='lunge'){assert.equal(totalDamage,40,'a standing dummy cannot authorize actual prone maul followups');assert.equal(e.v02LastContact?.part,'head');}
  assert.equal(e.animator.inspectBindingCache().created,0);assert.equal(e.animator.inspectBindingCache().currentBindings,0);assert.equal(f.scene._activeAnimatables.length,0);
  rows.push({case:'actual-contact',id:action.id,fps,speed,hits:impacts,strikeSerials:serialHits.size,captured,hitPos});
 }
});

test('actual bite contact respects dodge and shield, and a missed bite still leaves recovery',async t=>{
 const f=await fixture(t);plainWorld(f);
 for(const state of ['dodge','shieldPush']){
  const e=await begin(f,'quick-bite');let defended=false;
  for(let i=0;i<600&&e.brain.mode==='attack';i++){frame(f,e,1/60,{state,actionId:10});defended||=e.brain.mode==='hit'&&e.brain.state===WOLF_CLIPS.hit;}
  assert.equal(e.playerHp,500);if(state==='shieldPush'){assert.equal(defended,true);assert.equal(e.knockVelocity.lengthSquared(),0);}
  assert.equal(f.battle.combat.grabOwner,null);
 }
 const e=await begin(f,'quick-bite');f.player.position.set(0,0,12);let recovery=false;
 for(let i=0;i<600&&(e.brain.mode==='attack'||e.brain.behavior==='recovery');i++){frame(f,e,1/60);recovery||=e.brain.behavior==='recovery';}
 assert.equal(e.playerHp,500);assert.equal(recovery,true);rows.push({case:'defenses-and-miss',dodge:true,blockWithoutRecoil:true,missRecovery:true});
});

test('lunge anticipation tracks with a turn limit and commits its aim before the authored leap',async t=>{
 const f=await fixture(t);plainWorld(f);const e=await begin(f,'lunge'),action=WOLF_V02_BY_ID.lunge,dt=.01;
 for(let i=0;i<300&&e.brain.time<action.commitTime-.1;i++)f.battle.update(dt,f.player);
 const before=e.motionYaw;f.player.position.x=5;f.battle.update(dt,f.player);const tracked=e.motionYaw;
 assert.ok(Math.abs(tracked-before)>1e-6);assert.ok(Math.abs(tracked-before)<=1.6*dt+1e-7,'anticipation turn stays bounded');
 for(let i=0;i<100&&e.brain.time<action.commitTime;i++)f.battle.update(dt,f.player);
 const locked=e.motionYaw;f.player.position.x=-15;
 for(let i=0;i<10;i++){f.battle.update(dt,f.player);assert.equal(e.motionYaw,locked,'player movement cannot retarget the committed leap');}
 rows.push({case:'lunge-aim-lock',turnBeforeCommit:tracked-before,maximumTurn:1.6*dt,lockedAfterCommit:true});
});

test('heavy/bash interrupt before impact, capture escape and death release input, and defeat rewards deduplicate',async t=>{
 const f=await fixture(t);plainWorld(f);
 for(const id of ['judgment','shield-push']){
  const e=await begin(f,'quick-bite');e.player=f.player;e.dt=1/60;
  e.gate.collect=()=>({hits:[{id,damage:20,heavy:id==='judgment'}],hitStop:.03});
  try{e.poseAndContacts(f.player,{state:'idle'},{actionId:7},null);}finally{delete e.gate.collect;}
  assert.equal(e.brain.mode,'down');assert.equal(e.brain.state,WOLF_V02_DEATH);assert.ok(e.knockVelocity.length()>0);assert.equal(e.pendingEvents.length,0);
  const before=e.actor.position.clone();
  for(let i=0;i<45;i++)frame(f,e,1/60);assert.equal(e.playerHp,500);assert.notEqual(e.brain.mode,'attack');
  assert.ok(e.actor.position.subtract(before).dot(before.subtract(f.player.position))>0,'approved collapse and bounded recoil move away from the hit');
 }
 let e=await begin(f,'pin');const initial=f.player.position.clone();
 for(let i=0;i<300&&!e.grab.active;i++)frame(f,e,1/60);
 assert.equal(e.grab.active,true);assert.strictEqual(f.battle.combat.grabOwner,e);assert.equal(f.battle.escapeGrab(),true);assert.equal(e.grab.active,false);assert.equal(f.battle.combat.grabOwner,null);assert.deepEqual(f.player.position.asArray(),initial.asArray());
 for(let i=0;i<180&&(e.brain.mode==='attack'||e.brain.behavior==='recovery');i++)frame(f,e,1/60);assert.equal(e.playerHp,500);
 e=await begin(f,'pin');for(let i=0;i<300&&!e.grab.active;i++)frame(f,e,1/60);e.playerHp=0;frame(f,e,1/60);assert.equal(e.grab.active,false);assert.equal(f.battle.combat.grabOwner,null);
 e=await begin(f,'pin');for(let i=0;i<300&&!e.grab.active;i++)frame(f,e,1/60);let rewards=0;e.onDefeat=()=>rewards++;e.brain.hit({damage:900,heavy:true,ignoreDefense:true});
 for(let i=0;i<500&&!e.corpseGone;i++)frame(f,e,1/60);assert.equal(e.grab.active,false);assert.equal(f.battle.combat.grabOwner,null);assert.equal(rewards,1);assert.equal(e.corpseGone,true);assert.equal(e.brain.state,WOLF_V02_DEATH);
 rows.push({case:'interrupt-escape-death',heavy:true,bash:true,escape:true,playerDeathRelease:true,wolfDeathRelease:true,rewardCount:rewards});
});

test('0.2 1/5/10/20 manual summons on all maps retain independent rigs, sampler tables and stable warm resources',async t=>{
 for(const map of maps)await t.test(map[0],async t=>{
  const f=await fixture(t,map);for(const n of [1,5,10,20])assert.equal(await f.battle.summon(f.player,n,'wolf'),true);
  const enemies=[...f.battle.encounters],before=counts(f.scene);assert.equal(enemies.length,20);assert.equal(f.instances,20);assert.ok(enemies.every(e=>e.constructor===WolfV02Encounter&&e.animator.clips.size===12+WOLF_V02_AUTHORED_CLIPS.length));
  assert.equal(new Set(enemies.map(e=>e.asset.skeletons[0])).size,20);
  const body=e=>e.asset.meshes.find(m=>m.getTotalVertices()>1000&&!m.metadata?.moonforestOutline);assert.strictEqual(body(enemies[0]).geometry,body(enemies[1]).geometry);assert.notStrictEqual(body(enemies[0]).morphTargetManager,body(enemies[1]).morphTargetManager);
  const animators=enemies.map(e=>e.animator),channels=animators.map(a=>a.channels);
  for(let repeat=0;repeat<3;repeat++){f.battle.hide();assert.equal(f.casters.size,0);assert.equal(await f.battle.summon(f.player,20,'wolf'),true);assert.deepEqual(f.battle.encounters,enemies);assert.deepEqual(enemies.map(e=>e.animator),animators);assert.deepEqual(enemies.map(e=>e.animator.channels),channels);assert.deepEqual(counts(f.scene),before);assert.equal(f.instances,20);}
  rows.push({case:'summon-lifecycle',map:map[0],counts:[1,5,10,20],warmRepeats:3,instances:f.instances,resources:before,independentSkeletonsAndMorph:true,sharedGeometry:true});
 });
});

test('cancelled 0.2 preparation stays hidden, releases waiting work and retries on a changed map without new models',async t=>{
 const f=await fixture(t),gate=deferred(),entered=deferred();let held=false;
 f.battle.preparationOptions={maxBlocks:1,frame:async()=>{const e=f.battle.wolfPool[0];if(!held&&e?.assetPreparationStep>=2){held=true;entered.resolve();await gate.promise;}}};
 const pending=f.battle.summon(f.player,5,'wolf');await entered.promise;const preparation=f.battle.summonPreparation;f.battle.hide();f.world.mapId='village';
 assert.equal(await pending,false);assert.equal(preparation.pendingWaits,0);assert.equal(f.battle.encounters.length,0);assert.equal(f.casters.size,0);assert.ok(f.battle.wolfPool.every(e=>!e.active&&!e.actor?.isEnabled()));
 gate.resolve();await Promise.resolve();const before=f.instances;f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.summon(f.player,5,'wolf'),true);assert.equal(f.instances,5);assert.ok(before<=5);assert.ok(f.battle.wolfPool.every(e=>e.constructor===WolfV02Encounter));
 rows.push({case:'cancel-retry',pendingWaiters:preparation.pendingWaits,modelsAfterRetry:f.instances,lateActivation:false});
});
