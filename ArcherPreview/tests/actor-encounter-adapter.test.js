import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,TransformNode,Vector3,MeshBuilder,PBRMaterial,AssetContainer,Animation,AnimationGroup,Skeleton,Bone,Matrix,VertexBuffer} from '@babylonjs/core';
import {CharacterAnimator} from '../src/animation.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {BossBattle} from '../src/boss-battle.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {ACTOR_DEFINITIONS,getActorDefinition,validateActorSpawn} from '../src/actor-definitions.js';
import {createActorEncounterFactory} from '../src/actor-encounter-adapter.js';

const prepare=()=>createBossPreparation({frame:async()=>{},incremental:true});
function fixture(t,{borrowed=false}={}){
  const engine=new NullEngine(),scene=new Scene(engine);Object.assign(engine.getCaps(),{maxVertexUniformVectors:256,maxVertexTextureImageUnits:16,textureFloat:true});new FreeCamera('camera',new Vector3(0,2,-8),scene);
  const cast=new Set(),world={scene,mapId:'village',terrain:{heightAt:()=>0,place:p=>{p.y=0;}},shadows:{addShadowCaster:m=>cast.add(m),removeShadowCaster:m=>cast.delete(m)}};
  const battle=new BossBattle(world,()=>{},()=>{},()=>true),player=new TransformNode('player',scene);battle.currentPlayer=player;
  const libraries=new Map(),loads={count:0},disposedSources={count:0};
  function libraryFactory(_scene,id){
    const definition=Object.values(ACTOR_DEFINITIONS).find(d=>d.assetId===id),container=new AssetContainer(scene),root=new TransformNode('rig-root',scene),hip=new TransformNode('mixamorig:Hips',scene);hip.parent=root;
    const nodes=[root,hip,...['Head','RightHand','LeftHand','LeftFoot','RightFoot'].map(name=>{const n=new TransformNode('mixamorig:'+name,scene);n.parent=hip;return n;})];
    const mesh=MeshBuilder.CreateBox(id,{size:1},scene);mesh.parent=root;mesh.material=new PBRMaterial(id+'-paint',scene);
    const skeleton=new Skeleton(id+'-skin',id+'-skin',scene),bone=new Bone('Hips',skeleton,null,Matrix.Identity());bone.linkTransformNode(hip);mesh.skeleton=skeleton;
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,Array(mesh.getTotalVertices()*4).fill(0));
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,Array.from({length:mesh.getTotalVertices()*4},(_,i)=>i%4===0?1:0));
    container.meshes.push(mesh);container.transformNodes.push(...nodes);container.skeletons.push(skeleton);container.materials.push(mesh.material);
    for(const name of Object.values(definition.animation)){
      const animation=new Animation(name,'position',30,Animation.ANIMATIONTYPE_VECTOR3,Animation.ANIMATIONLOOPMODE_CYCLE);
      animation.setKeys([{frame:0,value:Vector3.Zero()},{frame:30,value:new Vector3(.2,0,0)}]);
      const group=new AnimationGroup(name,scene);group.addTargetedAnimation(animation,hip);container.animationGroups.push(group);
    }
    container.populateRootNodes();container.removeAllFromScene();
    const dispose=container.dispose.bind(container);container.dispose=()=>{disposedSources.count++;dispose();};
    const config={version:definition.assetVersion,scale:1,animations:definition.animation,catalog:Object.keys(definition.animation).map(name=>({name,fps:30,duration:1,rootTrack:[[0,0,0],[0,0,0]],groundTrack:[.075,.075]}))};
    const library={config,container,loads:0,load:async()=>{if(!library.loads){loads.count++;library.loads++;}}};libraries.set(id,library);
    return {library,owned:!borrowed};
  }
  const interactions=[],rewards=[];
  const factory=createActorEncounterFactory({world,battle,getPlayer:()=>player,libraryFactory,rewardsEnabled:true,onDefeat:event=>rewards.push(event),interactNpc:(...args)=>{interactions.push(args);return true;}});
  t.after(async()=>{await factory.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,world,battle,player,factory,libraries,loads,disposedSources,cast,interactions,rewards};
}

