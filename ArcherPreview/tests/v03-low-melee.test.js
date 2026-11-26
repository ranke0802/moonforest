import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {FreeCamera,NullEngine,Scene,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {parseHTML} from 'linkedom';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {CharacterAnimator} from '../src/animation.js';
import {BossBattle} from '../src/boss-battle.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {configurePlayerSize} from '../src/player-dimensions.js';
import {PlayerMeleeAim,meleeApproachPoint,meleeNeckPoint} from '../src/player-melee-aim.js';
import {PLAYER_STRIKES,PLAYER_STRIKE_AIM_YAW,PlayerStrikeSampler} from '../src/player-strikes.js';
import {MeleeContactGate} from '../src/melee-collision.js';
import {CHAPTER_MONSTER_MODELS} from '../src/v03/chapter-monster-models.js';
import {createChapterEnemyFactory} from '../src/v03/chapter-enemy-encounter.js';
import {GreatAttackCast} from '../src/v03/great-attack.js';
import {createGreatAttackFx} from '../src/v03/great-attack-fx.js';
import {STRIKE_LUNGE,strikeLungeStep,applyStrikeTravel} from '../src/v03/strike-approach.js';
import {setHitScale} from '../src/hit-scale.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';

const base=new URL('../public/assets/',import.meta.url);
const manifest=id=>JSON.parse(readFileSync(new URL(id+'.json',base)));
async function loadRig(scene,url){
 let gltf;
 if(url.pathname.endsWith('.glb')){
  const bytes=readFileSync(url),end=20+bytes.readUInt32LE(12);
  gltf=JSON.parse(bytes.toString('utf8',20,end));
  gltf.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(end+8).toString('base64');
 }else{
  const decoded=await readRuntimeGltf(url);gltf=decoded.gltf;
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+decoded.files.get(b.uri).data.toString('base64');
 }
 delete gltf.extensionsRequired;delete gltf.extensionsUsed;
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const group of asset.animationGroups)group.stop();
 return asset;
}

