import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,FreeCamera,Vector3,PBRMaterial,ShaderMaterial,Material,VertexBuffer,DirectionalLight,ShadowGenerator} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {BossBattle} from '../src/boss-battle.js';
import {ELENA_SIZE} from '../src/elena-spec.js';
import {BossModelLibrary} from '../src/boss-models.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {trimEmptyBoneSlots,trimEmptyBoneSlotsAsync} from '../src/character-render-cost.js';
import {buildMourningMeshBounds,buildMourningMeshBoundsAsync,prepareMourningCameraCulling} from '../src/mourning-camera-culling.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const reports=[],base=new URL('../public/assets/',import.meta.url);
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer??a,a.byteOffset??0,a.byteLength??a.length)).digest('hex');
const counts=f=>({meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,materials:f.scene.materials.length,skeletons:f.scene.skeletons.length,groups:f.scene.animationGroups.length,managers:f.scene.morphTargetManagers.length,pool:f.battle.allPooled.length});
async function fixture(t){
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
 const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.useConstantAnimationDeltaTime=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const camera=new FreeCamera('prepared-inspection',new Vector3(29,10,-13),scene);camera.setTarget(new Vector3(29,8,-30));
 const light=new DirectionalLight('sun',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(1024,light),loaders=[];
 const load=async name=>{
  const config=JSON.parse(readFileSync(new URL(name+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');loaders.push(loader);for(const group of container.animationGroups)group.stop();
  const paint=new PBRMaterial(name+'-source-paint',scene),mouth=new PBRMaterial(name+'-mouth-paint',scene);paint.unlit=mouth.unlit=true;paint.backFaceCulling=mouth.backFaceCulling=false;
  for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=/Lament_Mouth_Interior/.test(mesh.name)?mouth:paint;
  const models=new BossModelLibrary(scene,name);Object.assign(models,{config,container,instances:0,load:async()=>{models.loads=1;}});const instantiate=models.instantiate.bind(models);models.instantiate=async()=>{models.instances++;return instantiate();};return models;
 };
 const elenaModels=await load('elena'),mourningModels=await load('mourning-elena'),world={scene,cave:true,mapId:'witch-cave',terrain:createWitchCaveTerrain(),navigation:new CaveNavigation(caveObstacles()),shadows},events=[];
 world.navigation.grid(.34,67);world.navigation.grid(.7,67);
 const battle=new BossBattle(world,()=>{},()=>{},()=>true,{elenaModels,mourningModels,onDiagnosticEvent:e=>events.push(e)}),player=new TransformNode('player',scene);player.position.set(29,6,-23);
 const pbr=PBRMaterial.prototype.isReadyForSubMesh,shader=ShaderMaterial.prototype.isReady,compileCalls=[];let failNext=false;
 const record=mesh=>{compileCalls.push(mesh.name);if(failNext&&mesh.name!=='Elena_Meshy_Static'){failNext=false;throw new Error('injected shader preparation failure');}};
 PBRMaterial.prototype.isReadyForSubMesh=function(mesh,...args){record(mesh);return pbr.call(this,mesh,...args);};ShaderMaterial.prototype.isReady=function(mesh,...args){record(mesh);return shader.call(this,mesh,...args);};
 t.after(()=>{PBRMaterial.prototype.isReadyForSubMesh=pbr;ShaderMaterial.prototype.isReady=shader;battle.hide();for(const loader of loaders)loader.dispose();scene.dispose();engine.dispose();});
 return {engine,scene,camera,world,battle,player,events,elenaModels,mourningModels,compileCalls,fail:()=>{failNext=true;}};
}
function assertWarmInvisible(f){
 const e=f.battle.mourningPool[0];if(!e)return;
 assert.equal(e.active,false);if(e.actor)assert.equal(e.actor.isEnabled(),false);
 assert.equal(f.battle.encounters.includes(e),false);assert.notEqual(e.ring?.isEnabled(),true);assert.notEqual(e.spell?.mesh.isEnabled(),true);assert.notEqual(e.contact?.mesh.isEnabled(),true);
 assert.ok((e.asset?.meshes??[]).every(mesh=>!mesh.isEnabled()));
 assert.ok(f.world.shadows.getShadowMap().renderList.every(mesh=>!e.asset?.meshes.includes(mesh)),'hidden preparation never registers a shadow caster');
}
function step(f,frames=1){for(let i=0;i<frames;i++){f.battle.update(1/30,f.player);f.scene._animate(0);f.battle.poseAndContacts(f.player,{state:'idle'},null,null);}}

test('phase-one first summon also yields its preparation and reuses the prepared asset on resummon',async t=>{
 const f=await fixture(t);let frames=0;f.battle.preparationOptions={frame:async()=>{frames++;}};
 await f.battle.activateResident(f.player,{reset:true});const e=f.battle.encounters[0],stats=e.preparationStats;
 assert.ok(frames>2);assert.ok(stats.steps.some(step=>step.name==='skin-flags'));assert.equal(e.assetPrepared,true);
 const before=counts(f);await f.battle.activateResident(f.player,{reset:true});assert.strictEqual(e.preparationStats,stats);assert.deepEqual(counts(f),before);
});

test('incremental exact-zero weight proof and all-morph bone boxes exactly match synchronous results on actual rigs',async t=>{
 const f=await fixture(t),asset=f.mourningModels.container;let yields=0;const preparation=createBossPreparation({frame:async()=>{yields++;},budgetMs:1.5,maxBlocks:2});
 const results=[];
 for(const mesh of asset.meshes){
  if(!mesh.getTotalVertices())continue;const original=mesh.numBoneInfluencers,before=Object.fromEntries(mesh.getVerticesDataKinds().map(kind=>[kind,hash(mesh.getVerticesData(kind))]));
  const syncSlots=trimEmptyBoneSlots(mesh);mesh.numBoneInfluencers=original;assert.equal(await trimEmptyBoneSlotsAsync(mesh,preparation),syncSlots);
  const sync=buildMourningMeshBounds(mesh),async=await buildMourningMeshBoundsAsync(mesh,preparation);
  assert.deepEqual(async?.boxes,sync?.boxes);assert.equal(async?.maxWeightSumError,sync?.maxWeightSumError);assert.equal(async?.slots,sync?.slots);assert.strictEqual(async?.geometry,sync?.geometry);assert.strictEqual(async?.manager,sync?.manager);
  assert.deepEqual(Object.fromEntries(mesh.getVerticesDataKinds().map(kind=>[kind,hash(mesh.getVerticesData(kind))])),before,'proofs never rewrite positions/UV/weights/indices');
  results.push({mesh:mesh.name,slots:syncSlots,boneBoxes:sync?.boxes.length??0,vertices:mesh.getTotalVertices(),bitExact:true});
 }
 assert.ok(yields>40,'real long scan is divided into many scheduled slices');
 let current=true,frames=0;await assert.rejects(buildMourningMeshBoundsAsync(asset.meshes.find(m=>m.name==='Elina_Chimera_Skin'),createBossPreparation({frame:async()=>{if(++frames===3)current=false;},isCurrent:()=>current,maxBlocks:1})),{name:'AbortError'});
 reports.push({case:'sync-async-exact',results,scheduler:preparation.stats,cancelledAfterYields:frames});
});

test('one hidden warm actor prepares stable real morph variants and transform performs zero new scans or shader readiness requests',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});const first=f.battle.encounters[0],hp=f.battle.playerHp,potions=f.battle.potions.remaining;let frames=0;
 f.battle.preparationOptions={frame:async()=>{frames++;assertWarmInvisible(f);},maxBlocks:2};
 const pending=f.battle.preloadMourning();assert.strictEqual(f.battle.preloadMourning(),pending);assert.equal(await pending,true);assertWarmInvisible(f);
 const e=f.battle.mourningPool[0],stats=e.preparationStats,scanBlocks=stats.blocks,compiled=f.compileCalls.length,countsBefore=counts(f),animator=e.animator;
 assert.equal(e.brain,undefined,'background preparation has no combat brain/clock');assert.equal(e.assetPrepared,true);assert.ok(stats.yields>40);assert.equal(f.mourningModels.instances,1);
 const manager=e.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin').morphTargetManager;assert.equal(manager.numTargets,11);assert.equal(manager.numMaxInfluencers,11);assert.equal(manager.optimizeInfluencers,true);assert.equal(manager.isUsingTextureForTargets,true);
 const bounds=prepareMourningCameraCulling(e.asset),numeric=bounds.parts.map(part=>part.boxes);
 const handoffStart=performance.now();assert.equal(await f.battle.transformResident(f.player),true);const handoffDesktopMs=performance.now()-handoffStart;assert.strictEqual(e.animator,animator);assert.strictEqual(e.preparationStats,stats);assert.equal(stats.blocks,scanBlocks);assert.equal(f.compileCalls.length,compiled,'already warmed body/ink variants are not polled again');assert.strictEqual(prepareMourningCameraCulling(e.asset),bounds);assert.deepEqual(bounds.parts.map(part=>part.boxes),numeric);
 assert.equal(first.actor.isEnabled(),false);assert.equal(e.actor.isEnabled(),true);assert.equal(e.brain.hp,1800);assert.equal(f.battle.playerHp,hp);assert.equal(f.battle.potions.remaining,potions);assert.equal(f.battle.mourningPool.length,1);
 const body=e.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin'),ink=e.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin / silhouette');assert.strictEqual(body.geometry,ink.geometry);assert.strictEqual(body.morphTargetManager,ink.morphTargetManager);assert.strictEqual(body.skeleton,ink.skeleton);
 const variants=[];
 for(const castVariant of ['cast','cast_slam','cast_alternate']){e.animator.transition('cast',{castVariant,clipTime:1.65,actionId:castVariant});e.animator.update(0);f.scene.render();assert.equal(manager.numMaxInfluencers,11);assert.equal(body.material.isReadyForSubMesh(body,body.subMeshes[0]),true);variants.push({castVariant,slots:manager.numMaxInfluencers,bodyReady:true,sharedInk:true});}
 reports.push({case:'warm-transform',frames,readinessRequests:f.compileCalls.slice(0,compiled),scanBlocks,handoffDesktopMs,countsBefore,countsAfter:counts(f),variants,quality:'Same actual morph streams, stable11slots, body/ink geometry/skin/morph shared. NullEngine shader readiness is not a real mobile GPU measurement.',scheduler:stats});
});

