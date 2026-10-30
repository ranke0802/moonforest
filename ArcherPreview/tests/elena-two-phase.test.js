import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion,StandardMaterial,PBRMaterial,FreeCamera} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel,BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MOURNING_SPELLS,MOURNING_SIZE,MOURNING_SIZE_SCALE,spellImpact} from '../src/elena-spec.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const base=new URL('../public/assets/',import.meta.url),cache=new Map();
const near=(a,b,tolerance=1e-6,label='value')=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const snapshot=f=>({meshes:f.scene.meshes.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,skeletons:f.scene.skeletons.length,materials:f.scene.materials.length,textures:f.scene.textures.length,managers:f.scene.morphTargetManagers.length,pool:f.battle.allPooled.length});
async function fixture(t,{pbr=false}={}){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  // NullEngine has no GPU upload completion; prepare the shared outline sampler.
  caveFogFallback(scene).getInternalTexture().isReady=true;
  // Exercise production bone float textures. NullEngine has no 2D-array GPU
  // backend, so morph shader verification uses its vertex-attribute route.
  Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=true;
  const camera=new FreeCamera('two-phase-review',new Vector3(29,9,-18),scene);camera.setTarget(new Vector3(29,7,-27));
  const loaded=[];
  async function library(name){
    const config=JSON.parse(readFileSync(new URL(name+'.json',base)));
    if(!cache.has(name))cache.set(name,readRuntimeGltf(new URL(config.model,base)));
    const source=await cache.get(name),gltf=structuredClone(source.gltf);
    for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
    for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
    for(const group of container.animationGroups)group.stop();
    for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=pbr?new PBRMaterial(name+'-shader-color',scene):new StandardMaterial(name+'-offline-color',scene);
    loaded.push({loader,container});
    return {config,container,loads:0,instances:0,async load(){this.loads=1;},async instantiate(){this.instances++;return {config,asset:instantiateBossModel(container)};}};
  }
  const elenaModels=await library('elena'),mourningModels=await library('mourning-elena'),defeats=[];
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels,mourningModels,onDefeat:event=>defeats.push(event)}),player=new TransformNode('two-phase-player',scene);player.position.set(29,6,-22);
  t.after(()=>{battle.hide();for(const {container,loader} of loaded){container.dispose();loader.dispose();}scene.dispose();engine.dispose();});
  return {engine,scene,world,battle,player,elenaModels,mourningModels,defeats};
}
function step(f,dt=1/60,{contacts=true}={}){
  f.battle.update(dt,f.player);f.scene._animate(0);
  if(contacts)f.battle.poseAndContacts(f.player,{state:'idle'},null,null);
}

test('boss selector reuses one Elena per phase near the player without changing player resources',async t=>{
  const f=await fixture(t),{battle,player,world}=f,events=[];battle.onDiagnosticEvent=event=>events.push(event);
  const stages=()=>events.map(event=>event.type==='stage'?event.stage:event.type);
  battle.combat.hp=321;battle.potions.remaining=2;battle.combat.defense=13;
  await battle.activateResident(player);
  assert.deepEqual(stages(),['begin','model','model','screen','model','ready']);events.length=0;
  await battle.summonResident(player,2);
  assert.deepEqual(stages(),['begin','model','model','screen','model','ready']);events.length=0;
  const witch=battle.mourningPool[0];assert.equal(witch.brain.hp,1800);assert.equal(witch.active,true);assert.equal(battle.encounters.length,1);
  assert.ok(world.navigation.free(witch.actor.position,MOURNING_SIZE.radius));assert.ok(Vector3.Distance(witch.actor.position,player.position)<5);
  assert.deepEqual(witch.home,{x:witch.actor.position.x,z:witch.actor.position.z});
  const before=snapshot(f);
  for(let i=0;i<8;i++){
    await battle.summonResident(player,1);const saint=battle.elenaPool[0];assert.equal(saint.active,true);assert.equal(saint.brain.hp,1200);
    assert.equal(witch.active,false);assert.equal(battle.encounters.length,1);
    await battle.transformResident(player);assert.equal(witch.brain.hp,1800);assert.equal(witch.active,true);
    assert.ok(witch.movementNavigation.free(witch.actor.position,witch.radius),'transformation must relocate if the smaller phase-one spot cannot fit all limbs');
    assert.deepEqual(witch.home,battle.residentHome);assert.deepEqual(snapshot(f),before);
    witch.brain.hit({damage:200});await battle.summonResident(player,2);assert.equal(witch.brain.hp,1800);
    assert.equal(battle.playerHp,321);assert.equal(battle.potions.remaining,2);assert.equal(battle.combat.defense,13);
  }
  assert.equal(f.elenaModels.instances,1);assert.equal(f.mourningModels.instances,1);
  assert.ok(events.every(event=>event.stage!=='screen'&&event.type!=='error'),'pooled summons must skip screen preparation');
  const phase=battle.residentPhase;world.cave=false;assert.equal(await battle.summonResident(player,1),false);assert.equal(battle.residentPhase,phase);
});

