import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {parseHTML} from 'linkedom';
import {ActorPopulation} from '../../src/actor-population.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from '../../src/actor-definitions.js';
import {createActorEncounterFactory} from '../../src/actor-encounter-adapter.js';
import {setupChapterQuests} from '../../src/chapter-quest.js';
import {createBossPreparation} from '../../src/boss-preparation.js';
import {isRuntimeOutline} from '../../src/character-outlines.js';
import {createActualActorFixture,nativeCounters,timerCounters,sha,drain} from './phase2-verification-fixtures.mjs';

const sources=['actor-population.js','actor-definitions.js','actor-encounter-adapter.js','animation.js','boss-encounter.js','boss-battle.js','chapter-quest.js'],sourceHashes=Object.fromEntries(sources.map(name=>[name,sha(readFileSync(new URL('../../src/'+name,import.meta.url)))]));
const cases=[],matrix=[],native=nativeCounters(),timers=timerCounters(),events={death:[],reward:[],respawn:[],grants:[]},errors=[];
const stats=values=>{const a=values.slice().sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1),over16_67ms:a.filter(value=>value>16.67).length,over50ms:a.filter(value=>value>50).length};};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const settle=async population=>{for(let i=0;i<10000&&population.diagnostics().pending;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(population.diagnostics().pending,0,'all population operations settle');};
const delta=(after,before)=>Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-before[key]]));
let f,population,factory,quest;
async function check(name,run){try{const detail=await run();cases.push({name,passed:true,...detail});console.log('verified '+name);}catch(error){cases.push({name,passed:false,error:error.stack});console.error(name+': '+error.stack);throw error;}}
try{
 f=await createActualActorFixture();f.world.mapId='village';f.player.position.set(0,0,-30);
 factory=createActorEncounterFactory({world:f.world,battle:f.battle,getPlayer:()=>f.player,libraryFactory:f.libraryFactory,rewardsEnabled:true,onDefeat:event=>events.grants.push(event)});
 population=new ActorPopulation({definitions:ACTOR_DEFINITIONS,createAdapter:factory,preparationFactory:f.preparationFactory,validateSpawn:(definition,context)=>validateActorSpawn(definition,f.world,context),limits:{total:20,active:20,estimatedMemoryBytes:512*1024*1024,concurrentPreparations:1},onDeath:record=>events.death.push([record.id,record.lifeId]),onReward:record=>events.reward.push([record.id,record.lifeId]),onRespawn:record=>events.respawn.push([record.id,record.lifeId]),onError:error=>errors.push(String(error.message??error))});population.setGeneration('first-map');
 const context=index=>({player:f.player,position:new Vector3((index%5-2)*5,0,Math.floor(index/5)*5),rotationY:Math.PI});
 const recipes={1:['guardian-bear.standard'],5:['elena.mourning','guardian-bear.standard',...Array(3).fill('hooded-goblin.standard')],10:['elena.mourning',...Array(4).fill('guardian-bear.standard'),...Array(5).fill('hooded-goblin.standard')],20:[...Array(2).fill('elena.mourning'),...Array(6).fill('guardian-bear.standard'),...Array(12).fill('hooded-goblin.standard')]};
 await check('actual shipped-model mixed population1/5/10/20 preserves count and native battle ownership',async()=>{
  for(const requested of [1,5,10,20]){
   population.clear();await settle(population);const start=performance.now(),records=[];
   for(const [index,id]of recipes[requested].entries())records.push(await population.spawn(id,context(index)));
   await settle(population);await drain();const coldOrExpansionNodeElapsedMs=performance.now()-start;
   assert.equal(records.length,requested);assert.equal(f.battle.encounters.length,requested);assert.equal(new Set(f.battle.encounters).size,requested);
   for(const record of records){assert.equal(record.state,'active');assert.equal(record.adapter.encounter.brain.hp,ACTOR_DEFINITIONS[record.definitionId].hp);assert.equal(record.adapter.encounter.radius,ACTOR_DEFINITIONS[record.definitionId].collider.radius);}
   const calls=new Map(records.map(record=>[record.id,{update:0,pose:0}])),restore=[];
   for(const record of records)for(const [method,key]of [['update','update'],['poseAndContacts','pose']]){const encounter=record.adapter.encounter,original=encounter[method];encounter[method]=function(...args){calls.get(record.id)[key]++;return original.apply(this,args);};restore.push(()=>encounter[method]=original);}
   const cpu=[],managerCpu=[];
   try{for(let frame=0;frame<64;frame++){
    const start=performance.now();population.update(1/60,{player:f.player});const managerEnd=performance.now();f.battle.update(1/60,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);population.observe({player:f.player});cpu.push(performance.now()-start);managerCpu.push(managerEnd-start);
   }}finally{for(const restoreMethod of restore)restoreMethod();}
   assert.ok([...calls.values()].every(row=>row.update===64&&row.pose===64),'the existing battle owns exactly one update and pose/contact pass per actor per frame');
   const render=f.renderCost();assert.ok(render.mainDraws>0&&render.shadowDraws>0,'real geometry draws both main and shadow');assert.ok(render.submittedTrianglesByRole.outline>0,'silhouette cost included');
   matrix.push({requested,actual:records.length,definitions:recipes[requested],coldOrExpansionNodeElapsedMs,counters:f.counters(),native:native.snapshot(),resources:f.counts(),timers:timers.snapshot(),manager:population.diagnostics(),fullCpuSimulationMs:stats(cpu),managerCpuMs:stats(managerCpu),drawCost:render});
  }
  await assert.rejects(population.spawn('hooded-goblin.standard',context(21)),error=>error.code==='ACTOR_POPULATION_LIMIT');assert.equal(f.battle.encounters.length,20,'cap rejects21 explicitly without silently lowering20');
  return {counts:[1,5,10,20],actualCounts:matrix.map(row=>row.actual),logicCap:20,deviceCap:'unverified',models:f.assets};
 });

 await check('two49982-triangle actors keep independent skeletons, morphs, animation targets and poses',async()=>{
  const pair=population.entries.filter(record=>record.definitionId==='elena.mourning').map(record=>record.adapter.encounter);assert.equal(pair.length,2);
  const [a,b]=pair,body=encounter=>encounter.asset.meshes.find(mesh=>mesh.name==='Elina_Chimera_Skin'),aa=body(a),bb=body(b);assert.notEqual(aa.skeleton,bb.skeleton);assert.notEqual(aa.morphTargetManager,bb.morphTargetManager);assert.equal(aa.geometry,bb.geometry,'base geometry remains shared');
  const targets=encounter=>new Set(encounter.asset.animationGroups.flatMap(group=>group.targetedAnimations.map(channel=>channel.target))),at=targets(a),bt=targets(b);assert.equal([...at].filter(target=>bt.has(target)).length,0);
  a.animator.transition('cast',{castVariant:'cast_alternate',clipTime:1.0,actionId:'independent-a'});a.animator.update(.2);b.animator.transition('walk',{clipTime:.8,actionId:'independent-b',loop:true});b.animator.update(.2);f.scene._animate(0);a.animator.ensurePoseCurrent();b.animator.ensurePoseCurrent();
  const bBefore=sha(Float32Array.from(bb.skeleton.getTransformMatrices(bb)));a.animator.transition('cast',{castVariant:'cast_slam',clipTime:1.65,actionId:'independent-a-next'});a.animator.update(.2);a.animator.ensurePoseCurrent();
  assert.equal(sha(Float32Array.from(bb.skeleton.getTransformMatrices(bb))),bBefore,'one pose update cannot mutate the other skeleton');
  const ah=sha(Float32Array.from(aa.skeleton.getTransformMatrices(aa))),bh=sha(Float32Array.from(bb.skeleton.getTransformMatrices(bb)));assert.notEqual(ah,bh);assert.equal(f.assets.find(row=>row.id==='mourning-elena').triangles,49982);
  return {baseTrianglesPerActor:49982,independentSkeletons:true,independentMorphManagers:true,sharedBaseGeometry:true,overlappingAnimationTargets:0,poseHashes:[ah,bh]};
 });

 await check('actual death, single reward, paused countdown and warm respawn create no new native bindings or resources',async()=>{
  const record=population.entries.find(record=>record.definitionId==='hooded-goblin.standard'),encounter=record.adapter.encounter,life=record.lifeId,states=new Set();encounter.brain.start('Walking','idle');assert.equal(encounter.brain.hit({damage:999999}),true);
  for(let frame=0;frame<80&&record.state!=='dormant';frame++){population.update(.1,{player:f.player});f.battle.update(.1,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);population.observe();states.add(record.state);population.observe();}
  assert.equal(record.state,'dormant');assert.ok(record.respawnRemaining>0);assert.equal(events.death.filter(row=>row[0]===record.id&&row[1]===life).length,1);assert.equal(events.reward.filter(row=>row[0]===record.id&&row[1]===life).length,1);assert.equal(events.grants.filter(row=>row.actorId===encounter.id).length,1);
  const remaining=record.respawnRemaining,clock=population.clock;population.setPaused(true);population.update(1000,{player:f.player});assert.equal(record.respawnRemaining,remaining);assert.equal(population.clock,clock);population.setPaused(false);
  const before={native:native.snapshot(),runtime:f.counters(),resources:f.counts(),timers:timers.snapshot()},started=performance.now();population.update(remaining+.001,{player:f.player});await settle(population);await drain();const warmRespawnNodeElapsedMs=performance.now()-started;
  assert.equal(record.state,'active');assert.equal(record.lifeId,life+1);assert.equal(encounter.brain.hp,180);assert.equal(encounter.pendingEvents.length,0);assert.equal(encounter.bossReaction.remaining,0);assert.equal(encounter.bossReaction.flashRemaining,0);assert.equal(encounter.grab.active,false);assert.ok(encounter.asset.meshes.every(mesh=>mesh.visibility===1&&mesh.overlayAlpha===0));
  assert.deepEqual(native.snapshot(),before.native,'warm respawn performs no Skeleton/Bone/AnimationGroup/Mesh/Material creation/rebinding');assert.deepEqual(f.counters(),before.runtime,'warm respawn performs no modelparse, geometry/material or morphtexture creation');
  const after=f.counts();for(const key of ['meshes','geometries','materials','textures','skeletons','animationGroups','morphManagers','transformNodes','sceneObservers','nodeObservers'])assert.equal(after[key],before.resources[key],key+' stable on warm respawn');
  assert.equal(events.respawn.filter(row=>row[0]===record.id&&row[1]===life+1).length,1);assert.equal(f.battle.encounters.filter(value=>value===encounter).length,1);
  return {states:[...states],lifeBefore:life,lifeAfter:record.lifeId,warmRespawnNodeElapsedMs,elapsedScope:'Node async preparation interval including scheduling/drain; not isolated synchronous CPU or GPU time.',nativeCreationAndBindingDelta:delta(native.snapshot(),before.native),runtimeDelta:delta(f.counters(),before.runtime),resourcesBefore:before.resources,resourcesAfter:after,timers:timers.snapshot(),rewardAndRespawnEachOnce:true};
 });

 await check('actual twenty actors repeat clear and warm reuse with resource and memory plateau',async()=>{
  const baseline=f.counts(),nativeBefore=native.snapshot(),runtimeBefore=f.counters(),cycles=[];
  for(let life=0;life<5;life++){
   population.clear();await settle(population);assert.equal(f.battle.encounters.length,0);
   const records=[];for(const [index,id]of recipes[20].entries())records.push(await population.spawn(id,context(index)));await settle(population);await drain();
   const counts=f.counts();for(const key of ['meshes','geometries','materials','textures','skeletons','animationGroups','morphManagers','transformNodes','sceneObservers','nodeObservers'])assert.equal(counts[key],baseline[key],key+' plateau life '+life);
   assert.deepEqual(counts.estimatedMemory,baseline.estimatedMemory);cycles.push({life,entries:population.diagnostics().entries,resources:counts,timers:timers.snapshot()});
  }
  assert.deepEqual(native.snapshot(),nativeBefore);assert.deepEqual(f.counters(),runtimeBefore);return {cycles:cycles.length,nativeDelta:delta(native.snapshot(),nativeBefore),runtimeDelta:delta(f.counters(),runtimeBefore),snapshots:cycles};
 });

 await check('NPC uses actual ChapterQuests.talk, preserves combat isolation, range, line of sight and busy guards',async()=>{
  population.clear();await settle(population);f.world.navigation={free:()=>true,findFree:p=>p,segmentClear:()=>lineOfSight};let lineOfSight=true;
  const {document,window}=parseHTML('<html><body><main id="app"><div class="top-actions"></div></main></body></html>'),create=document.createElement.bind(document);
  document.createElement=(name,...args)=>{const node=create(name,...args);if(name==='dialog'){Object.defineProperty(node,'open',{get(){return this.hasAttribute('open');}});node.showModal=()=>node.setAttribute('open','');node.close=()=>{node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));};}return node;};
  const state={ready:true,dead:false,combat:false,busy:false,map:'village',position:f.player.position},storage={getItem:()=>null,setItem(){}},props={release(){},dispose(){},update(){},load:async()=>true};
  quest=setupChapterQuests({root:document.getElementById('app'),world:f.world,storage,getState:()=>state,createProps:()=>props});
  const interactNpc=(id,position,range)=>state.ready&&state.map===f.world.mapId&&Math.hypot(position.x-state.position.x,position.z-state.position.z)<=Math.min(3,range)&&f.world.navigation.segmentClear(state.position,position,.05)&&quest.talk(id);
  let activity={};const npcFactory=createActorEncounterFactory({world:f.world,battle:f.battle,getPlayer:()=>f.player,libraryFactory:f.libraryFactory,interactNpc,getActivity:()=>activity}),npcPopulation=new ActorPopulation({definitions:ACTOR_DEFINITIONS,createAdapter:npcFactory,preparationFactory:f.preparationFactory,validateSpawn:(definition,context)=>validateActorSpawn(definition,f.world,context)}),npcRecord=await npcPopulation.spawn('village.guard',{player:f.player,position:f.player.position.add(new Vector3(0,0,2))}),npc=npcRecord.adapter;
  let animationUpdates=0;const update=npc.encounter.animator.update.bind(npc.encounter.animator);npc.encounter.animator.update=dt=>{animationUpdates++;return update(dt);};
  for(let frame=0;frame<60;frame++)npcPopulation.update(1/60,{player:f.player});assert.equal(npc.snapshot().decisionCount,60);assert.equal(animationUpdates,60);
  f.player.position.z-=30;const nearDecisions=npc.snapshot().decisionCount;for(let frame=0;frame<60;frame++)npcPopulation.update(1/60,{player:f.player});const farDecisions=npc.snapshot().decisionCount-nearDecisions;assert.ok(farDecisions<=2);assert.ok(npcPopulation.diagnostics().stats.farDecisionSkips>=50);assert.equal(animationUpdates,120,'far NPC pose remains full frequency');
  for(const key of ['incoming','projectile','questRelevant']){activity={[key]:true};const before=npc.snapshot().decisionCount;npcPopulation.update(.001,{player:f.player});assert.equal(npc.snapshot().decisionCount,before+1,key+' preserves far NPC significance');}activity={};f.player.position.z+=30;
  assert.equal(f.battle.encounters.length,0);assert.equal(npc.interact(),true);assert.equal(quest.inspect().facts['talk:guard'],1);assert.equal(npc.snapshot().dead,false);
  for(const [label,change,restore]of [['far',()=>f.player.position.z-=10,()=>f.player.position.z+=10],['blocked',()=>lineOfSight=false,()=>lineOfSight=true],['busy',()=>state.busy=true,()=>state.busy=false],['combat',()=>state.combat=true,()=>state.combat=false],['wrong-map',()=>state.map='great-plains',()=>state.map='village']]){change();assert.equal(npc.interact(),false,label+' blocks interaction');restore();}
  const scheduling=npcPopulation.diagnostics();npcPopulation.dispose();await npc.dispose();await npcFactory.dispose();quest.dispose();quest=null;delete f.world.navigation;return {actualQuestFact:'talk:guard',factCount:1,hostileBattleRegistrations:0,blockedCases:['far','line-of-sight','busy','combat','wrong-map'],nearDecisions,farDecisions,animationUpdates,farThreatAndQuestOverrides:['incoming','projectile','questRelevant'],scheduling};
 });

 await check('partial actual actor preparation is cancelled on map leave and cannot publish a late actor',async()=>{
  population.clear({dispose:true});await settle(population);f.scene.render();await drain();const baseline=f.counts(),gate=deferred(),entered=deferred();let hold=true;
  population.preparationFactory=options=>createBossPreparation({...options,frame:async()=>{if(hold&&population.entries.some(record=>record.adapter?.encounter.asset)){hold=false;entered.resolve();await gate.promise;}}});
  const pending=population.spawn('guardian-bear.standard',context(0));pending.catch(()=>{});await entered.promise;assert.ok(population.entries.some(record=>record.adapter?.encounter.asset));population.leaveMap();f.world.mapId='great-plains';gate.resolve();await assert.rejects(pending,{name:'AbortError'});await settle(population);await drain();
  assert.equal(population.diagnostics().entries,0);assert.equal(f.battle.encounters.length,0);f.scene.render();await drain();const after=f.counts();for(const key of ['meshes','skeletons','animationGroups','morphManagers','transformNodes','sceneObservers','nodeObservers'])assert.equal(after[key],baseline[key],key+' released after partial cancellation');
  population.preparationFactory=f.preparationFactory;const fresh=await population.spawn('guardian-bear.standard',context(1));await settle(population);assert.equal(fresh.state,'active');assert.equal(f.battle.encounters.length,1);population.clear({dispose:true});await settle(population);f.scene.render();await drain();f.world.mapId='village';return {latePublishedActors:0,freshMapActorSucceeded:true,resourcesBefore:baseline,resourcesAfter:after,timers:timers.snapshot()};
 });

 await check('real spawn validation rejects blocked, unsafe and wrong-map positions before model creation',async()=>{
  const before=f.counters();await assert.rejects(population.spawn('guardian-bear.standard',{player:f.player,position:f.player.position.clone()}),/safety/);
  f.world.navigation={free:()=>false};await assert.rejects(population.spawn('guardian-bear.standard',context(0)),/navigation/);delete f.world.navigation;
  f.world.mapId='great-plains';await assert.rejects(population.spawn('village.guard',context(0)),/map/);f.world.mapId='village';assert.deepEqual(f.counters(),before);assert.equal(population.diagnostics().entries,0);return {rejected:['player-safety-distance','blocked-navigation','wrong-map'],newModelParses:0,newPopulationEntries:0};
 });

 await check('idle eviction disposes actual actor pose ownership while caller-owned templates remain bounded',async()=>{
  const snapshots=[];
  for(let cycle=0;cycle<3;cycle++){await population.spawn('hooded-goblin.standard',context(0));await settle(population);population.clear();population.update(30.01,{player:f.player});await settle(population);f.scene.render();await drain();assert.equal(population.diagnostics().entries,0);assert.equal(population.diagnostics().estimatedBytes,0);assert.equal(f.battle.encounters.length,0);snapshots.push(f.counts());}
  for(const value of snapshots.slice(1))assert.deepEqual(value,snapshots[0]);return {cycles:3,snapshots,templatesCallerOwned:true,templateCpuBuffersRetainedByFixture:true,poolEstimatedBytesAfter:0,timers:timers.snapshot()};
 });

 await check('one registered data variant applies HP collider and clip map without mutating the shared source or default actor',async()=>{
  const base=ACTOR_DEFINITIONS['hooded-goblin.standard'],definition={...base,actorDefinitionId:'verification.goblin.variant',hp:275,collider:{...base.collider,radius:.44,stopDistance:1.3,separationRadius:.52},animation:{...base.animation,Walking:'Sneaky_Walk_inplace'}};population.definitions.set(definition.actorDefinitionId,definition);
  const custom=await population.spawn(definition.actorDefinitionId,context(0)),encounter=custom.adapter.encounter;assert.equal(encounter.brain.hp,275);assert.equal(encounter.brain.maxHp,275);assert.equal(encounter.radius,.44);assert.equal(encounter.stopDistance,1.3);assert.equal(encounter.separationRadius,.52);assert.equal(encounter.animator.clips.Walking.name,'Sneaky_Walk_inplace');assert.equal(f.libraries.get('hooded-goblin').config.animations.Walking,'Walking');
  const animator=encounter.animator,before=native.snapshot();population.recycle(custom);await population.spawn(definition.actorDefinitionId,context(0));assert.equal(encounter.animator,animator);assert.equal(encounter.brain.hp,275);assert.deepEqual(native.snapshot(),before);
  const ordinary=await population.spawn('hooded-goblin.standard',context(1));assert.equal(ordinary.adapter.encounter.brain.hp,180);assert.equal(ordinary.adapter.encounter.radius,.34);assert.equal(ordinary.adapter.encounter.animator.clips.Walking.name,'Walking');
  assert.throws(()=>factory({...definition,movement:{...base.movement,runSpeed:99}}),/Unsupported actor movement/);assert.throws(()=>factory({...ACTOR_DEFINITIONS['elena.mourning'],animation:{...ACTOR_DEFINITIONS['elena.mourning'].animation,idle:'Chimera_Organic_Walk_2p4s'}}),/Unsupported animation/);
  population.clear({dispose:true});await settle(population);f.scene.render();await drain();return {registeredDefinitionId:definition.actorDefinitionId,hp:275,collider:{radius:.44,stopDistance:1.3,separationRadius:.52},idleClip:'Sneaky_Walk_inplace',defaultActorHp:180,defaultIdleClip:'Walking',sourceConfigUnchanged:true,warmNativeIncrements:0,unsupportedMovementAndAuthoredMourningRemapRejected:true};
 });
 assert.deepEqual(Object.fromEntries(sources.map(name=>[name,sha(readFileSync(new URL('../../src/'+name,import.meta.url)))])),sourceHashes,'runtime source hashes unchanged throughout actual scenarios');
}catch(error){if(!cases.some(row=>!row.passed))cases.push({passed:false,error:error.stack});}
finally{quest?.dispose();population?.dispose();await factory?.dispose();await drain();f?.dispose();await drain();native.restore();}
const report={generatedAt:new Date().toISOString(),passed:cases.every(row=>row.passed),sourceHashes,cases,matrix,events,errors,remainingTimers:timers.snapshot(),limits:['Actual shipped geometry/indices/skin/morph/animation data, real scoped public glTF loader and production encounter/battle/ChapterQuests paths. EXT_meshopt bytes decoded offline with existing helper and loaded through virtual I/O.','Opaque1x1 material fixtures replace model image/KTX decoding. Morph texture-array calls use existing inert NullEngine shim. No pixels, driver/GPU or complete texture-memory result.','Resource memory is conservative manager estimates plus a deduplicated lower bound of actual CPU geometry/morph/skeleton buffers. Source templates are explicitly caller-owned in these scenarios and are disposed with the fixture.','The demonstrated20active logic limit is a configured test cap. Actual simultaneous-device-cap/60FPS, thermals and input latency are unverified.','CPU preparation/simulation timings are Node reference samples and cannot predict device FPS.']};timers.restore();writeFileSync(new URL('phase2-verification-actors.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:cases.length,failed:cases.filter(row=>!row.passed),counts:matrix.map(row=>row.actual),remainingTimers:report.remainingTimers},null,2));if(!report.passed)process.exitCode=1;