test('map exit during load or a partially committed outline cancels hidden work and resumes the same single asset on return',async t=>{
 for(const phase of ['load','bounds'])await t.test(phase,async t=>{
  const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});const gate=deferred(),entered=deferred();let held=false;
  if(phase==='load'){const load=f.mourningModels.load;f.mourningModels.load=async()=>{entered.resolve();await gate.promise;await load();};}
  else f.battle.preparationOptions={maxBlocks:1,frame:async()=>{assertWarmInvisible(f);if(!held&&f.battle.mourningPool[0]?.assetPreparationStep===2){held=true;entered.resolve();await gate.promise;}}};
  const warm=f.battle.preloadMourning();await entered.promise;f.battle.hide();f.world.cave=false;f.world.mapId='village';gate.resolve();assert.equal(await warm,false);assert.equal(f.battle.mourningWarmJob.status,'cancelled');assertWarmInvisible(f);
  f.world.cave=true;f.world.mapId='witch-cave';f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.activateResident(f.player,{reset:true,phase:2}),true);
  assert.equal(f.mourningModels.instances,1);assert.equal(f.battle.mourningPool.length,1);assert.equal(f.battle.encounters.length,1);const e=f.battle.encounters[0];
  assert.equal(e.asset.meshes.filter(m=>m.metadata?.moonforestOutline).length,3);assert.equal(e.actor.isEnabled(),true);assert.equal(new Set(e.asset.meshes).size,e.asset.meshes.length);
  const before=counts(f);for(let i=0;i<4;i++){f.battle.hide();f.world.cave=false;f.world.cave=true;await f.battle.activateResident(f.player);}assert.deepEqual(counts(f),before);
  reports.push({case:'cancel-'+phase,instances:f.mourningModels.instances,counts:before,roundTrips:4});
 });
});

