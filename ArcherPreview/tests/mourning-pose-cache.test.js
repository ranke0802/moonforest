import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {refreshPoseMatrices} from '../src/pose-matrices.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));let packed;
async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  engine.createRawTexture2DArray=(data,w,h,d,format,mips,invert,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invert,sampling,compression,type);texture.depth=d;texture.is2DArray=true;return texture;};
  caveFogFallback(scene).getInternalTexture().isReady=true;
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const group of container.animationGroups)group.stop();
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial('pose-cache-offline',scene);
  const mourningModels=new BossModelLibrary(scene,'mourning-elena');mourningModels.config=config;mourningModels.container=container;mourningModels.load=async()=>{};
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true,{mourningModels}),player=new TransformNode('pose-cache-player',scene);player.position.set(29,6,-22);battle.residentPhase=2;await battle.activateResident(player);
  const enemy=battle.mourningPool[0];enemy.reviewMode=true;enemy.reviewMovement={x:0,z:0};enemy.renderVisible=true;
  t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});return {engine,scene,world,battle,player,enemy,animator:enemy.animator};
}
function matrices(nodes){return nodes.map(n=>Array.from(n.getWorldMatrix().m));}
function assertMatchesForced(f){
  const before=matrices(f.animator.poseNodes),capsules=structuredClone(f.enemy.hurtCapsules());
  refreshPoseMatrices(f.animator.poseNodes);
  assert.deepEqual(matrices(f.animator.poseNodes),before,'reused world matrices equal a complete forced hierarchy refresh');
  assert.deepEqual(f.enemy.hurtCapsules(),capsules,'all 49 hit capsules retain the same world-space endpoints');
}

test('r9 sampled walk, cast, hit and death poses reuse unchanged roots without touching rig nodes',async t=>{
  const f=await fixture(t),{animator}=f;let dirty=0;
  for(const node of animator.poseNodes){const original=node.markAsDirty;node.markAsDirty=function(...args){dirty++;return original.apply(this,args);};}
  for(const state of ['idle','walk','cast','hit','dead']){
    animator.reset();animator.transition(state,{clipTime:1.22,staggerRemaining:state==='hit'?1:0});animator.update(.15);
    const count=dirty,samples=animator.samples,buffer=animator.poseRootLocals;
    for(let i=0;i<10;i++)assert.equal(animator.ensurePoseCurrent(),false,state);
    assert.equal(dirty,count,'cache check does not dirty the imported hierarchy');assert.equal(animator.samples,samples);assert.strictEqual(animator.poseRootLocals,buffer);assertMatchesForced(f);
    const body=f.enemy.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin'),outline=f.enemy.asset.meshes.find(m=>m.parent===body&&m.metadata?.moonforestOutline);
    assert.strictEqual(outline.skeleton,body.skeleton);assert.strictEqual(outline.morphTargetManager,body.morphTargetManager);assert.equal(outline.metadata.outlinePixels,.5);
  }
});

test('same-render-ID actor/carrier relocation, turn and scale invalidate the cached pose before contacts',async t=>{
  const f=await fixture(t),{animator,enemy}=f;
  for(const mutate of [()=>enemy.actor.position.x+=.3,()=>enemy.actor.position.y+=.2,()=>enemy.actor.rotation.y+=.7,()=>enemy.actor.scaling.scaleInPlace(1.01),()=>enemy.carrier.position.z+=.1,()=>enemy.carrier.rotation.y+=.2,()=>enemy.carrier.scaling.scaleInPlace(1.01)]){
    animator.sample(0);assert.equal(animator.ensurePoseCurrent(),false);const renderId=f.scene.getRenderId();mutate();
    assert.equal(animator.ensurePoseCurrent(),true);assert.equal(f.scene.getRenderId(),renderId);assert.equal(animator.ensurePoseCurrent(),false);assertMatchesForced(f);
  }
});

test('real encounter reuses sampled pose, refreshes after separation, and survives return and final death',async t=>{
  const f=await fixture(t),{enemy,animator,battle,player,scene}=f;let reused=0,refreshed=0;
  const ensure=animator.ensurePoseCurrent;animator.ensurePoseCurrent=function(){const changed=ensure.call(this);changed?refreshed++:reused++;return changed;};
  for(let frame=0;frame<180;frame++){
    player.position.copyFrom(enemy.actor.position).addInPlace(new Vector3(5,0,0));enemy.reviewMovement.x=frame<60?1:frame<120?-1:0;
    battle.update(1/30,player);scene._animate(0);battle.poseAndContacts(player,{state:'idle'},null,null);if(frame%30===0)assertMatchesForced(f);
  }
  assert.ok(reused>150,'ordinary frames must not re-dirty all rig nodes');
  // Disable world constraints only for this contact-unit case so separation
  // definitely moves the actor, rather than a nearby cave wall rejecting it.
  const navigation=f.world.navigation;f.world.navigation=null;enemy.reviewMovement.x=0;
  animator.sample(0);player.position.copyFrom(enemy.actor.position).addInPlace(new Vector3(.5,0,0));const before=enemy.actor.position.clone(),count=refreshed;
  battle.poseAndContacts(player,{state:'idle'},null,null);assert.ok(Vector3.Distance(enemy.actor.position,before)>.5);assert.ok(refreshed>count);assertMatchesForced(f);f.world.navigation=navigation;
  const saved=enemy.actor.position.clone();battle.hide();f.world.cave=false;f.world.cave=true;await battle.activateResident(player);assertMatchesForced(f);assert.ok(Vector3.Distance(enemy.actor.position,saved)<1e-6);
  enemy.reviewMode=false;enemy.brain.hit({damage:9999});for(let i=0;i<156;i++){battle.update(1/30,player);battle.poseAndContacts(player,{state:'idle'},null,null);}
  assert.equal(animator.deathTime,5.2);assert.equal(animator.deathFinished,true);assert.equal(enemy.corpseGone,false);assertMatchesForced(f);
  for(let i=0;i<21;i++)battle.update(1/30,player);assert.equal(enemy.corpseGone,true);
  await battle.activateResident(player,{reset:true,phase:2});assert.equal(animator.deathTime,0);assert.equal(animator.deathFinished,false);assertMatchesForced(f);
});
