// Intersect only the portion of the warned rectangle actually crossed this
// frame. This sweeps over slow frames without hitting the whole route early.
export function chargeTouchesPlayer(plan,previous,current,player,{playerRadius=.3,reach=.9}={}){
  const shape=plan?.shapes?.[0];if(shape?.kind!=='rect')return false;
  const {origin,direction}=plan,project=p=>(p.x-origin.x)*direction.x+(p.z-origin.z)*direction.z;
  const center=project(shape.center),start=center-shape.halfLength,end=center+shape.halfLength;
  const a=project(previous),b=project(current);
  const sweptStart=Math.max(start,Math.min(a,b)-reach),sweptEnd=Math.min(end,Math.max(a,b)+reach);
  if(sweptEnd<sweptStart)return false;
  const z=project(player),x=(player.x-origin.x)*direction.z-(player.z-origin.z)*direction.x;
  const across=Math.max(0,Math.abs(x)-shape.halfWidth),along=Math.max(sweptStart-z,z-sweptEnd,0);
  return across*across+along*along<=playerRadius*playerRadius+1e-8;
}