test('phase-one death or immediate phase-two selector joins in-flight preparation without exposing its partial actor',async t=>{
 for(const trigger of ['death','selector'])await t.test(trigger,async t=>{
  const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});const first=f.battle.encounters[0],gate=deferred(),entered=deferred();let held=false;
  f.battle.preparationOptions={frame:async()=>{if(!held){held=true;entered.resolve();await gate.promise;}}};const warm=f.battle.preloadMourning();await entered.promise;assertWarmInvisible(f);
  let foreground;if(trigger==='death'){first.brain.hit({damage:9999});step(f,50);foreground=f.battle.residentPending;assert.ok(foreground);}else foreground=f.battle.summonResident(f.player,2);
  await Promise.resolve();assert.equal(f.mourningModels.instances,1);assertWarmInvisible(f);gate.resolve();assert.equal(await warm,true);assert.equal(await foreground,true);
  assert.equal(f.mourningModels.instances,1);assert.equal(f.battle.encounters.length,1);assert.equal(f.battle.encounters[0].phase,2);assert.equal(first.actor.isEnabled(),false);assert.equal(f.battle.encounters[0].brain.hp,1800);
  reports.push({case:'join-'+trigger,instances:f.mourningModels.instances,counts:counts(f)});
 });
});

test('failed shader preparation stays hidden, does not retry in the update loop, and one explicit summon reuses its committed work',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});f.battle.preparationOptions={frame:async()=>{}};f.fail();const warn=console.warn;console.warn=()=>{};
 try{assert.equal(await f.battle.preloadMourning(),false);}finally{console.warn=warn;}
 assertWarmInvisible(f);const e=f.battle.mourningPool[0],calls=f.compileCalls.length,scans=e.assetPreparationStep;assert.equal(scans,5);assert.equal(f.battle.mourningWarmJob.status,'error');
 step(f,120);assert.equal(f.compileCalls.length,calls);assert.equal(await f.battle.preloadMourning(),false);assert.equal(f.compileCalls.length,calls);
 assert.equal(await f.battle.summonResident(f.player,2),true);assert.strictEqual(f.battle.encounters[0],e);assert.equal(f.mourningModels.instances,1);assert.equal(e.preparationStats.blocks-(e.preparationStats.placementBlocks??0),0,'explicit recovery resumes after completed vertex proof; safe placement blocks are separate');
 reports.push({case:'failure-explicit-recovery',instances:f.mourningModels.instances,compileRequests:f.compileCalls.length,firstAttemptCompileRequests:calls,counts:counts(f)});
});

