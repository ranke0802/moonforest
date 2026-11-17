// Path-following logic for the guide light. Pure maths over {x,z} points; the
// visual lives in guide-wisp.js. The light keeps a lead ahead of the player,
// waits when they fall behind, and never teleports when the path is rebuilt.
const LEAD=5.5,MAX_SPEED=12,REJOIN=6;
export function createGuideTrack(){
 let points=[],lengths=[0],total=0,s=0;const position={x:0,z:0},scratch={s:0,distance:Infinity};
 function project(p){
  let best=Infinity,at=0;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
   const t=len>1e-9?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/len)):0,x=a.x+dx*t,z=a.z+dz*t,d=(p.x-x)*(p.x-x)+(p.z-z)*(p.z-z);
   if(d<best){best=d;at=lengths[i]+Math.sqrt(len)*t;}
  }
  scratch.s=at;scratch.distance=Math.sqrt(best);return scratch;
 }
 function place(value){
  s=Math.max(0,Math.min(total,value));
  let i=0;while(i<points.length-2&&lengths[i+1]<s)i++;
  const a=points[i],b=points[i+1]??a,span=lengths[i+1]-lengths[i],t=span>1e-9?(s-lengths[i])/span:0;
  position.x=a.x+(b.x-a.x)*t;position.z=a.z+(b.z-a.z)*t;
 }
 return {
  position,
  get total(){return total;},
  get distance(){return s;},
  get active(){return points.length>1;},
  clear(){points=[];lengths=[0];total=0;s=0;},
  // points[0] is where the player stands; the last point is the goal.
  setPath(next){
   const had=points.length>1,previous={x:position.x,z:position.z};
   points=next.map(p=>({x:p.x,z:p.z}));lengths=[0];total=0;
   for(let i=1;i<points.length;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);lengths.push(total);}
   if(points.length<2){this.clear();return;}
   // Keep the light where it is when the new path passes nearby.
   const near=had?project(previous):null;
   place(near&&near.distance<=REJOIN?near.s:0);
  },
  // Returns true once the light has reached the end of its path.
  update(dt,player,{stopShort=0}={}){
   if(points.length<2)return false;
   const end=Math.max(0,total-stopShort),ahead=project(player).s,wanted=Math.min(end,ahead+LEAD),gap=wanted-s;
   if(gap>0)place(Math.min(wanted,s+Math.min(MAX_SPEED,2.5+gap*2.4)*dt));
   else if(gap<-REJOIN)place(s+Math.max(-4,gap)*dt);
   return s>=end-.25;
  },
 };
}