test('definitions name only canonical versioned assets and preserve live encounter stats/animation mappings',()=>{
  for(const [id,definition]of Object.entries(ACTOR_DEFINITIONS)){
    assert.equal(id,definition.actorDefinitionId);assert.ok(Object.isFrozen(definition));
    const manifest=JSON.parse(readFileSync(new URL('../public/assets/'+definition.assetId+'.json',import.meta.url)));
    assert.equal(definition.assetVersion,manifest.version);assert.deepEqual(definition.animation,manifest.animations);
    assert.equal(/data:|base64|\.gltf|\.glb|https?:/.test(JSON.stringify(definition)),false);
    assert.equal(definition.lod.reduceExisting,false);
  }
  assert.equal(getActorDefinition('guardian-bear.standard').hp,900);
  assert.equal(getActorDefinition('hooded-goblin.standard').hp,180);
  assert.equal(getActorDefinition('elena.fallen').hp,1200);
  assert.equal(getActorDefinition('elena.mourning').hp,1800);
  assert.throws(()=>getActorDefinition('missing'));
});

test('spawn safety rejects map, navigation, actor overlap and player distance without relocation',t=>{
  const f=fixture(t),definition=getActorDefinition('hooded-goblin.standard'),position=new Vector3(0,0,4);
  assert.equal(validateActorSpawn(definition,f.world,{position,player:f.player}).valid,true);
  assert.equal(validateActorSpawn(definition,f.world,{position:f.player.position,player:f.player}).reason,'player-safety-distance');
  assert.equal(validateActorSpawn(definition,f.world,{position,occupied:[{x:0,z:4,radius:1}]}).reason,'occupied');
  f.world.navigation={free:()=>false};assert.equal(validateActorSpawn(definition,f.world,{position}).reason,'blocked-navigation');
  f.world.mapId='witch-cave';assert.equal(validateActorSpawn(getActorDefinition('village.guard'),f.world,{position}).reason,'wrong-map');
  assert.deepEqual(position.asArray(),[0,0,4]);
});

test('a registered variant consumes health, collider and actor-local clip mapping; unsupported movement/remaps reject explicitly',async t=>{
  const f=fixture(t),base=getActorDefinition('hooded-goblin.standard');
  const definition={...base,actorDefinitionId:'hooded-goblin.registered-variant',hp:275,maxHp:275,collider:{...base.collider,radius:.5,stopDistance:1.3,separationRadius:.6},animation:{Walking:'Sneaky_Walk_inplace'}};
  const adapter=f.factory(definition);await adapter.activate({position:new Vector3(0,0,4)},{preparation:prepare()});
  const encounter=adapter.encounter,source=f.libraries.get('hooded-goblin').config;
  assert.equal(encounter.brain.hp,275);assert.equal(encounter.brain.maxHp,275);
  assert.deepEqual([encounter.radius,encounter.stopDistance,encounter.separationRadius],[.5,1.3,.6]);
  assert.notEqual(encounter.config,source);assert.notEqual(encounter.config.animations,source.animations);
  assert.equal(source.animations.Walking,'Walking');assert.equal(encounter.config.animations.Walking,'Sneaky_Walk_inplace');
  assert.equal(encounter.animator.clips.Walking.name,'Sneaky_Walk_inplace');
  assert.equal(encounter.config.animations.Running,'Running','unmodified required actions retain the manifest mapping');
  const animator=encounter.animator;encounter.brain.hp=1;adapter.hide();adapter.reset({position:new Vector3(0,0,4)});
  await adapter.activate(undefined,{preparation:prepare()});assert.equal(encounter.brain.hp,275);assert.equal(encounter.animator,animator);
  const ordinary=f.factory(base);await ordinary.activate({position:new Vector3(4,0,0)},{preparation:prepare()});
  assert.equal(ordinary.encounter.brain.hp,180);assert.equal(ordinary.encounter.animator.clips.Walking.name,'Walking');assert.equal(f.loads.count,1);
  assert.throws(()=>f.factory({...definition,movement:{...base.movement,runSpeed:99}}),/Unsupported actor movement override/);
  const mourning=getActorDefinition('elena.mourning');assert.throws(()=>f.factory({...mourning,animation:{...mourning.animation,idle:mourning.animation.walk}}),/Unsupported animation override/);
  const missing=f.factory({...definition,actorDefinitionId:'hooded-goblin.missing-clip',animation:{Walking:'missing-clip'}});
  await assert.rejects(missing.warm({preparation:prepare()}),/Actor animation clip missing for Walking/);
});

