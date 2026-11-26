import {boostSwordStrike} from '../equipment-stats.js';

// The authored Sword_Judgment hips reach the bottom of the pre-jump crouch
// at frame 28 (60 fps). Hold that exact animation sample before releasing.
export const GREAT_ATTACK_POSE=28/60;
export const GREAT_ATTACK_HOLD=.24;
export const GREAT_ATTACK_SLOW=.48;
export const GREAT_ATTACK_BASE_RADIUS=1.25;
export const GREAT_ATTACK_IMPACT=1.10;

export class GreatAttackCast{
  constructor(actionId,level){
    this.actionId=actionId;
    this.level=Math.min(5,Math.trunc(level));
    this.multiplier=1+.2*this.level;
    this.holdLeft=GREAT_ATTACK_HOLD;
    this.center={x:0,y:0,z:0};
    this.radius=GREAT_ATTACK_BASE_RADIUS*this.multiplier;
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

  contains(position,navigation){
    if(!this.center||!position)return false;
    const dx=position.x-this.center.x,dz=position.z-this.center.z;
    return dx*dx+dz*dz<=this.radius*this.radius&&(!navigation||navigation.segmentClear(this.center,position,0,true));
  }

  sample(clipTime,sample,baseStrike,attackBonus,feet){
    // The approach predicts the landing with the real collision sweep. At
    // impact the actual constrained ground anchor owns the VFX and damage.
    if(!this.impacted&&clipTime>=GREAT_ATTACK_IMPACT){
      this.center.x=feet.x;this.center.y=feet.y;this.center.z=feet.z;
    }
    sample.radialAttack=this;
    sample.contacts.length=0;
    if(this.holdLeft>0){
      this.phase='windup';
      this.progress=.36*Math.min(1,clipTime/GREAT_ATTACK_POSE)+.64*(1-this.holdLeft/GREAT_ATTACK_HOLD);
    }else if(clipTime<GREAT_ATTACK_IMPACT){
      this.phase='release';this.progress=Math.max(0,(clipTime-GREAT_ATTACK_POSE)/(GREAT_ATTACK_IMPACT-GREAT_ATTACK_POSE));
    }else if(!this.impacted){
      this.impacted=true;this.phase='impact';this.progress=1;
      const strike=boostSwordStrike(baseStrike,attackBonus);
      const burst=strike.burst.map(value=>value*this.multiplier);
      const window={...strike,burst,damage:strike.damage*this.multiplier};
      sample.contacts.push({window,blade:sample.blade,previous:null});
    }else{this.phase='recovery';this.progress=1;}
  }
}
