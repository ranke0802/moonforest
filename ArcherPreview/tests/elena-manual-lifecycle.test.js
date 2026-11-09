import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,MeshBuilder,StandardMaterial,Vector3} from '@babylonjs/core';
import {ElenaEncounter} from '../src/elena-encounter.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {MOURNING_HURT_SEGMENTS} from '../src/mourning-elena-hurt.js';
import {MourningCaveNavigation} from '../src/mourning-cave-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {ArenaNavigation} from '../src/navigation.js';
import {villageObstacles} from '../src/village-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {PlayerCombat} from '../src/player-combat.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {setWorldCharacter,ENEMY_ARENA_RADIUS} from '../src/world-limits.js';
import {applyHitFlash} from '../src/hit-feedback.js';
import {ELENA_HOME} from '../src/elena-spec.js';
import {getActorDefinition} from '../src/actor-definitions.js';

const characters={village:'warrior-v3','great-plains':'warrior-plains','monster-forest':'warrior-v4','witch-cave':'warrior-v5'};
const flat={heightAt:()=>0,place(position){position.y=0;}};
const config=phase=>JSON.parse(readFileSync(new URL('../public/assets/'+(phase===2?'mourning-elena':'elena')+'.json',import.meta.url)));
const prepare=isCurrent=>createBossPreparation({incremental:false,isCurrent});
const names=new Set(['Hips','Spine2','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'].map(name=>'mixamorig:'+name));
for(const segment of MOURNING_HURT_SEGMENTS)for(const endpoint of [segment.a,segment.b])names.add(typeof endpoint==='string'?endpoint:endpoint.node);

// Lightweight rig/animator fixtures exercise real encounter summon/hide/death,
// hurt endpoint binding, spell geometry and shadow ownership. Real packed rig
// cloning/preparation has separate tests; no phone GPU performance is inferred.
function fixture(t){
 const engine=new NullEngine(),scene=new Scene(engine),casters=new Set(),combat=new PlayerCombat(),world={scene,mapId:'village',cave:false,navigation:new VillageNavigation([]),terrain:flat,shadows:{addShadowCaster:mesh=>casters.add(mesh),removeShadowCaster:mesh=>casters.delete(mesh)}};
 const material=new StandardMaterial('shared-enemy-paint',scene),player=new TransformNode('player',scene),actors=[];combat.hp=233;combat.invulnerable=.3;
 function actor(phase,index){
  const Encounter=phase===2?MourningElenaEncounter:ElenaEncounter,encounter=new Encounter(world,()=>{},()=>{},()=>{},{combat});actors.push(encounter);encounter.id=phase+'-'+index;encounter.manualSummon=true;encounter.retainAnimatorForPool=true;encounter.config=config(phase);
  encounter.actor=new TransformNode('actor-'+encounter.id,scene);encounter.actor.setEnabled(false);encounter.carrier=new TransformNode('carrier-'+encounter.id,scene);encounter.carrier.parent=encounter.actor;
  encounter.nodes={};let serial=0;for(const name of names){const node=new TransformNode(name,scene);node.parent=encounter.carrier;node.position.set((serial++%3)*.03,1,0);encounter.nodes[name]=node;}
  const mesh=MeshBuilder.CreateBox('body-'+encounter.id,{size:.2},scene);mesh.parent=encounter.carrier;mesh.material=material;mesh.overlayAlpha=0;
  encounter.asset={meshes:[mesh],transformNodes:Object.values(encounter.nodes),animationGroups:[]};encounter.deathVisibility=[[mesh,1]];
  encounter.ring=MeshBuilder.CreateGround('ring-'+encounter.id,{width:1,height:1},scene);encounter.ring.setEnabled(false);encounter.ring.isVisible=false;
  encounter.assetPrepared=true;encounter.prepareHidden=async()=>encounter.asset;
  encounter.createAnimator=()=>{
   const pose=encounter.nodes['DEF_Abdomen'],durations=Object.fromEntries(encounter.config.catalog.map(clip=>[clip.name,clip.duration]));let elapsed=0;
   return {durations,transition(state){this.current=state;},update(dt){elapsed+=dt;pose.position.x=elapsed;pose.computeWorldMatrix(true);},reset(){elapsed=0;pose.position.x=0;},resetForReuse(){this.reset();},dispose(){this.disposed=true;},ensurePoseCurrent(){encounter.actor.computeWorldMatrix(true);for(const node of Object.values(encounter.nodes))node.computeWorldMatrix(true);},inspect(){return {current:this.current,elapsed};}};
  };
  encounter.animator=encounter.createAnimator();return encounter;
 }
 t.after(()=>{for(const e of actors){e.hide();e.spell?.dispose();e.contact?.dispose();}scene.dispose();engine.dispose();setWorldCharacter('warrior');});
 return {engine,scene,world,casters,combat,material,player,actor};
}

