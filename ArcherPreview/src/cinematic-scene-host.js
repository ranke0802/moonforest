import {Quaternion,Vector3} from '@babylonjs/core';
import {createActorEncounterFactory} from './actor-encounter-adapter.js';
import {ACTOR_DEFINITIONS} from './actor-definitions.js';
import {ASSET_CATALOG} from './asset-catalog.js';
import {createBossPreparation,bossPreparationCancelled} from './boss-preparation.js';
import {MapLoadLifetime} from './map-load-lifetime.js';
import {orderPoseNodes,refreshPoseMatrices} from './pose-matrices.js';
import {AuthoredPlacementRuntime} from './authored-placement-runtime.js';
import {createEmptyPlacementDocument,placementCatalogAsset} from './placement-document.js';
import {evaluateCinematic} from './cinematic-document.js';
import {deathHaloAdvance} from './mourning-motion-v2.js';

const MAX_ACTORS=20,MAX_BYTES=512*1024*1024;
const copy=value=>value?.clone?.()??value;
const sameArray=(a,b,tolerance=1e-5)=>a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<tolerance);
const snapshot=world=>({scene:world.scene,mapId:world.mapId,ground:world.ground,generation:world.toolGeneration??0});
const sameWorld=(world,saved)=>world.scene===saved.scene&&world.mapId===saved.mapId&&world.ground===saved.ground&&(world.toolGeneration??0)===saved.generation&&!saved.scene.isDisposed;
const definitionAt=(definitions,id)=>definitions instanceof Map?definitions.get(id):definitions[id];

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
   const active=input?.filter(item=>item.weight>0)??[],animations=active.length?active:[{clipId:defaultClip,time:0,weight:1}],poseTime=active.length?time:0;
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

