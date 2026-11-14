import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {StandardMaterial} from '@babylonjs/core';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {wolfMomentumR14Fixture} from './helpers/wolf-momentum-r14-fixture.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {regularWolfManifest} from '../src/regular-wolf-spec.js';
import {WOLF_V02_COMBAT_PROFILES} from '../src/wolf-v02-spec.js';
import {armoredDamage} from '../src/equipment-stats.js';

test('four ordinary canines cause native stationary ram stagger without throw, capture or maul; boar and alpha retain their policy',async()=>{
 const a=await wolfMomentumR14Fixture(),containers=[],loaders=[];
 caveFogFallback(a.f.scene).getInternalTexture().isReady=true;
 a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render()};
 try{
  for(const id of ['gray-wolf','stylized-wolf','wolf-3','fox']){
   const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL(regularWolfManifest(id)+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;loaders.push(loader);const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
   for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-ram-stagger-proof',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
   const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
   a.resetCombat();const battle=a.f.battle,combat=battle.combat,player=a.f.player;
   player.position.set(0,0,6);player.rotation.y=Math.PI;await battle.summon(player,1,id);
   const e=battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});
   player.position.z=e.runtimeProfile.actions.lunge.preferredDistance;
   e.brain.startAction('lunge',{distance:player.position.z});
   const start=player.position.clone(),hp=battle.playerHp,expected=armoredDamage(e.brain.action.ramPhases[0].damage,combat.defense);let hit=false,completed=false;
   assert.equal(e.combatProfile,WOLF_V02_COMBAT_PROFILES.regularCanine);
   for(let frame=0;frame<360;frame++){
    a.step(1/60);
    assert.equal(a.controller.knockedDown,false,id+' never enters fall/get-up');assert.equal(!!a.controller.captured,false,id+' never captures');
    assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.equal(combat.v02Impact.active,false);assert.equal(e.v02Ram.hasClearanceLease(),false);
    assert.ok(player.position.equalsWithEpsilon(start,1e-7),id+' native recoil/throw cannot move player');
    if(!hit&&battle.playerHp<hp){
     hit=true;assert.ok(a.controller.staggerRemaining>0,id+' actual native hit-stun accepted');assert.equal(combat.reaction.remaining,0);assert.equal(e.v02Ram.authorized,false);
     assert.equal(e.v02Ram.phases[0].damage,expected);assert.equal(e.v02Ram.phases[0].acceptedKnockdown,false);assert.equal(e.v02Ram.cancelReason,'ram-stagger-only');
    }
    if(hit&&e.brain.mode!=='attack'){
     completed=true;assert.equal(e.brain.behavior,'recovery');break;
    }
   }
   assert.equal(hit,true,id+' real forehead sweep must hit');assert.equal(completed,true,id+' leaves ram into ordinary recovery');assert.equal(hp-battle.playerHp,expected,id+' only original ram damage, no ground bites');
   assert.ok(e.v02Ram.phases.slice(1).every(phase=>!phase.hit&&!phase.resolved));
   for(let frame=0;frame<20;frame++)a.step(1/60);
   assert.equal(a.controller.attack(),true,id+' normal attack works after stagger');
   assert.equal(a.controller.state==='knockdown'||!!a.controller.captured,false);
   // Keep dodge/block resolution on the same scoped ram hit path. These rows
   // deliberately inject confirmed contacts; the sweep above is the real hit.
   for(const state of ['dodge','shieldPush']){
    e.playerInvulnerable=0;e.brain.startAction('lunge',{distance:player.position.z});
    const action={state,actionId:71},phase=e.v02Ram.prepare(player,action),before=battle.playerHp;
    e.v02RamPhase=phase;
    try{e.receiveBossHit({event:{capture:false},damage:18,heavy:true,bodyContact:true,shieldContact:false,action});}
    finally{e.v02RamPhase=null;}
    assert.equal(battle.playerHp,before,id+' '+state+' still prevents ram damage');
    assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.equal(combat.v02Impact.active,false);
   }
  }
  assert.equal(WOLF_V02_COMBAT_PROFILES.alphaWolf.ramIgnoresGuard,true);assert.equal(WOLF_V02_COMBAT_PROFILES.alphaWolf.ramStaggerOnly,undefined);
  assert.equal(WOLF_V02_COMBAT_PROFILES.regularWolf.ramIgnoresGuard,false);assert.equal(WOLF_V02_COMBAT_PROFILES.regularWolf.ramStaggerOnly,undefined);
 }finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
});