test('an enlarged resident or transformation finds a clear spawn outside player and cave walls',async t=>{
  const f=await fixture(t),{battle,player,world}=f;player.position.set(29,6,-27);battle.residentPhase=2;await battle.activateResident(player);const witch=battle.mourningPool[0];
  assert.ok(witch.movementNavigation.free(witch.actor.position,witch.radius));assert.ok(Math.hypot(witch.actor.position.x-player.position.x,witch.actor.position.z-player.position.z)>=witch.radius+.8);
  await witch.summon(player,{position:new Vector3(43,6,-27),rotationY:0});
  assert.ok(witch.movementNavigation.free(witch.actor.position,witch.radius));assert.ok(Math.hypot(witch.actor.position.x-player.position.x,witch.actor.position.z-player.position.z)>=witch.radius+.8);
  assert.equal(f.mourningModels.instances,1);assert.equal(witch.actor.scaling.x,witch.config.scale*MOURNING_SIZE_SCALE);
});
test('real phase-one defeat transforms once and preserves player state through phase-two trips, reset and final death',async t=>{
  const f=await fixture(t),{battle,player,world}=f;battle.combat.hp=312;battle.combat.defense=9;battle.potions.remaining=1;
  await Promise.all([battle.activateResident(player),battle.activateResident(player)]);const first=battle.elenaPool[0];
  assert.equal(first.displayName,'타락한 성녀 엘레나');assert.equal(first.phase,1);assert.equal(f.elenaModels.instances,1);
  first.brain.hit({damage:first.brain.maxHp});for(let i=0;i<91;i++)step(f,1/60,{contacts:false});
  const pending=battle.residentPending;assert.ok(pending);await Promise.all([pending,battle.activateResident(player),battle.transformResident(player)]);
  const second=battle.mourningPool[0];assert.equal(second.displayName,'비탄의 마녀 엘레나');assert.equal(second.phase,2);assert.ok(second.animator instanceof MourningElenaAnimator);
  assert.equal(f.mourningModels.instances,1);assert.equal(battle.encounters.length,1);assert.strictEqual(battle.encounters[0],second);assert.equal(first.actor.isEnabled(),false);assert.equal(f.defeats.length,0);
  assert.equal(battle.playerHp,312);assert.equal(battle.combat.defense,9);assert.equal(battle.potions.remaining,1);
  second.brain.hp=1137;second.brain.wait=100;step(f,.3);second.animator.walkTime=.47;const before=snapshot(f),initialBreath=second.animator.breathClock,initialWalk=second.animator.walkTime;
  for(let i=0;i<12;i++){
    const clocks=()=>Object.fromEntries(['walkTime','hairTime','breathClock','haloTime','castTime','gaitBlend'].map(key=>[key,second.animator[key]])),preserved=clocks();
    const hiddenClock=second.animator.breathClock;battle.hide();world.cave=false;assert.equal(await battle.activateResident(player),false);step(f,1);
    near(second.animator.breathClock,hiddenClock);assert.equal(second.actor.isEnabled(),false);
    world.cave=true;assert.equal(await battle.activateResident(player),true);assert.equal(second.brain.hp,1137);assert.equal(second.animator.walkTime,initialWalk);
    assert.strictEqual(battle.encounters[0],second);assert.deepEqual(snapshot(f),before);assert.deepEqual(clocks(),preserved,'map return must resample without advancing or resetting any clock');
  }
  assert.equal(second.animator.breathClock,initialBreath,'independent clocks resume exactly where they paused');
  t.diagnostic(JSON.stringify({roundTrips:12,resumeClockAdvance:second.animator.breathClock-initialBreath,poolCounts:snapshot(f)}));
  assert.equal(battle.playerHp,312);assert.equal(battle.combat.defense,9);assert.equal(battle.potions.remaining,1);
  await battle.activateResident(player,{reset:true});assert.equal(battle.residentPhase,1);assert.strictEqual(battle.encounters[0],first);assert.equal(first.brain.hp,first.brain.maxHp);assert.equal(second.actor.isEnabled(),false);
  assert.equal(f.elenaModels.instances,1);assert.equal(f.mourningModels.instances,1);assert.equal(battle.allPooled.length,2);
  await battle.transformResident(player);assert.strictEqual(battle.encounters[0],second);second.brain.hit({damage:9999});
  for(let i=0;i<360;i++)step(f,1/60,{contacts:false});assert.equal(f.defeats.length,1);assert.equal(f.defeats[0].kind,'elena');assert.equal(second.corpseGone,true);assert.equal(second.actor.isEnabled(),false);
  battle.hide();world.cave=false;world.cave=true;await battle.activateResident(player);step(f,1,{contacts:false});assert.equal(second.brain.hp,0);assert.equal(second.actor.isEnabled(),false);assert.equal(f.defeats.length,1);
  // A complete replay must revive the cached second phase after its first death.
  await battle.activateResident(player,{reset:true});assert.strictEqual(battle.encounters[0],first);assert.equal(first.brain.hp,1200);
  first.brain.hit({damage:9999});for(let i=0;i<91;i++)step(f,1/60,{contacts:false});assert.ok(battle.residentPending);await battle.residentPending;
  assert.strictEqual(battle.encounters[0],second);assert.equal(second.brain.hp,1800);assert.equal(second.corpseGone,false);assert.equal(second.actor.isEnabled(),true);
  assert.equal(f.elenaModels.instances,1);assert.equal(f.mourningModels.instances,1);assert.equal(f.defeats.length,1);assert.deepEqual(snapshot(f),before);
});