test('a never-ready shader cancels before any late completion, and immediate map return prepares under the new revision',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});f.battle.preparationOptions={frame:async()=>{}};
 const entered=deferred(),ready=PBRMaterial.prototype.isReadyForSubMesh,shaderReady=ShaderMaterial.prototype.isReady;let blocked=true,calls=0;
 const waiting=function(mesh,original,args){if(blocked&&mesh.name==='Lament_Mouth_Interior'){calls++;entered.resolve();return false;}return original.call(this,mesh,...args);};
 PBRMaterial.prototype.isReadyForSubMesh=function(mesh,...args){return waiting.call(this,mesh,ready,args);};ShaderMaterial.prototype.isReady=function(mesh,...args){return waiting.call(this,mesh,shaderReady,args);};
 t.after(()=>{PBRMaterial.prototype.isReadyForSubMesh=ready;ShaderMaterial.prototype.isReady=shaderReady;});
 const warm=f.battle.preloadMourning();await entered.promise;assertWarmInvisible(f);const oldJob=f.battle.mourningWarmJob;f.battle.hide();f.world.cave=false;f.world.mapId='village';assert.equal(await warm,false);assert.equal(oldJob.preparation.pendingWaits,0);
 const stopped=calls;await new Promise(r=>setTimeout(r,35));assert.equal(calls,stopped,'never-ready old variant has no surviving readiness callback');f.world.cave=true;f.world.mapId='witch-cave';blocked=false;
 const returning=f.battle.activateResident(f.player,{reset:true,phase:2});assert.equal(await returning,true);assert.equal(oldJob.status,'cancelled','later-ready effects cannot complete the old owner');
 assert.equal(f.mourningModels.instances,1);assert.equal(f.battle.mourningPool.length,1);const e=f.battle.encounters[0];assert.equal(e.phase,2);assert.equal(e.actor.isEnabled(),true);assert.equal(e.preparationObservers.size,0);assert.equal(e.asset.meshes.filter(m=>m.metadata?.moonforestOutline).length,3);
 reports.push({case:'never-ready-cancel-new-foreground',instances:f.mourningModels.instances,oldPendingWaiters:oldJob.preparation.pendingWaits,oldJobStatus:oldJob.status,observerCount:e.preparationObservers.size,counts:counts(f)});
});

test('disposing the owning scene during a preparation slice cannot resurrect or register a shadow actor',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});let disposed=false;
 f.battle.preparationOptions={frame:async()=>{if(!disposed){disposed=true;f.scene.dispose();}}};assert.equal(await f.battle.preloadMourning(),false);assert.equal(f.battle.mourningWarmJob.status,'cancelled');assert.notEqual(f.battle.mourningPool[0]?.active,true);
});

