import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3,DirectionalLight,ShadowGenerator,TransformNode,PBRMaterial,VertexBuffer,MeshBuilder,MorphTargetManager,MorphTarget,Skeleton,Bone,Matrix} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {applyCharacterSurfaceStyle} from '../src/character-style.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {MourningElenaEncounter} from '../src/mourning-elena-encounter.js';
import {ElenaEncounter} from '../src/elena-encounter.js';
import {applyHitFlash} from '../src/hit-feedback.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

const records=[],base=new URL('../public/assets/',import.meta.url),sha=text=>createHash('sha256').update(text).digest('hex');
function fixture(t){
 const engine=new NullEngine({renderWidth:1664,renderHeight:768}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 Object.assign(engine.getCaps(),{textureFloat:true,canUseGLVertexID:true,maxVertexTextureImageUnits:16,maxTextureSize:4096,texture2DArrayMaxLayerCount:256});
 engine.createRawTexture2DArray=(data,w,h,depth,format,mips,invertY,sampling,compression,type)=>{const texture=engine.createRawTexture(data,w,h,format,mips,invertY,sampling,compression,type);texture.depth=depth;texture.is2DArray=true;return texture;};
 const camera=new FreeCamera('actual-material-camera',new Vector3(0,3,-12),scene);camera.setTarget(new Vector3(0,1,0));
 const light=new DirectionalLight('sun',new Vector3(.65,-1,-.45),scene),shadows=new ShadowGenerator(256,light);
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const requests=[],effects=new Set(),rawTextures=[],create=engine.createEffect.bind(engine),raw=engine.createRawTexture.bind(engine);
 engine.createEffect=(...args)=>{const effect=create(...args);effects.add(effect);requests.push({id:effect.uniqueId,defines:sha(effect.defines),shader:typeof args[0]==='string'?args[0]:'source'});return effect;};
 engine.createRawTexture=(...args)=>{rawTextures.push({width:args[1],height:args[2]});return raw(...args);};
 t.after(()=>{scene.dispose();engine.dispose();});
 return {engine,scene,camera,shadows,requests,effects,rawTextures};
}
async function packed(f,t,name){
 const config=JSON.parse(readFileSync(new URL(name+'.json',base))),decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');t.after(()=>loader.dispose());container.addAllToScene();
 for(const group of container.animationGroups)group.stop();
 const paint=new PBRMaterial(name+'-image-omitted-paint',f.scene);paint.unlit=true;paint.backFaceCulling=false;paint.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
 const asset={meshes:[...container.meshes],skeletons:container.skeletons,animationGroups:container.animationGroups,transformNodes:container.transformNodes};
 for(const mesh of asset.meshes)if(mesh.getTotalVertices()){
  mesh.material=paint;mesh.alwaysSelectAsActiveMesh=true;mesh.computeBonesUsingShaders=true;
  if(mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind))mesh.numBoneInfluencers=8;
  if(mesh.skeleton)mesh.skeleton.useTextureToStoreBoneMatrices=true;
 }
 return {asset,config};
}
function inventory(asset){return asset.meshes.filter(mesh=>mesh.getTotalVertices()).map(mesh=>({name:mesh.name,vertices:mesh.getTotalVertices(),attributes:mesh.getVerticesDataKinds(),bones:mesh.numBoneInfluencers,morphTargets:mesh.morphTargetManager?.numTargets??0,morphSlots:mesh.morphTargetManager?.numMaxInfluencers??0,textureMorphs:mesh.morphTargetManager?.isUsingTextureForTargets??false,ink:isRuntimeOutline(mesh),perSubmesh:mesh.material._storeEffectOnSubMeshes!==false}));}
function countResources(f){return {meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,materials:f.scene.materials.length,textures:f.scene.textures.length,skeletons:f.scene.skeletons.length,morphManagers:f.scene.morphTargetManagers.length};}

