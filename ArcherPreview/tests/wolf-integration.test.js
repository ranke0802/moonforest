import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,TransformNode,StandardMaterial} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {WolfBrain,WOLF_CLIPS,WOLF_STYLE} from '../src/wolf-spec.js';
import {WolfGrab} from '../src/wolf-grab.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {getActorDefinition} from '../src/actor-definitions.js';
const base=new URL('../public/assets/',import.meta.url),rows=[];
const maps=[['village',createVillageTerrain,villageObstacles],['great-plains',createGreatPlainsTerrain,plainsObstacles],['monster-forest',createMonsterForestTerrain,forestObstacles],['witch-cave',createWitchCaveTerrain,caveObstacles]];
async function fixture(t,map=maps[1]){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('camera',new Vector3(0,5,-10),scene);
 const config=JSON.parse(fs.readFileSync(new URL('alpha-wolf.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 container.animationGroups.forEach(g=>g.stop());const paint=new StandardMaterial('paint',scene);for(const m of container.meshes)if(m.getTotalVertices())m.material=paint;
 const models=new BossModelLibrary(scene,'alpha-wolf');models.config=config;models.container=container;models.load=async()=>{};
 const [mapId,terrainFn,obstacles]=map,terrain=terrainFn(),navigation=new (mapId==='witch-cave'?CaveNavigation:VillageNavigation)(obstacles());
 const world={scene,mapId,terrain,navigation,shadows:{addShadowCaster(){},removeShadowCaster(){}}},battle=new BossBattle(world,()=>{},()=>{},()=>{},{wolfModels:models}),player=new TransformNode('player',scene);player.position.set(0,0,6);terrain.place(player.position);
 battle.preparationOptions={frame:async()=>{},maxBlocks:4};
 t.after(()=>{battle.hide();container.dispose();loader.dispose();scene.dispose();engine.dispose();});return {battle,player,world,models,config,scene};
}
const counts=scene=>({mesh:scene.meshes.length,geometry:scene.geometries.length,skeleton:scene.skeletons.length,animation:scene.animationGroups.length,morph:scene.morphTargetManagers.length,textures:scene.textures.length,beforeRender:scene.onBeforeRenderObservable.observers.length});
test.after(()=>{fs.mkdirSync('reports/wolf-r8-integration',{recursive:true});fs.writeFileSync('reports/wolf-r8-integration/validation.json',JSON.stringify({scope:'Packed R8 asset, actual terrain/navigation and Babylon NullEngine; GPU and real-device FPS/heat not measured',cases:rows},null,2));});
test('R8 asset definition and style isolate the wolf without changing other boss defaults',()=>{
 const def=getActorDefinition('alpha-wolf.r8');assert.equal(def.assetId,'alpha-wolf');assert.equal(def.encounterType,'wolf');assert.equal(def.movement.runSpeed,4.2);assert.equal(def.movement.walkSpeed,.9);assert.deepEqual(def.style.defaults,WOLF_STYLE);
 assert.match(fs.readFileSync('index.html','utf8'),/value="wolf"[^>]*>우두머리 늑대/);
});
test('authored attack events survive long frames exactly once, deaths never recover, blocked stun has no movement',()=>{
 const durations=Object.fromEntries(Object.values(WOLF_CLIPS).map(n=>[n,3.1])),b=new WolfBrain(durations);b.start(WOLF_CLIPS.lunge,'attack');b.time=2.1;
 let result=b.update(2,2);assert.equal(result.events.length,1);assert.equal(b.state,WOLF_CLIPS.lunge);assert.equal(b.time,2.25);assert.equal(b.update(2,2).events.length,0);
 b.start(WOLF_CLIPS.lunge,'attack');b.parry();assert.equal(b.update(.2,2).speed,0);assert.ok(b.stagger>0);
 b.hit({damage:900,heavy:true,ignoreDefense:true});for(let i=0;i<200;i++)b.update(.1,1);assert.equal(b.hp,0);assert.equal(b.state,WOLF_CLIPS.down);assert.equal(b.time,3.1);
});
test('grab leaves player coordinates untouched and releases input on escape/interruption/reset',()=>{
 const changes=[],p={position:{x:2,y:0,z:3}},g=new WolfGrab(v=>changes.push(v),()=>{});assert.equal(g.start(p,{},1),true);assert.deepEqual(p.position,{x:2,y:0,z:3});assert.equal(g.escape(),true);assert.equal(g.active,false);
 g.start(p,{},2);g.update(.1,{state:WOLF_CLIPS.hit,serial:3,clipTime:0});assert.equal(g.active,false);assert.deepEqual(changes,[true,false,true,false]);
});
test('actual R8 1/5/10/20 manual summons on all four maps have independent poses and bounded warm pools',async t=>{
 for(const map of maps)await t.test(map[0],async t=>{
  const f=await fixture(t,map);for(const n of [1,5,10,20])assert.equal(await f.battle.summon(f.player,n,'wolf'),true);
  const enemies=[...f.battle.encounters],before=counts(f.scene);assert.equal(enemies.length,20);assert.ok(enemies.every(e=>e.kind==='wolf'&&e.displayName==='우두머리 늑대'&&e.animator.clips.size===12));
  assert.equal(new Set(enemies.map(e=>e.asset.skeletons[0])).size,20);const body=e=>e.asset.meshes.find(m=>m.getTotalVertices()>1000&&!m.metadata?.moonforestOutline);
  assert.strictEqual(body(enemies[0]).geometry,body(enemies[1]).geometry);assert.notStrictEqual(body(enemies[0]).morphTargetManager,body(enemies[1]).morphTargetManager);
  enemies[0].animator.transition(WOLF_CLIPS.lunge,{clipTime:2.02,blendDuration:0,actionId:100});enemies[0].animator.update(1);const a=enemies[0].nodes.pelvis.position.y,b=enemies[1].nodes.pelvis.position.y;assert.ok(Math.abs(a-b)>.1,'authored airborne body height survives independent sampler');
  for(let repeat=0;repeat<3;repeat++){f.battle.hide();assert.equal(await f.battle.summon(f.player,20,'wolf'),true);assert.deepEqual(counts(f.scene),before);assert.ok(enemies.every((e,i)=>e===f.battle.encounters[i]&&e.animator.clips.size===12&&e.brain.hp===900));}
  rows.push({map:map[0],counts:[1,5,10,20],warmRepeats:3,liveResources:before,after:counts(f.scene),sharedGeometry:true,independentSkeletonAndMorph:true});
 });
});
test('runtime sampler matches native R8 channels at identical authored times and planar extraction cannot erase body jump',async t=>{
 const f=await fixture(t),first=await f.models.instantiate(),second=await f.models.instantiate();const {WolfAnimator}=await import('../src/wolf-animation.js');const animator=new WolfAnimator(first.asset,f.config);
 const native=second.asset.animationGroups,byName=new Map(second.asset.transformNodes.map(n=>[n.name,n]));let checked=0;
 for(const clip of f.config.catalog){const group=native.find(g=>g.name===clip.name);group.start(false);group.pause();for(const time of [0,clip.duration*.37,clip.duration*.73,clip.duration]){
  animator.transition(clip.name,{clipTime:time,blendDuration:0,actionId:++checked});animator.update(1);group.goToFrame(group.from+time*60);
  for(const row of first.asset.animationGroups.find(g=>g.name===clip.name).targetedAnimations){const target=byName.get(row.target.name);if(!target)continue;const p=row.animation.targetProperty,a=row.target[p],b=target[p];if(a?.asArray){const av=a.asArray(),bv=b.asArray(),sign=p==='rotationQuaternion'&&av.reduce((s,v,i)=>s+v*bv[i],0)<0?-1:1;for(let i=0;i<av.length;i++)assert.ok(Math.abs(av[i]-bv[i]*sign)<1e-4,JSON.stringify({clip:clip.name,time,node:row.target.name,p,a:av,b:bv,from:group.from,to:group.to,fps:group.targetedAnimations[0].animation.framePerSecond}));}}
 }group.stop();}
 rows.push({nativeSamplerPoseChecks:checked,allTwelveClips:true});
});
test('late cancelled preparation never activates and can be retried on the new map without extra models',async t=>{
 const f=await fixture(t);let cancelled=false;f.battle.preparationOptions={frame:async()=>{if(!cancelled){cancelled=true;f.battle.hide();f.world.mapId='village';}}};
 assert.equal(await f.battle.summon(f.player,5,'wolf'),false);assert.equal(f.battle.encounters.length,0);assert.ok(f.battle.wolfPool.every(e=>!e.active&&!e.actor?.isEnabled()));f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.summon(f.player,5,'wolf'),true);assert.equal(f.battle.wolfPool.length,5);
});
test('real jaw/paw contacts respect dodge and shield, heavy/bash knock down, capture/death release and reward deduplicates',async t=>{
 const f=await fixture(t);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0],p=f.player;f.world.navigation.segmentClear=()=>true;let rewards=0;e.onDefeat=()=>rewards++;
 function pose(name,time){e.actor.position.set(0,0,0);e.actor.rotation.y=0;e.brain.start(name,'attack');e.brain.time=time;e.dt=.01;e.player=p;e.animator.transition(name,{clipTime:time,actionId:e.brain.serial,blendDuration:0});e.animator.update(1);e.alignPose();const jaw=e.nodes.jaw.getAbsolutePosition();p.position.set(jaw.x,0,jaw.z);e.pendingEvents=[{type:'attack',name,range:3,kind:'melee'}];e.playerInvulnerable=0;}
 pose(WOLF_CLIPS.lunge,2.25);let hp=e.playerHp;e.poseAndContacts(p,{state:'dodge',actionId:1},null,null);assert.equal(e.playerHp,hp);
 pose(WOLF_CLIPS.lunge,2.25);const before=e.actor.position.clone();e.poseAndContacts(p,{state:'shieldPush',actionId:2},null,null);assert.equal(e.playerHp,hp);assert.ok(e.brain.stagger>0,JSON.stringify({player:p.position.asArray(),actor:e.actor.position.asArray(),jaw:e.nodes.jaw.getAbsolutePosition().asArray(),root:e.animator.root.position.asArray(),rootRotation:e.animator.root.rotationQuaternion.asArray(),carrier:e.carrier.position.asArray(),rig:e.animator.root.parent.name,points:e.attackContactPoints(p.position).map(v=>v.asArray()),state:e.brain.state,active:e.active,alive:e.playerAlive}));assert.equal(e.knockVelocity.lengthSquared(),0);
 pose(WOLF_CLIPS.lunge,2.25);e.brain.stagger=0;e.poseAndContacts(p,{state:'idle'},null,null);assert.ok(e.playerHp<hp,'actual jaw contact must damage');
 for(const id of ['judgment','shield-push']){pose(WOLF_CLIPS.lunge,1.8);e.brain.stagger=0;e.gate.collect=()=>({hits:[{id,damage:20,heavy:id==='judgment'}],hitStop:.03});e.poseAndContacts(p,{state:'idle'},{actionId:4},null);assert.equal(e.brain.mode,'down');assert.ok(e.knockVelocity.length()>0);assert.ok(e.knockVelocity.dot(e.actor.position.subtract(p.position))>0);}
 e.grab.start(p,{},e.brain.serial);e.playerHp=0;e.update(.01,p);assert.equal(e.grab.active,false);assert.equal(e.combat.grabOwner,null);
 e.playerHp=500;e.brain.hit({damage:900,heavy:true});for(let i=0;i<60;i++){e.update(.1,p);e.poseAndContacts(p,{state:'idle'},null,null);}assert.equal(rewards,1);assert.equal(e.brain.state,WOLF_CLIPS.down);assert.equal(e.corpseGone,true);
 rows.push({contacts:'real jaw/paw pose',dodge:true,blockNoDisplacement:true,heavyAndBashAwayFromPlayer:true,deathRewardCount:rewards,playerDeathReleasesCapture:true});
});
test('authored long lunge lands on a 10.4 m target once; carrier cancels only planar root, not body pitch/flight',async t=>{
 const f=await fixture(t);await f.battle.summon(f.player,1,'wolf');const e=f.battle.encounters[0],p=f.player;f.world.navigation=null;f.world.terrain={place(v){v.y=0;}};
 e.actor.position.set(0,0,0);e.actor.rotation.y=0;e.brain.start(WOLF_CLIPS.lunge,'attack');p.position.set(0,0,10.4);e.playerHp=500;let hits=0;const old=e.hitPlayer.bind(e);e.hitPlayer=(...args)=>{hits++;old(...args);};
 for(let i=0;i<235;i++){e.update(.01,p);e.poseAndContacts(p,{state:'idle'},null,null);}
 assert.equal(hits,1);assert.ok(e.playerHp<500);assert.ok(e.actor.position.z>9&&e.actor.position.z<10);assert.ok(Math.abs(e.animator.root.getAbsolutePosition().z-e.actor.position.z)<.0005,JSON.stringify({root:e.animator.root.getAbsolutePosition().asArray(),actor:e.actor.position.asArray(),local:e.animator.root.position.asArray(),carrier:e.carrier.position.asArray(),parents:e.animator.nodes.map(n=>[n.name,n.parent?.name])}));
 rows.push({authoredLungeTargetMeters:10.4,biteHits:hits,actorMeters:e.actor.position.z,rootNotAppliedTwice:true,pitchAndFlightPreserved:true});
});
test('warm wolf pool survives repeated four-map round trips and warning height follows the current terrain',async t=>{
 const f=await fixture(t);await f.battle.summon(f.player,5,'wolf');const enemies=[...f.battle.encounters],before=counts(f.scene);
 for(let repeat=0;repeat<2;repeat++)for(const [mapId,terrain,obstacles]of maps){f.battle.hide();f.world.mapId=mapId;f.world.terrain=terrain();f.world.navigation=new (mapId==='witch-cave'?CaveNavigation:VillageNavigation)(obstacles());f.player.position.set(0,0,6);f.world.terrain.place(f.player.position);await f.battle.summon(f.player,5,'wolf');assert.deepEqual(f.battle.encounters,enemies);assert.deepEqual(counts(f.scene),before);assert.equal(enemies[0].warningTerrain().heightAt(0,0),f.world.terrain.heightAt(0,0));}
 rows.push({roundTripMaps:maps.map(m=>m[0]),roundTripRepeats:2,pooledWolves:5,resourcesStable:true,warningGroundUsesCurrentMap:true});
});
test('single HTML embeds R8 and runtime assets, paired controls and no external model/image dependencies',()=>{
 const html=fs.readFileSync('../Docs/Reviews/2026-11-12/우두머리_늑대_R8_게임적용_비교.html','utf8'),script=fs.readFileSync('scripts/wolf-game-r8-review.js','utf8');
 assert.match(html,/data-version="R8"/);assert.match(html,/data-version="GAME"/);assert.match(html,/id="model-R8"/);assert.match(html,/id="model-GAME"/);
 for(const [,id]of script.matchAll(/\$\('([a-zA-Z0-9-]+)'\)/g))assert.ok(html.includes('id="'+id+'"'),id+' DOM control missing');
 assert.match(script,/new WolfAnimator/);assert.match(script,/current.samples/);assert.match(script,/RotationYawPitchRollToRef\(-yaw/);assert.match(html,/id="previous"/);assert.match(html,/id="next"/);assert.match(html,/data-phase="2.25"/);
});
