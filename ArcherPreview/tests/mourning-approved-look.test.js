import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,MeshBuilder,PBRMaterial,FreeCamera,Vector3,Constants,RawTexture} from '@babylonjs/core';
import {WebGL2ShaderProcessor} from '@babylonjs/core/Engines/WebGL/webGL2ShaderProcessors.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {installMourningHairGuides} from '../src/mourning-hair-guides.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {attachCharacterOutlines} from '../src/character-outlines.js';
import {applyMonsterToon} from '../src/monster-toon.js';
import {applyElenaStyle} from '../src/elena-style.js';
import {characterStyleFor,setSceneCharacterStyles} from '../src/character-style.js';
import {CharacterStyleSettings} from '../src/character-style-settings.js';
import {applyHitFlash,canInlineHitFlash} from '../src/hit-feedback.js';
import {EnemyDeath,enableEnemyFade} from '../src/enemy-death.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {CaveFogRuntime} from '../src/cave-fog-runtime.js';
import {prepareMourningCameraCulling} from '../src/mourning-camera-culling.js';
import {inspectNpcInteriorInk,prepareNpcInteriorInk} from '../src/npc-interior-ink.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,options){
 const engine=new NullEngine(options),scene=new Scene(engine);scene.useRightHandedSystem=true;engine._webGLVersion=2;engine._getShaderProcessor=()=>new WebGL2ShaderProcessor();engine.disableUniformBuffers=true;
 const camera=new FreeCamera('main',new Vector3(0,3,9),scene);camera.setTarget(new Vector3(0,1.5,0));
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),json=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])json[key]=(json[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json},'');
 const paint=new PBRMaterial('shared-original',scene);paint.backFaceCulling=false;
 // NullEngine has no KTX GPU decoder. Only its upload boundary is stubbed;
 // the shipped 4K texture is separately hash-checked and never rewritten.
 paint.albedoTexture=RawTexture.CreateRGBATexture(new Uint8Array([230,195,180,255]),1,1,scene);paint.albedoTexture.getInternalTexture().isReady=true;
 for(const mesh of container.meshes)if(mesh.getTotalVertices())mesh.material=paint;
 const make=()=>{const asset=instantiateBossModel(container),actor=new TransformNode('actor',scene),carrier=new TransformNode('carrier',scene);carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;return {asset,actor,carrier};};
 t.after(()=>{loader.dispose();scene.dispose();engine.dispose();});return {engine,scene,camera,config,decoded,container,paint,make};
}

