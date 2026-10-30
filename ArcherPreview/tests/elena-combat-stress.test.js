import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,Vector3,StandardMaterial,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {BossBattle} from '../src/boss-battle.js';
import {ELENA_HOME,ELENA_SPELLS,MOURNING_SPELLS,spellImpact} from '../src/elena-spec.js';
import {spellContains} from '../src/elena-ground-magic.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';

const base=new URL('../public/assets/',import.meta.url),packed=new Map();
const report={generatedAt:new Date().toISOString(),scope:'Actual packed models and CPU pose/contact lifecycle in Babylon NullEngine; no GPU, visual screenshot, or frame-rate claim. Heap figures include the entire Node test fixture and decoded source cache, not the browser resident footprint.',sources:Object.fromEntries(['elena-spec.js','elena-encounter.js','elena-reposition.js','boss-battle.js','elena-ground-magic.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')])),lifecycle:[],spellCases:[]};
after(()=>{if(process.env.ELENA_COMBAT_REPORT==='1'){const folder=process.env.ELENA_COMBAT_REPORT_DIR??'elena-combat-followup';if(!/^[a-z0-9-]+$/.test(folder))throw new Error('Invalid report folder');const dir=new URL('../reports/'+folder+'/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('combat-stress.json',dir),JSON.stringify(report,null,2)+'\n');}});
const near=(a,b,message='value')=>assert.ok(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`);
const counts=f=>({meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,skeletons:f.scene.skeletons.length,materials:f.scene.materials.length,textures:f.scene.textures.length,managers:f.scene.morphTargetManagers.length,pool:f.battle.allPooled.length});
async function fixture(t){
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
  Object.assign(engine.getCaps(),{textureFloat:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
  const loaded=[];
  async function library(name){
    const config=JSON.parse(readFileSync(new URL(name+'.json',base)));if(!packed.has(name))packed.set(name,readRuntimeGltf(new URL(config.model,base)));
    const source=await packed.get(name),gltf=structuredClone(source.gltf);
    for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
    for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
    const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
    for(const group of container.animationGroups)group.stop();for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=new StandardMaterial(name+'-stress-color',scene);
    const models=new BossModelLibrary(scene,name);models.config=config;models.container=container;models.instances=0;models.load=async()=>{models.loads=1;};
    const instantiate=models.instantiate.bind(models);models.instantiate=async()=>{models.instances++;return instantiate();};loaded.push({loader,container});return models;
  }
  const elenaModels=await library('elena'),mourningModels=await library('mourning-elena'),defeats=[],damage=[];
  const world={scene,cave:true,terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows:{addShadowCaster(){},removeShadowCaster(){}}};
  const battle=new BossBattle(world,()=>{},(...event)=>damage.push(event),()=>true,{elenaModels,mourningModels,onDefeat:e=>defeats.push(e)}),player=new TransformNode('stress-player',scene);player.position.set(29,6,-23);
  t.after(()=>{battle.hide();for(const item of loaded){item.container.dispose();item.loader.dispose();}scene.dispose();engine.dispose();});
  return {engine,scene,world,battle,player,elenaModels,mourningModels,defeats,damage};
}
function step(f,dt=1/60,action={state:'idle'},contacts=true,shield=null){f.battle.update(dt,f.player);f.scene._animate(0);if(contacts)f.battle.poseAndContacts(f.player,action,null,shield);}
async function resident(f,phase){f.battle.residentPhase=phase;await f.battle.activateResident(f.player);const e=f.battle.encounters[0];e.renderVisible=true;return e;}
function begin(f,e,index=0){
  e.reviewMode=false;e.brain.stagger=0;e.brain.start(e.brain.idle,'idle');e.brain.nextSpell=index;e.brain.cast();e.knockVelocity.setAll(0);e.bossReaction.reset();e.spell.reset();
  e.actor.position.set(ELENA_HOME.x,6,ELENA_HOME.z);f.world.terrain.place(e.actor.position);f.player.position.set(ELENA_HOME.x,6,ELENA_HOME.z+4);f.world.terrain.place(f.player.position);
  f.battle.combat.hp=500;f.battle.combat.invulnerable=0;f.battle.combat.reaction.reset();e.engaged=true;step(f,0);
  return {spec:e.brain.spell,impact:spellImpact(e.brain.spell,e.brain.durations[e.brain.state]),warning:e.brain.castWarningDuration,plan:e.spell.plan};
}
function advance(f,e,time,action={state:'idle'},shield=null){const dt=e.brain.castLeadInRemaining+(time-e.brain.time)/e.brain.attackPlaybackRate;assert.ok(dt>=-1e-7);step(f,Math.max(0,dt),action,true,shield);}

test('map exit during a nearly released cast never resumes damage without a fresh warning',async t=>{
  const f=await fixture(t);
  for(const phase of [1,2])await t.test('phase '+phase,async()=>{
    const e=await resident(f,phase),{impact}=begin(f,e);advance(f,e,impact-.04);assert.equal(e.spell.mesh.isEnabled(),true);
    f.battle.hide();f.world.cave=false;assert.equal(e.spell.plan,null);f.world.cave=true;await f.battle.activateResident(f.player);
    const resumedTime=e.brain.time,resumedMode=e.brain.mode,hp=f.battle.playerHp;step(f,.06);
    report.lifecycle.push({case:'mid-cast map return',phase,resumedTime,resumedMode,damageFirst60ms:hp-f.battle.playerHp});
    assert.equal(f.battle.playerHp,hp,`phase ${phase} resumed at ${resumedTime}s and hit after only 60 ms of warning`);
    assert.ok(e.brain.mode!=='attack'||e.brain.time<1,'return must cancel or restart the old cast');
  });
});

function offset(plan,center,across,along){return {x:center.x+plan.direction.z*across+plan.direction.x*along,z:center.z-plan.direction.x*across+plan.direction.z*along};}
function bodyBoundary(plan,inside){
  const s=plan.shapes[0],margin=inside?.285:.315;
  if(s.kind==='rect')return offset(plan,s.center,s.halfWidth+margin,0);
  if(s.kind==='cross')return offset(plan,s.center,s.halfWidth+margin,s.halfWidth+margin);
  if(s.kind==='ring')return offset(plan,s.center,0,s.innerRadius-margin);
  if(s.kind==='circle')return offset(plan,s.center,0,s.radius+margin);
  const a=s.halfAngle,r=Math.min(4,s.outerRadius*.5);return offset(plan,s.center,Math.sin(a)*r+Math.cos(a)*margin,Math.cos(a)*r-Math.sin(a)*margin);
}

test('all twelve authored spell motions match visible fixed footprints and release/block/dodge/cancel/LOS rules',async t=>{
  const f=await fixture(t),outcomes=['hit','edge-hit','outside','dodge','block','shield','cancel','wall'];
  for(const phase of [1,2]){
    const e=await resident(f,phase),specs=phase===1?ELENA_SPELLS:MOURNING_SPELLS;
    for(let index=0;index<specs.length;index++)for(const outcome of outcomes){
      const label=`phase ${phase}/${specs[index].name}/${specs[index].pattern}/${outcome}`,{impact,plan,warning}=begin(f,e,index),initialSerial=e.brain.serial;
      // The enlarged annulus intentionally leaves a larger refuge beside the
      // boss. Place positive contact probes inside its visible band.
      if(phase===2&&plan.shapes[0].kind==='ring'){f.player.position.z=ELENA_HOME.z+plan.shapes[0].innerRadius+.6;f.world.terrain.place(f.player.position);}
      assert.ok(warning>=(phase===2?1.65:1),label+' minimum real-time warning');assert.ok(plan,label);assert.equal(e.spell.mesh.isEnabled(),true,label);assert.equal(e.spell.rim.isEnabled(),true,label);
      const positions=e.spell.mesh.getVerticesData(VertexBuffer.PositionKind);
      for(let p=0;p<positions.length;p+=Math.max(3,Math.floor(positions.length/96)*3))assert.ok(spellContains(plan,{x:positions[p],z:positions[p+2]},{radius:.0002}),label+' rendered fill agrees with footprint');
      if(outcome==='outside'||outcome==='edge-hit'){
        const p=bodyBoundary(plan,outcome==='edge-hit');f.player.position.set(p.x,f.world.terrain.heightAt(p.x,p.z),p.z);
        assert.equal(spellContains(plan,f.player.position),outcome==='edge-hit',label+' body edge');
      }
      const segmentClear=f.world.navigation.segmentClear;let shield;
      if(outcome==='shield'){shield=new TransformNode('stress-physical-shield',f.scene);shield.position.copyFrom(f.player.position);shield.position.y+=.95;shield.position.z-=.5;shield.rotation.y=Math.PI;}
      if(outcome==='wall')f.world.navigation.segmentClear=()=>false;
      try{
        advance(f,e,impact-.001);assert.equal(f.battle.playerHp,500,label+' cannot hit before release');assert.equal(e.spell.mesh.isEnabled(),true,label+' warning remains visible');
        assert.strictEqual(e.spell.plan,plan,label+' warning cannot track a moved player');
        const action=outcome==='dodge'?{state:'dodge',actionId:initialSerial}:outcome==='block'?{state:'shieldPush',actionId:initialSerial}:{state:'idle'};
        if(outcome==='cancel'){e.brain.hit({damage:1,stun:.5});step(f,.002,action);}else advance(f,e,impact+.00001,action,shield);
        const damage=500-f.battle.playerHp;assert.equal(damage>0,['hit','edge-hit'].includes(outcome),label+' release outcome');
        const hp=f.battle.playerHp;f.battle.poseAndContacts(f.player,action,null,null);f.battle.poseAndContacts(f.player,action,null,null);assert.equal(f.battle.playerHp,hp,label+' one hit per cast');
        if(['cancel','block','shield'].includes(outcome))assert.notEqual(e.brain.mode,'attack',label+' interrupts');
        step(f,.25);assert.equal(e.spell.mesh.isEnabled(),false,label+' floor flash expires');
        report.spellCases.push({phase,clip:specs[index].name,pattern:specs[index].pattern,outcome,warningSeconds:warning,sourceImpactSeconds:impact,damage,lockedAim:true});
      }finally{f.world.navigation.segmentClear=segmentClear;shield?.dispose();}
    }
  }
  assert.equal(report.spellCases.length,96);
});

test('twenty complete two-phase replays, death/restart and map trips retain residents and telegraph resources',async t=>{
  const f=await fixture(t);let baseline,first,second,heapAfterWarmup,maxWarningBuffers=0;const samples=[];
  // A bounded topology cache retains its warmed buffers; frames and later
  // casts must reuse those exact resources rather than allocate replacements.
  const buffers=e=>[e.spell.mesh,e.spell.rim].map(mesh=>({geometry:mesh.geometry,positions:mesh.getVertexBuffer(VertexBuffer.PositionKind),normals:mesh.getVertexBuffer(VertexBuffer.NormalKind),indices:mesh.geometry.getIndexBuffer()}));
  const rawBuffers=e=>[e.spell.mesh,e.spell.rim].flatMap(mesh=>[mesh.getVertexBuffer(VertexBuffer.PositionKind)?.getBuffer(),mesh.getVertexBuffer(VertexBuffer.NormalKind)?.getBuffer(),mesh.geometry?.getIndexBuffer()]).filter(Boolean);
  const cachedBuffers=e=>e.spell.topologies.flatMap(entry=>[entry.fill,entry.rim]).flatMap(geometry=>[geometry.getVertexBuffer(VertexBuffer.PositionKind)?.getBuffer(),geometry.getVertexBuffer(VertexBuffer.NormalKind)?.getBuffer(),geometry.getIndexBuffer()]).filter(Boolean);
  const warmed=[];
  for(const phase of [1,2]){const e=await resident(f,phase);for(let index=0;index<e.brain.spells.length;index++){begin(f,e,index);step(f,.01);e.spell.reset();}warmed.push({e,buffers:new Set(cachedBuffers(e)),misses:e.spell.cacheMisses,topologies:e.spell.topologies.length});}
  for(let cycle=0;cycle<20;cycle++){
    f.battle.combat.reset();f.player.position.set(29,6,-23);await f.battle.activateResident(f.player,{reset:true});const a=f.battle.elenaPool[0];first??=a;assert.strictEqual(a,first);assert.equal(a.brain.hp,1200);
    const aCast=begin(f,a,cycle%ELENA_SPELLS.length);advance(f,a,Math.min(.3,aCast.impact-.1));
    f.battle.hide();f.world.cave=false;f.world.cave=true;await f.battle.activateResident(f.player);
    a.brain.hit({damage:9999});for(let i=0;i<50;i++)step(f,1/30,{state:'idle'},false);assert.ok(f.battle.residentPending);await f.battle.residentPending;
    const b=f.battle.mourningPool[0];second??=b;assert.strictEqual(b,second);assert.equal(b.brain.hp,1800);assert.equal(b.corpseGone,false);
    const cast=begin(f,b,cycle%MOURNING_SPELLS.length);advance(f,b,cast.impact-.01);f.battle.combat.hp=0;step(f,.02);assert.notEqual(b.brain.mode,'attack');f.battle.combat.reset();
    // Every pattern is warmed before recording resource counts.
    for(let index=0;index<5;index++){begin(f,b,index);maxWarningBuffers=Math.max(maxWarningBuffers,rawBuffers(b).length);step(f,.05);b.spell.reset();}
    begin(f,b,cycle%5);const geometryBefore=buffers(b);for(let frame=0;frame<10;frame++)step(f,1/60);const geometryAfter=buffers(b);
    geometryBefore.forEach((part,index)=>{for(const key of Object.keys(part))assert.strictEqual(geometryAfter[index][key],part[key],'visible warning reuses '+key);});
    b.brain.hit({damage:9999});for(let i=0;i<Math.ceil(b.death.duration*30)+1;i++)step(f,1/30,{state:'idle'},false);assert.equal(f.defeats.length,cycle+1);assert.equal(b.corpseGone,true);
    assert.equal(f.elenaModels.instances,1);assert.equal(f.mourningModels.instances,1);assert.equal(f.battle.allPooled.length,2);
    const current=counts(f);baseline??=current;assert.deepEqual(current,baseline,'cycle '+cycle+' must retain fixed scene resource counts');samples.push(current);
    for(const warm of warmed){assert.equal(warm.e.spell.cacheMisses,warm.misses,'warm spell topology must not allocate again');assert.equal(warm.e.spell.topologies.length,warm.topologies);const currentBuffers=cachedBuffers(warm.e);assert.equal(currentBuffers.length,warm.buffers.size);assert.ok(currentBuffers.every(buffer=>warm.buffers.has(buffer)),'warm vertex/normal/index buffers remain identical');}
    if(cycle===2){global.gc?.();heapAfterWarmup=process.memoryUsage().heapUsed;}
  }
  global.gc?.();const heapFinal=process.memoryUsage().heapUsed;if(global.gc)assert.ok(heapFinal-heapAfterWarmup<8*1024*1024,'retained heap after warmup remains bounded');
  report.replays={cycles:20,finalDefeats:f.defeats.length,instances:{phase1:f.elenaModels.instances,phase2:f.mourningModels.instances},initial:baseline,final:counts(f),allCountsEqual:samples.every(s=>JSON.stringify(s)===JSON.stringify(baseline)),telegraphBuffers:{maxActivePerResident:maxWarningBuffers,caches:warmed.map(w=>({phase:w.e.phase,topologies:w.topologies,buffers:w.buffers.size,hits:w.e.spell.cacheHits,misses:w.e.spell.cacheMisses})),buffersReplacedAfterWarmup:0},heap:{explicitGC:!!global.gc,afterWarmup:heapAfterWarmup,final:heapFinal,delta:heapFinal-heapAfterWarmup}};
});

test('player death cancels casts and holds the resident until restart without new release events',async t=>{
  const f=await fixture(t);
  for(const phase of [1,2]){
    const e=await resident(f,phase),{impact}=begin(f,e);advance(f,e,impact-.02);f.battle.combat.hp=0;step(f,.03);
    assert.notEqual(e.brain.mode,'attack');assert.equal(e.spell.plan,null);assert.equal(e.spell.mesh.isEnabled(),false);const p=e.actor.position.clone();let events=0;
    for(let i=0;i<120;i++){step(f,1/30,{state:'idle'},false);events+=e.pendingEvents.filter(x=>x.kind==='ground').length;f.battle.poseAndContacts(f.player,{state:'idle'},null,null);}
    assert.equal(events,0);near(Vector3.Distance(e.actor.position,p),0,'dead player must not trigger boss travel');assert.equal(f.battle.playerHp,0);
    f.battle.combat.reset();const hp=f.battle.playerHp;step(f,.1);assert.equal(f.battle.playerHp,hp);assert.equal(e.spell.fired,false);
    report.lifecycle.push({case:'player death/restart',phase,releasesWhileDead:events,positionDelta:Vector3.Distance(e.actor.position,p)});
    const queued=begin(f,e);advance(f,e,queued.impact-.01);step(f,.02,{state:'idle'},false);assert.equal(e.pendingEvents.some(x=>x.kind==='ground'),true);
    f.battle.combat.hp=0;f.battle.poseAndContacts(f.player,{state:'idle'},null,null);assert.equal(e.spell.plan,null);assert.equal(e.spell.mesh.isEnabled(),false);assert.equal(f.battle.playerHp,0);step(f,.01);assert.notEqual(e.brain.mode,'attack');
    f.battle.combat.reset();e.brain.reposition();step(f,.05);f.battle.combat.hp=0;const movingPosition=e.actor.position.clone();step(f,.05);near(Vector3.Distance(e.actor.position,movingPosition),0,'player death also stops reposition movement');
    report.lifecycle.push({case:'death before queued contact and during reposition',phase,queuedWarningCleared:true,movementStopped:true});
  }
});

test('phase-one fall interrupted by map exit still resumes one healthy second phase',async t=>{
  const f=await fixture(t),e=await resident(f,1);e.brain.hit({damage:9999});step(f,.5,{state:'idle'},false);f.battle.hide();f.world.cave=false;
  assert.equal(f.battle.residentPhase,1);f.world.cave=true;await f.battle.activateResident(f.player);assert.equal(e.brain.hp,0);
  for(let i=0;i<90;i++)step(f,1/60,{state:'idle'},false);await f.battle.residentPending;
  assert.equal(f.battle.residentPhase,2);assert.equal(f.battle.mourningPool[0].brain.hp,1800);assert.equal(f.battle.encounters.length,1);assert.equal(f.mourningModels.instances,1);assert.equal(f.defeats.length,0);
  report.lifecycle.push({case:'phase-one death/map exit',phaseTwoHp:f.battle.mourningPool[0].brain.hp,instances:f.mourningModels.instances});
});
