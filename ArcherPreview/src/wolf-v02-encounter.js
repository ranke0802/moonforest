import {Vector3} from '@babylonjs/core';
import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Brain,WOLF_V02_KNOCKBACK_SCALE,WOLF_V02_ORBIT,WOLF_V02_GAIT} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {installWolfV02AttackClips} from './wolf-v02-authored-clips.js';
import {segmentDistanceSquared} from './melee-collision.js';
import {WolfV02LocomotionPose} from './wolf-v02-locomotion.js';

// These are the physical part envelopes; player capsule radius is added once.
// Their centres always come from the post-navigation, authored skeletal pose.
const CONTACT_PARTS=Object.freeze([
  Object.freeze({name:'jaw',radius:.60}),
  Object.freeze({name:'head',radius:.60}),
  Object.freeze({name:'fore.L.paw',radius:.75}),
  Object.freeze({name:'fore.R.paw',radius:.75}),
]);
const FALLBACK_COMMIT=Object.freeze({
  [WOLF_CLIPS.pin]:.85,
  [WOLF_CLIPS.lunge]:1.65,
});
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const ORBIT_CLIPS=new Set(Object.values(WOLF_V02_ORBIT));

function sampleRoot(clip,time){
  const frames=clip.rootTrack,f=Math.max(0,Math.min(frames.length-1,time*clip.fps));
  const i=Math.floor(f),j=Math.min(i+1,frames.length-1),t=f-i;
  return frames[i].map((v,k)=>v+(frames[j][k]-v)*t);
}

function sampleYaw(clip,time){
  const frames=clip.yawTrack;
  if(!frames?.length)return 0;
  const f=Math.max(0,Math.min(frames.length-1,time*clip.fps));
  const i=Math.floor(f),j=Math.min(i+1,frames.length-1);
  return frames[i]+angleDelta(frames[j],frames[i])*(f-i);
}

// The 0.2 variant owns decisions, movement and bounded post-sampler attention /
// fixed-length foot support. R8's sampler, model library, shared paint/ink,
// preparation, pool and death lifecycle remain the implementation used by 0.1.
export class WolfV02Encounter extends WolfEncounter{
  constructor(...args){
    super(...args);
    this.combatVersion='moonforest-0.2';
    this.v02MoveTarget=new Vector3();
    this.v02ContactParts=CONTACT_PARTS.map(part=>({...part,point:null}));
    this.v02ContactPoints=[];
    this.v02LastContact=null;
    this.v02LastOutcome=null;
    this.v02PreviousPlayer=new Vector3();
    for(const part of this.v02ContactParts)part.previous=new Vector3();
    this.v02ContactSerial=null;
    this.v02ResolvedSerial=null;
  }

  createBrain(durations){return new WolfV02Brain(durations);}
  prepareAsset(){this.config=installWolfV02AttackClips(this.asset,this.config);}

  update(dt,player){
    this.v02Pose?.capturePreviousFeet();
    this.v02Pose?.restore();
    this.v02HeldYaw=this.actor?.rotation.y;
    // A stationary watch keeps its support feet fixed. During the freely
    // interruptible observation, use a real step before the neck reaches its
    // turn limit. A punishable recovery always retains its full timer.
    const b=this.brain,p=this.actor?.position;
    if(b?.behavior==='observe'&&b.state===WOLF_CLIPS.watch&&p&&player){
      const target=Math.atan2(player.position.x-p.x,player.position.z-p.z);
      if(Math.abs(angleDelta(target,this.v02HeldYaw))>.24)b.observation=0;
    }
    super.update(dt,player);
  }

  alignPose(){
    this.v02Pose??=new WolfV02LocomotionPose(this);
    this.v02Pose.restore();
    super.alignPose();
    const orbit=this.brain.behavior==='flank'&&ORBIT_CLIPS.has(this.brain.state);
    if(orbit)this.v02Pose.plantOrbit(this.brain.state===WOLF_V02_ORBIT.left);
    else if(this.brain.mode==='move'&&this.brain.state===WOLF_CLIPS.run)this.v02Pose.plantRun();
    else this.v02Pose.resetPlants();
    this.v02Pose.aim();
  }

  motionSpec(name){
    if(this.brain?.mode==='attack'&&this.brain.action){
      return {...this.brain.action,name,kind:'melee',role:'attack'};
    }
    return super.motionSpec(name);
  }

  attackDamage(event){
    return Number.isFinite(event?.damage)?event.damage:super.attackDamage(event);
  }

