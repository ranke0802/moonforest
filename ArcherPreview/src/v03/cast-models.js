// Story cast with real models. Roles reuse the resident sheets the dialogue
// portraits already cast (driver = blacksmith, chief = merchant, innkeeper =
// farmer). Models load through the NPC world runtime, so they get exactly the
// NPC toon bands, outline and interior ink the rest of the game uses. Roles
// without a model (or any load failure) keep the block placeholder.
//
// Motion is driven here, once per rendered frame: a looping idle, and while
// talking the actor turns to face the player, then eases back home.
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
const MODEL_HEIGHT=1.85,IDLE='Idle_Stand',TURN_SPEED=4.2,RETURN_AFTER=5;
const quatY=yaw=>[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

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
  let pose=null,home=0,ready=false,disposed=false,npc=null,block=null,wake=null;
  let clock=Math.random()*4,target=null,returnAt=0,time=0;
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
    time+=dt;
    if(target===null&&returnAt&&time>=returnAt){target=home;returnAt=0;}
    if(target!==null){
     const delta=wrap(target-pose.yaw),step=Math.sign(delta)*Math.min(Math.abs(delta),dt*TURN_SPEED);
     pose.yaw+=step;if(Math.abs(delta)<.002){pose.yaw=target;target=null;}
     apply(record);
    }
    clock+=dt;const length=record.entry.geometry.clipDurations?.[IDLE]??4;
    record.clipId=IDLE;record.clock=clock;record.loop=true;
    try{record.sampler.sample([{clipId:IDLE,time:clock%length,weight:1}],clock);}catch{}
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
    pose={position:[x,y,z],yaw};home=yaw;target=null;returnAt=0;
    if(block)return block.place(x,y,z,yaw);
    if(wake){const resolve=wake;wake=null;resolve();}
    if(ready){const record=npc.get(instanceId);if(record?.ready)apply(record);}
   },
   // Turn toward whoever is talking; ease back home a little after it ends.
   talk(on,toward){
    if(block||!pose)return;
    if(on&&toward){target=Math.atan2(toward.x-pose.position[0],toward.z-pose.position[2]);returnAt=0;}
    else if(!on)returnAt=time+RETURN_AFTER;
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