test('twenty large manual Elena summons use each real map navigator, including cave-only full-pose clearance',async t=>{
 const f=fixture(t),actors=Array.from({length:20},(_,i)=>f.actor(2,i));
 for(const map of Object.keys(characters)){
  for(const e of actors)e.hide();setWorldCharacter(characters[map]);f.world.mapId=map;f.world.cave=map==='witch-cave';
  f.world.navigation=map==='witch-cave'?new CaveNavigation(caveObstacles()):map==='village'?new VillageNavigation(villageObstacles()):new ArenaNavigation(map==='great-plains'?plainsObstacles():forestObstacles());
  f.world.terrain=map==='witch-cave'?createWitchCaveTerrain():flat;f.player.position.set(map==='witch-cave'?-42:0,0,map==='witch-cave'?43:0);
  const occupied=[];
  for(const [index,e]of actors.entries()){
   const requested={x:f.player.position.x,y:0,z:f.player.position.z};
   await e.summon(f.player,{position:requested,occupied:occupied.map((other,i)=>i%2?other:{position:{x:other.x,z:other.z},radius:other.radius}),reuseAnimator:true});
   assert.deepEqual(requested,{x:f.player.position.x,y:0,z:f.player.position.z},'Caller position remains immutable');
   const navigation=e.movementNavigation;assert.ok(navigation.free(e.actor.position,e.radius,ENEMY_ARENA_RADIUS));
   if(f.world.cave)assert.ok(navigation instanceof MourningCaveNavigation);else assert.equal(navigation,f.world.navigation,'Ordinary maps must never use the cave-only baked mask');
   for(const other of occupied)assert.ok(Math.hypot(e.actor.position.x-other.x,e.actor.position.z-other.z)>=e.radius+other.radius+.12-1e-7);
   assert.notEqual(e.home,ELENA_HOME);assert.deepEqual(e.home,{x:e.actor.position.x,z:e.actor.position.z});occupied.push({x:e.actor.position.x,z:e.actor.position.z,radius:e.radius});
   assert.equal(e.active,true);assert.equal(actors.filter(a=>a.active).length,index+1);
  }
  assert.equal(occupied.length,20);assert.equal(f.combat.hp,233);assert.equal(f.combat.invulnerable,.3);
 }
});

for(const phase of [1,2])test(`twenty phase ${phase} actors keep spell, hurt, pose, hit, death, transform and shadow state independent`,async t=>{
 const f=fixture(t);setWorldCharacter('warrior-v3');const actors=Array.from({length:20},(_,i)=>f.actor(phase,i));
 for(const [i,e]of actors.entries())await e.summon(f.player,{position:new Vector3((i%5-2)*5,0,12+Math.floor(i/5)*5),reuseAnimator:true});
 const plans=actors.map(e=>e.spell.aim(1,'corridor',e.actor.position,e.actor.position.add(new Vector3(0,0,4)),{range:4,bossRadius:.3}));for(const e of actors){e.spell.show(.1,1);e.contact.update(e.actor,true);}
 assert.equal(new Set(actors.map(e=>e.spell.mesh)).size,20);assert.equal(new Set(actors.map(e=>e.contact.mesh)).size,20);assert.equal(new Set(actors.map(e=>e.death)).size,20);assert.equal(new Set(actors.map(e=>e.gate)).size,20);
 for(const [i,e]of actors.entries())e.animator.update(i*.013);
 const health=actors.map(e=>e.healthBarPosition().clone()),capsules=actors.map(e=>{e.animator.ensurePoseCurrent();return structuredClone(e.hurtCapsules());}),otherPose=actors[1].nodes.DEF_Abdomen.position.clone();
 actors[0].animator.update(.5);actors[0].actor.position.x+=.25;actors[0].animator.ensurePoseCurrent();actors[0].hurtCapsules();actors[0].healthBarPosition();
 assert.ok(actors[1].nodes.DEF_Abdomen.position.equals(otherPose));assert.ok(actors[1].healthBarPosition().equals(health[1]));assert.deepEqual(actors[1].hurtCapsules(),capsules[1]);
 actors[0].brain.hit({damage:10});applyHitFlash(actors[0].asset.meshes,actors[0].brain.flash,actors[0].brain.flashDuration);assert.ok(actors[0].asset.meshes[0].overlayAlpha>0);for(const e of actors.slice(1))assert.equal(e.asset.meshes[0].overlayAlpha,0);
 actors[0].hide();assert.equal(actors[0].spell.plan,null);assert.equal(actors[0].contact.mesh.isEnabled(),false);assert.equal(f.casters.has(actors[0].asset.meshes[0]),false);
 for(const [i,e]of actors.entries())if(i){assert.equal(e.spell.plan,plans[i]);assert.equal(e.spell.mesh.isEnabled(),true);assert.equal(e.contact.mesh.isEnabled(),true);assert.equal(e.active,true);assert.equal(f.casters.has(e.asset.meshes[0]),true);}
 if(phase===1){const transformed=[];for(const e of actors)e.onTransform=source=>transformed.push(source.id);actors[2].brain.hit({damage:9999});actors[2].brain.time=1.3;actors[2].updateDeath(.1);actors[2].updateDeath(.1);assert.deepEqual(transformed,[actors[2].id]);assert.equal(actors[3].transformRequested,false);}
 else{actors[2].brain.hit({damage:9999});actors[2].updateDeath(20);assert.equal(actors[2].corpseGone,true);assert.equal(actors[2].asset.meshes[0].visibility,0);assert.equal(actors[3].asset.meshes[0].visibility,1);assert.equal(f.material.alpha,1);assert.equal(f.casters.has(actors[3].asset.meshes[0]),true);}
 assert.equal(f.combat.hp,233);assert.equal(f.combat.invulnerable,.3);
});

