import {RegularWolfEncounter} from './regular-wolf-encounter.js';
import {bearEncounterSize} from './bear-size.js';
import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Encounter} from './wolf-v02-encounter.js';
import {Vector3} from '@babylonjs/core';
import {BossEncounter} from './boss-encounter.js';
import {GoblinEncounter} from './goblin-encounter.js';
import {ElenaEncounter} from './elena-encounter.js';
import {MourningElenaEncounter} from './mourning-elena-encounter.js';
import {BossModelLibrary,instantiateBossModel} from './boss-models.js';
import {createBossPreparation,bossPreparationCancelled} from './boss-preparation.js';
import {applyHitFlash} from './hit-feedback.js';
import {isRuntimeOutline} from './character-outlines.js';
import {ACTOR_DEFINITIONS,getActorDefinition,validateActorSpawn} from './actor-definitions.js';

const encounters={wolf:WolfEncounter,bear:BossEncounter,goblin:GoblinEncounter,elena:ElenaEncounter,mourning:MourningElenaEncounter,npc:GoblinEncounter};
const positionOf=value=>value instanceof Vector3?value.clone():new Vector3(value.x,value.y??0,value.z);
function registeredProfile(definition){
  const reference=ACTOR_DEFINITIONS[definition.actorDefinitionId]??Object.values(ACTOR_DEFINITIONS).find(value=>value.encounterType===definition.encounterType);
  if(!reference)throw new Error('Unsupported actor encounter: '+definition.encounterType);
  const movement=definition.movement??reference.movement;
  if(Object.keys(movement).length!==Object.keys(reference.movement).length||Object.keys(reference.movement).some(key=>movement[key]!==reference.movement[key]))
    throw new Error('Unsupported actor movement override; use the existing '+definition.encounterType+' movement profile');
  const collider={...reference.collider,...definition.collider};
  for(const key of Object.keys(collider))if(!['radius','stopDistance','separationRadius','source'].includes(key))throw new Error('Unsupported actor collider field: '+key);
  for(const key of ['radius','stopDistance','separationRadius'])if(!Number.isFinite(collider[key])||collider[key]<(key==='stopDistance'?0:Number.EPSILON))throw new Error('Invalid actor collider: '+key);
  const hp=definition.hp;
  if(definition.category!=='npc'&&(!Number.isFinite(hp)||hp<=0))throw new Error('Invalid actor health');
  if(definition.maxHp!==undefined&&definition.maxHp!==hp)throw new Error('Actor hp/maxHp must match the supported full-health spawn profile');
  const animation={...definition.animation};
  // The sampled Mourning rig has fixed authored channel/cloth/death contracts.
  // A generic animation remap would be silently ignored by that animator.
  if(definition.encounterType==='mourning'&&Object.keys(animation).some(key=>animation[key]!==reference.animation[key]))throw new Error('Unsupported animation override for the authored Mourning sampler');
  return {collider,hp,animation};
}

function assetEstimate(asset,fallback){
  const geometries=new Set(),skeletons=new Set(),managers=new Set();let geometryBytes=0,baseTriangles=0,outlineTriangles=0,poseBytes=0;
  for(const mesh of asset?.meshes??[]){
    const triangles=(mesh.getTotalIndices?.()??0)/3;
    if(isRuntimeOutline(mesh))outlineTriangles+=triangles;else baseTriangles+=triangles;
    if(mesh.geometry&&!geometries.has(mesh.geometry)){
      geometries.add(mesh.geometry);
      for(const kind of mesh.getVerticesDataKinds()){const data=mesh.getVerticesData(kind);geometryBytes+=data?.byteLength??(data?.length??0)*4;}
      const indices=mesh.getIndices();geometryBytes+=indices?.byteLength??(indices?.length??0)*4;
    }
    if(mesh.skeleton)skeletons.add(mesh.skeleton);
    if(mesh.morphTargetManager)managers.add(mesh.morphTargetManager);
  }
  for(const skeleton of skeletons)poseBytes+=(skeleton.bones.length+1)*16*4;
  return {estimatedBytes:Math.max(fallback??0,geometryBytes+poseBytes),sharedGeometryBytes:geometryBytes,poseMatrixBytes:poseBytes,baseTriangles,outlineTriangles,shadowTriangles:baseTriangles,totalPassTriangles:baseTriangles*2+outlineTriangles,skeletons:skeletons.size,morphManagers:managers.size,measurement:'indexed GPU triangles; pass sum is a conservative submission estimate, not measured GPU time'};
}