test('independent pooled encounters reuse shared geometry/materials and retain animator/native clip bindings over warm lives',async t=>{
  const f=fixture(t),definition=getActorDefinition('hooded-goblin.standard'),a=f.factory(definition),b=f.factory(definition);
  await a.warm({preparation:prepare()});await b.warm({preparation:prepare()});
  assert.notEqual(a.encounter.asset.skeletons[0],b.encounter.asset.skeletons[0]);
  assert.equal(a.encounter.asset.meshes[0].geometry,b.encounter.asset.meshes[0].geometry);
  assert.equal(a.encounter.asset.meshes[0].material,b.encounter.asset.meshes[0].material);
  assert.notEqual(a.encounter.asset.animationGroups[0].targetedAnimations[0].target,b.encounter.asset.animationGroups[0].targetedAnimations[0].target);
  await a.activate({position:new Vector3(0,0,4)},{preparation:prepare()});
  const e=a.encounter,animator=e.animator,geometry=e.asset.meshes[0].geometry,material=e.asset.meshes[0].material,skeleton=e.asset.skeletons[0],start=t.mock.method(AnimationGroup.prototype,'start',AnimationGroup.prototype.start);
  f.battle.combat.hp=233;f.battle.combat.invulnerable=.3;
  const counts=()=>[f.scene.meshes.length,f.scene.materials.length,f.scene.geometries.length,f.scene.skeletons.length,f.scene.animationGroups.length];
  const before=counts();
  for(let life=0;life<5;life++){
    e.brain.hp=1;e.brain.flash=.2;e.pendingEvents.push({type:'old'});e.target=f.player;e.knockVelocity.setAll(1);e.asset.meshes[0].visibility=.1;e.asset.meshes[0].isVisible=false;
    a.hide();assert.equal(e.brain.hp,180);assert.equal(e.pendingEvents.length,0);assert.equal(e.target,null);assert.equal(e.asset.meshes[0].visibility,1);assert.equal(e.asset.meshes[0].isVisible,true);
    a.reset({position:new Vector3(0,0,4)});await a.activate(undefined,{preparation:prepare()});
    assert.equal(e.animator,animator);assert.equal(e.asset.meshes[0].geometry,geometry);assert.equal(e.asset.meshes[0].material,material);assert.equal(e.asset.skeletons[0],skeleton);
    assert.equal(f.battle.encounters.filter(value=>value===e).length,1);assert.deepEqual(counts(),before);
  }
  assert.equal(start.mock.calls.length,0,'already prepared idle clips keep their native animatables');
  assert.equal(f.loads.count,1);assert.equal(f.battle.combat.hp,233);assert.equal(f.battle.combat.invulnerable,.3);
  const update=t.mock.method(e,'update',()=>{throw new Error('adapter duplicated battle update');});a.update(.1,{});assert.equal(update.mock.calls.length,0);
});

test('retained crossfade sets old native weights to zero; defaults stop/delete and both produce the same sampled pose',t=>{
  const f=fixture(t),node=new TransformNode('pose',f.scene),make=(name,x)=>{
    const animation=new Animation(name,'position',30,Animation.ANIMATIONTYPE_VECTOR3);animation.setKeys([{frame:0,value:new Vector3(x,0,0)},{frame:30,value:new Vector3(x,0,0)}]);
    const group=new AnimationGroup(name,f.scene);group.addTargetedAnimation(animation,node);return group;
  };
  const idle=make('idle',0),attack=make('attack',10),a=new CharacterAnimator([idle,attack],{idle:'idle',attack:'attack'});a.retainBindings=true;
  a.transition('attack',{clipTime:.5});a.update(.2);f.scene._animate(0);a.transition('idle',{clipTime:0,blendDuration:.1});a.update(.2);
  assert.equal(a.active.get('attack').weight,0);assert.ok(attack.animatables.length>0);assert.ok(attack.animatables.every(animatable=>animatable.weight===0));
  f.scene._animate(0);assert.equal(node.position.x,0);
  a.resetForReuse();a.transition('idle',{clipTime:0});a.update(.2);assert.equal(a.current,'idle');assert.equal(a.actionId,null);
  const b=new CharacterAnimator([make('default-idle',0),make('default-attack',10)],{idle:'default-idle',attack:'default-attack'});
  b.transition('attack',{clipTime:.5});b.update(.2);f.scene._animate(0);b.transition('idle',{clipTime:0,blendDuration:.1});b.update(.2);
  assert.equal(b.active.has('attack'),false);assert.equal(b.clips.attack.animatables.length,0);f.scene._animate(0);assert.equal(node.position.x,0);
  a.dispose();b.dispose();
});

