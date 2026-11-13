import fs from 'node:fs';
import {Vector3,StandardMaterial,TransformNode} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {readRuntimeGltf} from './read-runtime-gltf.js';
import {wolfHuntFixture} from './wolf-hunt-fixture.js';
import {CharacterAnimator} from '../../src/animation.js';
import {WarriorV2Controller} from '../../src/warrior-v2.js';
import {configurePlayerSize,playerDimensions} from '../../src/player-dimensions.js';
import {orderPoseNodes,refreshPoseMatrices} from '../../src/pose-matrices.js';
import {dodgeDistanceAt} from '../../src/dodge.js';
import {setWorldCharacter,ARENA_RADIUS} from '../../src/world-limits.js';
import {villageTravelLimit,clampVillageExit} from '../../src/map-travel.js';

// The same real warrior asset, 1.6 m scaling, controller, native animator and
// after-animation contact ordering as main.js. No standing capsule replaces
// the player skeleton. Replacement materials are CPU-test-only.
export async function wolfRamFixture(t){
 const f=await wolfHuntFixture();
 const base=new URL('../../public/assets/',import.meta.url);
 const config=JSON.parse(fs.readFileSync(new URL('warrior-v2.json',base)));
 const decoded=await readRuntimeGltf(new URL(config.model,base)),gltf=structuredClone(decoded.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression'&&x!=='KHR_texture_basisu');
 for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+decoded.files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;
 const playerAsset=await loader.loadAssetContainerAsync(f.scene,{json:gltf},'');playerAsset.addAllToScene();
 for(const group of playerAsset.animationGroups)group.stop();
 let impactCarrier=null,modelParent=f.player;
 if(f.world.release==='moonforest-0.2'){
  impactCarrier=new TransformNode('player-v02-impact-carrier',f.scene);impactCarrier.parent=f.player;modelParent=impactCarrier;
  f.player.metadata={...f.player.metadata,moonforestV02ImpactCarrier:impactCarrier};
 }
 for(const node of new Set([...playerAsset.meshes,...playerAsset.transformNodes]))if(!node.parent)node.parent=modelParent;
 const dimensions=configurePlayerSize(f.player,config,{warrior:true});f.player.rotation.y=Math.PI;
 const paint=new StandardMaterial('ram-warrior-test-paint',f.scene);
 for(const mesh of playerAsset.meshes)if(mesh.getTotalVertices()){mesh.material=paint;mesh.alwaysSelectAsActiveMesh=true;if(mesh.skeleton){mesh.numBoneInfluencers=mesh.isVerticesDataPresent('matricesWeightsExtra')?8:4;mesh.skeleton.useTextureToStoreBoneMatrices=true;mesh.computeBonesUsingShaders=true;}}
 const speeds=Object.fromEntries(Object.entries(config.speeds??{}).map(([key,value])=>[key,value*dimensions.ratio]));
 let animator=new CharacterAnimator(playerAsset.animationGroups,config.animations,{bindingCacheSize:2});
 let controller=new WarriorV2Controller({durations:animator.durations,speeds});
 const playerNodes=Object.fromEntries(playerAsset.transformNodes.map(node=>[node.name,node]));f.battle.playerNodes=playerNodes;
 const poseNodes=orderPoseNodes([f.player,...playerAsset.transformNodes,...playerAsset.meshes]);
 let elapsed=0,result={state:'idle',clipTime:0,loop:true},contactStop=0,renderContacts=false;
 const rollDirection=new Vector3(1,0,0);
 const reactions=[],damages=[];
 const constrainPlayerPosition=previous=>{
  const limit=f.world.mapId==='village'?villageTravelLimit(previous,ARENA_RADIUS):ARENA_RADIUS;
  f.world.navigation?.constrain(f.player.position,previous,playerDimensions(f.player).moveRadius,limit);
  if(f.world.mapId==='village')clampVillageExit(f.player.position,previous);
 };
 const receivePlayerHit=(duration,options={})=>{
  const accepted='captured' in options?(options.captured?(controller.capture(),true):(controller.releaseCapture(),true)):
   options.knockdown?controller.knockdown(options):controller.hit(duration,options);
  reactions.push({time:elapsed,duration,options:{...options},accepted,state:controller.state,clipTime:controller.action?.time??controller.time});return accepted;
 };f.battle.onPlayerHit=receivePlayerHit;
 const receiveDamage=(...args)=>damages.push({time:elapsed,args});f.battle.onDamage=receiveDamage;
 const observer=f.scene.onAfterAnimationsObservable.add(()=>{
  refreshPoseMatrices(poseNodes);
  if(renderContacts){contactStop=f.battle.poseAndContacts(f.player,result,null,playerNodes.Bunnyguard_Shield);controller.pauseOnImpact(contactStop||0);}
 });
 animator.transition('idle',result);animator.update(0);f.scene.render();
 const api={f,get controller(){return controller;},get animator(){return animator;},playerAsset,playerNodes,config,playerGltf:decoded.gltf,reactions,damages,impactCarrier,constrainPlayerPosition,nativeImpactPrelude:true,
  get elapsed(){return elapsed;},get result(){return result;},
  resetPlayer(){
   setWorldCharacter('warrior-plains');
   f.battle.hide();for(const encounter of f.battle.wolfPool)if(Object.hasOwn(encounter,'poseAndContacts'))delete encounter.poseAndContacts;
   animator.dispose();animator=new CharacterAnimator(playerAsset.animationGroups,config.animations,{bindingCacheSize:2});controller=new WarriorV2Controller({durations:animator.durations,speeds});
   elapsed=0;result={state:'idle',clipTime:0,loop:true};reactions.length=0;damages.length=0;renderContacts=false;
   f.battle.playerNodes=playerNodes;f.battle.onPlayerHit=receivePlayerHit;f.battle.onDamage=receiveDamage;f.battle.combat.reset();
   animator.transition('idle',result);animator.update(0);f.scene.render();
  },
  dodge(direction=Vector3.Right()){rollDirection.copyFrom(direction).normalize();return controller.dodge();},
  step(dt,input={x:0,y:0}){
   elapsed+=dt;const beforeRecoil=f.player.position.clone(),recoiled=f.battle.playerReaction.update(dt,f.player);
   if(recoiled)constrainPlayerPosition(beforeRecoil);
   f.battle.combat.v02Impact?.advance(dt,f.player,constrainPlayerPosition);
   result=controller.update(dt,{x:0,y:0,...input,alive:f.battle.playerAlive});
   if(result.rollFrom!=null){const distance=(dodgeDistanceAt(result.rollTo,config.dodge)-dodgeDistanceAt(result.rollFrom,config.dodge))*dimensions.ratio;f.player.position.addInPlace(rollDirection.scale(distance));}
   animator.transition(result.state,result);animator.update(result.captured||result.staggered||result.hitStopped?0:dt);
   // Tests with movement supply a world direction explicitly; stationary game
   // knockdown is unaffected. Ground anchor remains independent of pose roots.
   if(result.moving){const length=Math.hypot(input.x||0,input.y||0);if(length){f.player.position.x+=(input.x||0)/length*result.speed*(result.movementDt??dt);f.player.position.z+=(input.y||0)/length*result.speed*(result.movementDt??dt);}}
   if(!result.captured&&!f.battle.grab.active)f.world.terrain.place(f.player.position);
   f.battle.update(dt,f.player);renderContacts=true;f.scene.render();renderContacts=false;return result;
  },
  bodyPoints(){return Object.fromEntries(['Hips','Spine','Spine1','Spine2','Neck','Head'].map(name=>[name,playerNodes['mixamorig:'+name].getAbsolutePosition().asArray()]));},
  torsoSkin(){
   const names=new Set(['mixamorig:Hips','mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2']);
   const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity],sum=[0,0,0],point=new Vector3();let count=0;
   for(const mesh of playerAsset.meshes){
    if(!mesh.name.startsWith('Warrior_Body')||mesh.name.includes('Outline')||!mesh.skeleton||!mesh.getTotalVertices())continue;
    mesh.skeleton.prepare(true);const positions=mesh.getPositionData(true,true),indices=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights'),extraIndices=mesh.getVerticesData('matricesIndicesExtra'),extraWeights=mesh.getVerticesData('matricesWeightsExtra'),world=mesh.getWorldMatrix();
    for(let vertex=0;vertex<positions.length/3;vertex++){
     let influence=0;for(let slot=0;slot<4;slot++){const i=vertex*4+slot;if(names.has(mesh.skeleton.bones[indices[i]]?.name))influence+=weights[i];if(extraIndices&&names.has(mesh.skeleton.bones[extraIndices[i]]?.name))influence+=extraWeights[i];}
     if(influence<.5)continue;
     Vector3.TransformCoordinatesFromFloatsToRef(positions[vertex*3],positions[vertex*3+1],positions[vertex*3+2],world,point);
     const values=point.asArray();for(let k=0;k<3;k++){low[k]=Math.min(low[k],values[k]);high[k]=Math.max(high[k],values[k]);sum[k]+=values[k];}count++;
    }
   }
   return {count,low,high,centroid:sum.map(value=>value/count)};
  },
  async dispose(){f.battle.combat.v02Impact?.reset();f.scene.onAfterAnimationsObservable.remove(observer);animator.dispose();playerAsset.dispose();loader.dispose();await f.dispose();}
 };
 if(t)t.after(()=>api.dispose());return api;
}
