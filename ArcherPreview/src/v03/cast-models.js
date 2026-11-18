// Story cast with real models. Roles reuse the resident sheets the dialogue
// portraits already cast (driver = blacksmith, chief = merchant, innkeeper =
// farmer). Models load through the NPC world runtime, so they get exactly the
// NPC toon bands, outline and interior ink the rest of the game uses. Roles
// without a model (or any load failure) keep the block placeholder.
//
// Motion is driven here, once per rendered frame: a looping idle, and only
// while the player talks to an actor its gaze (neck + head, like the monsters'
// watch look) follows the player, easing back afterwards. Bodies never turn.
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {ACTOR_VISUALS,createActorVisual} from './placeholder-actor.js';
import {CAST_ENTRIES} from './cast-catalog.js';

export const CAST_MODELS=Object.freeze({
 driver:'moonforest-tripo-blacksmith',
 innkeeper:'moonforest-tripo-farmer',
 elder:'moonforest-tripo-elder-woman',
 herbalist:'moonforest-tripo-herbalist',
 youth:'moonforest-tripo-youth',
 chief:'moonforest-tripo-merchant',
 'chief-son':'moonforest-tripo-vigilante',
});
const MODEL_HEIGHT=1.85,IDLE='Idle_Stand',GAZE_IN=.35,GAZE_OUT=.8,GAZE_LINGER=1.2,EYE_HEIGHT=1.45;
const UP=new Vector3(0,1,0),clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value));
const quatY=yaw=>[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const ease=value=>value*value*(3-2*value);

// Neck then head turn toward a world point, measured along the rig's own
// headfront marker; applied after each idle sample, so nothing accumulates.
function createGaze(asset){
 const find=name=>asset.transformNodes.find(node=>node.name===name||node.name.endsWith(' '+name)||node.name.endsWith('.'+name));
 const neck=find('mixamorig:Neck'),head=find('mixamorig:Head'),front=find('headfront');
 if(!neck||!head||!front)return null;
 const origin=new Vector3(),forward=new Vector3(),right=new Vector3(),delta=new Quaternion(),desired=new Quaternion(),parent=new Quaternion();
 const direction=()=>{head.computeWorldMatrix(true);front.computeWorldMatrix(true);origin.copyFrom(head.getAbsolutePosition());forward.copyFrom(front.getAbsolutePosition()).subtractInPlace(origin);return forward.lengthSquared()>1e-10;};
 const rotate=(node,axis,radians)=>{
  if(Math.abs(radians)<1e-6||!node.rotationQuaternion||!node.parent)return;
  node.computeWorldMatrix(true);Quaternion.RotationAxisToRef(axis,radians,delta);delta.multiplyToRef(node.absoluteRotationQuaternion,desired);
  node.parent.computeWorldMatrix(true);parent.copyFrom(node.parent.absoluteRotationQuaternion).conjugateInPlace();parent.multiplyToRef(desired,node.rotationQuaternion);node.rotationQuaternion.normalize();
  node.markAsDirty();for(const child of node.getDescendants(false))child.computeWorldMatrix?.(true);
 };
 const aim=(node,target,weight,yawLimit,pitchLimit)=>{
  if(!direction())return;
  const yaw=Math.atan2(forward.x,forward.z),want=Math.atan2(target.x-origin.x,target.z-origin.z);
  rotate(node,UP,clamp(wrap(want-yaw),yawLimit)*weight);
  if(!direction())return;
  const now=Math.atan2(forward.x,forward.z);right.set(Math.cos(now),0,-Math.sin(now));
  const pitch=Math.atan2(forward.y,Math.hypot(forward.x,forward.z)),wantPitch=Math.atan2(target.y-origin.y,Math.hypot(target.x-origin.x,target.z-origin.z));
  rotate(node,right,-clamp(wantPitch-pitch,pitchLimit)*weight);
 };
 return {apply(target,weight){if(weight<=0)return;aim(neck,target,weight*.45,.35,.18);aim(head,target,weight,.6,.3);}};
}

export function createCastVisuals({getWorld,fallback=createActorVisual,loadRuntime,now=()=>performance.now()}={}){
 let runtime=null,runtimeScene=null,serial=0,observer=null,last=0;
 const actors=new Set();
 const load=loadRuntime??(async world=>{
  const [{createNpcWorld},{ASSET_CATALOG}]=await Promise.all([import('../npc-world.js'),import('../asset-catalog.js')]);
  const own=new Set(CAST_ENTRIES.map(entry=>entry.assetId));
  const catalog={...ASSET_CATALOG,entries:[...ASSET_CATALOG.entries.filter(entry=>!own.has(entry.assetId)),...CAST_ENTRIES]};
  const npc=createNpcWorld({world,catalog,getCatalog:()=>catalog,hydrate:async()=>[],storage:null,onError:error=>{if(error?.name!=='AbortError')console.warn('[MoonForest 0.3] cast model',error);}});
  npc.setPaused(true);// this module samples the clips itself
  return npc;
 });
 function ensure(){
  const world=getWorld();
  if(!runtime||runtimeScene!==world.scene){
   observer?.remove?.();observer=null;runtimeScene=world.scene;runtime=Promise.resolve(load(world));
   const scene=world.scene;last=0;
   observer=scene.onBeforeRenderObservable.add(()=>{const t=now(),dt=last?Math.min(.1,Math.max(0,(t-last)/1000)):0;last=t;for(const actor of actors)actor.tick(dt);});
   observer.remove=()=>scene.onBeforeRenderObservable.remove(observer);
  }
  return runtime;
 }
 function create(scene,key,{id=key}={}){
  const assetId=CAST_MODELS[key];
  if(!assetId)return fallback(scene,key,{id});
  const spec=ACTOR_VISUALS[key]??{label:key,height:1.7},scale=(spec.height??1.7)/MODEL_HEIGHT;
  const instanceId=`v03-cast-${String(id).replace(/[^A-Za-z0-9._:-]/g,'-')}-${++serial}`;
  let pose=null,ready=false,disposed=false,npc=null,block=null,wake=null;
  let clock=Math.random()*4,watch=null,gaze=null,gazeWeight=0,releaseAt=0,time=0;const eye=new Vector3();
  const transform=()=>({position:pose.position,rotation:quatY(pose.yaw),scale});
  const swapToBlock=error=>{
   if(disposed||block)return;actors.delete(actor);console.warn('[MoonForest 0.3] cast model unavailable',key,error);
   block=fallback(scene,key,{id});if(pose)block.place(...pose.position,pose.yaw);
  };
  // Pose the root directly: the shared runtime's own setters refuse records
  // once its map bookkeeping moves on, and this actor is owned by the story.
  const apply=record=>{const root=record.encounter.actor,yaw=pose.yaw;root.position.copyFromFloats(...pose.position);root.rotationQuaternion?.copyFromFloats(0,Math.sin(yaw/2),0,Math.cos(yaw/2));root.computeWorldMatrix(true);};
  const actor={
   tick(dt){
    if(!ready||disposed)return;const record=npc.get(instanceId);if(!record?.ready)return;
    time+=dt;clock+=dt;const length=record.entry.geometry.clipDurations?.[IDLE]??4;
    record.clipId=IDLE;record.clock=clock;record.loop=true;
    try{record.sampler.sample([{clipId:IDLE,time:clock%length,weight:1}],clock);}catch{return;}
    if(releaseAt&&time>=releaseAt){watch=null;releaseAt=0;}
    const at=watch?.();
    gazeWeight=at?Math.min(1,gazeWeight+dt/GAZE_IN):Math.max(0,gazeWeight-dt/GAZE_OUT);
    if(at)eye.set(at.x,at.y+EYE_HEIGHT,at.z);
    if(gazeWeight>0){gaze??=createGaze(record.encounter.asset);gaze?.apply(eye,ease(gazeWeight));}
   },
  };
  void ensure().then(async world=>{
   npc=world;if(disposed)return;if(!pose)await new Promise(resolve=>{wake=resolve;});
   if(disposed)return;
   await world.add(assetId,{instanceId,...transform(),clipId:IDLE,loop:true,persist:false});
   if(disposed){world.remove(instanceId,{persist:false});return;}
   ready=true;world.setTransform(instanceId,transform());actors.add(actor);
  }).catch(swapToBlock);
  return {
   id,key,label:spec.label,placeholder:false,height:spec.height??1.7,
   place(x,y,z,yaw=0){
    pose={position:[x,y,z],yaw};
    if(block)return block.place(x,y,z,yaw);
    if(wake){const resolve=wake;wake=null;resolve();}
    if(ready){const record=npc.get(instanceId);if(record?.ready)apply(record);}
   },
   // Only the actor the player is talking to follows them with its eyes.
   talk(on,watchTarget){
    if(block||!pose)return;
    if(on&&watchTarget){watch=watchTarget;releaseAt=0;}
    else if(!on)releaseAt=time+GAZE_LINGER;
   },
   dispose(){
    disposed=true;actors.delete(actor);block?.dispose();
    if(wake){const resolve=wake;wake=null;resolve();}
    if(npc)try{npc.remove(instanceId,{persist:false});}catch{}
   },
  };
 }
 create.preload=()=>ensure().catch(()=>{});
 return create;
}