  movementPlan(player,result){
    if(result.flank){
      // The dedicated left/right R10 support gait owns the orbit's stride.
      return {target:player.position,stopDistance:0};
    }
    return {target:player.position,stopDistance:result.stopDistance??result.engageDistance??2.4};
  }

  contactSeparation(){
    // Standing clearance is a navigation convenience wider than the player's
    // actual body. During a strike use the same physical movement capsule so
    // separation cannot push an authored paw away before contact is tested.
    if(this.brain?.mode==='attack'&&!this.grab.active){
      return this.radius+playerDimensions(this.player).moveRadius;
    }
    return super.contactSeparation();
  }

  applyMotionRoot(root){
    const brain=this.brain,clip=this.config.catalog.find(c=>c.name===brain.state);
    if(!clip)return;
    const action=brain.mode==='attack'?brain.action:null,time=brain.time;
    if(this.lastSerial!==brain.serial||this.wolfClip!==clip.name){
      this.wolfClip=clip.name;
      this.motionYaw=this.knockTurn?this.knockTurn.start+this.knockTurn.delta:this.actor.rotation.y;
      // Quick bites begin inside the Pin clip. The skipped authored approach
      // is an origin, never a first-frame world displacement.
      const start=action?.clipStart??0;
      this.previousWolfTime=start;
      this.lastRoot=sampleRoot(clip,start);
      this.v02RootYaw=sampleYaw(clip,start);
    }
    if(action&&!this.knockTurn&&!brain.stagger){
      const commit=action.commitTime??(action.clipStart>0?1.45:FALLBACK_COMMIT[clip.name]??0);
      if(time<commit&&this.player){
        const dx=this.player.position.x-this.actor.position.x,dz=this.player.position.z-this.actor.position.z;
        if(dx*dx+dz*dz>1e-8){
          const turn=angleDelta(Math.atan2(dx,dz),this.motionYaw),limit=1.6*Math.max(0,this.dt??0);
          this.motionYaw+=Math.max(-limit,Math.min(limit,turn));
        }
      }
    }
    const stalking=brain.behavior==='flank'&&ORBIT_CLIPS.has(brain.state);
    const watching=brain.state===WOLF_CLIPS.watch||ORBIT_CLIPS.has(brain.state);
    if(watching&&!stalking&&!this.knockTurn&&Number.isFinite(this.v02HeldYaw))this.actor.rotation.y=this.v02HeldYaw;
    if(watching&&!stalking&&!this.knockTurn)this.motionYaw=this.actor.rotation.y-sampleYaw(clip,time)+(this.v02RootYaw??0);
    if((time>=this.previousWolfTime||stalking)&&this.lastRoot&&!brain.stagger&&brain.mode!=='move'&&(!watching||stalking)){
      // The large 2.5x body amplified both authored fall travel and impulse.
      // Keep the pose curve intact and shorten only the world displacement.
      const fallScale=['down','recover'].includes(brain.mode)?WOLF_V02_KNOCKBACK_SCALE:1;
      const x=(root[0]-this.lastRoot[0])*this.config.scale*fallScale,z=(root[2]-this.lastRoot[2])*this.config.scale*fallScale;
      const yaw=this.motionYaw;
      const dx=x*Math.cos(yaw)+z*Math.sin(yaw),dz=z*Math.cos(yaw)-x*Math.sin(yaw);
      if(stalking){
        const player=this.player.position,p=this.actor.position;
        const distance=Math.hypot(p.x-player.x,p.z-player.z),navigation=this.movementNavigation;
        this.v02StalkRadius??=distance;
        // Source arc length, not elapsed time or a generic authored arc, is the
        // movement budget. Recompute the polar origin around the actual player
        // every step; a moving player never leaves an old circle centre behind.
        const sourceRadius=clip.orbitRadius??WOLF_V02_GAIT.orbitRadius;
        const wrapped=time<this.previousWolfTime;
        const yawStep=wrapped?angleDelta(sampleYaw(clip,clip.duration),sampleYaw(clip,this.previousWolfTime))+angleDelta(sampleYaw(clip,time),sampleYaw(clip,0)):angleDelta(sampleYaw(clip,time),sampleYaw(clip,this.previousWolfTime));
        const stride=Math.abs(yawStep)>1e-8?Math.abs(yawStep)*sourceRadius*this.config.scale:Math.hypot(dx,dz);
        const radial=Math.max(-stride*.25,Math.min(stride*.25,this.v02StalkRadius-distance));
        const nextDistance=Math.max(this.radius+playerDimensions(this.player).moveRadius,distance+radial);
        const tangent=Math.sqrt(Math.max(0,stride*stride-radial*radial));
        const angle=Math.atan2(p.x-player.x,p.z-player.z)-brain.flankSide*tangent/Math.max(.25,(distance+nextDistance)*.5);
        const to=this.v02MoveTarget.set(player.x+Math.sin(angle)*nextDistance,p.y,player.z+Math.cos(angle)*nextDistance);
        const clear=!navigation||navigation.segmentClear(p,to,this.radius);
        if(clear&&Math.abs(distance-this.v02StalkRadius)<1.5){
          p.x=to.x;p.z=to.z;this.actor.rotation.y=Math.atan2(player.x-p.x,player.z-p.z);brain.stalkBlocked=false;
          this.v02OrbitDistance=(this.v02OrbitDistance??0)+stride;
        }else{
          // Reject both the root and its foot phase. Next decision tries the
          // proper opposite gait once, then returns to a reachable attack.
          brain.time=this.previousWolfTime;brain.stalkBlocked=true;
          this.animator.transition(brain.state,{clipTime:brain.time,actionId:brain.serial});this.animator.update(0);
          for(let i=0;i<3;i++)root[i]=this.lastRoot[i];
        }
      }else{this.actor.position.x+=dx;this.actor.position.z+=dz;}
    }
    if(brain.mode!=='move'&&!this.knockTurn&&!stalking){
      this.actor.rotation.y=this.motionYaw+sampleYaw(clip,time)-(this.v02RootYaw??0);
    }
    this.previousWolfTime=brain.time;
    if(!stalking){this.v02StalkRadius=null;brain.suppressStalkStep=false;}
  }