test('twenty hidden preparations remain unpublished after a map-generation cancellation, then reuse independently',async t=>{
 const f=fixture(t);setWorldCharacter('warrior-v3');const actors=Array.from({length:20},(_,i)=>f.actor(2,i)),map=f.world.mapId;let finish;const blocked=new Promise(resolve=>finish=resolve);
 for(const e of actors)e.prepareHidden=async()=>{await blocked;return e.asset;};
 const pending=actors.map((e,i)=>e.summon(f.player,{position:new Vector3((i%5-2)*5,0,12+Math.floor(i/5)*5),activate:false,reuseAnimator:true,preparation:prepare(()=>f.world.mapId===map)}));
 f.world.mapId='great-plains';finish();const settled=await Promise.allSettled(pending);assert.ok(settled.every(result=>result.status==='rejected'&&result.reason.name==='AbortError'));
 for(const e of actors){assert.equal(e.active,false);assert.equal(e.actor.isEnabled(),false);assert.equal(e.ring.isEnabled(),false);}assert.equal(f.casters.size,0);
 for(const [i,e]of actors.entries())await e.summon(f.player,{position:new Vector3((i%5-2)*5,0,12+Math.floor(i/5)*5),activate:false,reuseAnimator:true,preparation:prepare(()=>f.world.mapId==='great-plains')});
 for(const e of actors){assert.equal(e.active,false);assert.equal(e.actor.isEnabled(),false);assert.equal(e.contact.mesh.isEnabled(),false);assert.equal(e.spell.mesh.isEnabled(),false);}
 for(const e of actors){e.active=true;e.actor.setEnabled(true);e.ring.setEnabled(true);}assert.equal(actors.filter(e=>e.active).length,20);
});

for(const phase of [1,2])test(`phase ${phase} concurrent summon reentry does not run subclass post-initialization early`,async t=>{
 const f=fixture(t);setWorldCharacter('warrior-v3');const e=f.actor(phase,0);let finish;const blocked=new Promise(resolve=>finish=resolve);e.prepareHidden=async()=>{await blocked;return e.asset;};
 const pending=e.summon(f.player,{position:new Vector3(4,0,4),reuseAnimator:true});assert.equal(e.loading,true);
 await e.summon(f.player,{position:new Vector3(-4,0,-4),reuseAnimator:true});assert.equal(e.contact,undefined);assert.equal(e.home,ELENA_HOME);finish();await pending;
 assert.deepEqual(e.home,{x:4,z:4});assert.equal(e.active,true);
});

test('a large actor reserves its own asynchronous placement before base loading starts and releases the reservation',async t=>{
 const f=fixture(t);setWorldCharacter('warrior-v3');const e=f.actor(2,0);let finish;const blocked=new Promise(resolve=>finish=resolve),navigation=f.world.navigation;navigation.findFree=async()=>{await blocked;return {x:4,z:4};};
 const pending=e.summon(f.player,{position:Vector3.Zero(),reuseAnimator:true});assert.equal(e.loading,false);assert.equal(e.summonPlacementPending,true);
 await e.summon(f.player,{position:new Vector3(8,0,8),reuseAnimator:true});assert.equal(e.active,false);assert.equal(e.contact,undefined);
 finish();await pending;assert.deepEqual(e.home,{x:4,z:4});assert.equal(e.summonPlacementPending,false);
 await e.summon(f.player,{position:new Vector3(6,0,6),reuseAnimator:true});assert.deepEqual(e.home,{x:6,z:6});assert.equal(e.summonPlacementPending,false);
});

test('manual selector capacity does not silently relax separate development-lab safety limits',()=>{
 assert.equal(getActorDefinition('elena.fallen').population.maxPooled,4);assert.equal(getActorDefinition('elena.mourning').population.maxPooled,4);
});