test('death callback is once per life and opt-in corpse completion retains the same animator through respawn',async t=>{
  const f=fixture(t),adapter=f.factory(getActorDefinition('hooded-goblin.standard'));
  await adapter.activate({position:new Vector3(0,0,4)},{preparation:prepare()});const e=adapter.encounter,animator=e.animator;
  for(let life=1;life<=2;life++){
    assert.equal(adapter.defeat(),true);e.updateDeath(6);e.updateDeath(6);
    assert.equal(adapter.snapshot().rewardGranted,true);assert.equal(f.rewards.length,life);assert.equal(e.animator,animator);
    assert.equal(e.actor.isEnabled(),false);adapter.hide();adapter.reset({position:new Vector3(0,0,4)});await adapter.activate(undefined,{preparation:prepare()});
    assert.equal(adapter.snapshot().rewardGranted,false);assert.equal(e.animator,animator);
  }
});

test('NPC stays outside battle, keeps its interaction under decision tiering and follows live quest relevance',async t=>{
  const f=fixture(t),definition=getActorDefinition('village.guard'),adapter=f.factory(definition);
  await adapter.activate({position:new Vector3(0,0,4)},{preparation:prepare()});
  assert.equal(f.battle.encounters.includes(adapter.encounter),false);assert.equal((f.battle.developmentPool??[]).includes(adapter.encounter),false);
  assert.equal(adapter.snapshot().questRelevant,false);adapter.decide(1,{});adapter.update(.1,{});assert.equal(adapter.interact(),true);
  assert.equal(f.interactions[0][0],'guard');assert.equal(f.interactions[0][1],adapter.encounter.actor.position);assert.equal(f.interactions[0][2],3);
  assert.equal(adapter.defeat(),false);assert.equal(f.rewards.length,0);
});

test('last-actor eviction releases only its owned library; borrowed libraries and another live clone survive',async t=>{
  const f=fixture(t),definition=getActorDefinition('hooded-goblin.standard'),a=f.factory(definition),b=f.factory(definition);
  await a.warm({preparation:prepare()});await b.warm({preparation:prepare()});
  const source=f.libraries.get('hooded-goblin').container,geometry=b.encounter.asset.meshes[0].geometry;
  await a.dispose();assert.equal(f.disposedSources.count,0);assert.equal(b.encounter.asset.meshes[0].geometry,geometry);assert.equal(geometry.isDisposed(),false);
  await b.dispose();assert.equal(f.disposedSources.count,1);assert.equal(f.factory.inspect().libraries,0);assert.equal(f.battle.developmentPool.length,0);
  const external=fixture(t,{borrowed:true}),borrowed=external.factory(definition);await borrowed.warm({preparation:prepare()});await borrowed.dispose();await external.factory.dispose();
  assert.equal(external.disposedSources.count,0);assert.ok(external.libraries.get('hooded-goblin').container.meshes.length>0);
});

test('map generation cancellation before a late library load prevents independent actor creation or publication',async t=>{
  const f=fixture(t),definition=getActorDefinition('hooded-goblin.standard');let finish,current=true;
  const adapter=f.factory(definition,{isCurrent:()=>current}),library=f.libraries.get('hooded-goblin');
  library.load=()=>new Promise(resolve=>finish=resolve);
  const warming=adapter.warm({preparation:createBossPreparation({frame:async()=>{},isCurrent:()=>current})});
  while(!finish)await Promise.resolve();current=false;const disposing=adapter.dispose();finish();
  await assert.rejects(warming,{name:'AbortError'});await Promise.resolve();await Promise.resolve();
  await disposing;
  assert.equal(f.battle.encounters.length,0);assert.equal(adapter.encounter.actor,undefined);assert.equal(f.factory.inspect().actors,0);
});

