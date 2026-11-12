import {Vector3} from '@babylonjs/core';
import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Brain,WOLF_V02_KNOCKBACK_SCALE} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {installWolfV02AttackClips} from './wolf-v02-authored-clips.js';
import {segmentDistanceSquared} from './melee-collision.js';

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

// The 0.2 variant owns decisions and movement only. The approved R8 sampler,
// model library, shared paint/ink/shader preparation, pool and death lifecycle
// remain the same implementation used by 0.1.
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
      // R8's Circle_Watch owns its short lateral step and foot placement.
      // Do not redirect a forward run sideways or mirror only its root.
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
    const stalking=brain.behavior==='flank'&&brain.state===WOLF_CLIPS.watch;
    const watching=brain.state===WOLF_CLIPS.watch;
    if(watching&&!stalking&&!this.knockTurn)this.motionYaw=this.actor.rotation.y-sampleYaw(clip,time)+(this.v02RootYaw??0);
    if(time>=this.previousWolfTime&&this.lastRoot&&!brain.stagger&&brain.mode!=='move'&&(!watching||stalking)){
      // The large 2.5x body amplified both authored fall travel and impulse.
      // Keep the pose curve intact and shorten only the world displacement.
      const fallScale=['down','recover'].includes(brain.mode)?WOLF_V02_KNOCKBACK_SCALE:1;
      const x=(root[0]-this.lastRoot[0])*this.config.scale*fallScale,z=(root[2]-this.lastRoot[2])*this.config.scale*fallScale;
      const yaw=this.motionYaw;
      const dx=x*Math.cos(yaw)+z*Math.sin(yaw),dz=z*Math.cos(yaw)-x*Math.sin(yaw);
      if(stalking){
        const player=this.player.position,p=this.actor.position;
        const to=this.v02MoveTarget.set(p.x+dx,p.y,p.z+dz),navigation=this.movementNavigation;
        const distance=Math.hypot(p.x-player.x,p.z-player.z),nextDistance=Math.hypot(to.x-player.x,to.z-player.z);
        this.v02StalkRadius??=distance;
        const clear=!navigation||navigation.segmentClear(p,to,this.radius);
        const facing=Math.abs(angleDelta(Math.atan2(player.x-to.x,player.z-to.z),this.motionYaw+sampleYaw(clip,time)-(this.v02RootYaw??0)));
        if(clear&&nextDistance<=this.v02StalkRadius+.65&&facing<=Math.PI/3){p.x=to.x;p.z=to.z;brain.suppressStalkStep=false;}
        else brain.suppressStalkStep=true;
      }else{this.actor.position.x+=dx;this.actor.position.z+=dz;}
    }
    if(brain.mode!=='move'&&!this.knockTurn){
      this.actor.rotation.y=this.motionYaw+sampleYaw(clip,time)-(this.v02RootYaw??0);
    }
    this.previousWolfTime=time;
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
    super.hide();
    this.v02ImpactOutcome=null;
    this.v02LastContact=null;
    this.v02LastOutcome=null;
    this.v02ContactSerial=null;this.v02ResolvedSerial=null;this.v02StalkRadius=null;
  }

  inspect(){
    return {...super.inspect(),combatVersion:this.combatVersion,action:this.brain?.action?.id??null,
      phase:this.brain?.phase??null,behavior:this.brain?.behavior??null,contact:this.v02LastContact,outcome:this.v02LastOutcome};
  }
}
