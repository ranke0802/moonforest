import {boostSwordStrike} from '../equipment-stats.js';

// The authored Sword_Judgment hips reach the bottom of the pre-jump crouch
// at frame 28 (60 fps). Hold that exact animation sample before releasing.
export const GREAT_ATTACK_POSE=28/60;
export const GREAT_ATTACK_CHARGE_SECONDS=3;
export const GREAT_ATTACK_SLOW=.48;
export const GREAT_ATTACK_BASE_RADIUS=1.25;
export const GREAT_ATTACK_IMPACT=1.10;

export class GreatAttackCast{
  constructor(actionId,level,charging=true,chargeProgress=0){
    this.actionId=actionId;
    this.level=Math.min(5,Math.trunc(level));
    this.rankBonusPercent=20*this.level;
    this.charging=true;
    this.chargeProgress=chargeProgress;
    this.releaseCharge=0;
    this.center={x:0,y:0,z:0};
    this.radius=GREAT_ATTACK_BASE_RADIUS*(100+this.rankBonusPercent)/100;
    this.progress=charging?chargeProgress:0;
    this.phase='windup';
    this.impacted=false;
    if(!charging)this.release(); // A buffered press may already have ended.
  }

  release(){
    if(!this.charging)return;
    this.releaseCharge=Math.max(0,Math.min(1,this.chargeProgress||0));
    this.charging=false;
    this.phase='release';
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

  placeImpact(feet,blade,world,heading){
    const target=this.target?.active&&this.target.brain?.hp>0?this.target.actor.position:null;
    this.target=null;
    const center=this.center,terrain=world?.terrain,nav=world?.navigation;
    const clear=p=>Math.abs(p.y-feet.y)<=GREAT_ATTACK_BASE_RADIUS&&(!nav||nav.segmentClear(feet,p,0,true));
    if(target&&Math.hypot(target.x-feet.x,target.z-feet.z)<=this.standoff+.12&&clear(target)){
      center.x=target.x;center.z=target.z;center.y=terrain?.heightAt?.(target.x,target.z)??target.y;
      return;
    }
    // The sword is held to one side. Keep its forward reach on the attack
    // centerline, then clip that point to the warrior's side of a wall or ledge.
    const tip=blade?.[1],forwardX=Math.sin(heading),forwardZ=Math.cos(heading);
    const projected=tip?(tip[0]-feet.x)*forwardX+(tip[2]-feet.z)*forwardZ:0;
    const reach=projected>0?projected:GREAT_ATTACK_BASE_RADIUS;
    const project=t=>{
      center.x=feet.x+forwardX*reach*t;center.z=feet.z+forwardZ*reach*t;
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

  sample(clipTime,sample,baseStrike,attackBonus,feet,world,heading=0){
    sample.radialAttack=this;
    sample.contacts.length=0;
    if(this.charging){
      this.phase='windup';
      this.progress=this.chargeProgress;
    }else if(clipTime<GREAT_ATTACK_IMPACT){
      this.phase='release';this.progress=Math.max(0,(clipTime-GREAT_ATTACK_POSE)/(GREAT_ATTACK_IMPACT-GREAT_ATTACK_POSE));
    }else if(!this.impacted){
      this.placeImpact(feet,sample.blade,world,heading);
      this.impacted=true;this.phase='impact';this.progress=1;
      const strike=boostSwordStrike(baseStrike,attackBonus);
      const burst=strike.burst.map(value=>{
        // Leave rounding to each enemy contact, after any rear critical.
        return value+value*this.rankBonusPercent*this.releaseCharge/100;
      });
      const window={...strike,burst,damage:burst.reduce((sum,value)=>sum+value,0)};
      sample.contacts.push({window,blade:sample.blade,previous:null});
    }else{this.phase='recovery';this.progress=1;}
  }
}
