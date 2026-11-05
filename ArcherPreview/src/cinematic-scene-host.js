import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {createActorEncounterFactory} from './actor-encounter-adapter.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import {ASSET_CATALOG} from './asset-catalog.js';
import {createBossPreparation,bossPreparationCancelled} from './boss-preparation.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {orderPoseNodes,refreshPoseMatrices} from './pose-matrices.js';
import {AuthoredPlacementRuntime} from './authored-placement-runtime.js';
import {createEmptyPlacementDocument,placementCatalogAsset} from './placement-document.js';
import {evaluateCinematic,cinematicBackgroundAt} from './cinematic-document.js';
import {deathHaloAdvance} from './mourning-motion-v2.js';
import {getCinematicDefinitions,cinematicStaticCatalog,cinematicStaticManifest} from './cinematic-assets.js';
import {createCinematicVisualFactory} from './cinematic-visual-adapter.js';
import {readMapManifest} from './map-manifests.js';
import {getNpcCatalog} from './npc-library.js';

const MAX_ACTORS=20,MAX_BYTES=512*1024*1024;
const copy=value=>value?.clone?.()??value;
const sameArray=(a,b,tolerance=1e-5)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<tolerance);
const snapshot=world=>({scene:world.scene,mapId:world.mapId,ground:world.ground,generation:world.toolGeneration??0});
const sameWorld=(world,saved)=>world.scene===saved.scene&&world.mapId===saved.mapId&&world.ground===saved.ground&&(world.toolGeneration??0)===saved.generation&&!saved.scene.isDisposed;
const definitionAt=(definitions,id)=>definitions instanceof Map?definitions.get(id):definitions[id];
const allRecords=world=>[...new Set([...(world.authoredPlacementRecords??[]),...(world.villageRenderRecords??[])])].filter(record=>!record.authoredSuppressed&&!record.root?.isDisposed());
function existingRow(world,catalog,record){
 const assetId=record.instance?.assetId??record.placement?.asset,entries=catalog.entries.filter(entry=>entry.assetId===assetId&&(!record.instance||entry.version===record.instance.assetVersion)),entry=record.entry?.catalog??entries.find(entry=>entry.usedMaps?.includes(world.mapId))??(entries.length===1?entries[0]:null);
 if(!entry||entry.geometry?.skinned||entry.geometry?.clips||record.meshes?.some(mesh=>mesh.skeleton||mesh.morphTargetManager)||!record.root)return null;
 const root=record.root;root.computeWorldMatrix(true);const bounds=root.getHierarchyBoundingVectors(),scale=record.instance?.transform.scale??record.placement?.scale??(root.scaling.x/(entry.units?.metersPerSourceUnit??1));
 return {instanceId:record.instance?.instanceId??record.placement?.id,assetId,assetVersion:entry.version,mapId:world.mapId,position:root.getAbsolutePosition().asArray(),rotation:(root.absoluteRotationQuaternion??root.rotationQuaternion??Quaternion.FromEulerVector(root.rotation)).asArray(),scale,root,meshes:record.meshes??root.getChildMeshes(),min:bounds.min,max:bounds.max,record};
}
const publicExisting=({instanceId,assetId,assetVersion,mapId,position,rotation,scale})=>({instanceId,assetId,assetVersion,mapId,position,rotation,scale});
function borrowExisting(world,row){
 const root=row.root,enabledDescriptor=Object.getOwnPropertyDescriptor(root,'setEnabled'),nativeEnabled=root.setEnabled,nodes=[root,...root.getDescendants()],flags=['alwaysSelectAsActiveMesh','isVisible','visibility','isPickable','showBoundingBox','layerMask','renderingGroupId','receiveShadows'];
 const saved=nodes.map(node=>({node,position:node.position?.clone(),rotation:node.rotation?.clone(),quaternion:node.rotationQuaternion,quaternionValue:node.rotationQuaternion?.clone(),scaling:node.scaling?.clone(),matrix:node.getWorldMatrix().clone(),matrixObject:node.getWorldMatrix(),frozen:node.isWorldMatrixFrozen,enabled:node.isEnabled(false),flags:Object.fromEntries(flags.filter(key=>key in node).map(key=>[key,node[key]])),buffers:node.instancedBuffers?Object.fromEntries(Object.entries(node.instancedBuffers).map(([key,value])=>[key,copy(value)])):null}));
 const recordFlags=Object.fromEntries(['cellActive','occluded','fogVisible','fogOwner','fogRevision','shadowCaster'].map(key=>[key,Object.getOwnPropertyDescriptor(row.record,key)])),shadowList=world.shadows?.getShadowMap?.()?.renderList,shadowIndices=new Map(row.meshes.map(mesh=>[mesh,shadowList?.indexOf(mesh)??-1])),state={kind:'bound',record:row.record,row,visible:false,scale:row.scale,baseScale:root.absoluteScaling.clone().scale(1/row.scale),restored:false};
 root.setEnabled=function(){return nativeEnabled.call(this,state.visible);};
 state.apply=actor=>{state.visible=actor.visible!==false;state.pose={position:[...actor.position],rotation:[...actor.rotation],scale:actor.scale};for(const node of nodes)node.unfreezeWorldMatrix?.();const matrix=Matrix.Compose(state.baseScale.scale(actor.scale),Quaternion.FromArray(actor.rotation),Vector3.FromArray(actor.position)),local=root.parent?matrix.multiply(root.parent.getWorldMatrix().clone().invert()):matrix;root.rotationQuaternion??=Quaternion.Identity();local.decompose(root.scaling,root.rotationQuaternion,root.position);root.freezeWorldMatrix(matrix);root.setEnabled(state.visible);for(const node of nodes.slice(1))node.computeWorldMatrix?.(true);for(const mesh of row.meshes){mesh.alwaysSelectAsActiveMesh=true;if(state.visible)world.shadows?.addShadowCaster(mesh,false);else world.shadows?.removeShadowCaster(mesh,false);}};
 state.restore=()=>{if(state.restored)return;state.restored=true;if(root.isDisposed()||world.scene!==root.getScene()||root.getScene().isDisposed)return;if(enabledDescriptor)Object.defineProperty(root,'setEnabled',enabledDescriptor);else delete root.setEnabled;
  for(const entry of saved){const node=entry.node;if(node.isDisposed())continue;node.unfreezeWorldMatrix?.();if(entry.position)node.position.copyFrom(entry.position);if(entry.rotation)node.rotation.copyFrom(entry.rotation);node.rotationQuaternion=entry.quaternion;if(entry.quaternion)entry.quaternion.copyFrom(entry.quaternionValue);if(entry.scaling)node.scaling.copyFrom(entry.scaling);Object.assign(node,entry.flags);node.setEnabled(entry.enabled);if(entry.buffers)for(const [key,value]of Object.entries(entry.buffers)){if(node.instancedBuffers[key]?.copyFrom&&value)node.instancedBuffers[key].copyFrom(value);else node.instancedBuffers[key]=copy(value);}node.computeWorldMatrix?.(true);entry.matrixObject.copyFrom(entry.matrix);node.freezeWorldMatrix(entry.matrixObject);if(!entry.frozen)node.unfreezeWorldMatrix();entry.matrixObject.copyFrom(entry.matrix);}
  for(const [key,descriptor]of Object.entries(recordFlags))if(descriptor)Object.defineProperty(row.record,key,descriptor);else delete row.record[key];
  if(shadowList){for(const mesh of row.meshes){let index;while((index=shadowList.indexOf(mesh))>=0)shadowList.splice(index,1);}for(const [mesh,index]of [...shadowIndices].filter(([,index])=>index>=0).sort((a,b)=>a[1]-b[1]))shadowList.splice(Math.min(index,shadowList.length),0,mesh);}
  if(world.villageVisibility){world.villageVisibility.timer=0;world.villageVisibility.shadowTimer=0;}if(world.villageOutlines)world.villageOutlines.next=0;
 };
 return state;
}

