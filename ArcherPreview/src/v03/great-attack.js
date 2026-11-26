import {boostSwordStrike} from '../equipment-stats.js';

// The authored Sword_Judgment hips reach the bottom of the pre-jump crouch
// at frame 28 (60 fps). Hold that exact animation sample before releasing.
export const GREAT_ATTACK_POSE=28/60;
export const GREAT_ATTACK_HOLD=.24;
export const GREAT_ATTACK_SLOW=.48;
const IMPACT_TIME=1.10;

export class GreatAttackCast{
  constructor(actionId,level){
    this.actionId=actionId;
    this.level=Math.min(5,Math.trunc(level));
    this.multiplier=1+.2*this.level;
    this.holdLeft=GREAT_ATTACK_HOLD;
    this.center=null;
    this.radius=0;
    this.progress=0;
    this.phase='windup';
    this.impacted=false;
  }

  // Only the animation clock pauses. Game time, damage, input and enemy
  // attacks continue. Preserve both sides of a coarse frame across the hold.
  clipStep(clipTime,dt,rate){
    if(this.holdLeft<=0)return dt;
    const toPose=Math.max(0,(GREAT_ATTACK_POSE-clipTime)/rate);
    const held=Math.min(this.holdLeft,Math.max(0,dt-toPose));
    this.holdLeft=Math.max(0,this.holdLeft-held);
    return dt-held;
  }

  aim(origin,heading,target,ratio,lunge,terrain,navigation){
    const dx=target?target.x-origin.x:0,dz=target?target.z-origin.z:0;
    const lock=target&&Math.hypot(dx,dz)<=lunge.reach*ratio+lunge.stop;
    const forward=(lunge.distance+1.35)*ratio;
    const x=lock?dx:Math.sin(heading)*forward,z=lock?dz:Math.cos(heading)*forward;
    const center={x:origin.x+x,y:origin.y,z:origin.z+z};
    // A blocked lunge cannot place its landing circle on the far side of a wall.
    if(navigation&&!navigation.segmentClear(origin,center,0,true)){
      let lo=0,hi=1;
      for(let i=0;i<8;i++){
        const t=(lo+hi)*.5;center.x=origin.x+x*t;center.z=origin.z+z*t;
        if(navigation.segmentClear(origin,center,0,true))lo=t;else hi=t;
      }
      center.x=origin.x+x*lo;center.z=origin.z+z*lo;
    }
    center.y=terrain?.heightAt?.(center.x,center.z)??origin.y;
    this.center=center;
  }

  contains(position,navigation){
    if(!this.center||!position)return false;
    const dx=position.x-this.center.x,dz=position.z-this.center.z;
    return dx*dx+dz*dz<=this.radius*this.radius&&(!navigation||navigation.segmentClear(this.center,position,0,true));
  }

  // Use the sampled sword's grip-to-tip reach, including player/model and
  // hit-volume scaling. Lock the radius once for preview and collision alike.
  sample(clipTime,sample,baseStrike,attackBonus){
    if(!this.radius){const [a,b]=sample.blade;this.radius=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])*this.multiplier;}
    sample.radialAttack=this;
    sample.contacts.length=0;
    if(this.holdLeft>0){
      this.phase='windup';
      this.progress=.36*Math.min(1,clipTime/GREAT_ATTACK_POSE)+.64*(1-this.holdLeft/GREAT_ATTACK_HOLD);
    }else if(clipTime<IMPACT_TIME){
      this.phase='release';this.progress=Math.max(0,(clipTime-GREAT_ATTACK_POSE)/(IMPACT_TIME-GREAT_ATTACK_POSE));
    }else if(!this.impacted){
      this.impacted=true;this.phase='impact';this.progress=1;
      const strike=boostSwordStrike(baseStrike,attackBonus);
      const burst=strike.burst.map(value=>value*this.multiplier);
      const window={...strike,burst,damage:strike.damage*this.multiplier};
      sample.contacts.push({window,blade:sample.blade,previous:null});
    }else{this.phase='recovery';this.progress=1;}
  }
}
