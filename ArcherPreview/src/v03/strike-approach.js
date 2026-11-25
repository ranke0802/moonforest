import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {isLowMeleeTarget,meleeApproachPoint} from '../player-melee-aim.js';
import {PLAYER_STRIKE_AIM_YAW} from '../player-strikes.js';

export const STRIKE_LUNGE=Object.freeze({slash:{distance:.55,until:.35},attack:{distance:.7,until:.35},judgment:{distance:.9,until:.3,reach:3,stop:1.25}});
const point=new Vector3();

// Ground travel follows the attack's locked target. The caller sweeps each
// step against terrain, walls and every solid actor, including bystanders.
export function strikeLungeStep(state,player,action,profile,foe,nearest,manual,ratio,duration,dt,fitted=true){
  const phase=Math.min(1,(action.clipTime??0)/(duration*profile.until));
  if(fitted&&state.id===action.actionId&&state.finished)return 0;
  const track=fitted?(manual?null:foe):foe??(profile.reach?nearest:null);
  const live=track?.active&&track.brain?.hp>0,p=player.position;
  const root=live?track.actor.position:null;
  const goal=live?(fitted?meleeApproachPoint(track,point):root):null;
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
  if(fitted)return Math.max(0,Math.min(step,gap-stop));
  return nearest?.actor?Math.max(0,Math.min(step,Vector3.Distance(p,nearest.actor.position)-stop)):step;
}
