import {boostSwordStrike} from '../equipment-stats.js';

// The authored Sword_Judgment hips reach the bottom of the pre-jump crouch
// at frame 28 (60 fps). Hold that exact animation sample before releasing.
export const GREAT_ATTACK_POSE=28/60;
export const GREAT_ATTACK_SLOW=.48;
export const GREAT_ATTACK_BASE_RADIUS=1.25;
export const GREAT_ATTACK_IMPACT=1.10;

export class GreatAttackCast{
  constructor(actionId,level,charging=true){
    this.actionId=actionId;
    this.level=Math.min(5,Math.trunc(level));
    this.multiplier=1+.2*this.level;
    this.charging=charging;
    this.center={x:0,y:0,z:0};
    this.radius=GREAT_ATTACK_BASE_RADIUS*this.multiplier;
    this.progress=0;
    this.phase=charging?'windup':'release';
    this.impacted=false;
  }

  release(){
    this.charging=false;
    if(this.phase==='windup')this.phase='release';
  }

  // Only the animation clock waits for the physical release. Approach the
  // crouch even on a coarse frame, then keep the same authored pose.
  clipStep(clipTime,dt,rate){
    return this.charging?Math.min(dt,Math.max(0,(GREAT_ATTACK_POSE-clipTime)/rate)):dt;
  }

  contains(position,navigation){
    if(!this.impacted||!position||Math.abs(position.y-this.center.y)>GREAT_ATTACK_BASE_RADIUS)return false;
    const dx=position.x-this.center.x,dz=position.z-this.center.z;
    return dx*dx+dz*dz<=this.radius*this.radius&&(!navigation||navigation.segmentClear(this.center,position,0,true));
  }

  placeImpact(feet,blade,world){
    const target=this.target?.active&&this.target.brain?.hp>0?this.target.actor.position:null;
    this.target=null;
    const center=this.center,terrain=world?.terrain,nav=world?.navigation;
    const clear=p=>Math.abs(p.y-feet.y)<=GREAT_ATTACK_BASE_RADIUS&&(!nav||nav.segmentClear(feet,p,0,true));
    if(target&&Math.hypot(target.x-feet.x,target.z-feet.z)<=this.standoff+.12&&clear(target)){
      center.x=target.x;center.z=target.z;center.y=terrain?.heightAt?.(target.x,target.z)??target.y;
      return;
    }
    // A free swing lands under the actual descending blade. Clip that ground
    // point to the warrior's side of a wall or ledge.
    const tip=blade?.[1],dx=(tip?.[0]??feet.x)-feet.x,dz=(tip?.[2]??feet.z)-feet.z;
    const project=t=>{
      center.x=feet.x+dx*t;center.z=feet.z+dz*t;
      center.y=terrain?.heightAt?.(center.x,center.z)??feet.y;
    };
    project(1);
    if(!clear(center)){
      let low=0,high=1;
      for(let i=0;i<7;i++){
        const mid=(low+high)/2;project(mid);
        if(clear(center))low=mid;else high=mid;
      }
      project(low);
    }
  }

  sample(clipTime,sample,baseStrike,attackBonus,feet,world){
    sample.radialAttack=this;
    sample.contacts.length=0;
    if(this.charging){
      this.phase='windup';
      this.progress=Math.min(1,clipTime/GREAT_ATTACK_POSE);
    }else if(clipTime<GREAT_ATTACK_IMPACT){
      this.phase='release';this.progress=Math.max(0,(clipTime-GREAT_ATTACK_POSE)/(GREAT_ATTACK_IMPACT-GREAT_ATTACK_POSE));
    }else if(!this.impacted){
      this.placeImpact(feet,sample.blade,world);
      this.impacted=true;this.phase='impact';this.progress=1;
      const strike=boostSwordStrike(baseStrike,attackBonus);
      const burst=strike.burst.map(value=>value*this.multiplier);
      const window={...strike,burst,damage:strike.damage*this.multiplier};
      sample.contacts.push({window,blade:sample.blade,previous:null});
    }else{this.phase='recovery';this.progress=1;}
  }
}