// A factory owns only the libraries it creates. Every actor is a normal cloned
// encounter; resident Elena adoption is deliberately never used for this pool.
export function createActorEncounterFactory({world,battle,getPlayer=()=>battle.currentPlayer,libraryFactory=(scene,id)=>new BossModelLibrary(scene,id,{scoped:true}),onDefeat=()=>{},rewardsEnabled=false,interactNpc=()=>false,interaction=interactNpc,onActorHide=()=>{},getActivity=()=>({})}){
  const scene=world.scene,entries=new Map(),adapters=new Set();let disposed=false,serial=0;
  function entryFor(definition){
    const key=definition.assetId+'@'+definition.assetVersion;
    if(!entries.has(key)){
      const result=libraryFactory(scene,definition.assetId,definition.assetVersion),library=result.library??result;
      entries.set(key,{key,library,owned:result.owned!==false,derivedMaterials:new Set(),references:0});
    }
    return entries.get(key);
  }
  function releaseEntry(entry){
    if(entry.references>0)return;if(entry.released)return entry.releasePromise;entry.released=true;
    if(entries.get(entry.key)===entry)entries.delete(entry.key);
    if(!entry.owned)return;
    const disposed=entry.library.dispose?.(); // abort scoped loads before awaiting a late result
    const release=()=>{for(const material of entry.derivedMaterials)material.dispose(false,false);entry.derivedMaterials.clear();entry.library.container?.dispose();};
    const pending=[entry.library.pending,disposed].filter(Boolean);
    if(pending.length)return entry.releasePromise=Promise.allSettled(pending).then(release);
    release();
  }
  function create(definition,context={}){
    if(disposed)throw bossPreparationCancelled();
    if(typeof definition==='string')definition=getActorDefinition(definition);
    if(definition.encounterType==='regular-wolf'&&world.release!=='moonforest-0.2')throw new Error('Regular wolves require MoonForest 0.2');
    const Encounter=definition.encounterType==='regular-wolf'?RegularWolfEncounter:definition.encounterType==='wolf'&&world.release==='moonforest-0.2'?WolfV02Encounter:encounters[definition.encounterType];if(!Encounter)throw new Error('Unsupported actor encounter: '+definition.encounterType);
    const profile=registeredProfile(definition);
    const entry=entryFor(definition),mapId=world.mapId,current=context.isCurrent??(()=>true),id='development-actor-'+(++serial),ownedAssets=new Set();
    entry.references++;
    let retired=false,disposal=null,warming=null,life=0,rewardGranted=false,active=false,estimate=null,spawnContext=null,decisionCount=0;
    const valid=()=>!retired&&!disposed&&world.scene===scene&&world.mapId===mapId&&!scene.isDisposed&&current();
    const check=()=>{if(!valid())throw bossPreparationCancelled();};
    const encounter=new Encounter(world,value=>battle.bossChanged?.(value),battle.onDamage??(()=>{}),(...args)=>battle.playerHit?.(...args),{
      combat:battle.combat,...(definition.encounterType==='regular-wolf'?{regularWolfId:definition.variant}:{}),
      loadAsset:async()=>{
        check();await entry.library.load();check();
        if(entry.library.config.version!==definition.assetVersion)throw new Error('Actor asset version differs from its definition: '+definition.actorDefinitionId);
        const config={...entry.library.config,animations:{...entry.library.config.animations,...profile.animation}},available=new Set(entry.library.container.animationGroups.map(group=>group.name));
        for(const [state,name]of Object.entries(config.animations))if(typeof name!=='string'||!available.has(name))throw new Error('Actor animation clip missing for '+state+': '+name);
        const preparation=encounter.actorPreparation,steps=[];
        const clone=()=>{check();const asset=instantiateBossModel(entry.library.container,steps);ownedAssets.add(asset);return asset;};
        const asset=preparation?await preparation.step('independent-actor-clone',clone):clone();
        return {config,asset,modelTimings:{mode:'independent-clone',steps}};
      },
      onDefeat:event=>{
        if(!valid()||!active||rewardGranted)return;
        rewardGranted=true;
        if(rewardsEnabled)onDefeat({...event,actorDefinitionId:definition.actorDefinitionId,actorId:id,life});
      },
    });
    const createBrain=encounter.createBrain.bind(encounter);
    encounter.createBrain=durations=>{const brain=createBrain(durations);if(definition.category!=='npc')brain.hp=brain.maxHp=profile.hp;return brain;};
    function applyCollider(){for(const key of ['radius','stopDistance','separationRadius'])encounter[key]=profile.collider[key]*(definition.encounterType==='bear'?(encounter.bearSize?.sizeScale??1):1);}
    applyCollider();
    encounter.id=id;encounter.actorDefinitionId=definition.actorDefinitionId;encounter.retainAnimatorForPool=true;encounter.developmentActor=true;
    if(definition.category!=='npc'){
      const pool=battle.developmentPool??= [];if(!pool.includes(encounter))pool.push(encounter);
    }
    function detach(){battle.encounters=battle.encounters.filter(value=>value!==encounter);battle.active=battle.encounters.some(value=>value.active);}
    function resetTransient(){
      encounter.grab.reset();encounter.gate.reset();encounter.pendingEvents=[];
      encounter.knockVelocity.setAll(0);encounter.bossReaction.reset();
      encounter.lastHit=encounter.lastReportedHit=encounter.lastSerial=encounter.lastRoot=encounter.defenseFeedbackKey=null;
      encounter.player=null;encounter.target=null;encounter.routeState={};encounter.dodgeContactClearance=false;encounter.renderVisible=true;encounter.fogVisible=true;
      encounter._reconciledMotion=null;encounter._battleUpdateToken=null;
      encounter.bodyContactCache=null;encounter.repositionSerial=null;encounter.chargeOrigin=null;encounter.repositionTarget=null;
      encounter.spell?.reset();encounter.contact?.hide();encounter.slamAdvance?.reset();
      if(encounter.ring){encounter.ring.isVisible=false;encounter.ring.setEnabled(false);}
      for(const [mesh,visibility]of encounter.deathVisibility??[]){mesh.visibility=visibility;mesh.isVisible=true;}
      applyHitFlash(encounter.asset?.meshes,0);
      // Never reset shared player health, potion, reaction or a different grab.
    }
    function releaseOwned(){
      const managers=new Set([...ownedAssets].flatMap(asset=>asset.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean)));
      for(const asset of ownedAssets)for(const mesh of asset.meshes)if(mesh.material?.metadata?.moonforestMonsterToon&&!isRuntimeOutline(mesh))entry.derivedMaterials.add(mesh.material);
      encounter.animator?.dispose();encounter.spell?.dispose();encounter.contact?.dispose();
      if(encounter.ring&&!encounter.ring.isDisposed()){encounter.ring.material?.dispose();encounter.ring.dispose();}
      if(encounter.actor&&!encounter.actor.isDisposed())encounter.actor.dispose(false,false);
      const sourceManagers=new Set(entry.library.container?.meshes?.map(mesh=>mesh.morphTargetManager).filter(Boolean));
      for(const asset of ownedAssets){
        for(const group of asset.animationGroups??[])group.dispose();
        for(const mesh of asset.meshes)if(!mesh.isDisposed())mesh.dispose(false,false);
        for(const node of asset.transformNodes)if(!node.isDisposed())node.dispose(false,false);
        for(const skeleton of asset.skeletons??[])if(!skeleton.isDisposed?.())skeleton.dispose();
      }
      for(const manager of managers)if(!sourceManagers.has(manager))manager.dispose();
      ownedAssets.clear();
      if(entry.released&&entry.owned){for(const material of entry.derivedMaterials)material.dispose(false,false);entry.derivedMaterials.clear();}
    }
    const adapter={
      definition,encounter,id,battleOwned:definition.category!=='npc',
      async warm({preparation,isCurrent}={}){
        check();if(isCurrent&&!isCurrent())throw bossPreparationCancelled();
        if(encounter.assetPrepared)return encounter.asset;
        if(warming)return warming;
        preparation??=context.preparation??createBossPreparation({isCurrent:valid});encounter.actorPreparation=preparation;
        warming=encounter.prepareHidden({preparation}).then(asset=>{
          check();if(isCurrent&&!isCurrent())throw bossPreparationCancelled();
          encounter.animator.retainBindings=true;
          for(const mesh of asset.meshes)if(mesh.material?.metadata?.moonforestMonsterToon&&!isRuntimeOutline(mesh))entry.derivedMaterials.add(mesh.material);
          estimate=assetEstimate(asset,definition.population.estimatedBytes);return asset;
        }).finally(()=>{warming=null;encounter.actorPreparation=null;});
        return warming;
      },
      reset(value={}){
        check();active=false;detach();encounter.hide();resetTransient();rewardGranted=false;spawnContext=value;
        encounter.hitCount=encounter.heavyCount=0;encounter.death.reset();
        if(encounter.brain){encounter.brain.hp=encounter.brain.maxHp;encounter.brain.flash=encounter.brain.stagger=0;}
        const reset=encounter.animator?.resetForReuse??encounter.animator?.reset;reset?.call(encounter.animator);
        return adapter;
      },
      async activate(value=spawnContext??{},{preparation,isCurrent}={}){
        check();if(isCurrent&&!isCurrent())throw bossPreparationCancelled();
        if(active&&(definition.category==='npc'||encounter.active))return adapter;
        await adapter.warm({preparation,isCurrent});check();
        preparation??=createBossPreparation({isCurrent:valid});
        const player=value.player??getPlayer();if(!player)throw new Error('Actor activation needs the current player');
        const position=value.position?positionOf(value.position):player.position.add(new Vector3(0,0,4));
        const bearSize=definition.encounterType==='bear'?bearEncounterSize(world):null,spawnDefinition=bearSize?{...definition,collider:{...profile.collider,radius:profile.collider.radius*bearSize.sizeScale},spawn:{...definition.spawn,safeDistance:definition.spawn.safeDistance*bearSize.sizeScale}}:definition;
        const spawn=validateActorSpawn(spawnDefinition,world,{position,player,occupied:value.occupied??[]});
        if(!spawn.valid)throw new Error('Unsafe actor spawn: '+spawn.reason);
        applyCollider();resetTransient();rewardGranted=false;spawnContext=value;
        await encounter.summon(player,{position,rotationY:value.rotationY,preparation,reuseAnimator:true});
        if(!valid()||(isCurrent&&!isCurrent())){encounter.hide();detach();throw bossPreparationCancelled();}
        life++;active=true;
        if(definition.category==='npc'){
          // Reuse the prepared visual/idle, never the hostile encounter update.
          encounter.active=false;encounter.setShadowCasting(true);encounter.player=null;encounter.ring.setEnabled(false);
          encounter.storyNpcId=definition.npc?.interactionId;world.storyNpcs?.syncEncounter(encounter);
        }else{
          battle.applyAttackSettings?.(encounter);
          if(value.staged===true)encounter.actor.setEnabled(false);
          else{if(!battle.encounters.includes(encounter))battle.encounters.push(encounter);battle.active=true;}
        }
        return adapter;
      },
      reveal(){if(!active||definition.category==='npc'||encounter.actor.isDisposed())return false;encounter.actor.setEnabled(true);if(!battle.encounters.includes(encounter))battle.encounters.push(encounter);battle.active=true;return true;},
      update(dt){
        if(!active||definition.category!=='npc'||encounter.storyNpcSuppressed)return;
        encounter.animator.update(dt); // combat actors update only in BossBattle
      },
      decide(){if(active&&definition.category==='npc')decisionCount++;},
      interact(){return active&&definition.npc&&!encounter.storyNpcSuppressed?interaction(definition.npc.interactionId,encounter.actor.position,definition.npc.range):false;},
      defeat(){
        if(!active||definition.category==='npc'||encounter.brain.hp<=0)return false;
        return encounter.brain.hit({damage:encounter.brain.hp,heavy:true});
      },
      hide(){
        if(retired)return;active=false;detach();encounter.hide();resetTransient();onActorHide({id,life});
        const reset=encounter.animator?.resetForReuse??encounter.animator?.reset;reset?.call(encounter.animator);
        if(encounter.brain){encounter.brain.hp=encounter.brain.maxHp;encounter.brain.flash=encounter.brain.stagger=0;}
        encounter.death.reset();
      },
      snapshot(){
        const dead=definition.category!=='npc'&&encounter.brain?.hp<=0;
        const activity=getActivity(definition,encounter);
        const clipDuration=encounter.animator?.deathDuration??encounter.animator?.durations?.[encounter.brain?.state]??0;
        const deathPoseFinished=encounter.animator?.deathFinished??((encounter.brain?.time??0)>=clipDuration);
        return {active:active&&(definition.category==='npc'||encounter.active),dead,dying:dead&&!encounter.corpseGone&&(!encounter.death.started||!deathPoseFinished),corpseGone:!!encounter.corpseGone,combat:active&&definition.category!=='npc'&&encounter.active&&!dead,incoming:!!encounter.pendingEvents.length||activity?.incoming===true,projectile:!!encounter.spell?.plan||activity?.projectile===true,questRelevant:spawnContext?.questRelevant===true||activity?.questRelevant===true,rewardGranted,position:encounter.actor?.position,life,decisionCount};
      },
      estimate(){return estimate??{estimatedBytes:definition.population.estimatedBytes};},
      dispose(){
        if(retired)return disposal;adapter.hide();retired=true;adapters.delete(adapter);
        battle.developmentPool=(battle.developmentPool??[]).filter(value=>value!==encounter);
        releaseOwned();
        // A cancelled prepare may finish its hidden acquisition after the caller
        // stops waiting. Clean that exact owned result again, never a new actor.
        const pending=[encounter.assetAcquisition,warming].filter(Boolean);
        entry.references--;const released=releaseEntry(entry);if(released)pending.push(released);
        if(pending.length)return disposal=Promise.allSettled(pending).then(releaseOwned);
      },
    };
    adapters.add(adapter);return adapter;
  }
  create.inspect=()=>({actors:adapters.size,libraries:entries.size,keys:[...entries.keys()],modelLoads:[...entries.values()].reduce((sum,entry)=>sum+(entry.library.loads??0),0)});
  create.dispose=()=>{
    if(disposed)return;const pending=[];for(const adapter of [...adapters]){const value=adapter.dispose();if(value)pending.push(value);}disposed=true;
    for(const entry of [...entries.values()]){const value=releaseEntry(entry);if(value)pending.push(value);}
    entries.clear();
    return Promise.allSettled(pending);
  };
  return create;
}