export function createCinematicSceneHost({world,getPlayer=()=>null,battle,catalog=ASSET_CATALOG,actorDefinitions=ACTOR_DEFINITIONS,actorFactory,createActorFactory=createActorEncounterFactory,libraryFactory,createPlacementRuntime=(target,options)=>new AuthoredPlacementRuntime(target,options),placementOptions={},acquireToolLease=options=>world.acquireToolLease(options),getState=()=>({}),onSubtitles=()=>{},onMarker=()=>{},audioIds=[],audioEnabled=false,preparationOptions={},limits={},now=()=>performance.now()}={}){
 if(!world?.scene)throw new TypeError('Cinematic host requires the existing world scene');
 const pool=new Map(),sessions=new Map(),retirements=new Set(),factories=new Set();let callbacks={},active=null,factory=actorFactory,factoryScene=world.scene,disposed=false,playbackState='idle';
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
 function getFactory(){
  if(!factory||factoryScene!==world.scene){if(factory&&!actorFactory)factory.dispose?.();if(!battle&&!actorFactory)throw new Error('Cinematic actors require the existing battle adapter');factory=createActorFactory({world,battle,getPlayer,libraryFactory,rewardsEnabled:false});factoryScene=world.scene;if(!actorFactory)factories.add(factory);}
  return factory;
 }
 async function slotFor(definition,key,protectedKeys,session){
  let slot=pool.get(key);if(slot?.retiring)throw new Error('Previous cinematic actor retirement is still pending');
  if(slot&&!sameWorld(world,slot.world)){retire(slot);throw new Error('Previous map actor retirement is still pending');}
  if(slot){stats.actorsReused++;slot.busy=true;session.slots.push(slot);return slot;}
  const estimate=definition.population?.estimatedBytes??16*1024*1024;
  if(pool.size>=caps.actors||bytes()+estimate>caps.estimatedBytes){
   const retired=[];for(const idle of [...pool.values()].filter(item=>!item.busy&&!item.retiring&&!protectedKeys.has(item.key)).sort((a,b)=>a.lastUsed-b.lastUsed))retired.push(retire(idle));
   await session.lifetime.wait(Promise.allSettled(retired));check(session);
  }
  if(pool.size>=caps.actors||bytes()+estimate>caps.estimatedBytes)throw new Error('Cinematic actor count/estimated-memory cap reached; no actor count was reduced');
  slot={key,definition,world:snapshot(world),estimatedBytes:estimate,busy:true,warmed:false,retiring:false,lastUsed:now(),adapter:null};pool.set(key,slot);session.slots.push(slot);
  const ownerCurrent=()=>!disposed&&!slot.retiring&&sameWorld(world,slot.world);
  let created;try{created=getFactory()(definition,{generation:slot.world.generation,isCurrent:ownerCurrent});}catch(error){pool.delete(key);session.slots.splice(session.slots.indexOf(slot),1);throw error;}
  slot.pendingCreate=Promise.resolve(created).then(async adapter=>{slot.adapter=adapter;if(slot.retiring)await adapter.dispose();return adapter;});slot.pendingCreate.catch(()=>{});stats.actorsCreated++;return slot;
 }
 function restoreLimits(session){
  if(session.limitsRestored||!session.cameraLimits||!sameWorld(world,session.world))return;session.limitsRestored=true;Object.assign(world.camera,session.cameraLimits);
 }
 const host={
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
    if(!root)return null;root.computeWorldMatrix(true);const meshes=root.getChildMeshes?.().filter(mesh=>mesh.getTotalVertices()>0)??[],bounds=root.getHierarchyBoundingVectors(),scale=target.kind==='animated'?root.scaling.x/target.slot.baseScale.x:record?.instance?.transform.scale??target.scale??1;
    return {actorId,root,meshes,min:bounds.min,max:bounds.max,readOnly:target.kind==='bound',position:root.position.asArray(),rotation:(root.rotationQuaternion??Quaternion.FromEulerVector(root.rotation)).asArray(),scale};
   }).filter(Boolean);
  },
  previewActorTransform(actorId,{position,rotation,scale}){
   if(!Array.isArray(position)||position.length!==3||!position.every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)||!Array.isArray(rotation)||rotation.length!==4||!rotation.every(Number.isFinite)||Math.abs(Math.hypot(...rotation)-1)>.01||!Number.isFinite(scale)||scale<.05||scale>20)throw new Error('유효한 위치·회전·크기를 사용하세요.');
   const session=active;if(!session||!current(session))throw bossPreparationCancelled();const target=session.prepared?.actors.get(actorId);if(!target||target.kind==='bound')throw new Error('이 대상은 위치를 바꿀 수 없습니다.');
   if(target.kind==='static')session.prepared.staticRuntime.sampleFreeTransforms([{instanceId:target.instanceId,position,rotation,scale}]);
   else{const root=target.slot.adapter.encounter.actor;root.position.copyFromFloats(...position);root.rotationQuaternion??=Quaternion.Identity();root.rotationQuaternion.copyFromFloats(...rotation);root.scaling.copyFrom(target.slot.baseScale).scaleInPlace(scale);root.computeWorldMatrix(true);for(const node of root.getDescendants())node.computeWorldMatrix?.(true);for(const skeleton of target.slot.adapter.encounter.asset.skeletons??[])skeleton.prepare(true);}
   return true;
  },
  getLiveLease(){return active&&!active.released?active.lease:null;},
  captureCamera(){world.camera.getViewMatrix();return {position:world.camera.position.asArray(),target:world.camera.getTarget().asArray(),fov:world.camera.fov};},
  async acquire(document,{token,signal,isCurrent=()=>true}={}){
   if(disposed)throw bossPreparationCancelled();if(active&&!active.released)throw new Error('Cinematic host already owns a scene lease');
   if(document.mapId!==world.mapId)throw new Error('Load the selected cinematic map before acquiring its scene');
   evict();
   const session={token,signal,isCurrent,world:snapshot(world),controller:new AbortController(),lease:null,slots:[],released:false,staticRuntime:null,prepared:null};sessions.set(token,session);active=session;
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
  async prepare(document,{token,signal,isCurrent,lease}={}){
   const session=sessions.get(token);if(!session||session.lease!==lease)throw bossPreparationCancelled();check(session);
   const lifetime=new MapLoadLifetime({signal:session.controller.signal,stage:'cinematic-preparation'}),preparation=createBossPreparation({...preparationOptions,isCurrent:()=>current(session)});session.lifetime=lifetime;session.preparation=preparation;
   const cancel=()=>preparation.cancel(session.controller.signal.reason??bossPreparationCancelled());session.controller.signal.addEventListener('abort',cancel,{once:true});
   const prepared={actors:new Map(),staticRuntime:null,document,world:session.world};session.prepared=prepared;
   try{
    if(document.actors.length>caps.actors)throw new Error('Cinematic actor count cap reached');
    const counts=new Map(),plan=document.actors.map(actor=>{if(!actor.actorDefinitionId)return {actor};const definition=definitionAt(actorDefinitions,actor.actorDefinitionId);if(!definition||definition.assetId!==actor.assetId||definition.assetVersion!==actor.assetVersion)throw new Error('Cinematic actor definition/version conflict');const count=(counts.get(actor.actorDefinitionId)??0)+1;counts.set(actor.actorDefinitionId,count);if(count>(definition.population?.maxPooled??caps.actors))throw new Error('Cinematic per-definition actor cap reached');return {actor,definition,key:actor.actorDefinitionId+'#'+count};});
    const protectedKeys=new Set(plan.filter(item=>item.key).map(item=>item.key));evict(protectedKeys);const frame=evaluateCinematic(document,0),staticActors=[];
    for(const {actor,definition,key}of plan){
     check(session);const initial=frame.actors.find(item=>item.actorId===actor.actorId);
     if(actor.instanceId){
      if(definition||document.tracks.transforms.some(track=>track.actorId===actor.actorId)||document.tracks.animations.some(track=>track.actorId===actor.actorId))throw new Error('Bound existing instances are read-only in cinematic playback');
      const record=[...(world.authoredPlacementRecords??[]),...(world.villageRenderRecords??[])].find(item=>!item.authoredSuppressed&&(item.placement?.id??item.instanceId)===actor.instanceId);
      if(!record)throw new Error('Bound existing instance is not loaded');
      if((record.instance?.assetId??record.placement?.asset)!==actor.assetId||record.instance&&record.instance.assetVersion!==actor.assetVersion)throw new Error('Bound instance asset identity differs from the cinematic reference');
      const position=record.root.position.asArray(),rotation=(record.root.rotationQuaternion??Quaternion.FromEulerVector(record.root.rotation)).asArray(),entry=placementCatalogAsset(catalog,actor.assetId,actor.assetVersion),unit=record.instance?1:entry.units.metersPerSourceUnit;
      if(!sameArray(initial.position,position)||!sameArray(initial.rotation,rotation)||!record.root.scaling.asArray().every(value=>Math.abs(value-unit*initial.scale)<1e-5))throw new Error('Bound instance transform differs from its immutable map placement');
      prepared.actors.set(actor.actorId,{kind:'bound',record,position,rotation,scale:initial.scale});continue;
     }
     if(!definition){placementCatalogAsset(catalog,actor.assetId,actor.assetVersion);staticActors.push({actor,initial});continue;}
     const slot=await slotFor(definition,key,protectedKeys,session);check(session);slot.preparation=preparation;
     const adapter=await lifetime.wait(slot.pendingCreate);check(session);
     if(!slot.warmed){slot.warmPromise=adapter.warm({preparation,isCurrent:()=>current(session)});await lifetime.wait(slot.warmPromise);preparation.check();slot.warmed=true;slot.baseScale=adapter.encounter.actor.scaling.clone();slot.sampler=createCinematicPoseSampler(adapter.encounter);slot.estimatedBytes=adapter.estimate?.().estimatedBytes??slot.estimatedBytes;if(bytes()>caps.estimatedBytes)throw new Error('Prepared cinematic actors exceed the estimated-memory cap');}
     prepared.actors.set(actor.actorId,{kind:'animated',slot});
    }
    if(staticActors.length){
     const runtime=createPlacementRuntime(world,{...placementOptions,catalog,publish:false});session.staticRuntime=runtime;prepared.staticRuntime=runtime;
     const instances=staticActors.map(({actor,initial})=>({instanceId:'cinematic-'+(token?.id??'preview')+'-'+actor.actorId,assetId:actor.assetId,assetVersion:actor.assetVersion,transform:{position:initial.position,rotation:initial.rotation,scale:initial.scale},attachment:{surface:'free',normal:[0,1,0],offset:0},collision:'none'}));
     await lifetime.wait(runtime.apply({...createEmptyPlacementDocument(runtime.baseManifest),revision:1,instances}));check(session);
     staticActors.forEach(({actor},index)=>prepared.actors.set(actor.actorId,{kind:'static',instanceId:instances[index].instanceId}));
    }
    check(session);stats.prepared++;return prepared;
   }catch(error){for(const slot of session.slots)if(!slot.warmed)retire(slot);throw error;}
   finally{lifetime.close();session.controller.signal.removeEventListener('abort',cancel);}
  },
  sample(frame,{token,lease,prepared,seeking=false}={}){
   const session=sessions.get(token);if(!session||session.lease!==lease||session.prepared!==prepared)throw bossPreparationCancelled();check(session);
   const camera=world.camera;camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=camera.inertialPanningX=camera.inertialPanningY=0;
   camera.setTarget(Vector3.FromArray(frame.camera.target));if(camera.setPosition)camera.setPosition(Vector3.FromArray(frame.camera.position));else camera.position.copyFromFloats(...frame.camera.position);camera.fov=frame.camera.fov;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
   const statics=[];
   for(const actor of frame.actors){
    const target=prepared.actors.get(actor.actorId);if(!target)throw new Error('Unprepared cinematic actor: '+actor.actorId);
    if(target.kind==='bound'){if(!sameArray(actor.position,target.position)||!sameArray(actor.rotation,target.rotation)||Math.abs(actor.scale-target.scale)>1e-5)throw new Error('Existing map instance is read-only');continue;}
    if(target.kind==='static'){statics.push({instanceId:target.instanceId,position:actor.position,rotation:actor.rotation,scale:actor.scale});continue;}
    const {slot}=target,encounter=slot.adapter.encounter,root=encounter.actor;
    root.position.copyFromFloats(...actor.position);root.rotationQuaternion??=Quaternion.Identity();root.rotationQuaternion.copyFromFloats(...actor.rotation);root.scaling.copyFrom(slot.baseScale).scaleInPlace(actor.scale);
    if(!slot.shown){root.setEnabled(true);encounter.setShadowCasting(true);slot.shown=true;}
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
   attempt(()=>lease?.stopAudio?.());attempt(()=>session.staticRuntime?.dispose());
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
