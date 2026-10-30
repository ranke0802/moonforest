import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {EnemyDeath,CORPSE_FADE_SECONDS,MOURNING_DEATH_HOLD_SECONDS} from '../src/enemy-death.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {isRuntimeOutline} from '../src/character-outlines.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {setWorldCharacter} from '../src/world-limits.js';

const base=new URL('../public/assets/',import.meta.url),cache=new Map();
const near=(a,b,label='value')=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);
const counts=f=>({meshes:f.scene.meshes.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,skeletons:f.scene.skeletons.length,materials:f.scene.materials.length,textures:f.scene.textures.length,managers:f.scene.morphTargetManagers.length,pool:f.battle.allPooled.length});
const bufferRefs=e=>e.spell.topologies.flatMap(t=>[t.fill,t.rim]).flatMap(g=>[g.getVertexBuffer(VertexBuffer.PositionKind)?.getBuffer(),g.getVertexBuffer(VertexBuffer.NormalKind)?.getBuffer(),g.getIndexBuffer()]);
async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  caveFogFallback(scene).getInternalTexture().isReady=true;
  Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  // NullEngine stores the original texture-array dimensions without GPU upload.
  // Pose/lifecycle checks use the same bounded morph texture policy as production.
  engine.createRawTexture2DArray=(data,width,height,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,width,height,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
  const loaded=[];
  async function model(name){
    const config=JSON.parse(readFileSync(new URL(name+'.json',base)));
    if(name==='mourning-elena')assert.equal(config.animations.dead,'Chimera_Death_Lament_5p2s','test must load the shipped r9 death model');
    if(!cache.has(config.model))cache.set(config.model,readRuntimeGltf(new URL(config.model,base)));
    const source=await cache.get(config.model),gltf=structuredClone(source.gltf);
    for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
    for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
    for(const group of container.animationGroups)group.stop();
    for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('r9-death-offline',scene);
    loaded.push({loader,container});
    const library=new BossModelLibrary(scene,name);library.config=config;library.container=container;library.load=async()=>{};return library;
  }
  const elenaModels=await model('elena'),mourningModels=await model('mourning-elena'),defeats=[],removed=[],added=[];
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(mesh){added.push(mesh);},removeShadowCaster(mesh){removed.push(mesh);}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels,mourningModels,onDefeat:e=>defeats.push(e)}),player=new TransformNode('r9-lifecycle-player',scene);player.position.set(29,6,-22);
  t.after(()=>{battle.hide();for(const {loader,container} of loaded){container.dispose();loader.dispose();}scene.dispose();engine.dispose();});
  return {engine,scene,world,battle,player,defeats,removed,added};
}
function step(f,dt=1/60){f.battle.update(dt,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);}
function advance(f,enemy,time){const target=Math.min(time,enemy.death.duration);let steps=0;while(enemy.death.elapsed<target){assert.ok(++steps<1000,'death clock must progress');step(f,Math.min(1/60,target-enemy.death.elapsed));}}
function visualState(enemy){return enemy.asset.meshes.filter(m=>m.getTotalVertices()).map(mesh=>({mesh,material:mesh.material,alpha:mesh.material.alpha,pixels:mesh.metadata?.outlinePixels,brightness:mesh.material.metadata?.elenaStyle?.brightness}));}
function assertOpaque(enemy,snapshot){
  assert.equal(enemy.actor.isEnabled(),true);
  for(const s of snapshot){assert.equal(s.mesh.visibility,1,s.mesh.name+' remains opaque');assert.equal(s.mesh.material,s.material);assert.equal(s.material.alpha,s.alpha);assert.equal(s.mesh.metadata?.outlinePixels,s.pixels);assert.equal(s.material.metadata?.elenaStyle?.brightness,s.brightness);if(isRuntimeOutline(s.mesh))assert.equal(s.pixels,.5);}
}

test('death clock keeps other enemies on five-second fade and lament on opaque clip plus hold',()=>{
  const d=new EnemyDeath();assert.equal(d.duration,CORPSE_FADE_SECONDS);assert.equal(d.advance(2.5),true);near(d.opacity,.5);d.advance(2.5);assert.equal(d.finished,true);assert.equal(d.opacity,0);
  d.reset({holdPose:true,clipSeconds:5.2});near(d.duration,5.2+MOURNING_DEATH_HOLD_SECONDS);assert.equal(d.finished,false);
  assert.equal(d.advance(5.2),true);assert.equal(d.finished,false);assert.equal(d.opacity,1);assert.equal(d.advance(.64),false);assert.equal(d.finished,false);d.advance(.011);assert.equal(d.finished,true);assert.equal(d.opacity,1);assert.equal(d.advance(10),false);
  d.reset();assert.equal(d.holdPose,false);assert.equal(d.duration,5);assert.equal(d.opacity,1);assert.equal(d.finished,false);d.advance(Number.NaN);assert.equal(d.elapsed,0);
});

