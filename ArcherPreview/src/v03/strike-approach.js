import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {isLowMeleeTarget,meleeApproachPoint} from '../player-melee-aim.js';
import {constrainDodge} from '../dodge-collision.js';
import {GREAT_ATTACK_BASE_RADIUS,GREAT_ATTACK_IMPACT,GREAT_ATTACK_POSE} from './great-attack.js';
import {playerDimensions} from '../player-dimensions.js';
import {PLAYER_STRIKE_AIM_YAW} from '../player-strikes.js';

export const STRIKE_LUNGE=Object.freeze({slash:{distance:.55,until:.35},attack:{distance:.7,until:.35},judgment:{distance:.9,until:.3,reach:3,stop:GREAT_ATTACK_BASE_RADIUS}});
export const STARFALL_REACH_SCALE=1.5;
const point=new Vector3();
const previousFeet=new Vector3();
// Tracked reach already reflects the range used to select the chain foe.
export const strikeAimRange=(foe,trackedReach=0,reachScale=1)=>Math.max((foe?.meleeAimDistance??4)*reachScale,trackedReach);

function greatAttackStep(cast,player,foe,manual,profile,ratio,clipTime,aimReach){
  if(cast.charging||cast.impacted)return 0;
  const feet=player.position;
  if(cast.dashTime===undefined){
    cast.dashTime=0;cast.dashDistance=0;
    cast.dashLimit=strikeAimRange(foe,aimReach,STARFALL_REACH_SCALE);
    cast.target=!manual&&foe?.active&&foe.brain?.hp>0&&Vector3.Distance(feet,foe.actor.position)<=cast.dashLimit?foe:null;
    // Large bosses keep their physical body clearance when the warrior lands.
    cast.standoff=Math.max(profile.stop,(cast.target?.radius??0)+playerDimensions(player).standingClearance);
  }
  const t=Math.min(1,Math.max(0,(clipTime-GREAT_ATTACK_POSE)/(GREAT_ATTACK_IMPACT-GREAT_ATTACK_POSE)));
  const prior=cast.dashTime;
  if(t<=prior)return 0;
  cast.dashTime=t;
  const easedStep=(1-prior)**2-(1-t)**2;
  if(!cast.target?.active||!(cast.target.brain?.hp>0)){
    cast.target=null;
    const step=Math.min(cast.dashLimit-cast.dashDistance,profile.distance*ratio*easedStep);
    cast.dashDistance+=step;
    return step;
  }
  const to=cast.target.actor.position,dx=to.x-feet.x,dz=to.z-feet.z,gap=Math.hypot(dx,dz);
  if(gap>.001)player.rotation.y=Math.atan2(dx,dz);
  // Keep the authored easing for a stationary target. Unspent travel can
  // follow a moving foe up to the original range and the peak dash speed.
  const follow=Math.max(0,gap-cast.standoff)*easedStep/(1-prior)**2;
  const step=Math.min(cast.dashLimit-cast.dashDistance,2*cast.dashLimit*(t-prior),follow);
  cast.dashDistance+=step;
  return step;
}

// Ground travel follows the attack's locked target. The caller sweeps each
// step against terrain, walls and every solid actor, including bystanders.
export function strikeLungeStep(state,player,action,profile,foe,nearest,manual,ratio,duration,dt,fitted=true,aimReach=0){
  if(action.greatAttack)return greatAttackStep(action.greatAttack,player,foe,manual,profile,ratio,action.clipTime??0,aimReach);
  const end=duration*profile.until;
  const phase=Math.min(1,(action.clipTime??0)/end);
  if(fitted&&state.id===action.actionId&&state.finished)return 0;
  const track=fitted?(manual?null:foe):foe??(profile.reach?nearest:null);
  const live=track?.active&&track.brain?.hp>0,p=player.position;
  const root=live?track.actor.position:null;
  const goal=live&&fitted?meleeApproachPoint(track,point):root;
  const rootGap=root?(fitted?Math.hypot(root.x-p.x,root.z-p.z):Vector3.Distance(p,root)):Infinity;
  const gap=fitted&&goal?Math.min(rootGap,Math.hypot(goal.x-p.x,goal.z-p.z)):rootGap;
  const stop=profile.stop??(fitted&&isLowMeleeTarget(track)?1:1.3);
  if(state.id!==action.actionId){
    state.id=action.actionId;state.done=0;state.reach=(profile.reach??0)*ratio;
    state.foe=state.reach&&live&&rootGap<state.reach+(profile.stop??1.3)?track:null;
    state.span=state.foe?Math.max(0,gap-stop):profile.distance*ratio;
  }
  if(state.foe&&state.foe===track&&live)state.span=Math.min(state.reach,Math.max(state.span,state.done+gap-stop));
  const want=state.span*(1-(1-phase)**2);
  if(phase<1&&!manual&&foe&&goal){
    const turn=Math.atan2(goal.x-p.x,goal.z-p.z)+(PLAYER_STRIKE_AIM_YAW[action.state]??0)-player.rotation.y;
    player.rotation.y+=Math.max(-4*dt,Math.min(4*dt,Math.atan2(Math.sin(turn),Math.cos(turn))));
  }
  const step=want-state.done;state.done=want;state.finished=phase===1;
  if(fitted){
    return Math.max(0,Math.min(step,gap-stop));
  }
  return nearest?.actor?Math.max(0,Math.min(step,Vector3.Distance(p,nearest.actor.position)-stop)):step;
}

export function applyStrikeTravel(player,action,heading,step,world,encounters,limit,dimensions,clampExit){
  if(step<=1e-4)return;
  const feet=player.position;
  const ground=action.greatAttack&&world.terrain?.heightAt?world.terrain:null;
  const portions=ground?Math.ceil(step/dimensions.moveRadius):1;
  const dx=Math.sin(heading)*step/portions,dz=Math.cos(heading)*step/portions;
  for(let i=0;i<portions;i++){
    previousFeet.copyFrom(feet);
    feet.x+=dx;feet.z+=dz;
    constrainDodge(feet,previousFeet,world.navigation,encounters,limit,dimensions);
    clampExit?.(feet,previousFeet);
    if(ground){
      const height=ground.heightAt(feet.x,feet.z);
      if(Math.abs(height-feet.y)>dimensions.moveRadius+Math.hypot(feet.x-previousFeet.x,feet.z-previousFeet.z)){
        feet.copyFrom(previousFeet);break;
      }
      feet.y=height;
    }
  }
}
