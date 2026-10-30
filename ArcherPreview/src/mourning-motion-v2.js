// Source: shared/motion-v2.js, r8-v2-cast-wind-idle-hit. Times are source clip seconds.
export const smooth01=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export const haloSpeedAt=t=>1+2*smooth01(t/.32)*(1-smooth01((t-2.30)/.70));
export const windAt=t=>smooth01((t-.12)/.66)*(1-smooth01((t-1.75)/1.03));
export const shotWeight=(t,duration,fadeIn,fadeOut)=>smooth01(Math.min(t/fadeIn,(duration-t)/fadeOut));
export function mourningMotionWeights({casting=false,castTime=0,hitActive=false,hitTime=0,interruptCastWeight=0,hitReleaseWeight=0,hitReleaseTime=0,gaitBlend=0}={},castingOverride=casting,out={}){
  let cast=castingOverride?shotWeight(castTime,3,.18,.25):hitActive?interruptCastWeight*(1-smooth01(hitTime/.15)):0;
  let hit=hitActive?shotWeight(hitTime,1.3,.07,.24):hitReleaseWeight*(1-smooth01(hitReleaseTime/.24));
  const total=Math.max(1,cast+hit);cast/=total;hit/=total;
  const base=1-cast-hit,gait=Math.max(0,Math.min(1,gaitBlend));out.walk=base*gait;out.cast=cast;out.idle=base*(1-gait);out.hit=hit;return out;
}