test('actual warrior and both Elena phases retain their own cached submesh effects through phase changes and complete witch death',async t=>{
 const f=fixture(t),player=await packed(f,t,'warrior-v3'),playerRoot=new TransformNode('actual-player',f.scene);
 for(const node of [...player.asset.meshes,...player.asset.transformNodes])if(!node.parent)node.parent=playerRoot;
 playerRoot.scaling.setAll(player.config.scale);playerRoot.position.x=-3;applyCharacterSurfaceStyle(player.asset,'player');attachCharacterOutlines(player.asset,'warrior');
 for(const mesh of player.asset.meshes)if(mesh.getTotalVertices()&&!isRuntimeOutline(mesh))f.shadows.addShadowCaster(mesh,false);
 const world={scene:f.scene,shadows:f.shadows,terrain:{heightAt:()=>0,place(p){p.y=0;}}},encounters=[];
 for(const [name,Type]of [['elena',ElenaEncounter],['mourning-elena',MourningElenaEncounter]]){
  const loaded=await packed(f,t,name),encounter=new Type(world,()=>{},()=>{},()=>{},{loadAsset:async()=>loaded});
  await encounter.prepareHidden({preparation:createBossPreparation({frame:async()=>{}})});encounters.push(encounter);
  assert.ok(encounter.asset.meshes.filter(isRuntimeOutline).every(mesh=>mesh.material._storeEffectOnSubMeshes));
 }
 const [phase1,witch]=encounters,attributes={player:inventory(player.asset),phase1:inventory(phase1.asset),phase2:inventory(witch.asset)};
 for(const asset of [player.asset,phase1.asset,witch.asset])for(const material of new Set(asset.meshes.map(mesh=>mesh.material).filter(Boolean)))assert.equal(material.isFrozen,false);
 await phase1.summon(playerRoot,{position:new Vector3(1,0,2.8),rotationY:0,preparation:createBossPreparation({frame:async()=>{}})});phase1.updateRenderRange(f.camera.position);
 for(let i=0;i<3;i++){phase1.animator.update(1/60);f.scene.render();}
 const steady=[];
 function frames(label,count,update=()=>{}){
  const requests=f.requests.length,effects=f.effects.size,textures=f.rawTextures.length,refs=[...f.effects].map(effect=>[effect,effect._refCount]);
  for(let i=0;i<count;i++){update(i);f.scene.render();}
  const row={label,frames:count,effectRequests:f.requests.length-requests,newEffects:f.effects.size-effects,newRawTextures:f.rawTextures.length-textures,refGrowth:refs.reduce((sum,[effect,before])=>sum+(effect._refCount-before),0)};steady.push(row);return row;
 }
 assert.equal(frames('phase1-animated-idle',120,()=>phase1.animator.update(1/60)).effectRequests,0);
 phase1.hide();
 const beforePhase2=f.effects.size;
 await witch.summon(playerRoot,{position:new Vector3(1,0,2.8),rotationY:0,preparation:createBossPreparation({frame:async()=>{}})});witch.updateRenderRange(f.camera.position);f.scene.render();
 assert.equal(f.effects.size,beforePhase2,'phase2 first display uses hidden-prepared effects alongside actual player attributes');
 assert.equal(frames('phase2-animated-idle',120,()=>witch.animator.update(1/60)).effectRequests,0);
 const beforeDeath={effects:f.effects.size,uploads:f.rawTextures.length,resources:countResources(f)},requestsBefore=f.requests.length;
 // Exact production death path, including first death morph, the5.85s fade boundary,
 // removal of shadow casters, opacity0 and actor disable at the unchanged10s.
 assert.equal(witch.brain.hit({damage:witch.brain.hp}),true);
 const deathFrames=[];
 for(let frame=0;frame<606;frame++){
  const before=f.requests.length;witch.update(1/60,playerRoot);applyHitFlash(witch.asset.meshes,frame<12?.1:0);f.scene.render();
  if(f.requests.length!==before)deathFrames.push({frame,seconds:(frame+1)/60,opacity:witch.death.opacity,requests:f.requests.slice(before)});
  assert.equal(f.effects.size,beforeDeath.effects,'first death and fade introduce no new shader Effect');
  assert.equal(f.rawTextures.length,beforeDeath.uploads,'death introduces no new SDK RawTexture');
 }
 assert.equal(witch.death.duration,10);assert.equal(witch.death.finished,true);assert.equal(witch.actor.isEnabled(),false);assert.deepEqual(countResources(f),beforeDeath.resources);
 const post=frames('after-death-steady',120);assert.equal(post.effectRequests,0);assert.equal(post.refGrowth,0);
 assert.ok(steady.every(row=>row.newEffects===0&&row.newRawTextures===0&&row.refGrowth===0));
 records.push({case:'actual-player-both-phases-complete-death',attributes,steady,deathFrames,deathEffectRequests:f.requests.length-requestsBefore,deathNewEffects:0,deathNewRawTextures:0,deathDuration:witch.death.duration,resourcesStable:true});
});