test('a shader deadline clears the hidden join, restores borrowed state and permits one explicit fresh request',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});let clock=0;const ready=PBRMaterial.prototype.isReadyForSubMesh,shaderReady=ShaderMaterial.prototype.isReady,previous=new Map();
 const delayed=function(mesh,original,args){if(mesh.name==='Lament_Mouth_Interior'){if(!previous.has(this))previous.set(this,true);clock=45001;return false;}return original.call(this,mesh,...args);};
 PBRMaterial.prototype.isReadyForSubMesh=function(mesh,...args){return delayed.call(this,mesh,ready,args);};ShaderMaterial.prototype.isReady=function(mesh,...args){return delayed.call(this,mesh,shaderReady,args);};
 t.after(()=>{PBRMaterial.prototype.isReadyForSubMesh=ready;ShaderMaterial.prototype.isReady=shaderReady;});
 f.battle.preparationOptions={now:()=>clock,frame:async()=>{}};const warn=console.warn;console.warn=()=>{};try{assert.equal(await f.battle.preloadMourning(),false);}finally{console.warn=warn;}
 const job=f.battle.mourningWarmJob,e=f.battle.mourningPool[0];assert.equal(job.status,'error');assert.match(job.error,/시간이 초과/);assert.equal(job.preparation.pendingWaits,0);assert.equal(e.hiddenPreparationPending,null);assert.notEqual(e.assetPrepared,true);assertWarmInvisible(f);
 for(const material of previous.keys())assert.notEqual(material.allowShaderHotSwapping,false,'borrowed hot-swapping restored after whole-job timeout');
 PBRMaterial.prototype.isReadyForSubMesh=ready;ShaderMaterial.prototype.isReady=shaderReady;f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.summonResident(f.player,2),true);assert.equal(f.mourningModels.instances,1);assert.equal(f.battle.encounters[0],e);
 reports.push({case:'shader-timeout-explicit-recovery',oldPendingWaiters:job.preparation.pendingWaits,sourceClockMs:clock,instances:f.mourningModels.instances,counts:counts(f)});
});

test('map cancellation does not wait for a never-resolving model prefetch or leave a deadline timer behind',async t=>{
 const f=await fixture(t);await f.battle.activateResident(f.player,{reset:true});const load=f.mourningModels.load;f.mourningModels.load=()=>new Promise(()=>{});
 const warm=f.battle.preloadMourning();await Promise.resolve();const job=f.battle.mourningWarmJob;f.battle.hide();f.world.cave=false;assert.equal(await warm,false);assert.equal(job.status,'cancelled');assert.equal(job.preparation.pendingWaits,0);assert.equal(f.battle.mourningPool.length,0);
 f.mourningModels.load=load;f.world.cave=true;assert.equal(await f.battle.activateResident(f.player,{reset:true,phase:2}),true);assert.equal(f.mourningModels.instances,1);
 reports.push({case:'never-model-load-cancel',oldPendingWaiters:job.preparation.pendingWaits,instances:f.mourningModels.instances});
});

test('real resident cold and warm activation reports animator work and preserves the initial pose on reset',async t=>{
 const f=await fixture(t);f.battle.preparationOptions={frame:async()=>{}};const cases=[];
 const nearPose=(actual,expected)=>{if(typeof actual==='number'){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);return;}if(Array.isArray(actual)){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)nearPose(actual[i],expected[i]);return;}if(actual&&typeof actual==='object'){assert.deepEqual(Object.keys(actual),Object.keys(expected));for(const key of Object.keys(actual))nearPose(actual[key],expected[key]);return;}assert.equal(actual,expected);};
 const pose=e=>({hp:e.brain.hp,state:e.brain.state,actor:e.actor.position.asArray(),nodes:e.asset.transformNodes.map(n=>[n.name,...n.position.asArray(),...(n.rotationQuaternion?.asArray()??[0,0,0,1])]),morph:e.asset.meshes.filter(m=>m.morphTargetManager&&!m.metadata?.moonforestOutline).map(m=>Array.from({length:m.morphTargetManager.numTargets},(_,i)=>m.morphTargetManager.getTarget(i).influence))});
 async function activation(label,fn){const before=f.events.length,start=performance.now();assert.equal(await fn(),true);const elapsed=performance.now()-start,event=f.events.slice(before).find(e=>e.type==='ready');assert.ok(event?.preparationStats);cases.push({label,elapsedDesktopMs:elapsed,preparationStats:structuredClone(event.preparationStats)});return f.battle.encounters.find(e=>e.kind==='elena');}
 let e=await activation('saint-cold',()=>f.battle.activateResident(f.player,{reset:true}));const saint=pose(e);
 assert.ok(cases.at(-1).preparationStats.steps.some(s=>s.name==='model-clone'&&Number.isFinite(s.ms)));
 assert.ok(!cases.at(-1).preparationStats.steps.some(s=>s.name==='model-adopt'));
 e=await activation('saint-reset',()=>f.battle.activateResident(f.player,{reset:true}));nearPose(pose(e),saint);
 assert.ok(!cases.at(-1).preparationStats.steps.some(s=>s.name==='model-adopt'||s.name==='model-clone'));
 assert.equal(await f.battle.preloadMourning(),true);const prefetch=structuredClone(f.battle.mourningWarmJob.preparation.stats);
 e=await activation('witch-warm-transform',()=>f.battle.transformResident(f.player));const witch=pose(e);
 e=await activation('witch-reset',()=>f.battle.activateResident(f.player,{reset:true,phase:2}));nearPose(pose(e),witch);
 const dir=new URL('../reports/loading-stutter-2026-11-03/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('resident-preparation.json',dir),JSON.stringify({scope:'Actual packed resident rigs, desktop NullEngine CPU scheduling; no physical GPU or mobile FPS.',cases,prefetch},null,2)+'\n');
});

