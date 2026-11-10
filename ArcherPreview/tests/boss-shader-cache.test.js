import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,FreeCamera,Vector3,DirectionalLight,ShadowGenerator,TransformNode,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {enableEnemyFade} from '../src/enemy-death.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {applyMonsterToon} from '../src/monster-toon.js';
import {applyElenaStyle} from '../src/elena-style.js';
import {applyHitFlash} from '../src/hit-feedback.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {ElenaEncounter} from '../src/elena-encounter.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';

const records=[],base=new URL('../public/assets/',import.meta.url);
function fixture(t){
 const engine=new NullEngine({renderWidth:640,renderHeight:360}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
 const camera=new FreeCamera('shader-cache-camera',new Vector3(0,3,-12),scene);camera.setTarget(new Vector3(0,1,0));
 const light=new DirectionalLight('sun',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(256,light),actor=new TransformNode('hidden-boss',scene);actor.setEnabled(false);
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const effects=[],seen=new Set(Object.values(engine._compiledEffects)),requests=[],rawTextures=[],create=engine.createEffect.bind(engine),raw=engine.createRawTexture.bind(engine);
 engine.createEffect=(...args)=>{const effect=create(...args),entry={shader:typeof args[0]==='string'?args[0]:'source',alpha:/#define ALPHABLEND\b/.test(effect.defines),id:effect.uniqueId,renderPass:engine.currentRenderPassId};requests.push(entry);if(!seen.has(effect)){seen.add(effect);effects.push(entry);}return effect;};
 engine.createRawTexture=(...args)=>{rawTextures.push({width:args[1],height:args[2],format:args[3]});return raw(...args);};
 t.after(()=>{scene.dispose();engine.dispose();});
 return {engine,scene,camera,shadows,actor,effects,requests,rawTextures};
}
function inventory(f){return {meshes:f.scene.meshes.length,geometry:f.scene.geometries.length,materials:f.scene.materials.length,textures:f.scene.textures.length,skeletons:f.scene.skeletons.length,morphManagers:f.scene.morphTargetManagers.length};}
function simpleAsset(f,inline=true){
 const material=new PBRMaterial('shared-paint',f.scene);material.unlit=true;material.disableLighting=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;material.metadata={moonforestMonsterToon:true};
 const body=MeshBuilder.CreateBox('body',{},f.scene);body.material=material;body.parent=f.actor;const asset={meshes:[body]};if(inline)applyElenaStyle(asset);attachCharacterOutlines(asset,inline?'elena':'goblin');enableEnemyFade(asset);return {asset,body,material};
}
function shadowReady(f,body){
 const previous=f.engine.currentRenderPassId;f.engine.currentRenderPassId=f.shadows.getShadowMap().renderPassId;
 try{return body.subMeshes.every(sub=>f.shadows.isReady(sub,false,body.material.needAlphaBlendingForMesh(body)));}finally{f.engine.currentRenderPassId=previous;}
}
async function packedAsset(f,t,manifest){
 const config=JSON.parse(readFileSync(new URL(manifest+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');t.after(()=>loader.dispose());container.addAllToScene();for(const group of container.animationGroups)group.stop();
 const asset={meshes:[...container.meshes],skeletons:container.skeletons,animationGroups:container.animationGroups,transformNodes:container.transformNodes},source=new PBRMaterial('actual-packed-paint',f.scene);source.unlit=true;source.backFaceCulling=false;source.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
 for(const mesh of asset.meshes)if(mesh.getTotalVertices())mesh.material=source;
 return {asset,config};
}

for(const precompiledOpaque of [false,true])test(`same-renderId preparation checks both actual PBR variants; existing opaque=${precompiledOpaque}`,async t=>{
 const f=fixture(t),{asset,body,material}=simpleAsset(f),checks=[],ready=material.isReadyForSubMesh.bind(material);let frames=0;
 const living=MeshBuilder.CreateBox('living-shared-paint',{},f.scene);living.position.x=3;living.material=material;enableEnemyFade({meshes:[living]});
 if(precompiledOpaque)assert.equal(ready(body,body.subMeshes[0],false),true);
 material.isReadyForSubMesh=(mesh,sub,instances)=>{assert.equal(material.checkReadyOnEveryCall,true);const value=ready(mesh,sub,instances);checks.push({visibility:mesh.visibility,alpha:/#define ALPHABLEND\b/.test(sub.effect?.defines)});return value;};
 const renderId=f.scene.getRenderId(),renderPass=f.engine.currentRenderPassId;
 await prepareBossShaders(asset,{shadows:f.shadows,frame:async()=>{frames++;assert.equal(material.checkReadyOnEveryCall,false,'the borrowed flag is never held during a yield');assert.equal(f.actor.isEnabled(),false);assert.equal(f.shadows.getShadowMap().renderList.length,0);}});
 assert.equal(f.scene.getRenderId(),renderId);assert.equal(f.engine.currentRenderPassId,renderPass);assert.equal(material.checkReadyOnEveryCall,false);assert.equal(material.allowShaderHotSwapping,true);assert.equal(body.visibility,1);
 assert.equal(checks.some(x=>x.visibility===.5&&x.alpha),true);assert.equal(checks.some(x=>x.visibility===1&&!x.alpha),true);assert.doesNotMatch(body.subMeshes[0].effect.defines,/#define ALPHABLEND\b/);
 const warmedEffects=f.effects.length,requestsBefore=f.requests.length,counts=inventory(f);material.isReadyForSubMesh=ready;f.actor.setEnabled(true);f.shadows.addShadowCaster(body,false);
 const transitions=[];
 for(const visibility of [1,.999,.5,.1,1]){
  for(const mesh of asset.meshes)mesh.visibility=visibility;
  if(visibility<1)f.shadows.removeShadowCaster(body,false);else f.shadows.addShadowCaster(body,false);
  applyHitFlash(asset.meshes,.1);const effectsBefore=f.effects.length;f.scene.render();
  assert.equal(body.renderOverlay,visibility<1);assert.equal(f.effects.length,effectsBefore,'first living and first fading hit reuse hidden-prepared SDK effects');
  assert.equal(living.visibility,1);assert.equal(material.needAlphaBlendingForMesh(living),false);assert.equal(material.alpha,1);assert.equal(material.transparencyMode,PBRMaterial.PBRMATERIAL_OPAQUE);
  const renderer=f.scene.getOutlineRenderer(),overlay=body.subMeshes[0]._getDrawWrapper(renderer._passIdForDrawWrapper[3]);assert.ok(overlay?.effect?.isReady());
  assert.equal(overlay.defines.includes('INSTANCES'),false,'the actual non-instanced boss batch stays non-instanced');transitions.push({visibility,newEffects:f.effects.length-effectsBefore,overlay:body.renderOverlay});
 }
 assert.equal(f.effects.length,warmedEffects);assert.deepEqual(inventory(f),counts);
 records.push({case:'same-render-id-and-death-overlay',precompiledOpaque,frames,checks,preparedEffects:f.effects.slice(0,warmedEffects),postWarmEffectRequests:f.requests.length-requestsBefore,transitions,postWarmNewEffects:0,resourcesStable:true});
});

test('non-inline monsters prepare their existing first-hit overlay without enabling an overlay or drawing a hidden actor',async t=>{
 const f=fixture(t),{asset,body}=simpleAsset(f,false),overlayBefore=body.renderOverlay;let draws=0;body.onBeforeDrawObservable.add(()=>draws++);await prepareBossShaders(asset,{shadows:f.shadows,frame:async()=>{}});
 assert.equal(draws,0);assert.equal(body.renderOverlay,overlayBefore);assert.ok(f.effects.some(effect=>effect.shader==='outline'));const effects=f.effects.length;
 f.actor.setEnabled(true);applyHitFlash(asset.meshes,.1);f.scene.render();assert.equal(body.renderOverlay,true);assert.equal(f.effects.length,effects);assert.ok(draws>0);
 records.push({case:'first-non-inline-hit',hiddenDraws:0,firstHitNewEffects:0});
});

test('actual PBR readiness errors restore either original checkReadyOnEveryCall setting before propagating',async t=>{
 for(const original of [false,true]){
  const f=fixture(t),{asset,body,material}=simpleAsset(f);material.checkReadyOnEveryCall=original;material.isReadyForSubMesh=()=>{assert.equal(material.checkReadyOnEveryCall,true);throw Error('actual-material-failure');};
  await assert.rejects(prepareBossShaders(asset,{frame:async()=>{assert.equal(material.checkReadyOnEveryCall,original);}}),/actual-material-failure/);
  assert.equal(material.checkReadyOnEveryCall,original);assert.equal(material.allowShaderHotSwapping,true);assert.equal(body.visibility,1);
 }
 records.push({case:'readiness-option-restoration',originalValues:[false,true],restoredAfterError:true});
});

test('overlay cancellation, deadline and shader error restore borrowed visibility/readiness state without late polls',async t=>{
 for(const failure of ['cancel','timeout','shader'])await t.test(failure,async t=>{
  const f=fixture(t),{asset,body,material}=simpleAsset(f),renderer=f.scene.getOutlineRenderer(),isReady=renderer.isReady.bind(renderer);let calls=0,clock=0,entered;
  const started=new Promise(resolve=>entered=resolve),preparation=createBossPreparation({frame:async()=>{},now:()=>clock});
  renderer.isReady=(sub,instances,pass)=>{calls++;assert.equal(pass,renderer._passIdForDrawWrapper[3]);assert.equal(body.visibility,.5);if(failure==='shader'){isReady(sub,instances,pass);const effect=sub._getDrawWrapper(pass).effect;effect.getCompilationError=()=> 'overlay compiler failure';effect.allFallbacksProcessed=()=>true;}if(failure==='timeout')clock=45001;entered();return false;};
  const pending=prepareBossShaders(asset,{preparation});await started;if(failure==='cancel')preparation.cancel();
  await assert.rejects(pending,failure==='shader'?/셰이더/:{name:failure==='cancel'?'AbortError':'TimeoutError'});
  assert.equal(body.visibility,1);assert.equal(material.allowShaderHotSwapping,true);assert.equal(material.checkReadyOnEveryCall,false);assert.equal(preparation.pendingWaits,0);const stopped=calls;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls,stopped);assert.equal(f.actor.isEnabled(),false);assert.equal(f.shadows.getShadowMap().renderList.length,0);
  records.push({case:'overlay-'+failure,readinessCalls:calls,lateCalls:0,stateRestored:true});
 });
});

for(const manifest of ['elena','mourning-elena'])test(`${manifest} actual packed skin/morph geometry has no new body, ink, shadow or overlay Effect on first display and fade`,async t=>{
 const f=fixture(t),{asset,config}=await packedAsset(f,t,manifest);
 for(const node of [...asset.meshes,...asset.transformNodes])if(!node.parent)node.parent=f.actor;
 for(const mesh of asset.meshes)if(mesh.getTotalVertices()){mesh.alwaysSelectAsActiveMesh=true;mesh.computeBonesUsingShaders=true;if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;if(mesh.skeleton)mesh.skeleton.useTextureToStoreBoneMatrices=true;}
 for(const manager of new Set(asset.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))){manager.areUpdatesFrozen=true;manager.optimizeInfluencers=manager.isUsingTextureForTargets;manager.numMaxInfluencers=manager.numTargets;manager.areUpdatesFrozen=false;}
 applyMonsterToon(asset);applyElenaStyle(asset);attachCharacterOutlines(asset,'elena');enableEnemyFade(asset);
 for(const material of new Set(asset.meshes.map(mesh=>mesh.material).filter(Boolean)))assert.equal(material.isFrozen,false,'the actual boss material contract stays unfrozen; frozen readiness uses a separate SDK fast path');
 const bodies=asset.meshes.filter(mesh=>mesh.getTotalVertices()&&!isRuntimeOutline(mesh)),beforeRaw=f.rawTextures.length;
 await prepareBossShaders(asset,{shadows:f.shadows,frame:async()=>{assert.equal(f.actor.isEnabled(),false);}});
 for(const mesh of bodies){assert.equal(mesh.instances.length,0);assert.equal(mesh.hasThinInstances,false);assert.doesNotMatch(mesh.subMeshes[0].effect.defines,/#define ALPHABLEND\b/);assert.ok(shadowReady(f,mesh));}
 const prepared=f.effects.length,afterWarmRaw=f.rawTextures.length,counts=inventory(f),transitions=[];f.actor.scaling.setAll(config.scale);f.actor.setEnabled(true);
 for(const visibility of [1,.999,.7,.1,1]){
  for(const mesh of asset.meshes)mesh.visibility=visibility;for(const mesh of bodies)visibility<1?f.shadows.removeShadowCaster(mesh,false):f.shadows.addShadowCaster(mesh,false);
  for(const manager of new Set(bodies.map(mesh=>mesh.morphTargetManager).filter(Boolean)))for(let i=0;i<manager.numTargets;i++)manager.getTarget(i).influence=i%2?.3:.7;
  applyHitFlash(asset.meshes,.1);const start=f.effects.length;f.scene.render();assert.equal(f.effects.length,start,'the actual first skin/morph/overlay draw reuses prepared effects');transitions.push({visibility,newEffects:f.effects.length-start});
 }
 // Bone textures are intentionally reported separately from Effect creation:
 // NullEngine can reveal lazy SDK allocation, never real GPU upload duration.
 const rawAfterFirstDraw=f.rawTextures.length;for(let i=0;i<3;i++)f.scene.render();assert.equal(f.effects.length,prepared);assert.equal(f.rawTextures.length,rawAfterFirstDraw);
 records.push({case:'actual-packed-model-effects',manifest,allBossMaterialsUnfrozen:true,bodies:bodies.map(mesh=>({name:mesh.name,vertices:mesh.getTotalVertices(),boneInfluencers:mesh.numBoneInfluencers,morphTargets:mesh.morphTargetManager?.numTargets??0,textureMorphs:mesh.morphTargetManager?.isUsingTextureForTargets??false})),transitions,newEffectsOnFirstDisplayOrDeath:0,rawTexturesDuringWarm:afterWarmRaw-beforeRaw,rawTexturesAfterFirstDisplay:rawAfterFirstDraw-afterWarmRaw,resourcesBeforeDisplay:counts,resourcesAfterDisplay:inventory(f),sourceImagesLoaded:false});
});

test('actual goblin geometry reuses prepared body, outline, overlay and shadow effects through first fatal hit and fade',async t=>{
 const f=fixture(t),{asset}=await packedAsset(f,t,'hooded-goblin');
 for(const node of [...asset.meshes,...asset.transformNodes])if(!node.parent)node.parent=f.actor;
 for(const mesh of asset.meshes)if(mesh.getTotalVertices()){mesh.alwaysSelectAsActiveMesh=true;if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;if(mesh.skeleton)mesh.skeleton.useTextureToStoreBoneMatrices=true;}
 applyMonsterToon(asset);attachCharacterOutlines(asset,'goblin');enableEnemyFade(asset);
 await prepareBossShaders(asset,{shadows:f.shadows,frame:async()=>{}});
 const bodies=asset.meshes.filter(m=>m.getTotalVertices()&&!isRuntimeOutline(m)),prepared=f.effects.length;
 f.actor.setEnabled(true);for(const m of bodies)f.shadows.addShadowCaster(m,false);f.scene.render();const beforeRequests=f.requests.length;
 for(const visibility of [1,.999,.8,.5,.1]){for(const m of asset.meshes)m.visibility=visibility;if(visibility<1)for(const m of bodies)f.shadows.removeShadowCaster(m,false);applyHitFlash(asset.meshes,.1);f.scene.render();assert.equal(f.effects.length,prepared,'first fatal-hit/fade draw unexpectedly prepared another SDK effect');}
 t.diagnostic(`goblin first fatal/fade cached effect requests: ${f.requests.length-beforeRequests}`);
});

for(const [manifest,Type]of [['guardian-bear',BossEncounter],['elena',ElenaEncounter],['mourning-elena',MourningElenaEncounter]])test(`${manifest} actual hidden encounter prepares its first contact or attack-warning draw before summon`,async t=>{
 const f=fixture(t),loaded=await packedAsset(f,t,manifest),terrain={heightAt:(x,z)=>.01*x+.02*z,place(p){p.y=this.heightAt(p.x,p.z);}},world={scene:f.scene,shadows:f.shadows,terrain},player=new TransformNode('aux-player',f.scene);
 const encounter=new Type(world,()=>{},()=>{},()=>{},{loadAsset:async()=>loaded});let draws=0;const draw=f.engine.drawElementsType.bind(f.engine);f.engine.drawElementsType=(...args)=>{draws++;return draw(...args);};
 const preparation=createBossPreparation({frame:async()=>{if(encounter.actor)assert.equal(encounter.actor.isEnabled(),false);assert.notEqual(encounter.ring?.isEnabled(),true);assert.notEqual(encounter.contact?.mesh.isEnabled(),true);assert.equal(f.shadows.getShadowMap().renderList.length,0);assert.equal(draws,0);}});
 await encounter.prepareHidden({preparation});assert.equal(encounter.assetPrepared,true);assert.equal(draws,0);
 for(const material of new Set(encounter.asset.meshes.map(mesh=>mesh.material).filter(Boolean)))assert.equal(material.isFrozen,false,'the real encounter prepares unfrozen body/ink materials');
 const auxiliary=encounter.kind==='elena'?encounter.contact.mesh:encounter.ring;assert.equal(auxiliary.metadata.moonforestWarmMaterial,true);assert.equal(auxiliary.isEnabled(),false);if(encounter.kind==='elena')assert.equal(encounter.contact.prepared,true);
 const effects=f.effects.length,before=inventory(f),material=auxiliary.material,geometry=auxiliary.geometry;
 await encounter.summon(player,{position:new Vector3(0,0,2.8),rotationY:0,preparation:createBossPreparation({frame:async()=>{}})});
 if(encounter.kind==='elena'){encounter.updateRenderRange(f.camera.position);assert.equal(encounter.contact.mesh.isEnabled(),true);}else{encounter.brain.start('Axe_Spin_Attack','attack');encounter.update(1/60,player);assert.equal(encounter.ring.isVisible,true);}
 assert.equal(auxiliary.material,material);assert.equal(auxiliary.geometry,geometry);const firstDrawBefore=f.effects.length;f.scene.render();assert.ok(draws>0);assert.equal(f.effects.length,firstDrawBefore,'first actual contact or warning draw reuses the prepared SDK Effect');assert.equal(f.effects.length,effects);assert.deepEqual(inventory(f),before);
 for(let i=0;i<3;i++)f.scene.render();assert.equal(f.effects.length,effects);assert.equal(auxiliary.material,material);assert.equal(auxiliary.geometry,geometry);
 records.push({case:'actual-encounter-auxiliary-first-draw',manifest,auxiliary:auxiliary.name,allBossMaterialsUnfrozen:true,hiddenDraws:0,firstDrawNewEffects:0,resourcesBeforeSummon:before,resourcesAfterDraw:inventory(f),materialAndGeometryReused:true});
 encounter.hide();
});

test('actual corrected witch prepare and first death reuse morph texture and every prepared effect',async t=>{
 const f=fixture(t);f.engine.getCaps().texture2DArrayMaxLayerCount=256;let uploads=0;const upload=f.engine.createRawTexture2DArray;f.engine.createRawTexture2DArray=(...args)=>{uploads++;return upload(...args);};
 const loaded=await packedAsset(f,t,'mourning-elena'),body=loaded.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin'),manager=body.morphTargetManager,target=manager.getTargetByName('Death_Ground_Contact');
 assert.ok(manager.isUsingTextureForTargets);assert.equal(manager.numTargets,11);const oldPositions=target.getPositions(),oldNormals=target.getNormals(),oldInfluence=target.influence,atLoad=uploads;
 const terrain={heightAt:()=>0,place(p){p.y=0;}},world={scene:f.scene,shadows:f.shadows,terrain},player=new TransformNode('first-death-player',f.scene),encounter=new MourningElenaEncounter(world,()=>{},()=>{},()=>{},{loadAsset:async()=>loaded});
 await encounter.prepareHidden({preparation:createBossPreparation({frame:async()=>{if(encounter.actor)assert.equal(encounter.actor.isEnabled(),false);}})});
 assert.equal(uploads,atLoad+1);assert.notEqual(target.getPositions(),oldPositions);assert.notEqual(target.getNormals(),oldNormals);assert.equal(manager.numTargets,11);assert.equal(manager.numMaxInfluencers,11);assert.equal(manager.optimizeInfluencers,true);assert.equal(target.influence,oldInfluence);
 const shell=encounter.asset.meshes.find(m=>isRuntimeOutline(m)&&m.parent===body);assert.ok(shell);assert.equal(shell.morphTargetManager,manager);const preparedEffects=f.effects.length,preparedUploads=uploads,counts=inventory(f);
 await encounter.summon(player,{position:new Vector3(0,0,2.8),rotationY:0,preparation:createBossPreparation({frame:async()=>{}})});encounter.updateRenderRange(f.camera.position);f.scene.render();assert.equal(f.effects.length,preparedEffects);assert.equal(uploads,preparedUploads);const liveRequests=f.requests.length;
 encounter.animator.transition('dead');for(const dt of [1/60,.3,.4,.6,1]){encounter.animator.update(dt);f.scene.render();assert.equal(f.effects.length,preparedEffects,'death pose reuses prewarmed body/outline/shadow variants');assert.equal(uploads,preparedUploads,'death influence changes never repack the morph texture');}
 const deathRequests=f.requests.slice(liveRequests);assert.ok(deathRequests.every(request=>f.effects.slice(0,preparedEffects).some(effect=>effect.id===request.id)),'all effect requests reuse previously prepared effect objects');
 assert.ok(target.influence>0);assert.deepEqual(inventory(f),counts);const positions=target.getPositions(),normals=target.getNormals();encounter.hide();await encounter.prepareHidden({preparation:createBossPreparation({frame:async()=>{}})});assert.equal(target.getPositions(),positions);assert.equal(target.getNormals(),normals);assert.equal(uploads,preparedUploads);assert.equal(f.effects.length,preparedEffects);
 records.push({case:'corrected-witch-first-death',targetCount:manager.numTargets,slots:manager.numMaxInfluencers,initialCorrectionUploads:uploads-atLoad,firstLiveAndDeathNewEffects:0,firstLiveAndDeathNewMorphTextures:0,deathEffectRequestsReusingCache:deathRequests,warmReprepareUploads:0,resourcesStable:true});
});

test.after(()=>{
 const folder=new URL('../reports/loading-stutter-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('shader-cache-validation.json',folder),JSON.stringify({baseline:'71f9165',passed:records.length===13,cases:records,scope:'Pinned Babylon 9.31 actual Effect creation/cache, PBR readiness, built-in overlay pass 3, body/ink skin/morph geometry and shadow readiness; actual encounter hidden preparation and first contact/warning draws.',unchanged:['No hidden actor draw, caster registration or visible overlay activation during preparation','Existing body/outline/hit colors, alpha composition, material ownership, skeleton/morph streams, combat and LOD'],limitations:['NullEngine does not compile GPU driver programs or measure GPU upload/fence latency, device FPS, temperature or visual quality.','Actual packed geometry is decoded, but downloaded model images/KTX are omitted. Synthetic opaque paint exercises the shipped skin/morph material variants.','RawTexture allocation counts are SDK resource events, not measured GPU upload duration.','The shipped boss materials remain unfrozen, explicitly asserted on actual packed assets and encounters. Frozen arbitrary inputs have a separate SDK fast path and are outside this fix.']},null,2)+'\n');
 const death=records.find(row=>row.case==='corrected-witch-first-death');if(death){const output=new URL('../reports/forest-stamina-kneel-2026-11-03/',import.meta.url);mkdirSync(output,{recursive:true});writeFileSync(new URL('shader-morph-review.json',output),JSON.stringify({case:death,scope:'Actual packed geometry, actual encounter prepareAsset and hidden preparation, summon, sampled death and warm reprepare; Babylon NullEngine with image data omitted.',limitations:['Effect cache identity and SDK allocation calls are measured; real GPU compilation, upload duration and mobile/iOS are not measured.','Existing attribute fallback remains outside this texture-mode validation.']},null,2)+'\n');}
});