test('approved paint/ink and pooled actors preserve geometry, texture, independent settings, flash and eased death in all four map contexts',async t=>{
 const f=await fixture(t),settings=new CharacterStyleSettings();setSceneCharacterStyles(f.scene,settings.value);
 const saint=MeshBuilder.CreateBox('saint',{},f.scene);saint.material=f.paint;applyMonsterToon({meshes:[saint]});applyElenaStyle({meshes:[saint]});const saintMaterial=saint.material,saintShell=attachCharacterOutlines({meshes:[saint]},'elena')[0];
 const actors=[];let sharedPaint,sharedInk;
 for(const mapId of ['village','great-plains','monster-forest','witch-cave']){
  const a=f.make(),before=new Map(a.asset.meshes.filter(m=>m.getTotalVertices()).map(m=>[m,[m.geometry,m.skeleton,m.morphTargetManager]]));
  const encounter=new MourningElenaEncounter({scene:f.scene,mapId},()=>{});Object.assign(encounter,{asset:a.asset,actor:a.actor,config:f.config});encounter.preparePaint();
  const shells=attachCharacterOutlines(a.asset,'elena',{deferCameraCulling:true});enableEnemyFade(a.asset);assert.equal(shells.length,3);
  const body=a.asset.meshes.find(m=>m.name==='Elina_Chimera_Skin');
  const triangles=[...before.keys()].reduce((n,m)=>n+m.getTotalIndices()/3,0);assert.equal(triangles,49982);
  for(const [mesh,[geometry,skeleton,morph]]of before){assert.equal(mesh.geometry,geometry);assert.equal(mesh.skeleton,skeleton);assert.equal(mesh.morphTargetManager,morph);assert.equal(mesh.material.getClassName(),'ShaderMaterial');assert.equal(mesh.material.backFaceCulling,false);assert.equal(mesh.material.stencil.mask,1);assert.equal(mesh.material.stencil.func,Constants.ALWAYS);assert.equal(mesh.material._textures.paintSampler,f.paint.albedoTexture);}
  for(const shell of shells){assert.equal(shell.geometry,shell.parent.geometry);assert.equal(shell.skeleton,shell.parent.skeleton);assert.equal(shell.morphTargetManager,shell.parent.morphTargetManager);assert.equal(shell.material.stencil.func,Constants.NOTEQUAL);assert.equal(shell.material.stencil.mask,0);assert.notEqual(shell.material,saintShell.material);}
  if(sharedPaint){assert.equal(body.material,sharedPaint);assert.equal(shells[0].material,sharedInk);}sharedPaint=body.material;sharedInk=shells[0].material;
  assert.deepEqual(characterStyleFor(body),settings.value.mourning);assert.deepEqual(characterStyleFor(shells[0]),settings.value.mourning);
  applyHitFlash(a.asset.meshes,.22);assert.equal(body.renderOverlay,false);assert.equal(canInlineHitFlash(body),true);
  const opacity=new EnemyDeath();opacity.reset({holdPose:true});opacity.advance(7);body.visibility=opacity.opacity;assert.ok(body.visibility>0&&body.visibility<1);assert.equal(body.material.needAlphaBlendingForMesh(body),true);applyHitFlash(a.asset.meshes,.22);assert.equal(body.renderOverlay,true);
  body.visibility=1;applyHitFlash(a.asset.meshes,0);
  actors.push({...a,body,shells});
 }
 assert.equal(saint.material,saintMaterial);assert.equal(saint.material.getClassName(),'PBRMaterial');assert.equal(saintShell.material.stencil.enabled,false);assert.deepEqual(characterStyleFor(saintShell),settings.value.boss);
 settings.set('mourning',{outline:false,internal:false,brightness:1.1});setSceneCharacterStyles(f.scene,settings.value);assert.ok(actors.flatMap(a=>a.shells).every(m=>!m.isEnabled()));assert.equal(saintShell.isEnabled(),true);assert.equal(characterStyleFor(actors[0].body).brightness,1.1);assert.equal(settings.value.boss.brightness,1);
 settings.reset('mourning');setSceneCharacterStyles(f.scene,settings.value);
 const a=actors[0];for(const mesh of [a.body,...a.shells]){await mesh.material.forceCompilationAsync(mesh);assert.equal(mesh.material.isReadyForSubMesh(mesh,mesh.subMeshes[0]),true);}
 const effect=a.body.subMeshes[0].effect;assert.match(effect.fragmentSourceCode,/\.78\+\.14\*smoothstep/);assert.match(effect.fragmentSourceCode,/gl_FrontFacing/);assert.match(effect.fragmentSourceCode,/caveFogShadeSurface/);assert.doesNotMatch(effect.fragmentSourceCode,/fwidth|reflectionSampler/);
 f.scene.render();const values={},original=effect.setFloat.bind(effect);effect.setFloat=(name,value)=>{values[name]=value;return original(name,value);};applyHitFlash(a.asset.meshes,.11);a.body.material.bind(a.body.getWorldMatrix(),a.body,undefined,a.body.subMeshes[0]);assert.equal(values.paintExposure,1.35);assert.equal(values.paintOpacity,1);assert.equal(values.paintHitFlash,.36);
 a.body.visibility=.4;a.body.material.bind(a.body.getWorldMatrix(),a.body,undefined,a.body.subMeshes[0]);assert.equal(values.paintOpacity,.4);assert.equal(values.paintHitFlash,0);a.body.visibility=1;
 const texture=f.decoded.gltf.images.find(row=>row.uri?.endsWith('.ktx2'));const bytes=readFileSync(new URL(texture.uri,new URL(f.config.model,new URL('../public/assets/',import.meta.url))));assert.equal(hash(bytes),'b943792deead273c3d9793295a2660c005e750f23e1c4074de95f5e6487c4eb9');
 assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0,'unsupported depth never allocates a pass');
 for(const a of actors)a.actor.dispose();assert.equal(inspectNpcInteriorInk(f.scene).registered,0);
});

