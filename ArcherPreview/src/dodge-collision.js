import { isEnemySolid, dodgeSeparation } from './enemy-collision.js';
import { ARENA_RADIUS } from './world-limits.js';

const SKIN=.002, STEP=.06;

// Sweep each short portion of the authored roll, then spend its remaining
// distance along the contact tangent. Enemies are never moved by this solver.
export function constrainDodge(position, from, navigation, encounters = [], limit = ARENA_RADIUS) {
  const dx=position.x-from.x,dz=position.z-from.z,length=Math.hypot(dx,dz);
  if(length<1e-8)return position;
  const ux=dx/length,uz=dz/length;
  const exactWorld=typeof navigation.obstacleContact==='function';
  const circles=exactWorld?[]:navigation.obstacles.map(o=>({x:o.x,z:o.z,radius:o.radius+.32,enemy:false}));
  for(const enemy of encounters)if(isEnemySolid(enemy))circles.push({
    x:enemy.actor.position.x,z:enemy.actor.position.z,radius:dodgeSeparation(enemy),enemy:true,
  });
  let x=from.x,z=from.z;
  const contact=(mx,mz)=>{
    const a=mx*mx+mz*mz;
    if(a<1e-12)return null;
    // V3 supplies exact static box/circle sweeps. Other scenes retain the
    // original circle path, including the existing enemy shoulder assistance.
    // Include the v3 navigator's clearance skin before the sweep: subtracting
    // travel skin alone is insufficient at a grazing contact and would make
    // the next regular move relocate an otherwise safe rolled position.
    let hit=exactWorld?navigation.obstacleContact({x,z},{x:mx,z:mz},.322):null,time=hit?.time??1;
    for(const c of circles){
      const rx=x-c.x,rz=z-c.z,b=rx*mx+rz*mz;
      // Existing overlaps can escape or slide sideways, but cannot deepen.
      if(b>=-1e-10)continue;
      const gap=rx*rx+rz*rz-c.radius*c.radius,disc=b*b-a*gap;
      if(disc<0)continue;
      const t=gap<=0?0:(-b-Math.sqrt(disc))/a;
      if(t<0||t>time)continue;
      const hx=rx+mx*t,hz=rz+mz*t,n=Math.hypot(hx,hz);
      time=t;hit={time,nx:hx/n,nz:hz/n,enemy:c.enemy};
    }
    if(Math.hypot(x+mx,z+mz)>limit){
      const b=x*mx+z*mz,gap=x*x+z*z-limit*limit;
      const t=Math.max(0,(-b+Math.sqrt(Math.max(0,b*b-a*gap)))/a);
      if(t<=time){const hx=x+mx*t,hz=z+mz*t,n=Math.hypot(hx,hz);hit={time:t,nx:-hx/n,nz:-hz/n,enemy:false};}
    }
    return hit;
  };
  const steps=Math.ceil(length/STEP),step=length/steps;
  for(let s=0;s<steps;s++){
    let mx=ux*step,mz=uz*step;
    for(let pass=0;pass<4;pass++){
      const distance=Math.hypot(mx,mz),hit=contact(mx,mz);
      if(!hit){x+=mx;z+=mz;break;}
      const advance=Math.max(0,hit.time-SKIN/distance);
      x+=mx*advance;z+=mz*advance;
      const remaining=distance*(1-advance);
      if(remaining<1e-6)break;
      if(hit.enemy&&pass===0){
        const tx=-hit.nz,tz=hit.nx,dot=tx*ux+tz*uz;
        let sign=dot<0?-1:1;
        // At a head-on contact, choose the clearer shoulder instead of
        // yielding a zero tangent. A small offset then keeps that side stable.
        if(Math.abs(dot)<.15){
          const positive=contact(tx*.35,tz*.35)?.time??1;
          const negative=contact(-tx*.35,-tz*.35)?.time??1;
          if(Math.abs(positive-negative)>.01)sign=positive>negative?1:-1;
        }
        const travel=remaining*Math.max(.75,Math.abs(dot));
        mx=tx*sign*travel;mz=tz*sign*travel;
      }else{
        // Walls and secondary contacts only slide; they never receive the
        // steering assist, so sealed gaps and trees still stop the roll.
        const scale=remaining/distance;
        mx*=scale;mz*=scale;
        const inward=Math.min(0,mx*hit.nx+mz*hit.nz);
        mx-=hit.nx*inward;mz-=hit.nz*inward;
      }
      if(Math.hypot(mx,mz)<1e-6)break;
    }
  }
  position.x=x;position.z=z;
  return position;
}