function assign(binding,value){
 if(typeof value==='number')binding.target[binding.property]=value;
 else if(binding.target[binding.property]?.copyFrom)binding.target[binding.property].copyFrom(value);
 else binding.target[binding.property]=copy(value);
 binding.target.markAsDirty?.();
}
// Public Babylon Animation.evaluate reads the authored interpolation directly.
// No AnimationGroup wall clock or late-animation queue survives a seek. The
// same absolute adapter is used for editor scrubbing and in-game playback.
export function createCinematicPoseSampler(encounter){
 const asset=encounter.asset,groups=new Map(asset.animationGroups.map(group=>[group.name,group])),bindings=[],byTarget=new Map(),animator=encounter.animator;
 const defaultClip=encounter.config.animations?.idle??groups.keys().next().value;
 for(const [clipId,group]of groups)for(const {target,animation}of group.targetedAnimations){
  const property=animation.targetProperty;
  if(!['position','rotationQuaternion','scaling','influence'].includes(property))throw new Error('Unsupported cinematic animation channel: '+property);
  let properties=byTarget.get(target);if(!properties){properties=new Map();byTarget.set(target,properties);}
  let binding=properties.get(property);
  if(!binding){const rest=copy(target[property]);binding={target,property,rest,scratch:copy(rest),clips:new Map()};properties.set(property,binding);bindings.push(binding);}
  binding.clips.set(clipId,{animation,group});
 }
 for(const group of groups.values())group.stop();
 const poseNodes=orderPoseNodes([...asset.transformNodes,...asset.meshes]);
 const mourning=!!animator?.deathChannels&&!!animator?.applyCloth;
 const stateByClip=new Map(Object.entries(encounter.config.animations??{}).map(([state,name])=>[name,state]));
 // Reuse the approved Mourning channel corrections, including knee tracks,
 // rather than substituting uncorrected raw GLTF channels for that rig.
 if(mourning){
  for(const channel of animator.deathChannels){const binding=byTarget.get(channel.target)?.get(channel.property);if(binding)binding.clips.set(encounter.config.animations.dead,{track:channel.track});}
 }
 function groundAt(clipId,time){const clip=encounter.config.catalog?.find(row=>row.name===clipId),track=clip?.groundTrack;if(!track?.length)return .075;const frame=Math.max(0,Math.min(track.length-1,time*(clip.fps??30))),i=Math.floor(frame);return track[i]+(track[Math.min(i+1,track.length-1)]-track[i])*(frame-i);}
 return {
  defaultClip,bindings:bindings.length,
  sample(input,time=0){
   const inPlaceNpc=encounter.config.npc?.rootMotion==='in-place'&&encounter.npcCarrier&&encounter.npcMotionRoot&&encounter.npcMotionAnchor;if(inPlaceNpc)encounter.npcCarrier.position.copyFrom(encounter.npcCarrierOrigin);
   const active=input?.filter(item=>item.weight>0)??[],animations=active.length?active:defaultClip?[{clipId:defaultClip,time:0,weight:1}]:[],poseTime=active.length?time:0;
   for(const item of animations)if(!groups.has(item.clipId))throw new Error('Cinematic clip is not prepared: '+item.clipId);
   for(const binding of bindings){
    // evaluate() may reuse its internal work value. Consume each sample into
    // the binding scratch before evaluating the same track again.
    let total=0,out=binding.scratch;
    for(const item of animations){
     const channel=binding.clips.get(item.clipId),value=channel?.track?channel.track.sample(item.time):channel?channel.animation.evaluate(Math.max(channel.group.from,Math.min(channel.group.to,channel.group.from+item.time*channel.animation.framePerSecond))):binding.rest,weight=item.weight;
     if(!total){if(typeof value==='number')out=value;else out.copyFrom(value);}
     else if(typeof value==='number')out+=(value-out)*weight/(total+weight);
     else if(binding.property==='rotationQuaternion')Quaternion.SlerpToRef(out,value,weight/(total+weight),out);
     else Vector3.LerpToRef(out,value,weight/(total+weight),out);
     total+=weight;
    }
    assign(binding,out);
   }
   if(inPlaceNpc){encounter.actor.computeWorldMatrix(true);encounter.npcCarrier.computeWorldMatrix(true);refreshPoseMatrices(poseNodes);const relative=Vector3.TransformCoordinates(encounter.npcMotionRoot.getAbsolutePosition(),encounter.actor.getWorldMatrix().clone().invert());encounter.npcCarrier.position.x-=relative.x-encounter.npcMotionAnchor.x;encounter.npcCarrier.position.z-=relative.z-encounter.npcMotionAnchor.z;encounter.npcCarrier.computeWorldMatrix(true);}
   if(mourning){
    const weights={walk:0,cast:0,idle:0,hit:0};let death=null,cast=null;
    Object.assign(animator,{walkTime:0,hairTime:0,idleTime:0,castTime:0,hitTime:0,deathTime:0,breathClock:poseTime,haloTime:poseTime%48,gaitBlend:0,hitPulseWeight:0,hitPulseTime:1,clothInitialized:false,deathStarted:false});
    for(const item of animations){const state=stateByClip.get(item.clipId);if(state==='dead'){death=item;continue;}if(state?.startsWith('cast')){weights.cast+=item.weight;cast=item;animator.castTime=item.time;animator.castVariant=state;}else if(state in weights){weights[state]+=item.weight;animator[state+'Time']=item.time;if(state==='walk')animator.hairTime=item.time;}}
    animator.weights=weights;animator.gaitBlend=weights.walk;animator.current=death?'dead':cast?'cast':weights.walk?'walk':'idle';animator.deathStarted=!!death;animator.deathTime=death?.time??0;
    if(death)animator.haloTime=deathHaloAdvance(0,death.time)%48;
    for(const channel of animator.halo)channel.target[channel.property].copyFrom(channel.track.sample(animator.haloTime));
    animator.applyMorphs(!!cast,!!death);encounter.alignPose();animator.refreshPose();animator.applyCloth(0);animator.cachePoseRoots();
   }else if(encounter.carrier&&encounter.nodes?.['mixamorig:Hips']){
    encounter.carrier.position.setAll(0);encounter.actor.computeWorldMatrix(true);encounter.carrier.computeWorldMatrix(true);
    const hip=encounter.nodes['mixamorig:Hips'];hip.computeWorldMatrix(true);
    const relative=Vector3.TransformCoordinates(hip.getAbsolutePosition(),encounter.actor.getWorldMatrix().clone().invert()),weight=animations.reduce((sum,item)=>sum+item.weight,0),ground=animations.reduce((sum,item)=>sum+groundAt(item.clipId,item.time)*item.weight,0)/weight;
    encounter.carrier.position.set(-relative.x,ground,-relative.z);
   }
   if(!mourning)refreshPoseMatrices(poseNodes);
   // A second explicit seek can change the pose within the same render ID.
   // The public force flag refreshes that palette; the subsequent scene draw
   // then reuses it instead of skinning with a previous seek's cached matrices.
   for(const skeleton of asset.skeletons??[])skeleton.prepare(true);
  },
 };
}