  attackRange(spec){
    if(!this.v02EvaluatingContacts)return super.attackRange(spec);
    const origin=this.actor.position,owners=this.brain.action?.contactParts;
    let reach=0;
    for(const part of this.v02ContactParts){
      if(owners&&!owners.includes(part.name))continue;
      const p=this.nodes[part.name].getAbsolutePosition();
      reach=Math.max(reach,Math.hypot(p.x-origin.x,p.z-origin.z)+part.radius+playerDimensions(this.player).moveRadius);
      if(this.v02ContactSerial===this.brain.serial)reach=Math.max(reach,Math.hypot(part.previous.x-origin.x,part.previous.z-origin.z)+part.radius+playerDimensions(this.player).moveRadius);
    }
    // Broad phase follows the actual pose. It never replaces the capsule test.
    return Math.max(super.attackRange(spec),reach);
  }

  attackContactPoints(aim){
    const parts=this.v02ContactParts,points=this.v02ContactPoints;
    points.length=0;
    const owners=this.brain.action?.contactParts;
    for(const part of parts){if(owners&&!owners.includes(part.name))continue;part.point=this.nodes[part.name].getAbsolutePosition();points.push(part.point);}
    points.sort((a,b)=>Vector3.DistanceSquared(a,aim)-Vector3.DistanceSquared(b,aim));
    return points;
  }