test('foreground preparation includes bounded-consumer stats on error and cancellation',async t=>{
 const f=await fixture(t);f.battle.preparationOptions={frame:async()=>{}};f.fail();
 await assert.rejects(f.battle.activateResident(f.player,{reset:true}),/injected shader preparation failure/);
 const failure=f.events.findLast(event=>event.type==='error');assert.ok(failure.preparationStats.steps.some(step=>step.name==='animator'));
 assert.equal(await f.battle.activateResident(f.player,{reset:true}),true);
 const gate=deferred(),entered=deferred();let blocked=false;f.battle.preparationOptions={frame:async()=>{if(!blocked){blocked=true;entered.resolve();await gate.promise;}}};
 const pending=f.battle.activateResident(f.player,{reset:true,phase:2});await entered.promise;f.battle.hide();assert.equal(await pending,false);gate.resolve();
 const cancelled=f.events.findLast(event=>event.type==='cancel');assert.ok(cancelled.preparationStats);assert.ok(cancelled.preparationStats.yields>=1);
});

test('contact creation stays hidden through cancellation and resumes on the same mesh',async t=>{
 const f=await fixture(t),gate=deferred(),entered=deferred();let held=false;
 f.battle.preparationOptions={maxBlocks:1,frame:async()=>{const e=f.battle.elenaPool[0];if(!held&&e?.contact&&!e.contact.prepared){held=true;entered.resolve();await gate.promise;}}};
 const pending=f.battle.activateResident(f.player,{reset:true});await entered.promise;const e=f.battle.elenaPool[0],contact=e.contact;
 assert.equal(contact.mesh.isEnabled(),false);assert.equal(e.actor.isEnabled(),false);f.battle.hide();f.world.cave=false;assert.equal(await pending,false);
 gate.resolve();await Promise.resolve();assert.equal(contact.mesh.isEnabled(),false);assert.equal(e.active,false);
 f.world.cave=true;f.battle.preparationOptions={frame:async()=>{}};assert.equal(await f.battle.activateResident(f.player,{reset:true}),true);
 assert.strictEqual(e.contact,contact);assert.equal(contact.prepared,true);assert.equal(f.scene.meshes.filter(mesh=>mesh.name==='elena-contact-ground').length,1);
 assert.equal(contact.mesh.scaling.x,ELENA_SIZE.contactScale);assert.equal(contact.mesh.isEnabled(),false);
});

test('disposing the scene while contact shader preparation waits cannot expose a late mesh',async t=>{
 const f=await fixture(t),gate=deferred(),entered=deferred();let held=false;
 f.battle.preparationOptions={maxBlocks:1,frame:async()=>{const e=f.battle.elenaPool[0];if(!held&&e?.contact&&!e.contact.prepared){held=true;entered.resolve();await gate.promise;}}};
 const pending=f.battle.activateResident(f.player,{reset:true});await entered.promise;const e=f.battle.elenaPool[0],contact=e.contact;f.scene.dispose();
 assert.equal(await pending,false);gate.resolve();await Promise.resolve();assert.equal(contact.mesh.isDisposed(),true);assert.equal(e.active,false);
});

test.after(()=>{const dir=new URL('../reports/elena-transform-performance-2026-11-02/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('hidden-preparation-validation.json',dir),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Actual packed rigs, CPU step scheduling, shader variants and lifecycle in Babylon NullEngine. No browser/GPU/physical temperature measurement.',reports},null,2)+'\n');});