export function createCinematicSceneHost({world,getPlayer=()=>null,battle,catalog=ASSET_CATALOG,actorDefinitions=getCinematicDefinitions(catalog),actorFactory,createActorFactory=createActorEncounterFactory,libraryFactory,createVisualFactory=createCinematicVisualFactory,visualOptions={},createPlacementRuntime=(target,options)=>new AuthoredPlacementRuntime(target,options),placementOptions={},acquireToolLease=options=>world.acquireToolLease(options),getState=()=>({}),onSubtitles=()=>{},onMarker=()=>{},audioIds=[],audioEnabled=false,preparationOptions={},limits={},now=()=>performance.now()}={}){
 if(!world?.scene)throw new TypeError('Cinematic host requires the existing world scene');
 const pool=new Map(),sessions=new Map(),retirements=new Set(),factories=new Set();let callbacks={},active=null,factory=actorFactory,factoryScene=world.scene,visualFactory=null,visualScene=null,disposed=false,playbackState='idle';
 const caps={actors:Math.min(MAX_ACTORS,limits.actors??MAX_ACTORS),estimatedBytes:Math.min(MAX_BYTES,limits.estimatedBytes??MAX_BYTES),idleSeconds:limits.idleSeconds??30};
 const stats={acquired:0,prepared:0,samples:0,released:0,actorsCreated:0,actorsReused:0,actorsRetired:0,audioCues:0,markers:0,cleanupErrors:0};
 const attempt=work=>{try{return work();}catch{stats.cleanupErrors++;}};
 const knownAudio=new Set(audioIds);
 const bytes=()=>[...pool.values()].reduce((sum,slot)=>sum+slot.estimatedBytes,0);
 const current=session=>!disposed&&!session.released&&!session.controller.signal.aborted&&!session.signal?.aborted&&session.isCurrent()&&sameWorld(world,session.world)&&session.lease?.isCurrent()&&!getState().dead&&!getState().failed;
 const check=session=>{if(!current(session))throw bossPreparationCancelled();};
 function retire(slot){
  if(slot.retiring)return slot.retirement;slot.retiring=true;slot.busy=false;slot.preparation?.cancel();
  let disposal;try{if(slot.adapter&&!slot.adapter.then){slot.adapter.hide?.();disposal=slot.adapter.dispose?.();}}catch{}
  const pending=[slot.pendingCreate,slot.warmPromise,disposal].filter(Boolean);
  const retirement=Promise.allSettled(pending).then(async()=>{try{await slot.adapter?.dispose?.();}finally{if(pool.get(slot.key)===slot)pool.delete(slot.key);stats.actorsRetired++;}});slot.retirement=retirement;retirements.add(retirement);retirement.then(()=>retirements.delete(retirement),()=>retirements.delete(retirement));return retirement;
 }
 function evict(protectedKeys=new Set()){
  for(const slot of pool.values())if(!slot.busy&&!slot.retiring&&(!sameWorld(world,slot.world)||!protectedKeys.has(slot.key)&&now()-slot.lastUsed>=caps.idleSeconds*1000))retire(slot);
 }
 function getFactory(definition){
  if(definition.cinematic){if(!visualFactory||visualScene!==world.scene){visualFactory?.dispose();visualFactory=createVisualFactory({world,catalog,...visualOptions});visualScene=world.scene;factories.add(visualFactory);}return visualFactory;}
  if(!factory||factoryScene!==world.scene){if(factory&&!actorFactory)factory.dispose?.();if(!battle&&!actorFactory)throw new Error('Cinematic actors require the existing battle adapter');factory=createActorFactory({world,battle,getPlayer,libraryFactory,rewardsEnabled:false});factoryScene=world.scene;if(!actorFactory)factories.add(factory);}
  return factory;
 }
 async function slotFor(definition,key,protectedKeys,session){
  let slot=pool.get(key);
  while(slot&&(slot.retiring||!sameWorld(world,slot.world))){
   await session.lifetime.wait(slot.retiring?slot.retirement:retire(slot));check(session);slot=pool.get(key);
  }
  if(slot){stats.actorsReused++;slot.busy=true;session.slots.push(slot);return slot;}
  const estimate=definition.population?.estimatedBytes??16*1024*1024;
  if(pool.size>=caps.actors||bytes()+estimate>caps.estimatedBytes){
   const retired=[...pool.values()].filter(item=>item.retiring).map(item=>item.retirement);for(const idle of [...pool.values()].filter(item=>!item.busy&&!item.retiring&&!protectedKeys.has(item.key)).sort((a,b)=>a.lastUsed-b.lastUsed))retired.push(retire(idle));
   await session.lifetime.wait(Promise.allSettled(retired));check(session);
  }
  if(pool.size>=caps.actors||bytes()+estimate>caps.estimatedBytes)throw new Error('Cinematic actor count/estimated-memory cap reached; no actor count was reduced');
  slot={key,definition,world:snapshot(world),estimatedBytes:estimate,busy:true,warmed:false,retiring:false,lastUsed:now(),adapter:null};pool.set(key,slot);session.slots.push(slot);
  const ownerCurrent=()=>!disposed&&!slot.retiring&&sameWorld(world,slot.world);
  let created;try{created=getFactory(definition)(definition,{generation:slot.world.generation,isCurrent:ownerCurrent});}catch(error){pool.delete(key);session.slots.splice(session.slots.indexOf(slot),1);throw error;}
  slot.pendingCreate=Promise.resolve(created).then(async adapter=>{slot.adapter=adapter;if(slot.retiring)await adapter.dispose();return adapter;});slot.pendingCreate.catch(()=>{});stats.actorsCreated++;return slot;
 }
 function restoreLimits(session){
  if(session.limitsRestored||!session.cameraLimits||!sameWorld(world,session.world))return;session.limitsRestored=true;Object.assign(world.camera,session.cameraLimits);
 }
 const host={
  getMapId(){return world.mapId;},getWorld(){return world;},
  getExistingHandles({renderHandles=false}={}){return allRecords(world).map(record=>existingRow(world,catalog,record)).filter(Boolean).map(row=>renderHandles?row:publicExisting(row));},
  setCallbacks(value){callbacks={...callbacks,...value};},
  setPlaybackState(state){
   playbackState=state;const session=active;if(!session||!current(session))return;
   const canvas=world.scene.getEngine().getRenderingCanvas?.();
   if(state==='playing'){world.camera.movement?.resetPanVelocity?.();world.camera.movement?.resetRotationVelocity?.();world.camera.movement?.resetZoomVelocity?.();world.camera.detachControl?.();}else if(canvas){if(session.lease.attachCamera)session.lease.attachCamera();else world.camera.attachControl?.(canvas,true);}
  },
  getActorHandles(){
   const session=active;if(!session||!current(session)||!session.prepared)return [];
   return [...session.prepared.actors].map(([actorId,target])=>{
    const record=target.kind==='static'?session.prepared.staticRuntime.records.get(target.instanceId):target.kind==='bound'?target.record:null,root=target.kind==='animated'?target.slot.adapter.encounter.actor:record?.root;
    if(!root||target.visible===false||!root.isEnabled())return null;root.computeWorldMatrix(true);const meshes=root.getChildMeshes?.().filter(mesh=>mesh.getTotalVertices()>0)??[],bounds=root.getHierarchyBoundingVectors(),scale=target.kind==='animated'?root.scaling.x/target.slot.baseScale.x:target.kind==='bound'?root.scaling.x/target.baseScale.x:record?.instance?.transform.scale??target.scale??1;
    return {actorId,root,meshes,min:bounds.min,max:bounds.max,readOnly:false,...(target.kind==='bound'?target.pose:{position:root.position.asArray(),rotation:(root.rotationQuaternion??Quaternion.FromEulerVector(root.rotation)).asArray(),scale})};
   }).filter(Boolean);
  },
  previewActorTransform(actorId,{position,rotation,scale}){
   if(!Array.isArray(position)||position.length!==3||!position.every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)||!Array.isArray(rotation)||rotation.length!==4||!rotation.every(Number.isFinite)||Math.abs(Math.hypot(...rotation)-1)>.01||!Number.isFinite(scale)||scale<.05||scale>20)throw new Error('유효한 위치·회전·크기를 사용하세요.');
   const session=active;if(!session||!current(session))throw bossPreparationCancelled();const target=session.prepared?.actors.get(actorId);if(!target)throw new Error('이 대상은 위치를 바꿀 수 없습니다.');
   if(target.kind==='bound'){target.apply({position,rotation,scale,visible:target.visible});return true;}
   if(target.kind==='static')session.prepared.staticRuntime.sampleFreeTransforms([{instanceId:target.instanceId,position,rotation,scale}]);
   else{const root=target.slot.adapter.encounter.actor;root.position.copyFromFloats(...position);root.rotationQuaternion??=Quaternion.Identity();root.rotationQuaternion.copyFromFloats(...rotation);root.scaling.copyFrom(target.slot.baseScale).scaleInPlace(scale);root.computeWorldMatrix(true);for(const node of root.getDescendants())node.computeWorldMatrix?.(true);for(const skeleton of target.slot.adapter.encounter.asset.skeletons??[])skeleton.prepare(true);}
   return true;
  },
  getLiveLease(){return active&&!active.released?active.lease:null;},
  captureCamera(){world.camera.getViewMatrix();return {position:world.camera.position.asArray(),target:world.camera.getTarget().asArray(),fov:world.camera.fov};},
  async acquire(document,{token,signal,isCurrent=()=>true,time=0,mapId}={}){
   if(disposed)throw bossPreparationCancelled();if(active&&!active.released)throw new Error('Cinematic host already owns a scene lease');
   if((mapId??cinematicBackgroundAt(document,time).mapId)!==world.mapId)throw new Error('Load the selected cinematic map before acquiring its scene');
   evict();
   const session={token,signal,isCurrent,world:snapshot(world),preparationTime:time,controller:new AbortController(),lease:null,slots:[],released:false,staticRuntime:null,prepared:null};sessions.set(token,session);active=session;
   session.abort=()=>session.controller.abort(signal.reason??bossPreparationCancelled());signal?.addEventListener('abort',session.abort,{once:true});if(signal?.aborted)session.abort();
   try{
    session.lease=await acquireToolLease({owner:'cinematic-'+(token?.id??'preview'),hideHud:true,freeCamera:true,audioEnabled,
     onFrame:dt=>{if(current(session))callbacks.onFrame?.(dt);},onPause:value=>{host.stopAudio({token,lease:session.lease});callbacks.onPause?.(value);},
     onCancel:reason=>{session.controller.abort(bossPreparationCancelled());void host.release({token,lease:session.lease,prepared:session.prepared,reason,restore:false});callbacks.onCancel?.(reason);},
    });
    check(session);const camera=world.camera;session.cameraLimits={lowerAlphaLimit:camera.lowerAlphaLimit,upperAlphaLimit:camera.upperAlphaLimit,lowerBetaLimit:camera.lowerBetaLimit,upperBetaLimit:camera.upperBetaLimit,lowerRadiusLimit:camera.lowerRadiusLimit,upperRadiusLimit:camera.upperRadiusLimit};
    for(const key of Object.keys(session.cameraLimits))camera[key]=null;stats.acquired++;return session.lease;
   }catch(error){await host.release({token,lease:session.lease,reason:'acquire-error'});throw error;}
  },
  async prepare(document,{token,signal,isCurrent,lease,time}={}){
   const session=sessions.get(token);if(!session||session.lease!==lease)throw bossPreparationCancelled();check(session);
   const lifetime=new MapLoadLifetime({signal:session.controller.signal,stage:'cinematic-preparation'}),preparation=createBossPreparation({...preparationOptions,isCurrent:()=>current(session)});session.lifetime=lifetime;session.preparation=preparation;
   const cancel=()=>preparation.cancel(session.controller.signal.reason??bossPreparationCancelled());session.controller.signal.addEventListener('abort',cancel,{once:true});
   const prepared={actors:new Map(),staticRuntime:null,document,world:session.world};session.prepared=prepared;
   try{
    if(document.actors.length>caps.actors)throw new Error('Cinematic actor count cap reached');
    const dynamicDefinitions={...getCinematicDefinitions(getNpcCatalog(catalog)),...(actorDefinitions instanceof Map?Object.fromEntries(actorDefinitions):actorDefinitions)},counts=new Map(),plan=document.actors.map(actor=>{if(!actor.actorDefinitionId)return {actor};const definition=definitionAt(dynamicDefinitions,actor.actorDefinitionId);if(!definition||definition.assetId!==actor.assetId||definition.assetVersion!==actor.assetVersion)throw new Error('Cinematic actor definition/version conflict');const count=(counts.get(actor.actorDefinitionId)??0)+1;counts.set(actor.actorDefinitionId,count);if(count>(definition.population?.maxPooled??caps.actors))throw new Error('Cinematic per-definition actor cap reached');return {actor,definition,key:actor.actorDefinitionId+'#'+count};});
    const protectedKeys=new Set(plan.filter(item=>item.key).map(item=>item.key));evict(protectedKeys);const frame=evaluateCinematic(document,time??session.preparationTime),staticActors=[];
    for(const {actor,definition,key}of plan){
     check(session);const initial=frame.actors.find(item=>item.actorId===actor.actorId);
     if(actor.instanceId){
      if((actor.mapId??document.mapId)!==world.mapId)continue;
      const record=[...(world.authoredPlacementRecords??[]),...(world.villageRenderRecords??[])].find(item=>!item.authoredSuppressed&&(item.placement?.id??item.instanceId)===actor.instanceId);
      if(!record)throw new Error('Bound existing instance is not loaded');
      if((record.instance?.assetId??record.placement?.asset)!==actor.assetId||record.instance&&record.instance.assetVersion!==actor.assetVersion)throw new Error('Bound instance asset identity differs from the cinematic reference');
      const row=existingRow(world,catalog,record);if(!row||row.assetId!==actor.assetId||row.assetVersion!==actor.assetVersion)throw new Error('Bound instance asset identity differs from the cinematic reference');if([...prepared.actors.values()].some(target=>target.record===record))throw new Error('Existing instance cannot be borrowed twice');
      prepared.actors.set(actor.actorId,borrowExisting(world,row));continue;
     }
     if(!definition||definition.cinematicStatic){placementCatalogAsset(catalog,actor.assetId,actor.assetVersion);staticActors.push({actor,initial});continue;}
     const slot=await slotFor(definition,key,protectedKeys,session);check(session);slot.preparation=preparation;
     const adapter=await lifetime.wait(slot.pendingCreate);check(session);
     if(!slot.warmed){slot.warmPromise=adapter.warm({preparation,isCurrent:()=>current(session)});await lifetime.wait(slot.warmPromise);preparation.check();slot.warmed=true;slot.baseScale=adapter.encounter.actor.scaling.clone();slot.sampler=createCinematicPoseSampler(adapter.encounter);slot.estimatedBytes=adapter.estimate?.().estimatedBytes??slot.estimatedBytes;if(bytes()>caps.estimatedBytes)throw new Error('Prepared cinematic actors exceed the estimated-memory cap');}
     prepared.actors.set(actor.actorId,{kind:'animated',slot});
    }
    if(staticActors.length){
     const readManifest=placementOptions.readManifest??readMapManifest,runtime=createPlacementRuntime(world,{...placementOptions,readManifest:async url=>cinematicStaticManifest(await readManifest(url),url),catalog:cinematicStaticCatalog(catalog),publish:false});session.staticRuntime=runtime;prepared.staticRuntime=runtime;
     const instances=staticActors.map(({actor,initial})=>({instanceId:'cinematic-'+(token?.id??'preview')+'-'+actor.actorId,assetId:actor.assetId,assetVersion:actor.assetVersion,transform:{position:initial.position,rotation:initial.rotation,scale:initial.scale},attachment:{surface:'free',normal:[0,1,0],offset:0},collision:'none'}));
     await lifetime.wait(runtime.apply({...createEmptyPlacementDocument(runtime.baseManifest),revision:1,instances}));check(session);
     staticActors.forEach(({actor,initial},index)=>{const target={kind:'static',instanceId:instances[index].instanceId,visible:initial.visible!==false},root=runtime.records.get(target.instanceId).root,setEnabled=root.setEnabled;root.setEnabled=function(){return setEnabled.call(this,target.visible);};root.setEnabled(target.visible);prepared.actors.set(actor.actorId,target);});
    }
    check(session);stats.prepared++;return prepared;
   }catch(error){for(const slot of session.slots)if(!slot.warmed)retire(slot);throw error;}
   finally{lifetime.close();session.controller.signal.removeEventListener('abort',cancel);}
  },
  sample(frame,{token,lease,prepared,seeking=false}={}){
   const session=sessions.get(token);if(!session||session.lease!==lease||session.prepared!==prepared)throw bossPreparationCancelled();check(session);
   const camera=world.camera;camera.movement?.resetPanVelocity?.();camera.movement?.resetRotationVelocity?.();camera.movement?.resetZoomVelocity?.();camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=camera.inertialPanningX=camera.inertialPanningY=0;
   camera.setTarget(Vector3.FromArray(frame.camera.target));if(camera.setPosition)camera.setPosition(Vector3.FromArray(frame.camera.position));else camera.position.copyFromFloats(...frame.camera.position);camera.fov=frame.camera.fov;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   const statics=[];
   for(const actor of frame.actors){
    const target=prepared.actors.get(actor.actorId);if(!target){if(actor.visible===false)continue;throw new Error('Unprepared cinematic actor: '+actor.actorId);}target.visible=actor.visible!==false;
    if(target.kind==='bound'){target.apply(actor);continue;}
    if(target.kind==='static'){const record=prepared.staticRuntime.records.get(target.instanceId);record.root.setEnabled(target.visible);if(target.visible)statics.push({instanceId:target.instanceId,position:actor.position,rotation:actor.rotation,scale:actor.scale});continue;}
    const {slot}=target,encounter=slot.adapter.encounter,root=encounter.actor;
    root.position.copyFromFloats(...actor.position);root.rotationQuaternion??=Quaternion.Identity();root.rotationQuaternion.copyFromFloats(...actor.rotation);root.scaling.copyFrom(slot.baseScale).scaleInPlace(actor.scale);
    if(slot.shown!==target.visible){root.setEnabled(target.visible);encounter.setShadowCasting(target.visible);slot.shown=target.visible;}if(!target.visible)continue;
    slot.sampler.sample(actor.animations,frame.time);
   }
   if(statics.length)prepared.staticRuntime.sampleFreeTransforms(statics);onSubtitles(frame.subtitles);stats.samples++;
  },
  emit(cue,{token,lease}={}){
   const session=sessions.get(token);if(!session||session.lease!==lease)return false;check(session);
   if(cue.kind==='audio'){if(!knownAudio.has(cue.audioId))throw new Error('Unknown cinematic audio ID');stats.audioCues++;return lease.playAudio(cue.audioId,{volume:cue.volume});}
   if(cue.kind==='event'&&cue.type==='marker'){stats.markers++;onMarker(cue.label,cue.time);return true;}
   throw new Error('Cinematic event is not allowlisted');
  },
  stopAudio({token,lease}={}){const session=sessions.get(token);if(session&&session.lease===lease)lease?.stopAudio?.();},
  async release({token,lease,prepared,reason='complete',restore=true}={}){
   const session=sessions.get(token);if(!session){prepared?.staticRuntime?.dispose();return;}
   if(session.released){if(prepared&&prepared!==session.releasedPrepared){prepared.staticRuntime?.dispose();session.releasedPrepared=prepared;}return;}
   session.released=true;session.releasedPrepared=prepared;session.controller.abort(bossPreparationCancelled());session.preparation?.cancel();session.lifetime?.abort();session.lifetime?.close();session.signal?.removeEventListener('abort',session.abort);
   attempt(()=>lease?.stopAudio?.());for(const target of session.prepared?.actors.values()??[])if(target.kind==='bound')attempt(()=>target.restore());attempt(()=>session.staticRuntime?.dispose());
   const keep=restore&&sameWorld(world,session.world)&&!['death','context-loss','scene-dispose','map-change','error','dispose'].includes(reason);
   for(const slot of session.slots){slot.busy=false;slot.shown=false;slot.lastUsed=now();if(keep&&slot.warmed&&!slot.retiring)attempt(()=>slot.adapter.hide());else retire(slot);}
   attempt(()=>restoreLimits(session));attempt(()=>lease?.release?.(reason,{restore:restore&&sameWorld(world,session.world)}));
   if(active===session){active=null;attempt(()=>onSubtitles([]));}stats.released++;
   // Keep only a bounded latest session for the player's late-prepare cleanup.
   for(const [key,value]of sessions)if(value!==session&&value.released)sessions.delete(key);
  },
  inspect(){return {scene:world.scene===active?.world.scene||!active,engineOwned:false,rafOwned:false,state:playbackState,active:!!active&&!active.released,actors:pool.size,estimatedBytes:bytes(),pendingRetirements:retirements.size,limits:{...caps},stats:{...stats},pool:[...pool.values()].map(slot=>({key:slot.key,warmed:slot.warmed,busy:slot.busy,retiring:slot.retiring,estimatedBytes:slot.estimatedBytes})),memoryMeaning:'Definition reservations and adapter estimates; no device/GPU residency claim.'};},
  evictIdle(){evict();},
  async dispose(){if(disposed)return;disposed=true;if(active)await host.release({token:active.token,lease:active.lease,prepared:active.prepared,reason:'dispose',restore:true});for(const slot of pool.values())retire(slot);for(const owned of factories)owned.dispose?.();await Promise.allSettled([...retirements]);sessions.clear();},
 };
 return host;
}
