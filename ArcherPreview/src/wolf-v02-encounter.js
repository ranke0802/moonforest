import {Vector3} from '@babylonjs/core';
import {WolfEncounter} from './wolf-encounter.js';
import {WolfV02Brain,WOLF_V02_KNOCKBACK_SCALE} from './wolf-v02-spec.js';
import {WOLF_CLIPS} from './wolf-spec.js';
import {playerDimensions} from './player-dimensions.js';
import {installWolfV02AttackClips} from './wolf-v02-authored-clips.js';

// These envelopes include the contacting part and the player's body width.
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
    const target=this.v02MoveTarget,origin=this.actor.position;
    if(result.flank){
      const flank=result.flank;
      const bearing=Math.atan2(origin.x-player.position.x,origin.z-player.position.z);
      const angle=bearing+(flank.side<0?-1:1)*(flank.angle??.45);
      const radius=flank.radius??6.5;
      target.set(player.position.x+Math.sin(angle)*radius,player.position.y,player.position.z+Math.cos(angle)*radius);
      return {target,stopDistance:.12};
    }
    if(result.retreat){
      target.copyFrom(origin).subtractInPlace(player.position);target.y=0;
      if(target.lengthSquared()<1e-8)target.set(-Math.sin(this.actor.rotation.y),0,-Math.cos(this.actor.rotation.y));
      const distance=result.retreatDistance??result.engageDistance??result.stopDistance??25.4;
      target.normalize().scaleInPlace(distance).addInPlace(player.position);
      return {target,stopDistance:.12};
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
    if(time>=this.previousWolfTime&&this.lastRoot&&!brain.stagger&&brain.mode!=='move'){
      // The large 2.5x body amplified both authored fall travel and impulse.
      // Keep the pose curve intact and shorten only the world displacement.
      const fallScale=['down','recover'].includes(brain.mode)?WOLF_V02_KNOCKBACK_SCALE:1;
      const x=(root[0]-this.lastRoot[0])*this.config.scale*fallScale,z=(root[2]-this.lastRoot[2])*this.config.scale*fallScale;
      const yaw=this.motionYaw;
      this.actor.position.x+=x*Math.cos(yaw)+z*Math.sin(yaw);
      this.actor.position.z+=z*Math.cos(yaw)-x*Math.sin(yaw);
    }
    if(brain.mode!=='move'&&!this.knockTurn){
      this.actor.rotation.y=this.motionYaw+sampleYaw(clip,time)-(this.v02RootYaw??0);
    }
    this.previousWolfTime=time;
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
    const low=this.player.position.y+.15,high=this.player.position.y+playerDimensions(this.player).headHeight;
    let best=null;
    for(const point of points){
      const part=this.v02ContactParts.find(p=>p.point===point);
      const radius=part?.radius??.6;
      const distance=Math.hypot(point.x-aim.x,point.z-aim.z,Math.max(low-point.y,point.y-high,0));
      if(!best||distance-radius<best.distance-best.radius){best={part:part?.name??'jaw',point:point.asArray(),distance,radius};}
      if(distance<=radius){
        this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:this.brain.time,...best,contact:true};
        return true;
      }
    }
    this.v02LastContact={serial:this.brain.serial,action:event.id??this.brain.action?.id,sourceTime:this.brain.time,...best,contact:false};
    return false;
  }

  receiveBossHit(options){
    const serial=this.brain.serial,before=this.playerHp,wasCaptured=this.grab.active;
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
    const serial=this.brain?.serial,hasImpact=this.pendingEvents?.some(event=>event.type==='attack');
    const heavyBefore=this.heavyCount;
    const action=this.brain?.action?.id??null;
    this.v02ImpactOutcome=null;
    const hitStop=super.poseAndContacts(player,result,sample,shield);
    if(this.heavyCount>heavyBefore)this.knockVelocity.scaleInPlace(WOLF_V02_KNOCKBACK_SCALE);
    if(hasImpact){
      const outcome=this.v02ImpactOutcome??{serial,hit:false,blocked:false,captured:false};
      this.v02LastOutcome={...outcome,action};
      this.brain.noteAttackResult?.(outcome);
    }
    return hitStop;
  }

  hide(){
    super.hide();
    this.v02ImpactOutcome=null;
    this.v02LastContact=null;
    this.v02LastOutcome=null;
  }

  inspect(){
    return {...super.inspect(),combatVersion:this.combatVersion,action:this.brain?.action?.id??null,
      phase:this.brain?.phase??null,behavior:this.brain?.behavior??null,contact:this.v02LastContact,outcome:this.v02LastOutcome};
  }
}
