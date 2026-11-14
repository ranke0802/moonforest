const clamp=x=>Math.max(0,Math.min(1,x));
export function segmentDistanceSquared(p1,q1,p2,q2){
  return segmentDistanceValues(p1[0],p1[1],p1[2],q1[0],q1[1],q1[2],p2[0],p2[1],p2[2],q2[0],q2[1],q2[2]);
}
// Detailed sweeps can test thousands of segments in one attack. Use scalar
// scratch values instead of creating several arrays for every substep.
function segmentDistanceValues(px,py,pz,qx,qy,qz,ax,ay,az,bx,by,bz){
  const dx=qx-px,dy=qy-py,dz=qz-pz,ex=bx-ax,ey=by-ay,ez=bz-az,rx=px-ax,ry=py-ay,rz=pz-az;
  const a=dx*dx+dy*dy+dz*dz,e=ex*ex+ey*ey+ez*ez,f=ex*rx+ey*ry+ez*rz;let s=0,t=0;
  if(a<=1e-10&&e<=1e-10)return rx*rx+ry*ry+rz*rz;
  if(a<=1e-10)t=clamp(f/e);
  else {const c=dx*rx+dy*ry+dz*rz;if(e<=1e-10)s=clamp(-c/a);else {const b=dx*ex+dy*ey+dz*ez,den=a*e-b*b;s=den?clamp((b*f-c*e)/den):0;t=(b*s+f)/e;if(t<0){t=0;s=clamp(-c/a);}else if(t>1){t=1;s=clamp((b-c)/a);}}}
  const x=(px+dx*s)-(ax+ex*t),y=(py+dy*s)-(ay+ey*t),z=(pz+dz*s)-(az+ez*t);return x*x+y*y+z*z;
}
// Sweep the actual blade, rather than awarding a hit simply because J was pressed.
export function bladeTouchesCapsule(previous,current,capsule,radius,lateral=null){
  // Conservative sweep bounds reject distant limbs before the detailed sweep.
  // Include both blade endpoints at both times and the lateral cut allowance.
  for(let axis=0;axis<3;axis++){
    const lo=Math.min(current[0][axis],current[1][axis],previous?.[0][axis]??current[0][axis],previous?.[1][axis]??current[1][axis]);
    const hi=Math.max(current[0][axis],current[1][axis],previous?.[0][axis]??current[0][axis],previous?.[1][axis]??current[1][axis]);
    const extra=(lateral?.halfWidth??0)*Math.abs(lateral?.axis?.[axis]??0);
    if(hi+extra<Math.min(capsule[0][axis],capsule[1][axis])-radius||lo-extra>Math.max(capsule[0][axis],capsule[1][axis])+radius)return false;
  }
  const a=previous?.[0]??current[0],b=previous?.[1]??current[1],p=current[0],q=current[1];
  const dx=p[0]-a[0],dy=p[1]-a[1],dz=p[2]-a[2],ex=q[0]-b[0],ey=q[1]-b[1],ez=q[2]-b[2];
  const travel=previous?Math.max(Math.sqrt(dx*dx+dy*dy+dz*dz),Math.sqrt(ex*ex+ey*ey+ez*ez)):0;
  // Bound gaps by the collider radius instead of eight fixed samples. Fast swings
  // on slow devices must not skip narrow arms/legs between rendered frames.
  const steps=Math.max(1,Math.ceil(travel/Math.max(.005,radius*.5)));
  const c=capsule[0],d=capsule[1];
  if(sweptSegment(a,b,p,q,dx,dy,dz,ex,ey,ez,c[0],c[1],c[2],d[0],d[1],d[2],radius,steps))return true;
  // Retain the identical lateral samples and detailed sweep. Translate capsule
  // coordinates as scalars instead of allocating three arrays and recursively
  // recomputing blade travel for every row, limb and substep of a wide cut.
  if(lateral?.halfWidth>0){
    const width=lateral.halfWidth,rows=Math.max(2,Math.ceil(width*2/Math.max(.025,radius))),axis=lateral.axis;
    for(let i=0;i<=rows;i++){
      const offset=-width+width*2*i/rows;
      if(sweptSegment(a,b,p,q,dx,dy,dz,ex,ey,ez,c[0]-axis[0]*offset,c[1]-axis[1]*offset,c[2]-axis[2]*offset,d[0]-axis[0]*offset,d[1]-axis[1]*offset,d[2]-axis[2]*offset,radius,steps))return true;
    }
  }
  return false;
}
function sweptSegment(a,b,p,q,dx,dy,dz,ex,ey,ez,cx,cy,cz,dx2,dy2,dz2,radius,steps){
  // Same rejection bounds as the former recursive call, including each shifted
  // capsule. No change to radius, sample spacing, reach or contact windows.
  if(Math.max(a[0],b[0],p[0],q[0])<Math.min(cx,dx2)-radius||Math.min(a[0],b[0],p[0],q[0])>Math.max(cx,dx2)+radius||
     Math.max(a[1],b[1],p[1],q[1])<Math.min(cy,dy2)-radius||Math.min(a[1],b[1],p[1],q[1])>Math.max(cy,dy2)+radius||
     Math.max(a[2],b[2],p[2],q[2])<Math.min(cz,dz2)-radius||Math.min(a[2],b[2],p[2],q[2])>Math.max(cz,dz2)+radius)return false;
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    if(segmentDistanceValues(a[0]+dx*t,a[1]+dy*t,a[2]+dz*t,b[0]+ex*t,b[1]+ey*t,b[2]+ez*t,cx,cy,cz,dx2,dy2,dz2)<=radius*radius)return true;
  }
  return false;
}
export class MeleeContactGate{
  constructor(){this.previous=null;this.actionId=null;this.hits=new Set();this.pending=[];}
  reset(){this.previous=null;this.actionId=null;this.hits.clear();this.pending=[];}
  collect(sample){
    if(this.actionId!==sample.actionId){this.reset();this.actionId=sample.actionId;}
    const now=sample.elapsed??0,hits=[];let hitStop=0;
    for(const contact of sample.contacts??[sample]){
      if(!this.check({...sample,...contact}))continue;
      const window=contact.window;
      if(window.burst){
        // Commit only after real blade contact. Hold that impact pose for the short burst.
        hitStop=Math.max(hitStop,(window.burst.length-1)*window.interval+.015);
        window.burst.forEach((damage,i)=>this.pending.push({at:now+i*window.interval,hit:{...window,damage,heavy:i===window.burst.length-1,burstIndex:i+1}}));
      }else hits.push(window);
    }
    for(const pending of this.pending)if(pending.at<=now+1e-8)hits.push(pending.hit);
    this.pending=this.pending.filter(p=>p.at>now+1e-8);
    return {hits,hitStop};
  }
  check({actionId,window,blade,previous,capsule,radius,capsules,bladeRadius=0,rangeContact=false,lateral=null}){
    if(this.actionId!==actionId){this.reset();this.actionId=actionId;}
    if(!window){this.previous=null;return false;}
    const hit=!this.hits.has(window.id)&&(rangeContact||(capsules||[{points:capsule,radius}]).some(c=>bladeTouchesCapsule(previous||this.previous,blade,c.points,c.radius+bladeRadius,lateral)));
    this.previous=blade;
    if(hit)this.hits.add(window.id);
    return hit;
  }
}
