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
  const travel=previous?Math.max(...current.map((p,k)=>Math.sqrt(dot(sub(p,previous[k]),sub(p,previous[k]))))):0;
  // Bound gaps by the collider radius instead of eight fixed samples. Fast swings
  // on slow devices must not skip narrow arms/legs between rendered frames.
  const steps=Math.max(1,Math.ceil(travel/Math.max(.005,radius*.5)));
  for(let i=0;i<=steps;i++){
    const t=i/steps,blade=current.map((p,k)=>p.map((v,j)=>previous?previous[k][j]+(v-previous[k][j])*t:v));
    if(segmentDistanceSquared(...blade,...capsule)<=radius*radius)return true;
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
  check({actionId,window,blade,previous,capsule,radius,capsules,bladeRadius=0,rangeContact=false}){
    if(this.actionId!==actionId){this.reset();this.actionId=actionId;}
    if(!window){this.previous=null;return false;}
    const hit=!this.hits.has(window.id)&&(rangeContact||(capsules||[{points:capsule,radius}]).some(c=>bladeTouchesCapsule(previous||this.previous,blade,c.points,c.radius+bladeRadius)));
    this.previous=blade;
    if(hit)this.hits.add(window.id);
    return hit;
  }
}
