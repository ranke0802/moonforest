const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const clamp=x=>Math.max(0,Math.min(1,x));
export function segmentDistanceSquared(p1,q1,p2,q2){
  const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2),a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);let s=0,t=0;
  if(a<=1e-10&&e<=1e-10)return dot(r,r);
  if(a<=1e-10)t=clamp(f/e);
  else {const c=dot(d1,r);if(e<=1e-10)s=clamp(-c/a);else {const b=dot(d1,d2),den=a*e-b*b;s=den?clamp((b*f-c*e)/den):0;t=(b*s+f)/e;if(t<0){t=0;s=clamp(-c/a);}else if(t>1){t=1;s=clamp((b-c)/a);}}}
  const d=sub(add(p1,mul(d1,s)),add(p2,mul(d2,t)));return dot(d,d);
}
// Sweep the actual blade, rather than awarding a hit simply because J was pressed.
export function bladeTouchesCapsule(previous,current,capsule,radius){
  for(let i=0;i<=8;i++){
    const t=i/8,blade=current.map((p,k)=>p.map((v,j)=>previous?previous[k][j]+(v-previous[k][j])*t:v));
    if(segmentDistanceSquared(...blade,...capsule)<=radius*radius)return true;
  }
  return false;
}
export class MeleeContactGate{
  constructor(){this.previous=null;this.actionId=null;this.hits=new Set();}
  reset(){this.previous=null;this.actionId=null;this.hits.clear();}
  check({actionId,window,blade,previous,capsule,radius,capsules}){
    if(this.actionId!==actionId){this.reset();this.actionId=actionId;}
    if(!window){this.previous=null;return false;}
    const hit=!this.hits.has(window.id)&&(capsules||[{points:capsule,radius}]).some(c=>bladeTouchesCapsule(previous||this.previous,blade,c.points,c.radius));
    this.previous=blade;
    if(hit)this.hits.add(window.id);
    return hit;
  }
}
