import {Vector3} from '@babylonjs/core';
import {PLAYER_STRIKES} from './player-strikes.js';

const profiles=new WeakMap();
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function profile(shield){
 const geometry=shield.geometry;if(!geometry)return null;if(profiles.has(geometry))return profiles.get(geometry);
 const positions=shield.getVerticesData('position');if(!positions)return null;
 const points=[];let front=-Infinity;for(let i=0;i<positions.length;i+=3){points.push([positions[i],positions[i+1]]);front=Math.max(front,positions[i+2]);}
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const lower=[],upper=[];
 for(const point of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
 for(let i=points.length-1;i>=0;i--){const point=points[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
 lower.pop();upper.pop();const hull=lower.concat(upper),low=Math.min(...hull.map(p=>p[1])),high=Math.max(...hull.map(p=>p[1])),rows=[];
 for(let row=0;row<=12;row++){
  const y=low+(high-low)*row/12;let left=Infinity,right=-Infinity;
  for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];if(y<Math.min(a[1],b[1])-1e-7||y>Math.max(a[1],b[1])+1e-7)continue;const t=Math.abs(b[1]-a[1])<1e-8?0:Math.max(0,Math.min(1,(y-a[1])/(b[1]-a[1]))),x=a[0]+(b[0]-a[0])*t;left=Math.min(left,x);right=Math.max(right,x);}
  if(Number.isFinite(left))rows.push([new Vector3(left,y,front),new Vector3(right,y,front)]);
 }
 profiles.set(geometry,rows);return rows;
}

// Only a released shield-push window gains the full visible face. The game's
// sword samples and window timings are unchanged. World face history is clipped
// to that same window before the ordinary anatomy gate/dedup sees it.
export class WolfV02ShieldSweep{
 constructor(){this.point=new Vector3();this.shield=null;this.rows=null;this.action=null;this.time=0;this.history=false;}
 reset(clearTarget=false){this.action=null;this.history=false;if(clearTarget)this.shield=null;}
 warm(shield){
  if(!shield)return false;
  if(this.shield!==shield){
   this.shield=shield;const source=profile(shield);if(!source)return false;
   if(source!==this.profile){this.profile=source;this.rows=source.map(local=>({local,now:[[0,0,0],[0,0,0]],old:[[0,0,0],[0,0,0]],contact:{window:null,blade:[[0,0,0],[0,0,0]],previous:[[0,0,0],[0,0,0]],lateral:null}}));this.contacts=this.rows.map(row=>row.contact);}
   this.reset();
  }
  return !!this.rows;
 }
 sample(input,result,shield){
  // Bind rigid geometry on the initial idle pose (or hidden preparation when
  // the equipment reference is available), never wait for the released hit.
  if(!this.warm(shield)){this.reset();return input;}
  const strike=PLAYER_STRIKES.shieldPush[0];
  if(result.state!=='shieldPush'||result.actionId==null||result.clipTime<strike.from-.25||result.clipTime>strike.to+.25){this.reset();return input;}
  const continuous=this.history&&this.action===result.actionId&&result.clipTime>=this.time&&result.clipTime-this.time<.5,window=input?.contacts?.find(contact=>contact.window?.id==='shield-push')?.window;
  const from=continuous?this.time:result.clipTime,span=Math.max(1e-9,result.clipTime-from),a=continuous?Math.max(0,Math.min(1,((window?.from??from)-from)/span)):1,b=continuous?Math.max(0,Math.min(1,((window?.to??result.clipTime)-from)/span)):1;
  for(const row of this.rows)for(let endpoint=0;endpoint<2;endpoint++){
   Vector3.TransformCoordinatesToRef(row.local[endpoint],shield.getWorldMatrix(),this.point);const now=row.now[endpoint],old=row.old[endpoint];now[0]=this.point.x;now[1]=this.point.y;now[2]=this.point.z;
   for(let axis=0;axis<3;axis++){const previous=continuous?old[axis]:now[axis];row.contact.previous[endpoint][axis]=previous+(now[axis]-previous)*a;row.contact.blade[endpoint][axis]=previous+(now[axis]-previous)*b;old[axis]=now[axis];}
   row.contact.window=window;
  }
  this.action=result.actionId;this.time=result.clipTime;this.history=result.state==='shieldPush'&&result.actionId!=null;
  return window?{...input,contacts:this.contacts}:input;
 }
}