test('r9 death plays once for 5.2 seconds at every attack-speed setting, holds opaque, and hides the whole actor',async t=>{
  const f=await fixture(t);f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];
  for(const speed of [.5,1,2]){
    await f.battle.activateResident(f.player,{reset:true,phase:2});e.brain.configureAttacks({speed});e.brain.cast();step(f,.2);
    const position=e.actor.position.clone(),yaw=e.actor.rotation.y,visual=visualState(e),reward=f.defeats.length,removed=f.removed.length;
    assert.ok(visual.some(s=>isRuntimeOutline(s.mesh)),'real outline shells included');
    e.bossReaction.start(new Vector3(1,0,0));e.brain.hit({damage:e.brain.hp});f.player.position.x+=1;
    step(f,1/60);assert.equal(f.defeats.length,reward+1);assert.equal(f.battle.combatCount,0);assert.equal(f.removed.length,removed,'opaque collapse retains its shadow');assert.equal(e.spell.mesh.isEnabled(),false);assert.equal(e.pendingEvents.length,0);
    advance(f,e,5.2);near(e.animator.deathTime,5.2);assert.equal(e.animator.deathFinished,true);assert.equal(e.corpseGone,false);assertOpaque(e,visual);near(Vector3.Distance(e.actor.position,position),0,'dead actor cannot recoil or translate');near(e.actor.rotation.y,yaw,'death preserves its previous facing');
    const held=e.poseNodes.map(n=>[n.position.asArray(),n.rotationQuaternion?.asArray(),n.scaling.asArray()]);
    advance(f,e,5.84);near(e.animator.deathTime,5.2);assertOpaque(e,visual);assert.deepEqual(e.poseNodes.map(n=>[n.position.asArray(),n.rotationQuaternion?.asArray(),n.scaling.asArray()]),held,'final local pose holds');
    step(f,.02);assert.equal(e.corpseGone,true);assert.equal(e.actor.isEnabled(),false);assert.ok(visual.every(s=>!s.mesh.isEnabled()&&s.mesh.visibility===1),'body and outlines hide together without fading');assert.equal(e.animator.disposed,true);assert.equal(f.removed.length,removed+e.deathVisibility.length);
    const removedAfter=f.removed.length;for(let i=0;i<30;i++)step(f,.1);e.updateDeath(1);assert.equal(f.removed.length,removedAfter);assert.equal(f.defeats.length,reward+1);assert.equal(e.spell.mesh.isEnabled(),false);
  }
});

test('r9 dying resident pauses through map trips, resumes without restart, and pooled revival restores state and buffers',async t=>{
  const f=await fixture(t);f.battle.residentPhase=2;await f.battle.activateResident(f.player);const e=f.battle.mourningPool[0];
  for(let i=0;i<e.brain.spells.length;i++){e.brain.nextSpell=i;e.brain.cast();step(f,.01);e.spell.reset();}
  const resources=counts(f),buffers=bufferRefs(e),visual=visualState(e);f.battle.combat.hp=319;f.battle.potions.remaining=2;f.battle.combat.defense=11;
  for(let cycle=0;cycle<4;cycle++){
    await f.battle.activateResident(f.player,{reset:true,phase:2});e.brain.cast();step(f,.12);e.brain.hit({damage:e.brain.hp});advance(f,e,cycle%2?4.6:.9);
    const clock=e.animator.deathTime,halo=e.animator.haloTime,elapsed=e.death.elapsed,reward=f.defeats.length;
    for(let trip=0;trip<3;trip++){
      f.battle.hide();f.world.cave=false;step(f,10);near(e.death.elapsed,elapsed);near(e.animator.deathTime,clock);assert.equal(e.actor.isEnabled(),false);
      f.world.cave=true;await f.battle.activateResident(f.player);assert.equal(e.brain.hp,0);near(e.animator.deathTime,clock);near(e.animator.haloTime,halo);near(e.death.elapsed,elapsed);assertOpaque(e,visual);assert.equal(f.defeats.length,reward);
    }
    // Paused frames do not consume the death clock; zero-delta update also preserves it.
    step(f,0);near(e.animator.deathTime,clock);advance(f,e,5.86);assert.equal(e.corpseGone,true);assert.equal(e.actor.isEnabled(),false);assert.equal(f.defeats.length,reward);
    f.battle.hide();f.world.cave=false;f.world.cave=true;await f.battle.activateResident(f.player);step(f,.1);assert.equal(e.actor.isEnabled(),false);assert.equal(f.defeats.length,reward);
    await f.battle.activateResident(f.player,{reset:true,phase:2});assert.equal(e.brain.hp,e.brain.maxHp);assert.equal(e.death.started,false);assert.equal(e.animator.deathStarted,false);assertOpaque(e,visual);assert.equal(e.fogVisible,true);
    assert.deepEqual(counts(f),resources);assert.deepEqual(new Set(bufferRefs(e)),new Set(buffers),'LRU order may change but warmed buffers must be reused');assert.equal(f.battle.playerHp,319);assert.equal(f.battle.potions.remaining,2);assert.equal(f.battle.combat.defense,11);
  }
  // Cave visibility is still authoritative: opaque means no fade, not seeing through walls.
  e.brain.hit({damage:9999});step(f,.1);const position=e.actor.position.clone(),wall=position.x-1.5,fog=new CaveFogRuntime(f.world,{isOpaque:x=>x>=wall&&x<wall+1});t.after(()=>fog.dispose());
  fog.update({x:position.x-4,z:position.z},0,{force:true,encounters:[e]});fog.beforeRender();assert.equal(e.fogVisible,false);assert.ok(e.asset.meshes.every(m=>!m.getTotalVertices()||!m.isVisible));assert.ok(e.asset.meshes.every(m=>m.visibility===1));fog.restore();
});