test('the cave Witch keeps a sampled exterior edge at reduced resolution with the same three draws',async t=>{
 const f=await fixture(t,{renderWidth:1354,renderHeight:652}),a=f.make(),world={scene:f.scene,camera:f.camera,cave:true,edition:'moonforest-0.3',terrain:{heightAt:()=>0}};
 const fog=new CaveFogRuntime(world,{isOpaque:()=>false});
 fog.texture.getInternalTexture().isReady=true;
 const encounter=new MourningElenaEncounter(world,()=>{});
 Object.assign(encounter,{...a,config:f.config,active:true});
 encounter.preparePaint();
 const shells=attachCharacterOutlines(a.asset,'elena'),bounds=prepareMourningCameraCulling(a.asset);
 assert.equal(shells.length,3);
 const settings=new CharacterStyleSettings(),set=change=>setSceneCharacterStyles(f.scene,settings.set('mourning',change));
 fog.update(new Vector3(0,0,3),0,{encounters:[encounter]});
 for(const mesh of shells)await mesh.material.forceCompilationAsync(mesh);
 f.scene.render();
 const css={clientWidth:797,clientHeight:384},originalCanvas=f.engine.getRenderingCanvas;
 f.engine.getRenderingCanvas=()=>css;
 const effects=new Set(shells.map(mesh=>mesh.subMeshes[0].effect));
 const widths=[],inkFlash=[],stencils=[],depthGaps=[];
 for(const effect of effects){
  assert.match(effect.vertexSourceCode,/gl_Position\.z\s*\+=\s*mourningDepthBias/);
  const original=effect.setFloat.bind(effect),original2=effect.setFloat2.bind(effect);
  effect.setFloat=(name,value)=>{if(name==='outlinePixels')widths.push(value);if(name==='hitFlash')inkFlash.push(value);return original(name,value);};
  effect.setFloat2=(name,x,y)=>{if(name==='mourningDepthBias')depthGaps.push(x);return original2(name,x,y);};
 }
 const drawn=new Set();
 for(const shell of shells)shell.onBeforeDrawObservable.add(()=>{drawn.add(shell);stencils.push([shell.material.stencil.func,shell.material.stencil.backFunc,shell.material.stencil.mask]);});
 const render=(scale,expected)=>{
  f.engine.getHardwareScalingLevel=()=>scale;
  drawn.clear();widths.length=0;inkFlash.length=0;stencils.length=0;depthGaps.length=0;f.scene.render();
  assert.equal(drawn.size,expected===0?0:3);
  assert.deepEqual(widths,expected===0?[]:[expected,expected,expected]);
  if(expected)assert.ok(bounds.outlinePadding().pixels>=expected);
 };
 // S23 cave capture: high at 85%, CSS 797×384 with a 1354×652 framebuffer.
 const body=a.asset.meshes.find(mesh=>mesh.name==='Elina_Chimera_Skin'),bodyEffect=body.subMeshes[0].effect;
 const surfaceFlash=[],set1=bodyEffect.setFloat.bind(bodyEffect);
 bodyEffect.setFloat=(name,value)=>{if(name==='paintHitFlash')surfaceFlash.push(value);return set1(name,value);};
 render(1/1.7,1);
 const open=()=>assert.deepEqual(stencils,Array.from({length:3},()=>[Constants.ALWAYS,Constants.ALWAYS,0]));
 open();assert.ok(depthGaps.includes(.035));
 applyHitFlash(a.asset.meshes,.22);render(1/1.7,1);open();
 assert.ok(surfaceFlash.includes(.72));assert.ok(inkFlash.length&&inkFlash.every(v=>v===0));
 assert.ok(Math.abs(widths[0]*f.engine.getRenderHeight()/css.clientHeight-1.7)<.003);
 for(const m of a.asset.meshes)m.visibility=.6;
 render(1/1.7,1);assert.ok(stencils.length&&stencils.every(([func,back])=>func===Constants.NOTEQUAL&&back===func));
 for(const m of a.asset.meshes)m.visibility=1;
 render(1/.85,1.5/.85);open();
 render(1/2,1);
 set({outlineWidth:.25});render(1/.85,.25);
 set({outlineWidth:0});render(1/.85,0);
 set({outline:true,outlineWidth:.5});set({outline:false});render(1/.85,0);
 set({outline:true});world.edition='moonforest-0.2';render(1/.85,.5);
 assert.ok(stencils.every(([func])=>func===Constants.NOTEQUAL));assert.ok(inkFlash.includes(.72));
 world.edition='moonforest-0.3';fog.update(new Vector3(50,0,50),2,{force:true,encounters:[encounter]});render(1/.85,0);
 fog.dispose();render(1/.85,.5);
 f.engine.getRenderingCanvas=originalCanvas;
 a.actor.dispose();
});