test('ordinary summon/hide retains its existing recreate/dispose behavior unless explicit actor pooling opts in',async()=>{
  const calls=[],animator=()=>({durations:{idle:1},dispose:()=>calls.push('dispose'),transition:()=>{},update:()=>{}}),old=animator();
  const e=Object.assign(Object.create(BossEncounter.prototype),{loading:false,onChange:()=>{},grab:{reset(){}},prepareHidden:async()=>{},animator:old,createAnimator:()=>{calls.push('create');return animator();},createBrain:()=>({state:'idle',serial:1}),death:{reset(){}},deathVisibility:[],ownsCombat:false,bossReaction:{reset(){}},asset:{meshes:[]},actor:{position:Vector3.Zero(),rotation:{y:0},setEnabled(){}},ring:{setEnabled(){},isVisible:false},world:{terrain:{place(){}}},knockVelocity:Vector3.Zero(),gate:{reset(){}},setShadowCasting(){}});
  await e.summon({position:Vector3.Zero(),rotation:{y:0}},{position:new Vector3(0,0,4)});
  assert.deepEqual(calls,['dispose','create']);assert.notEqual(e.animator,old);e.hide();assert.deepEqual(calls,['dispose','create','dispose']);
});

test('staged group actors stay hidden and outside battle until committed',async t=>{
 const f=fixture(t),a=f.factory(getActorDefinition('hooded-goblin.standard')),b=f.factory(getActorDefinition('hooded-goblin.standard'));
 await a.activate({position:new Vector3(0,0,4),staged:true},{preparation:prepare()});await b.activate({position:new Vector3(3,0,4),staged:true},{preparation:prepare()});
 assert.equal(a.encounter.actor.isEnabled(),false);assert.equal(b.encounter.actor.isEnabled(),false);assert.equal(f.battle.encounters.length,0);assert.equal(a.reveal(),true);assert.equal(b.reveal(),true);assert.equal(f.battle.encounters.length,2);assert.equal(a.encounter.actor.isEnabled(),true);assert.equal(b.encounter.actor.isEnabled(),true);
});
import {createAuthoredMonsterRuntime} from '../src/authored-monster-runtime.js';
import {ActorPopulation} from '../src/actor-population.js';
import {emptyMonsterSpawns} from '../src/monster-spawn-document.js';
test('actual pooled encounters enter together, wait for all corpses, and respawn as a group',async t=>{
 const f=fixture(t);f.world.navigation={free:()=>true};const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},state={ready:true,dead:false,paused:false};
 class ImmediatePopulation extends ActorPopulation{constructor(opts){super({...opts,preparationFactory:()=>prepare()});}}
 const runtime=createAuthoredMonsterRuntime({world:f.world,battle:f.battle,getPlayer:()=>f.player,getState:()=>state,storage,Factory:()=>f.factory,Population:ImmediatePopulation});t.after(()=>runtime.dispose());const doc=emptyMonsterSpawns(),row=(id,x)=>({id,definitionId:'hooded-goblin.standard',groupId:'pack',spawnMode:'start',respawn:true,rewardEnabled:true,x,z:4,yaw:0,delaySeconds:2,randomRadius:2,drop:{assetId:'',effectEnabled:false}});doc.maps.village=[row('a',-3),row('b',3)];runtime.replace(doc);runtime.beforeBattle(0,f.player);
 for(let i=0;i<80&&runtime.inspect().groups[0]?.state!=='active';i++)await new Promise(r=>setTimeout(r,2));assert.equal(runtime.inspect().groups[0].state,'active');assert.equal(f.battle.encounters.length,2);
 const [a,b]=f.battle.encounters;a.brain.hp=0;a.death.advance(5);runtime.afterBattle(f.player);assert.equal(runtime.inspect().groups[0].state,'active');b.brain.hp=0;b.death.advance(5);runtime.afterBattle(f.player);assert.equal(runtime.inspect().groups[0].state,'waiting');assert.equal(f.battle.encounters.length,0);
 runtime.beforeBattle(2,f.player);for(let i=0;i<80&&runtime.inspect().groups[0]?.state!=='active';i++)await new Promise(r=>setTimeout(r,2));assert.equal(runtime.inspect().groups[0].state,'active');assert.equal(f.battle.encounters.length,2);runtime.leaveMap();assert.equal(f.battle.encounters.length,0);
});