test('the actual mourning model library adopts one packed container without cloning morph managers or skeletons',async t=>{
  const f=await fixture(t),{container,config}=f.mourningModels,library=new BossModelLibrary(f.scene,'mourning-elena');
  library.container=container;library.config=config;library.load=async()=>{library.loads=1;};
  const originalSkeletons=[...container.skeletons],originalManagers=[...new Set(container.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))];assert.equal(originalManagers.length,1);
  const first=await library.instantiate(),after=snapshot(f);
  for(let i=0;i<12;i++){
    const again=await library.instantiate();assert.strictEqual(again.asset,first.asset);assert.strictEqual(again.config,config);assert.deepEqual(snapshot(f),after);
  }
  assert.deepEqual(first.asset.skeletons,originalSkeletons);first.asset.skeletons.forEach((skeleton,index)=>assert.strictEqual(skeleton,originalSkeletons[index]));
  const adoptedManagers=[...new Set(first.asset.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))];assert.deepEqual(adoptedManagers,originalManagers);assert.strictEqual(adoptedManagers[0],originalManagers[0]);
  assert.equal(f.scene.morphTargetManagers.filter(manager=>manager===originalManagers[0]).length,1);assert.equal(f.scene.skeletons.length,originalSkeletons.length);
});

test('first offline pose and same-frame relocation refresh the mesh root before bones and cloth',async t=>{
  const f=await fixture(t);f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];
  e.alignPose();e.animator.sample(0);const head=e.nodes.DEF_Head.getAbsolutePosition().clone(),relative=head.subtract(e.actor.position);
  assert.ok(Math.abs(relative.x)<2*MOURNING_SIZE_SCALE&&Math.abs(relative.z)<2*MOURNING_SIZE_SCALE&&relative.y>.5*MOURNING_SIZE_SCALE&&relative.y<4*MOURNING_SIZE_SCALE,'first head pose must follow the cave actor without scene.render: '+JSON.stringify({actor:e.actor.position.asArray(),head:head.asArray(),relative:relative.asArray()}));
  e.actor.position.set(31,6.25,-25);e.actor.rotation.y=2.7;e.alignPose();e.animator.sample(0);
  const expected=relative.applyRotationQuaternion(Quaternion.RotationYawPitchRoll(2.7,0,0)).add(e.actor.position);
  near(Vector3.Distance(e.nodes.DEF_Head.getAbsolutePosition(),expected),0,1e-4,'same-frame transformed head');
  for(let i=0;i<90;i++)e.animator.sample(1/60);
  for(const {bone} of e.animator.cloth)assert.ok(Vector3.Up().applyRotationQuaternion(bone.absoluteRotationQuaternion).y<-.985,bone.name);
});

test('leaving while phase two loads prevents resurrection, and reentry creates one phase-two resident',async t=>{
  const f=await fixture(t),{battle,player,world,mourningModels}=f;await battle.activateResident(player);
  let release;const gate=new Promise(resolve=>{release=resolve;});mourningModels.load=async function(){this.loads=1;await gate;};
  const first=battle.elenaPool[0];first.brain.hit({damage:9999});for(let i=0;i<91;i++)step(f,1/60,{contacts:false});
  const pending=battle.residentPending;assert.ok(pending);assert.equal(battle.residentPhase,2);assert.equal(mourningModels.instances,0);
  battle.hide();world.cave=false;release();assert.equal(await pending,false);assert.equal(battle.encounters.length,0);assert.equal(battle.mourningPool.length,0);assert.equal(first.actor.isEnabled(),false);
  world.cave=true;await Promise.all([battle.activateResident(player),battle.activateResident(player)]);assert.equal(mourningModels.instances,1);assert.equal(battle.encounters.length,1);assert.equal(battle.encounters[0].phase,2);
});