test('hair correction is default, idle/walk/death and non-hair bones stay exact, and refresh/reset do not compound it',async t=>{
 const f=await fixture(t),a=f.make(),b=f.make(),fixed=new MourningElenaAnimator(a.asset,f.config,a.actor),original=new MourningElenaAnimator(b.asset,f.config,b.actor);
 installMourningHairGuides(fixed);
 assert.equal(fixed.hairGuides.guides.length,15);assert.equal(fixed.hairGuides.enabled,true);
 const nodes=a.asset.transformNodes.filter(n=>!n.name.startsWith('DEF_Hair_')).map(n=>[n,b.asset.transformNodes.find(x=>x.name===n.name)]);
 for(const state of ['idle','walk','cast_slam','hit','dead']){
  for(const animator of [fixed,original]){animator.reset();animator.transition(state,{clipTime:1.7,actionId:1});if(state==='walk')animator.gaitBlend=1;if(state==='hit')animator.hitTime=.3;animator.sample(1/60);}
  for(const [x,y]of nodes)for(const key of ['position','rotationQuaternion','scaling'])if(x[key])assert.deepEqual(x[key].asArray(),y[key].asArray(),state+' '+x.name);
  const before=fixed.hairGuides.guides.map(c=>c.bone.getWorldMatrix().asArray().slice());fixed.refreshPose();fixed.refreshPose();assert.deepEqual(fixed.hairGuides.guides.map(c=>c.bone.getWorldMatrix().asArray()),before);
  if(['idle','walk','dead'].includes(state))for(const c of fixed.hairGuides.guides){const other=b.asset.transformNodes.find(n=>n.name===c.bone.name);assert.deepEqual(c.bone.rotationQuaternion.asArray(),other.rotationQuaternion.asArray());}
 }
 fixed.reset();assert.equal(fixed.hairGuides.enabled,true);assert.equal(fixed.hairGuides.guides.length,15);
});

test('hidden interior warmup shares one material, allocates no framebuffers and obeys cancellation',async t=>{
 const f=await fixture(t);f.engine.getCaps().depthTextureExtension=true;
 const a=f.make();a.actor.setEnabled(false);
 const encounter=new MourningElenaEncounter({scene:f.scene},()=>{});Object.assign(encounter,{asset:a.asset,actor:a.actor,config:f.config});encounter.preparePaint();
 let pauses=0;const preparation=createBossPreparation({frame:async()=>{pauses++;},maxBlocks:1});
 await prepareNpcInteriorInk(a.asset,preparation);assert.ok(pauses>0);
 const material=f.scene.materials.find(m=>m.name==='npc-interior-normal');assert.ok(material);
 f.scene.onBeforeRenderObservable.notifyObservers(f.scene);assert.equal(inspectNpcInteriorInk(f.scene).renderTargets,0);assert.equal(inspectNpcInteriorInk(f.scene).postProcesses,0);
 await prepareNpcInteriorInk(a.asset,createBossPreparation({frame:async()=>{}}));assert.equal(f.scene.materials.filter(m=>m.name==='npc-interior-normal').length,1);
 const cancelled=createBossPreparation({isCurrent:()=>false});await assert.rejects(prepareNpcInteriorInk(a.asset,cancelled),{name:'AbortError'});
 a.actor.dispose();assert.ok(material.isDisposed||!f.scene.materials.includes(material));assert.equal(inspectNpcInteriorInk(f.scene).registered,0);
});
