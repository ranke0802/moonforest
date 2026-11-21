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
// Living cast (2026-11-19, user: NPCs stood frozen): idle fidgets, a short
// stroll around home when given room (roam), a stop and a look when the player
// comes close, and the whole body turning to face whoever talks to them.
const WALK='Casual_Walk',WALK_SPEED=.95,TURN_RATE=3.2,FADE=.3,NOTICE=3.4,NOTICE_SQ=NOTICE*NOTICE;
const FIDGETS=Object.freeze(['Stand_and_Chat','Agree_Gesture','Listening_Gesture']);
// Clips a model cannot play cleanly. The blacksmith's apron is skinned to his
// right hand: in Agree_Gesture the hand to the chest drags the apron up like
// cheese (2026-11-20, user; seen at 1.0-1.5 s of the clip in the game).
const SKIP_CLIPS=Object.freeze({'moonforest-tripo-blacksmith':new Set(['Agree_Gesture'])});
const STAND_IN=Object.freeze({Agree_Gesture:'Talk_with_Hands_Open'});
const TALK_CLIPS=Object.freeze(['Talk_with_Hands_Open','Listening_Gesture']);
const RETRY_LIMIT=3,RETRY_MS=2500;
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
 // The turn sits mostly on the neck: on these rigs the chin is skinned to the
 // neck, so a head-only turn pulled the jaw long (user, 2026-11-19). The body
 // turns for anything wider (see tick), so the limits stay small.
 return {apply(target,weight){if(weight<=0)return;aim(neck,target,weight*.85,.42,.14);aim(head,target,weight*.25,.12,.08);}};
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
  let pose=null,ready=false,disposed=false,npc=null,block=null,wake=null,overlay=null,overlayEvery=0;
  let clock=Math.random()*4,watch=null,gaze=null,gazeWeight=0,releaseAt=0,time=0,pending=0;const eye=new Vector3();
  const transform=()=>({position:pose.position,rotation:quatY(pose.yaw),scale});
  // A failed load (often a transient abort while a map trip settles) shows the
  // block for now and retries; a later success replaces the block with the
  // model (2026-11-19: the driver stayed a block for the rest of the session).
  let attempts=0;
  const swapToBlock=error=>{
   if(disposed)return;actors.delete(actor);console.warn('[MoonForest 0.3] cast model unavailable',key,error);
   if(!block){block=fallback(scene,key,{id});if(pose)block.place(...pose.position,pose.yaw);}
   if(++attempts<=RETRY_LIMIT&&!scene.isDisposed)setTimeout(()=>{if(!disposed&&!scene.isDisposed)void spawn();},RETRY_MS*attempts);
  };
  // Pose the root directly: the shared runtime's own setters refuse records
  // once its map bookkeeping moves on, and this actor is owned by the story.
  const apply=record=>{const root=record.encounter.actor,yaw=pose.yaw;root.position.copyFromFloats(...pose.position);root.rotationQuaternion?.copyFromFloats(0,Math.sin(yaw/2),0,Math.cos(yaw/2));root.computeWorldMatrix(true);};
  // Behaviour state (all per actor, no per-frame allocation).
  const live={walkYaw:null,walkHeight:null,walkSpeed:WALK_SPEED,gestureLeft:0,mode:'idle',clip:IDLE,from:null,fromTime:0,fade:0,clipTime:0,next:2+Math.random()*4,target:{x:0,z:0},roam:null,talking:false,talkIndex:0,yaw:null,face:null};
  const skip=SKIP_CLIPS[assetId];
  const length=(record,clip)=>skip?.has(clip)?0:record.entry.geometry.clipDurations?.[clip]??0;
  const play=(record,clip)=>{if(clip===live.clip||!length(record,clip))return;live.from=live.clip;live.fromTime=live.clipTime;live.fade=FADE;live.clip=clip;live.clipTime=0;};
  const turnToward=(yaw,dt)=>{const step=wrap(yaw-live.yaw);live.yaw+=clamp(step,TURN_RATE*dt);pose.yaw=live.yaw;return Math.abs(step)<.05;};
  function chooseIdle(record){
   const fidget=Math.random()<.4?FIDGETS[Math.floor(Math.random()*FIDGETS.length)]:IDLE;
   play(record,length(record,fidget)?fidget:IDLE);live.mode='idle';live.next=Math.max(3,length(record,live.clip))*(1+Math.random()*.6);
  }
  function chooseWalk(record){
   const roam=live.roam;if(!roam)return false;
   for(let i=0;i<6;i++){
    const angle=Math.random()*Math.PI*2,distance=roam.radius*(.35+Math.random()*.65),x=roam.home.x+Math.cos(angle)*distance,z=roam.home.z+Math.sin(angle)*distance;
    const mx=(x+pose.position[0])/2,mz=(z+pose.position[2])/2;
    if(roam.free&&(!roam.free(x,z)||!roam.free(mx,mz)))continue;
    live.target.x=x;live.target.z=z;live.mode='walk';play(record,WALK);live.next=12;return true;
   }
   return false;
  }
  function behave(record,dt){
   live.yaw??=pose.yaw;live.next-=dt;
   const player=live.roam?.player?.()??null,at=watch?.();
   if(at){
    // In conversation: face the speaker with the whole body, talk with the hands.
    live.mode='talk';turnToward(Math.atan2(at.x-pose.position[0],at.z-pose.position[2]),dt);
    if(!TALK_CLIPS.includes(live.clip)||live.clipTime>=length(record,live.clip)){live.talkIndex=(live.talkIndex+1)%TALK_CLIPS.length;play(record,TALK_CLIPS[live.talkIndex]);}
    return;
   }
   if(live.mode==='talk'){if(live.walkYaw!==null){live.mode='walk';play(record,WALK);live.next=20;}else{chooseIdle(record);live.next=2.5;}}
   // Someone close by: stop and look over (a light gaze), then carry on.
   const dx=player?player.x-pose.position[0]:0,dz=player?player.z-pose.position[2]:0,close=player&&dx*dx+dz*dz<NOTICE_SQ;
   live.face=close?player:null;
   if(close&&live.walkYaw===null&&live.gestureLeft<=0){if(live.mode==='walk'){chooseIdle(record);}turnToward(Math.atan2(dx,dz),dt*.5);return;}
   if(live.gestureLeft>0){live.gestureLeft-=dt;if(live.gestureLeft<=0)chooseIdle(record);return;}
   if(live.mode==='walk'){
    const tx=live.target.x-pose.position[0],tz=live.target.z-pose.position[2],gap=Math.hypot(tx,tz);
    if(gap<.15||live.next<=0){if(live.walkYaw!==null){live.yaw=live.walkYaw;pose.yaw=live.walkYaw;live.walkYaw=null;}chooseIdle(record);return;}
    const aligned=turnToward(Math.atan2(tx,tz),dt);const pace=live.walkYaw!==null?live.walkSpeed:WALK_SPEED,speed=aligned?pace:pace*.35,step=Math.min(gap,speed*dt);
    const x=pose.position[0]+tx/gap*step,z=pose.position[2]+tz/gap*step;
    pose.position[0]=x;pose.position[2]=z;pose.position[1]=(live.walkHeight??live.roam?.heightAt)?.(x,z)??pose.position[1];
    return;
   }
   if(live.next<=0){if(!(live.roam&&Math.random()<.55&&chooseWalk(record)))chooseIdle(record);}
  }
  const actor={
   tick(dt){
    if(!ready||disposed)return;const record=npc.get(instanceId);if(!record?.ready)return;
    // Presentation tiers (CLAUDE.md): near or talking every frame, mid range
    // at 30 Hz, far at 15 Hz; behaviour and walking still advance by the
    // accumulated time (2026-11-20: five village folk sampled every frame).
    pending+=dt;
    const cam=scene.activeCamera?.globalPosition;let interval=0;
    if(overlay)interval=overlayEvery;
    else if(cam&&!watch&&live.mode!=='talk'){const dx=cam.x-pose.position[0],dz=cam.z-pose.position[2],d2=dx*dx+dz*dz;interval=d2<144?0:d2<900?1/30:1/15;}
    if(pending<interval)return;
    dt=Math.min(.25,pending);pending=0;
    time+=dt;clock+=dt;
    // A story pose owns the body (see overlay): no strolling, fidgets or gaze under it.
    if(overlay){if(live.clip!==IDLE)play(record,IDLE);live.mode='idle';live.gestureLeft=0;}else behave(record,dt);
    live.clipTime+=live.mode==='walk'&&live.walkYaw!==null?dt*live.walkSpeed/WALK_SPEED:dt;live.fromTime+=dt;live.fade=Math.max(0,live.fade-dt);
    const cur=length(record,live.clip)||4,w=live.fade>0?1-live.fade/FADE:1;
    record.clipId=live.clip;record.clock=clock;record.loop=true;
    try{
     if(w<1&&live.from){const prev=length(record,live.from)||4;record.sampler.sample([{clipId:live.from,time:live.fromTime%prev,weight:1-w},{clipId:live.clip,time:live.clipTime%cur,weight:w}],clock);}
     else record.sampler.sample([{clipId:live.clip,time:live.clipTime%cur,weight:1}],clock);
    }catch{return;}
    apply(record);
    if(overlay){try{const every=overlay(record.encounter.actor,record.encounter.asset,dt);overlayEvery=typeof every==='number'?every:0;}catch(error){overlay=null;console.warn('[MoonForest 0.3] cast pose stopped',error);}return;}
    if(releaseAt&&time>=releaseAt){watch=null;releaseAt=0;}
    const at=watch?.()??live.face;
    gazeWeight=at?Math.min(1,gazeWeight+dt/GAZE_IN):Math.max(0,gazeWeight-dt/GAZE_OUT);
    if(at)eye.set(at.x,(at.y??pose.position[1])+EYE_HEIGHT,at.z);
    if(gazeWeight>0){gaze??=createGaze(record.encounter.asset);gaze?.apply(eye,ease(gazeWeight)*(watch?1:.7));}
   },
  };
  const spawn=()=>ensure().then(async world=>{
   npc=world;if(disposed)return;if(!pose)await new Promise(resolve=>{wake=resolve;});
   if(disposed)return;
   try{world.remove(instanceId,{persist:false});}catch{}
   await world.add(assetId,{instanceId,...transform(),clipId:IDLE,loop:true,persist:false});
   if(disposed){world.remove(instanceId,{persist:false});return;}
   if(block){block.dispose();block=null;}
   ready=true;world.setTransform(instanceId,transform());actors.add(actor);
  }).catch(swapToBlock);
  // Resolves once the model stands there (its textures uploaded) or the block took its place.
  const settled=spawn();
  return {
   id,key,label:spec.label,placeholder:false,height:spec.height??1.7,settled,
   place(x,y,z,yaw=0){
    pose={position:[x,y,z],yaw};live.yaw=yaw;if(live.roam){live.roam.home.x=x;live.roam.home.z=z;}if(live.mode==='walk')live.mode='idle';
    if(block)return block.place(x,y,z,yaw);
    if(wake){const resolve=wake;wake=null;resolve();}
    if(ready){const record=npc.get(instanceId);if(record?.ready)apply(record);}
   },
   // Lets the actor stroll within radius of home (the story owns placement:
   // place() moves home too). free(x,z): walkable; player(): {x,y,z} or null.
   roam(options){live.roam=options?{radius:options.radius??2.5,home:{x:pose?.position[0]??0,z:pose?.position[2]??0},free:options.free??null,heightAt:options.heightAt??null,player:options.player??null}:null;if(!live.roam&&live.mode==='walk')live.mode='idle';},
   // Where the actor stands now (it may have strolled off its placed spot).
   get position(){return pose?{x:pose.position[0],z:pose.position[2]}:null;},
   // Story moves: walk to a spot (then face yaw), or play one gesture.
   // speed: metres a second (the clip keeps step with it).
   walkTo(x,z,{yaw=null,heightAt=null,speed=WALK_SPEED}={}){if(!pose)return;live.walkSpeed=speed;live.target.x=x;live.target.z=z;live.walkYaw=yaw;live.walkHeight=heightAt;live.mode='walk';live.next=20;live.gestureLeft=0;const record=npc?.get?.(instanceId);if(record?.ready)play(record,WALK);else live.clip=WALK;},
   gesture(clip){const record=npc?.get?.(instanceId);if(record?.ready&&!length(record,clip)&&STAND_IN[clip])clip=STAND_IN[clip];if(!record?.ready||!length(record,clip))return;live.mode='idle';play(record,clip);live.gestureLeft=Math.min(2.2,length(record,clip));},
   // A story pose over the idle clip (lying thrown, pushing the wagon):
   // fn(root, asset, dt) runs each frame after the clip is sampled and may
   // set the root and turn bones; null hands the body back. It may return
   // the seconds until it needs to run again (a slow pose: 1/30), else it
   // runs every frame.
   overlay(fn){overlay=typeof fn==='function'?fn:null;overlayEvery=0;},
   // Only the actor the player is talking to turns and talks to them.
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