test('leaving during phase-two instantiation hides the completed actor and reuses it on return',async t=>{
  const f=await fixture(t),{battle,player,world,mourningModels}=f;await battle.activateResident(player);
  const instantiate=mourningModels.instantiate.bind(mourningModels);let release,reached;
  const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{reached=resolve;});
  mourningModels.instantiate=async()=>{reached();await gate;return instantiate();};
  const pending=battle.transformResident(player);await entered;assert.equal(battle.mourningPool.length,1);
  battle.hide();world.cave=false;release();assert.equal(await pending,false);assert.equal(battle.encounters.length,0);
  const resident=battle.mourningPool[0];assert.equal(resident.active,false);assert.equal(resident.actor.isEnabled(),false);assert.equal(resident.spell.mesh.isEnabled(),false);
  world.cave=true;await battle.activateResident(player);assert.equal(mourningModels.instances,1);assert.strictEqual(battle.encounters[0],resident);assert.equal(resident.actor.isEnabled(),true);
});

test('autonomous encounter path releases all five patterns once without source-root displacement',async t=>{
  const f=await fixture(t);f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];e.renderVisible=true;
  const patterns=[];
  for(let index=0;index<5;index++){
    e.brain.cast();patterns.push(e.brain.spell.pattern);const origin=e.actor.position.clone(),serial=e.brain.serial;let releases=0,plan;
    const castSeconds=e.brain.castLeadInRemaining+3/e.brain.attackPlaybackRate;
    for(let frame=0;frame<Math.floor(castSeconds*60)-1;frame++){
      f.battle.update(1/60,f.player);releases+=e.pendingEvents.filter(event=>event.kind==='ground').length;f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);
      near(Vector3.Distance(e.actor.position,origin),0);assert.equal(e.brain.serial,serial);assert.equal(e.brain.state,'cast');assert.equal(e.engaged,true);
      plan??=e.spell.plan;assert.strictEqual(e.spell.plan,plan);
    }
    assert.equal(releases,1);assert.equal(e.spell.fired,true);const hp=f.battle.playerHp;f.battle.poseAndContacts(f.player,{state:'idle'},null,null);assert.equal(f.battle.playerHp,hp);
    while(e.brain.mode==='attack')step(f);
  }
  assert.deepEqual(patterns,MOURNING_SPELLS.map(spell=>spell.pattern));assert.equal(f.defeats.length,0);
});

test('five real phase-two casts stay fixed, expose valid hurt capsules, and manual review resumes walking',async t=>{
  const f=await fixture(t);f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];
  e.reviewMode=true;e.renderVisible=true;e.reviewMovement={x:1,z:0};const first=e.actor.position.clone();
  for(let i=0;i<30;i++)step(f);assert.ok(e.actor.position.x>first.x+.2);assert.equal(e.brain.state,'walk');assert.ok(e.animator.walkTime>0);
  const seen=[];let stableCounts;
  for(let spellIndex=0;spellIndex<5;spellIndex++){
    assert.equal(e.requestReviewCast(),true);assert.equal(e.requestReviewCast(),false);const pattern=e.brain.spell.pattern;seen.push(pattern);
    const lockedPosition=e.actor.position.clone(),lockedWalk=e.animator.walkTime,hitPoints=f.battle.playerHp;let releases=0,plan;
    const castSeconds=e.brain.castLeadInRemaining+3/e.brain.attackPlaybackRate;
    for(let frame=0;frame<Math.floor(castSeconds*60)-1;frame++){
      f.battle.update(1/60,f.player);releases+=e.pendingEvents.filter(x=>x.kind==='ground').length;f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);
      near(Vector3.Distance(e.actor.position,lockedPosition),0);near(e.animator.walkTime,lockedWalk);assert.equal(e.brain.state,'cast');
      plan??=e.spell.plan;assert.strictEqual(e.spell.plan,plan);assert.equal(plan.pattern,pattern);
      for(const node of e.asset.transformNodes)assert.ok(node.getAbsolutePosition().asArray().every(Number.isFinite),node.name);
      const capsules=e.hurtCapsules();assert.equal(capsules.length,49);assert.ok(capsules.every(c=>c.radius>0&&c.points.flat().every(Number.isFinite)));
    }
    assert.equal(releases,1);assert.equal(e.spell.fired,true);assert.ok(spellImpact(e.brain.spell,3)>=1);assert.equal(f.battle.playerHp,hitPoints,'review casts never damage the player');
    while(e.brain.mode==='attack')step(f);
    assert.equal(e.animator.walkTime,0);const resumed=e.actor.position.clone();step(f);assert.equal(e.brain.state,'walk');near(e.animator.walkTime,2/(60*MOURNING_SIZE_SCALE));assert.ok(e.actor.position.x>resumed.x);
    stableCounts??=snapshot(f);assert.deepEqual(snapshot(f),stableCounts);
  }
  assert.deepEqual(seen,MOURNING_SPELLS.map(s=>s.pattern));assert.equal(f.mourningModels.instances,1);
  e.reviewMovement={x:0,z:0};for(let i=0;i<120;i++)step(f);assert.equal(e.brain.mode,'idle');assert.equal(e.spell.mesh.isEnabled(),false);
  for(const alias of ['mixamorig:Head','mixamorig:Hips','mixamorig:RightHand'])assert.ok(e.nodes[alias]);
});