test('shipped warrior swings track their target and use real contacts on low and tall rigs',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,6),scene);
 const world={scene,mapId:'great-plains',release:'moonforest-0.2',terrain:{place(p){p.y=0;},heightAt(){return 0;}},shadows:{addShadowCaster(){},removeShadowCaster(){}}};
 const battle=new BossBattle(world,()=>{});battle.preparationOptions={frame:async()=>scene.render(),maxBlocks:4};
 const factory=createChapterEnemyFactory({world,battle,incremental:false,loadModel:loadRig,mountWeapon:()=>({ready:Promise.resolve(true),dispose(){}})});
 t.after(()=>{factory.dispose();battle.hide();scene.dispose();engine.dispose();setHitScale({});});
 setHitScale({playerStrike:1.15,monsterHurt:1.15,playerHurt:1.15});
 const cfg=manifest('warrior-v3-mobile4k'),asset=await loadRig(scene,new URL(cfg.model,base)),player=new TransformNode('player',scene);
 asset.addAllToScene();for(const n of [...asset.meshes,...asset.transformNodes])if(!n.parent)n.parent=player;
 const dimensions=configurePlayerSize(player,cfg,{warrior:true}),animator=new CharacterAnimator(asset.animationGroups,cfg.animations);
 const pose=orderPoseNodes([player,...asset.transformNodes,...asset.meshes]),sword=asset.meshes.find(n=>n.name==='Golden_Oathblade'),aim=new PlayerMeleeAim(asset);
 const {document}=parseHTML('<main></main>');
 const fx=createGreatAttackFx({scene,root:document.querySelector('main'),ground:world.terrain.heightAt});
 let scarDraws=0;
 scene.getMeshByName('v03-starfall-ground').onAfterRenderObservable.add(()=>scarDraws++);
 async function opponent(kind){
  if(CHAPTER_MONSTER_MODELS[kind])return (await factory.create({kind,id:kind,x:0,z:1.7,player})).encounter;
  const modelId=kind==='goblin'?'hooded-goblin':'fox-r2',spec=manifest(modelId),lib=new BossModelLibrary(scene,modelId);
  lib.config=spec;lib.container=await loadRig(scene,new URL(spec.model,base));lib.load=async()=>{};
  const paint=new StandardMaterial('fox coat',scene);for(const m of lib.container.meshes)if(m.getTotalVertices())m.material=paint;
  if(kind==='goblin')battle.goblinModels=lib;else battle.regularWolves.fox.models=lib;
  await battle.summon(player,1,kind);return battle.encounters.find(e=>e.kind===kind||e.regularWolfId===kind);
 }
 let serial=0;
 function swing(foe,state,start,fitted,other,{yaw=0,level=0,manual=false,blocked=false,rank=0}={}){
  aim.reset();animator.transition('idle',{clipTime:0,actionId:null,blendDuration:0});animator.update(1);scene.render();
  player.position.set(0,0,0);foe.actor.position.set(0,level,start);foe.actor.rotation.y=yaw;
  foe.player=player;foe.actor.computeWorldMatrix(true);foe.alignPose();refreshPoseMatrices(foe.poseNodes);
  const first=rank?foe.actor.position:fitted?meleeApproachPoint(foe,new Vector3()):meleeNeckPoint(foe,new Vector3())??foe.actor.position;
  const correction=PLAYER_STRIKE_AIM_YAW[state]??0;
  player.rotation.y=(manual?Math.PI:Math.atan2(first.x,first.z))+correction;
  const gate=new MeleeContactGate(),sampler=new PlayerStrikeSampler(),ledger={},actionId=++serial,hits=[];
  const duration=animator.durations[state],dt=1/60;
  const navigation={obstacles:blocked?[{x:0,z:.48,radius:.12}]:[],segmentClear:()=>!blocked};
  const hp=foe.brain.hp;if(blocked)world.navigation=navigation;
  const cast=rank?new GreatAttackCast(actionId,rank):null;
  const renderedHits=[];
  if(cast)fx.reset();
  cast?.release(); // This fixture samples the released attack by clip seconds.
  const contactWorld={navigation,terrain:world.terrain},encounters=other?[foe,other]:[foe];
  for(let time=0;time<=duration;time+=dt){
   const action={actionId,state,clipTime:time,greatAttack:cast};
   aim.restore();animator.transition(state,action);animator.update(dt);
   if(time===0)aim.begin(action,player,foe,fitted);
   const step=strikeLungeStep(ledger,player,action,STRIKE_LUNGE[state],foe,other??foe,manual,dimensions.ratio,duration,dt,fitted);
   if(step>0)applyStrikeTravel(player,action,player.rotation.y-correction,step,contactWorld,encounters,50,dimensions);
   scene.render();refreshPoseMatrices(pose);aim.apply(action,player,dt);
   const sample=sampler.sample(action,sword,null,true,player.rotation.y,0,dimensions);
   const capsules=foe.hurtCapsules();
   // Test the hooded goblin's real body independently of its upright assist.
   if(foe.kind==='goblin')capsules.pop();
   if(cast){
    cast.sample(time,sample,PLAYER_STRIKES.judgment[0],0,player.position,contactWorld);
    fx.update(cast,sample.blade,player.position);fx.tick();
    const before=foe.brain.hp;
    foe.poseAndContacts(player,action,sample,null);
    if(foe.brain.hp<before){
     const draws=scarDraws;scene.render();
     assert.ok(scarDraws>draws,'the ground crack drew on the frame that dealt damage');
     renderedHits.push(foe.brain.mode);
    }
   }
   hits.push(...gate.collect({...sample,capsules,areaContact:cast?.contains(foe.actor.position,navigation)}).hits.map(h=>h.id));
   if(blocked)foe.poseAndContacts(player,action,sample,null);
  }
  if(blocked){delete world.navigation;assert.equal(foe.brain.hp,hp,'wall occludes the real encounter damage path');}
  aim.restore();return {hits,aimed:aim.target===foe,travel:player.position.length(),z:player.position.z,center:cast?.center,renderedHits};
 }
 const nearSide={kind:'goblin',active:true,actor:{position:new Vector3(-1,0,0)},radius:.34,brain:{hp:10}};
 for(const kind of ['fox','goblin','goblin-warrior','goblin-archer','goblin-shaman','ghoul-warrior','zombie','hobgoblin-boss']){
  player.position.set(0,0,0);const foe=await opponent(kind);
  for(const state of ['slash','attack']){
   const expected=state==='slash'?['cut']:['thrust','follow-cut'];
   const ordinary=swing(foe,state,1.9,true,null,{yaw:Math.PI/2});
   assert.deepEqual(ordinary.hits,expected,kind+' '+state+' broadside');
   const before=swing(foe,state,2.1,false,nearSide),after=swing(foe,state,2.1,true,nearSide);
   assert.deepEqual(after.hits,expected,kind+' '+state+' crowded approach');
   assert.equal(after.aimed,kind==='fox'||kind.startsWith('goblin'),'shoulder fit '+kind);
   if(state==='slash')assert.deepEqual(before.hits,[],kind+' reproduces old crowded miss');
   if(kind.startsWith('goblin-')&&state==='attack')assert.deepEqual(before.hits,['thrust']);
   assert.ok(after.travel<=STRIKE_LUNGE[state].distance*dimensions.ratio+.001,'authored travel budget');
  }
  if(kind.startsWith('goblin')){
   const downhill={level:-.34},before=swing(foe,'slash',1.9,false,null,downhill),after=swing(foe,'slash',1.9,true,null,downhill);
   assert.deepEqual(before.hits,[],kind+' formerly swung above the torso downhill');
   assert.deepEqual(after.hits,['cut'],kind+' fits the visible shoulder to the lower torso');
  }
  const leap=swing(foe,'judgment',3.2,true,nearSide),outOfReach=swing(foe,'judgment',6,true,nearSide);
  assert.deepEqual(leap.hits,['jump-cut','jump-cut','jump-cut'],kind+' closes for one normal three-part heavy hit');
  assert.ok(leap.travel<=STRIKE_LUNGE.judgment.reach*dimensions.ratio+.001);
  assert.deepEqual(outOfReach.hits,[],kind+' misses beyond the leap range');
  if(kind==='fox'||kind==='goblin'||kind==='goblin-warrior'){
   const charged=swing(foe,'judgment',3.2,true,nearSide,{rank:1});
   assert.deepEqual(charged.hits,['jump-cut','jump-cut','jump-cut'],kind+' receives all three hits');
   assert.equal(charged.renderedHits.length,3,kind+' rendered the first, second and third HP loss');
   if(kind==='fox')assert.equal(charged.renderedHits[0],'down','fox knockdown and the first partial crack batch share a frame');
   assert.deepEqual(charged.center,{x:0,y:0,z:3.2},kind+' is the centre of the level-one blast');
   assert.ok(charged.travel>1&&Vector3.Distance(player.position,foe.actor.position)>1,kind+' is reached without overlapping its rig');
  }
  if(kind==='goblin-warrior'){
   const far=swing(foe,'slash',4,true,null),away=swing(foe,'slash',1.9,true,null,{manual:true});
   assert.deepEqual(far.hits,[]);assert.deepEqual(away.hits,[]);
   assert.ok(far.z>.45&&away.z<-.45,'an empty swing still steps in the intended direction');
   const wall=swing(foe,'slash',1.3,true,null,{blocked:true});
   assert.ok(wall.travel<.2,'wall stops the authored step');
   assert.deepEqual(wall.hits,['cut'],'blade geometrically overlaps behind the wall; the encounter rejected damage');
  }
 }
});