test('actual texture morph outline binds one current manager per draw while retaining explicit consecutive-rig bone binding',async t=>{
 const f=fixture(t),loaded=await packed(f,t,'mourning-elena'),world={scene:f.scene,shadows:f.shadows,terrain:{heightAt:()=>0,place(p){p.y=0;}}},encounter=new MourningElenaEncounter(world,()=>{},()=>{},()=>{},{loadAsset:async()=>loaded});
 await encounter.prepareHidden({preparation:createBossPreparation({frame:async()=>{}})});
 const shell=encounter.asset.meshes.find(mesh=>isRuntimeOutline(mesh)&&mesh.morphTargetManager?.numTargets===11),manager=shell.morphTargetManager;
 assert.equal(manager.isUsingTextureForTargets,true);assert.equal(shell.material.isFrozen,false);
 const bind=manager._bind;let calls=0;manager._bind=function(effect){calls++;return bind.call(this,effect);};
 for(const influence of [0,.2,1,0]){
  manager.getTarget(0).influence=influence;const before=calls;f.scene.resetCachedMaterial();
  shell.material.bind(shell.computeWorldMatrix(true),shell,shell.subMeshes[0].effect,shell.subMeshes[0]);
  assert.equal(calls-before,1,'unfrozen Babylon ShaderMaterial already binds the actual current morph manager; the onBind observer must not repeat it');
 }
 records.push({case:'actual-morph-bind-count',binds:calls,draws:4,bindsPerDraw:1,targets:manager.numTargets});
});

for(const texture of [false,true])test(`consecutive shared-ink rigs retain their own current ${texture?'texture':'attribute'} morph parameters, including empty and absent managers`,t=>{
 const f=fixture(t),actors=[];
 for(let i=0;i<4;i++){
  const body=MeshBuilder.CreateBox('independent-rig-'+i,{},f.scene),vertices=body.getTotalVertices();
  body.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(vertices*4));body.setVerticesData(VertexBuffer.MatricesWeightsKind,Float32Array.from({length:vertices*4},(_,j)=>j%4===0?1:0));
  body.skeleton=new Skeleton('skeleton-'+i,'skeleton-'+i,f.scene);body.skeleton.useTextureToStoreBoneMatrices=true;
  const bone=new Bone('root',body.skeleton,null,Matrix.Identity());bone.setPosition(new Vector3(i+.25,0,0));body.skeleton.prepare(true);
  let manager=null,calls=0;
  if(i<3){
   manager=new MorphTargetManager(f.scene);manager.useTextureToStoreTargets=texture;manager.numMaxInfluencers=1;manager.optimizeInfluencers=false;
   if(i<2){const target=new MorphTarget('one-target',.2+i*.3,f.scene);target.setPositions(body.getVerticesData(VertexBuffer.PositionKind).slice());target.setNormals(body.getVerticesData(VertexBuffer.NormalKind).slice());manager.addTarget(target);}
   body.morphTargetManager=manager;const bind=manager._bind;manager._bind=function(effect){calls++;return bind.call(this,effect);};
  }
  const shell=attachCharacterOutlines({meshes:[body]},'bear')[0];actors.push({body,shell,manager,get calls(){return calls;}});
 }
 const bound={},effect={isReady:()=>true,getUniformIndex:()=>0,setMatrix(){},setFloat(name,value){bound[name]=value;},setFloat2(){},setFloat3(){},setColor3(){},setMatrices(){},setFloatArray(name,value){bound[name]=Array.from(value??[]);},setTexture(name,value){bound[name]=value;}};
 for(let frame=0;frame<3;frame++){
  f.scene.resetCachedMaterial();
  for(const [i,actor]of actors.entries()){
   if(actor.manager?.numTargets)actor.manager.getTarget(0).influence=.1*(i+1)+frame*.1;
   const before=actor.calls;actor.shell.material.bind(actor.shell.computeWorldMatrix(true),actor.shell,effect,actor.shell.subMeshes[0]);
   assert.equal(bound.boneSampler,actor.body.skeleton.getTransformMatrixTexture(actor.shell),'cached draws bind the current independent rig');
   if(actor.manager){assert.deepEqual(bound.morphTargetInfluences,Array.from(actor.manager.influences));if(texture)assert.equal(bound.morphTargets,actor.manager._targetStoreTexture);}
   assert.equal(actor.calls-before,texture&&actor.manager?1:0,'only the SDK performs texture-manager binding, never the observer');
  }
 }
 records.push({case:'consecutive-independent-rigs',texture,frames:3,rigs:4,emptyAndAbsentManager:true,independentMorphParameters:true,independentBoneTextures:true,textureManagerBinds:actors.reduce((sum,actor)=>sum+actor.calls,0)});
});

test.after(()=>{
 const folder=new URL('../reports/thermal-followup-2026-11-04/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('boss-material-validation.json',folder),JSON.stringify({baseline:'5a6abaa',passed:records.length===4,cases:records,limitations:['Babylon9.31 NullEngine SDK call/effect identity validation; GPU programs, upload durations, driver pipeline stalls, thermal behavior and phone FPS are unmeasured.','Production player/boss geometry, all vertex attributes, skeletons, morph targets and encounter preparation/animation are used; downloaded model textures are omitted and replaced with opaque unlit PBR paint.','This test can exclude repeated SDK effect-cache requests and missing tested geometry/opacity variants; it cannot exclude GPU driver first-use costs or rendering work from the full map.']},null,2)+'\n');
});