test('phase-two painted body and morph-normal silhouette compile with stable five-target variants',async t=>{
  const f=await fixture(t,{pbr:true});f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];e.reviewMode=true;e.reviewMovement={x:0,z:0};e.renderVisible=true;
  const body=e.asset.meshes.find(m=>m.morphTargetManager&&!m.metadata?.moonforestOutline),outline=e.asset.meshes.find(m=>m.morphTargetManager&&m.metadata?.moonforestOutline);assert.ok(body);assert.ok(outline);
  assert.strictEqual(outline.morphTargetManager,body.morphTargetManager);assert.equal(body.morphTargetManager.optimizeInfluencers,false);assert.equal(body.morphTargetManager.numMaxInfluencers,5);assert.equal(body.morphTargetManager.numTargets,5);
  assert.equal(outline.metadata.outlinePixels,.5);assert.equal(body.material.metadata.elenaStyle.brightness,1.35);
  const effects=[];
  for(const time of [0,1.5,3]){
    e.brain.cast();e.brain.time=time;e.animator.transition('cast',{clipTime:time});e.animator.update(0);e.alignPose();
    await body.material.forceCompilationAsync(body);await outline.material.forceCompilationAsync(outline);f.scene.render();
    const bodyEffect=body.subMeshes[0].effect,outlineEffect=outline.subMeshes[0].effect;
    assert.ok(bodyEffect);assert.ok(outlineEffect);assert.match(bodyEffect.fragmentSourceCode,/1\.35 \* elenaBand/);assert.match(outlineEffect.vertexSourceCode,/normalUpdated/);assert.match(outlineEffect.vertexSourceCode,/morphTargetInfluences/);
    effects.push([bodyEffect,outlineEffect]);
  }
  assert.strictEqual(effects[0][0],effects[1][0]);assert.strictEqual(effects[1][0],effects[2][0]);assert.strictEqual(effects[0][1],effects[1][1]);assert.strictEqual(effects[1][1],effects[2][1]);
  const manager=body.morphTargetManager,vertices=body.getTotalVertices(),stride=2,width=Math.min(vertices*stride,4096),height=Math.ceil(vertices*stride/4096);
  const morphTexture={vertices,stride,width,height,layers:manager.numTargets,bytes:width*height*manager.numTargets*4*4,minimumUnpaddedBytes:vertices*stride*manager.numTargets*4*4};
  const boneTextures=[...new Set(e.asset.meshes.filter(m=>m.skeleton).map(m=>m.skeleton.getTransformMatrixTexture(m)).filter(Boolean))].map(texture=>{const size=texture.getSize();return {...size,bytes:size.width*size.height*4*4};});
  for(let i=0;i<manager.numTargets;i++){assert.equal(manager.getTarget(i).hasPositions,true);assert.equal(manager.getTarget(i).hasNormals,true);}
  assert.ok(morphTexture.bytes>=morphTexture.minimumUnpaddedBytes);assert.equal(boneTextures.length,2);
  t.diagnostic(JSON.stringify({textureEstimate:{format:'RGBA32F, no mipmaps; morph GPU storage estimated from Babylon packing at maxTextureSize 4096; bone texture dimensions observed in NullEngine',morphTexture,boneTextures,boneTextureBytes:boneTextures.reduce((sum,item)=>sum+item.bytes,0),outlineSharesMorphAndBoneTextures:true}}));
});
