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
import {WOLF_MAUL_NO_CONTACT_SECONDS,WOLF_MAUL_ESCAPE_RECOVERY_SECONDS} from '../src/wolf-v02-grab.js';

test('native mixed alpha/boar owns one maul, honors early taps, bounds lost contact, and releases on hide/death',async()=>{
 const a=await wolfMomentumR14Fixture(),containers=[],loaders=[],proof={scope:'Actual alpha wolf and R3 boar, native warrior/controller and collision/contact pipeline. Ordinary wolves/fox no longer capture from a ram. The overlap case places the second actor at the settling attacker; player position and damage gates are never fabricated.',cases:[]};
 caveFogFallback(a.f.scene).getInternalTexture().isReady=true;a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render()};
 try{
  for(const id of ['boar']){
   const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL(regularWolfManifest(id)+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
   for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
   for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
   const loader=new GLTFFileLoader();loader.skipMaterials=true;loaders.push(loader);const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
   for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-ownership-proof',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
   const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
  }
  const battle=a.f.battle,combat=battle.combat,player=a.f.player;
  async function start(){
   a.resetCombat();player.position.set(0,0,6);player.rotation.y=Math.PI;await battle.summon(player,1,'boar');await battle.summon(player,1,'wolf');
   const enemies=battle.encounters;for(let i=0;i<enemies.length;i++){const e=enemies[i];assert.notEqual(e.combatProfile.ramStaggerOnly,true);e.actor.position.set(i?.12:-.12,0,0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:['lunge'],speed:1});}return enemies;
  }
  async function held(enemies,{overlap=false}={}){
   let inserted=false;
   for(let i=0;i<60*14;i++){
    const settling=enemies.find(e=>e.v02Ram.authorized&&e.brain.ramStage==='settle'&&!e.grab.maulHolding);
    if(overlap&&!inserted&&settling){const other=enemies.find(e=>e!==settling);other.actor.position.copyFrom(settling.actor.position);other.actor.position.x+=.001;inserted=true;}
    a.step(1/60);const owner=combat.grabOwner;if(owner?.grab.maulHolding)return {owner,other:enemies.find(e=>e!==owner),inserted};
   }
   assert.fail('Actual accepted ram must reach a native prone maul hold');
  }
  {
   const enemies=await start(),{owner,other}=await held(enemies),began=a.elapsed;let taps=0,lastTap=-Infinity,release=null;
   assert.equal(combat.wolfRamOwner(player),owner);assert.equal(combat.claimWolfRam(other,player),false);assert.equal(other.grab.start(player,a.playerNodes,other.brain.serial),false);
   for(let i=0;i<60*4;i++){
    if(a.controller.captured&&taps<5&&a.elapsed-lastTap>=.10){lastTap=a.elapsed;taps++;battle.escapeGrab();if(owner.grab.maulHits<2)assert.equal(a.controller.captured,true,'early taps cannot skip the first two real bites');}
    a.step(1/60);if(!a.controller.captured){release=a.elapsed;break;}
   }
   assert.equal(taps,5);assert.equal(owner.grab.maulHits,2);assert.equal(owner.grab.lastReleaseReason,'maul-escape');assert.ok(release);assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.ok(combat.wolfRamRecovery>0);assert.equal(combat.canStartWolfRam(other,player),false);assert.equal(a.controller.dodge(),true);
   proof.cases.push({name:'early taps and second attacker',taps,realBites:owner.grab.maulHits,releaseAfter:release-began,ownerReleased:true,nativeDodgeAccepted:true});
  }
  {
   const enemies=await start(),{owner,other,inserted}=await held(enemies,{overlap:true}),began=a.elapsed,position=player.position.clone();let taps=0,lastTap=-Infinity;
   for(let i=0;i<60*3&&a.controller.captured;i++){
    if(taps<5&&a.elapsed-lastTap>=.10){lastTap=a.elapsed;taps++;battle.escapeGrab();}
    a.step(1/60);
   }
   assert.equal(inserted,true);assert.equal(taps,5);assert.equal(a.controller.captured,false);assert.equal(owner.grab.maulHits,0,'a missed mouth never receives fabricated guarantee damage');assert.equal(owner.grab.lastReleaseReason,'maul-contact-lost');assert.ok(a.elapsed-began<=WOLF_MAUL_NO_CONTACT_SECONDS+1/60+1e-6);assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.ok(player.position.equalsWithEpsilon(position,1e-6));assert.equal(combat.canStartWolfRam(other,player),false);assert.ok(combat.wolfRamRecovery<=WOLF_MAUL_ESCAPE_RECOVERY_SECONDS);assert.equal(a.controller.dodge(),true);
   proof.cases.push({name:'overlap misses cannot hold forever',taps,realBites:owner.grab.maulHits,releaseAfter:a.elapsed-began,reason:owner.grab.lastReleaseReason,noPlayerTeleport:true,nativeDodgeAccepted:true});
  }
  for(const reason of ['hide','death']){
   const enemies=await start(),{owner,other}=await held(enemies);other.hide();assert.equal(a.controller.captured,true);assert.equal(combat.grabOwner,owner,'another actor hiding cannot release the owner');
   if(reason==='hide')owner.hide();else{assert.equal(owner.brain.hit({damage:9999,heavy:true}),true);a.step(1/60);}
   assert.equal(a.controller.captured,false);assert.equal(combat.grabOwner,null);assert.equal(combat.wolfRamOwner(player),null);assert.equal(owner.brain.ramMaulHold,false);assert.equal(owner.grab.maulHolding,false);
   proof.cases.push({name:reason+' cleanup',otherHidePreservedOwner:true,ownerReleased:true});
  }
  proof.passed=true;fs.writeFileSync(new URL('../reports/regular-wolves-r1/maul-ownership-regression.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
 }finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
});