  attackBodyContact(event,aim,points){
    const dimensions=playerDimensions(this.player),bodyRadius=dimensions.moveRadius;
    const low=bodyRadius,high=dimensions.height-bodyRadius,player=this.player.position;
    const action=this.brain.action,time=this.brain.time,previousTime=this.v02PreviousContactTime;
    const maxPlayerStep=Math.min(2,Math.max(.8,32*Math.max(0,this.dt??0)));
    const sweep=this.v02ContactSerial===this.brain.serial&&time>=previousTime&&time-previousTime<.65&&Vector3.DistanceSquared(player,this.v02PreviousPlayer)<=maxPlayerStep*maxPlayerStep;
    const start=action?.contactStart??action?.impact??time,end=action?.contactEnd??time;
    const alpha=t=>Math.max(0,Math.min(1,(t-previousTime)/Math.max(1e-9,time-previousTime)));
    const from=sweep?alpha(Math.max(start,previousTime)):1,to=sweep?alpha(Math.min(end,time)):1;
    let best=null;
    for(const point of points){
      const part=this.v02ContactParts.find(p=>p.point===point);
      const radius=(part?.radius??.6)+bodyRadius;
      const now=[point.x-player.x,point.y-player.y,point.z-player.z];
      const old=sweep?[part.previous.x-this.v02PreviousPlayer.x,part.previous.y-this.v02PreviousPlayer.y,part.previous.z-this.v02PreviousPlayer.z]:now;
      const at=t=>now.map((v,i)=>old[i]+(v-old[i])*t);
      const distance=Math.sqrt(segmentDistanceSquared(at(from),at(to),[0,low,0],[0,high,0]));
      if(!best||distance-radius<best.distance-best.radius){best={part:part?.name??'jaw',point:point.asArray(),distance,radius};}
      if(distance<=radius){
        this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:this.brain.time,...best,bodyRadius,swept:sweep,contact:true};
        return true;
      }
    }
    this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:this.brain.time,...best,contact:false};
    return false;
  }

  receiveBossHit(options){
    const serial=this.brain.serial,before=this.playerHp,wasCaptured=this.grab.active;
    if(this.v02ResolvedSerial===serial)return false;
    if(options.bodyContact||options.shieldContact)this.v02ResolvedSerial=serial;
    // A subsection of the Pin animation is still an ordinary bite. Only the
    // dedicated full Pin action may acquire input/capture ownership.
    const capture=options.event?.capture===true&&this.brain.action?.capture===true;
    const event={...options.event,capture};
    const resolved=super.receiveBossHit({...options,event,grab:false});
    const captured=!wasCaptured&&this.grab.active;
    const blocked=resolved&&!captured&&(options.shieldContact||options.action?.state==='shieldPush');
    this.v02ImpactOutcome={serial,hit:this.playerHp<before||captured,blocked:!!blocked,captured};
    return resolved;
  }

  poseAndContacts(player,result,sample,shield){
    if(!this.active||this.corpseGone)return;
    const serial=this.brain?.serial;
    const attack=this.brain.action,time=this.brain.time,previous=this.v02ContactSerial===serial?this.v02PreviousContactTime:time;
    const inWindow=attack&&this.brain.mode==='attack'&&!this.brain.stagger&&this.brain.hp>0&&time>=(attack.contactStart??attack.impact)&&previous<=(attack.contactEnd??attack.impact)&&this.v02ResolvedSerial!==serial;
    if(inWindow&&!this.pendingEvents.some(e=>e.type==='attack'))this.pendingEvents.push({type:'attack',name:attack.sourceClip,actionId:attack.id,range:attack.range,kind:'melee',damage:attack.damage,capture:attack.capture});
    if(!inWindow)this.pendingEvents=[];
    const hasImpact=this.pendingEvents.some(event=>event.type==='attack');
    const heavyBefore=this.heavyCount;
    const action=this.brain?.action?.id??null;
    this.v02ImpactOutcome=null;
    this.v02EvaluatingContacts=true;
    let hitStop;
    try{hitStop=super.poseAndContacts(player,result,sample,shield);}finally{this.v02EvaluatingContacts=false;}
    if(this.heavyCount>heavyBefore)this.knockVelocity.scaleInPlace(WOLF_V02_KNOCKBACK_SCALE);
    if(hasImpact){
      const outcome=this.v02ImpactOutcome??{serial,hit:false,blocked:false,captured:false};
      this.v02LastOutcome={...outcome,action};
      this.brain.noteAttackResult?.(outcome);
    }
    if(this.brain.mode==='attack'&&!this.brain.stagger&&this.brain.hp>0){
      this.v02ContactSerial=this.brain.serial;this.v02PreviousContactTime=this.brain.time;
      this.v02PreviousPlayer.copyFrom(player.position);
      for(const part of this.v02ContactParts)part.previous.copyFrom(this.nodes[part.name].getAbsolutePosition());
    }else this.v02ContactSerial=null;
    return hitStop;
  }

  hide(){
    this.v02Pose?.restore();this.v02Pose?.resetPlants();
    super.hide();
    this.v02ImpactOutcome=null;
    this.v02LastContact=null;
    this.v02LastOutcome=null;
    this.v02ContactSerial=null;this.v02ResolvedSerial=null;this.v02StalkRadius=null;this.v02OrbitDistance=0;
  }

  inspect(){
    return {...super.inspect(),combatVersion:this.combatVersion,action:this.brain?.action?.id??null,
      phase:this.brain?.phase??null,behavior:this.brain?.behavior??null,contact:this.v02LastContact,outcome:this.v02LastOutcome,
      locomotion:{orbitSourceDistance:this.v02OrbitDistance??0,plantReachError:this.v02Pose?.maxReachError??0,releasedPlants:this.v02Pose?.releasedPlants??0}};
  }
}
