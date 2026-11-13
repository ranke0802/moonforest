import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {StandardMaterial} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {wolfMomentumR14Fixture} from '../../tests/helpers/wolf-momentum-r14-fixture.js';
import {BossModelLibrary} from '../../src/boss-models.js';
import {caveFogFallback} from '../../src/cave-fog-binding.js';
import {REGULAR_WOLF_VARIANTS,regularWolfRuntimeProfile} from '../../src/regular-wolf-spec.js';

const a=await wolfMomentumR14Fixture(),proof={scope:'Native CPU warrior, shared encounter/sampler and fitted model contact smoke; device GPU and visual approval are not measured.',cases:[]},containers=[],loaders=[];
// Match existing NullEngine fixtures: its four-byte fog fallback has no GPU upload.
caveFogFallback(a.f.scene).getInternalTexture().isReady=true;
a.f.battle.preparationOptions={...a.f.battle.preparationOptions,frame:async()=>a.f.scene.render(),timeoutMs:8000};
const selected=process.argv.find(arg=>arg.startsWith('--ids='))?.slice(6).split(',')??Object.keys(REGULAR_WOLF_VARIANTS);
try{
 for(const id of selected){
  console.log('checking',id);
  const base=new URL('../../public/assets/',import.meta.url),config=JSON.parse(fs.readFileSync(new URL(id+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(name=>name!=='EXT_meshopt_compression'&&name!=='KHR_texture_basisu');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loaders.push(loader);loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(a.f.scene,{json:gltf},'');containers.push(container);
  for(const group of container.animationGroups)group.stop();const paint=new StandardMaterial(id+'-smoke',a.f.scene);for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
  const models=new BossModelLibrary(a.f.scene,id);models.config=config;models.container=container;models.loads=1;models.load=async()=>{};a.f.battle.regularWolves[id].models=models;
  const profile=regularWolfRuntimeProfile(id,config);assert.equal(regularWolfRuntimeProfile(id,{...config}),profile);assert.throws(()=>regularWolfRuntimeProfile(id,{...config,sourceSha256:'unregistered'}));
  async function summon(sequence,distance=4){a.resetCombat();a.f.battle.hide();a.f.player.position.set(0,0,distance);a.f.player.rotation.y=Math.PI;await a.f.battle.summon(a.f.player,1,id);const e=a.f.battle.encounters[0];e.actor.position.setAll(0);e.actor.rotation.y=0;e.brain.random=()=>.5;e.brain.configureAttacks({custom:true,sequence:[sequence],speed:1});return e;}
  const e=await summon('quick-bite'),before=e.playerHp;let bite=null;
  for(let i=0;i<60*14;i++){a.step(1/60);if(e.playerHp<before){bite={damage:before-e.playerHp,part:e.v02LastContact?.part,sourceTime:e.v02LastContact?.sourceTime,actualDistance:Math.hypot(e.actor.position.x-a.f.player.position.x,e.actor.position.z-a.f.player.position.z)};break;}}
  assert.ok(bite,id+' autonomous fitted bite must contact native warrior');assert.ok(['jaw','head'].includes(bite.part));assert.equal(e.animator.clips.size,22);assert.equal(e.combatProfile.ramIgnoresGuard,false);
  console.log('bite passed',id);const cachedAnimator=e.animator,guard=await summon('lunge',6);assert.equal(guard.animator,cachedAnimator);const shieldHp=guard.playerHp;assert.ok(a.controller.setShieldHeld(true));let blocked=false;
  for(let i=0;i<60*14;i++){a.step(1/60);if(guard.v02LastOutcome?.blocked){blocked=true;break;}if(guard.playerHp<shieldHp)break;}
  assert.ok(blocked,id+' regular ram remains blockable');assert.equal(guard.playerHp,shieldHp);assert.equal(a.damageEvents.filter(event=>event.value==='BREAK').length,0);
  console.log('block passed',id);guard.grab.reset();a.controller.setShieldHeld(false);assert.equal(guard.brain.hit({damage:10,heavy:true}),true);guard.v14Air.begin(a.f.player.position,null,a.f.player.rotation.y);const origin=guard.actor.position.clone();for(let i=0;i<35;i++)a.step(1/60);const fallTravel=Math.hypot(guard.actor.position.x-origin.x,guard.actor.position.z-origin.z);assert.ok(fallTravel>0);assert.ok(guard.brain.hp>0);
  console.log('fall passed',id);const restored=await summon('quick-bite');assert.equal(restored,e);assert.equal(restored.brain.hp,300);assert.equal(restored.v14Air.valid(),false);assert.equal(restored.v02ContactSerial,null);assert.equal(restored.grab.active,false);
  console.log('reset passed',id);await a.f.battle.summon(a.f.player,2,id).catch(error=>{console.log('clone failure',JSON.stringify({lastSummon:a.f.battle.lastSummon,pool:a.f.battle.regularWolves[id].pool.map(e=>({prepared:e.assetPrepared,step:e.assetPreparationStep,stages:e.preparationStats?.steps}))}));throw error;});const [first,second]=a.f.battle.encounters;assert.notEqual(first.nodes.head,second.nodes.head);assert.notEqual(first.asset.skeletons[0],second.asset.skeletons[0]);assert.equal(first.runtimeProfile,second.runtimeProfile);const one=first.asset.meshes.find(mesh=>mesh.getTotalVertices()&&!mesh.name.includes('Outline')),two=second.asset.meshes.find(mesh=>mesh.name===one.name);assert.equal(one.geometry,two.geometry);assert.equal(one.material,two.material);assert.equal(models.loads,1);
  proof.cases.push({id,height:config.height,clips:22,bite,regularRamBlocked:true,breakNotices:0,fallTravel,reusedAnimator:true,independentSkeletons:true,sharedGeometry:true,sharedMaterial:true,sharedProfile:true,modelLoads:models.loads});
 }
 a.f.battle.hide();assert.equal(a.f.battle.combat.grabOwner,null);assert.equal(a.impactCarrier.position.y,0);assert.equal(a.f.battle.allPooled.filter(e=>e.regularWolfId).length,selected.length*2);
 proof.passed=true;fs.writeFileSync(new URL('./runtime-smoke.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{for(const container of containers)container.dispose();for(const loader of loaders)loader.dispose();await a.dispose();}
