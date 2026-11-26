import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {isLowMeleeTarget,meleeApproachPoint} from '../player-melee-aim.js';
import {constrainDodge} from '../dodge-collision.js';
import {GREAT_ATTACK_BASE_RADIUS,GREAT_ATTACK_IMPACT} from './great-attack.js';
import {PLAYER_STRIKE_AIM_YAW} from '../player-strikes.js';

export const STRIKE_LUNGE=Object.freeze({slash:{distance:.55,until:.35},attack:{distance:.7,until:.35},judgment:{distance:.9,until:.3,reach:3,stop:GREAT_ATTACK_BASE_RADIUS}});
const point=new Vector3();

// Ground travel follows the attack's locked target. The caller sweeps each
// step against terrain, walls and every solid actor, including bystanders.
export function strikeLungeStep(state,player,action,profile,foe,nearest,manual,ratio,duration,dt,fitted=true){
  const end=action.greatAttack?GREAT_ATTACK_IMPACT:duration*profile.until;
  const phase=Math.min(1,(action.clipTime??0)/end);
  if(fitted&&state.id===action.actionId&&state.finished)return 0;
  const track=fitted?(manual?null:foe):foe??(profile.reach?nearest:null);
  const live=track?.active&&track.brain?.hp>0,p=player.position;
  const root=live?track.actor.position:null;
  const goal=live&&fitted&&!action.greatAttack?meleeApproachPoint(track,point):root;
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
    const move=Math.max(0,Math.min(step,gap-stop));
    if(action.greatAttack)state.remaining=Math.max(0,Math.min(state.span-want,gap-stop-move));
    return move;
  }
  return nearest?.actor?Math.max(0,Math.min(step,Vector3.Distance(p,nearest.actor.position)-stop)):step;
}

function sweepStrike(to,from,heading,step,world,encounters,limit,dimensions,clampExit){
  to.x=from.x;to.z=from.z;
  if(step<=1e-4)return;
  to.x+=Math.sin(heading)*step;to.z+=Math.cos(heading)*step;
  constrainDodge(to,from,world.navigation,encounters,limit,dimensions);
  clampExit?.(to,from);
}

// Forecast only the unspent, currently reachable travel. A moving target,
// changed facing, wall or bystander updates the preview before impact.
export function applyStrikeTravel(player,action,state,heading,step,world,encounters,limit,dimensions,clampExit){
  const feet=player.position;
  if(step>1e-4)sweepStrike(feet,feet.clone(),heading,step,world,encounters,limit,dimensions,clampExit);
  const cast=action.greatAttack;
  if(!cast||cast.impacted)return;
  const remaining=state.remaining;
  if(remaining<=1e-4){
    cast.center.x=feet.x;cast.center.z=feet.z;
  }else{
    const now=action.actionElapsed??action.clipTime;
    const preview=cast.landingPreview??={next:0,x:0,z:0,heading:0,remaining:0};
    // The crouch keeps this sweep identical for many frames. Recheck moving
    // blockers at least every 75 ms of simulation (156 ms at charge speed).
    if(now<preview.next&&Math.abs(feet.x-preview.x)+Math.abs(feet.z-preview.z)<.008&&
       Math.abs(heading-preview.heading)<.008&&Math.abs(remaining-preview.remaining)<.008)return;
    preview.x=feet.x;preview.z=feet.z;preview.heading=heading;preview.remaining=remaining;preview.next=now+.075;
    sweepStrike(cast.center,feet,heading,remaining,world,encounters,limit,dimensions,clampExit);
  }
  cast.center.y=world.terrain?.heightAt?.(cast.center.x,cast.center.z)??feet.y;
}
