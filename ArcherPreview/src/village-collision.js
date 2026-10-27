const TINY=1e-10;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function localPoint(p,box,c,s){
  const x=p.x-box.x,z=p.z-box.z;
  return {x:x*c-z*s,z:x*s+z*c};
}
function boxDistance(p,box){
  const x=Math.abs(p.x)-box.halfWidth,z=Math.abs(p.z)-box.halfDepth;
  return Math.hypot(Math.max(x,0),Math.max(z,0))+Math.min(Math.max(x,z),0);
}
function boxNormal(p,delta,box){
  const x=p.x-clamp(p.x,-box.halfWidth,box.halfWidth),z=p.z-clamp(p.z,-box.halfDepth,box.halfDepth),d=Math.hypot(x,z);
  if(d>TINY)return {nx:x/d,nz:z/d};
  if(box.halfWidth-Math.abs(p.x)<box.halfDepth-Math.abs(p.z))return {nx:Math.sign(p.x)||Math.sign(delta.x)||1,nz:0};
  return {nx:0,nz:Math.sign(p.z)||Math.sign(delta.z)||1};
}

/** Signed distance to the actual solid, not its broad-phase enclosing circle. */
export function obstacleClearance(p,obstacle){
  if(obstacle.shape!=='box')return Math.hypot(p.x-obstacle.x,p.z-obstacle.z)-obstacle.radius;
  const c=Math.cos(obstacle.yaw),s=Math.sin(obstacle.yaw);
  return boxDistance(localPoint(p,obstacle,c,s),obstacle);
}

function circleContact(from,delta,x,z,radius){
  const rx=from.x-x,rz=from.z-z,a=delta.x**2+delta.z**2;
  if(a<TINY)return null;
  const b=rx*delta.x+rz*delta.z,gap=rx*rx+rz*rz-radius*radius;
  if(gap<=TINY){
    const d=Math.hypot(rx,rz);
    // A coincident initial overlap can escape in the requested direction.
    if(d<TINY||b>=-TINY)return null;
    return {time:0,nx:rx/d,nz:rz/d};
  }
  if(b>=0)return null;
  const discriminant=b*b-a*gap;if(discriminant<0)return null;
  const time=(-b-Math.sqrt(discriminant))/a;
  if(time<0||time>1)return null;
  const hx=rx+delta.x*time,hz=rz+delta.z*time,d=Math.hypot(hx,hz);
  return d>TINY?{time,nx:hx/d,nz:hz/d}:null;
}

/** Continuous circle sweep against a circle or the exact rounded OBB offset.
 * Faces are finite strips, corners are quarter-circles: enlarging both box
 * axes alone would wrongly fill the outside corner and close diagonal gaps.
 */
export function sweepObstacle(from,delta,obstacle,radius=0){
  if(obstacle.shape!=='box')return circleContact(from,delta,obstacle.x,obstacle.z,obstacle.radius+radius);
  if(delta.x**2+delta.z**2<TINY)return null;
  const c=Math.cos(obstacle.yaw),s=Math.sin(obstacle.yaw),p=localPoint(from,obstacle,c,s);
  const d={x:delta.x*c-delta.z*s,z:delta.x*s+delta.z*c};
  const world=hit=>hit&&{time:hit.time,nx:hit.nx*c+hit.nz*s,nz:-hit.nx*s+hit.nz*c};
  if(boxDistance(p,obstacle)<=radius+TINY){
    const normal=boxNormal(p,d,obstacle);
    return normal.nx*d.x+normal.nz*d.z<-TINY?world({time:0,...normal}):null;
  }
  const hx=obstacle.halfWidth,hz=obstacle.halfDepth;let closest=null;
  const accept=hit=>{if(hit&&hit.time>=0&&hit.time<=1&&(!closest||hit.time<closest.time))closest=hit;};
  for(const sign of [-1,1]){
    if(sign*d.x<-TINY){
      const time=(sign*(hx+radius)-p.x)/d.x,z=p.z+d.z*time;
      if(z>=-hz-TINY&&z<=hz+TINY)accept({time,nx:sign,nz:0});
    }
    if(sign*d.z<-TINY){
      const time=(sign*(hz+radius)-p.z)/d.z,x=p.x+d.x*time;
      if(x>=-hx-TINY&&x<=hx+TINY)accept({time,nx:0,nz:sign});
    }
  }
  if(radius>0)for(const xSign of [-1,1])for(const zSign of [-1,1]){
    const x=xSign*hx,z=zSign*hz,hit=circleContact(p,d,x,z,radius);
    if(hit&&(p.x+d.x*hit.time-x)*xSign>=-TINY&&(p.z+d.z*hit.time-z)*zSign>=-TINY)accept(hit);
  }
  return world(closest);
}
