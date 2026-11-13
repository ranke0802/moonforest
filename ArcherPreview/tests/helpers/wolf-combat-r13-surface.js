import {Vector3} from '@babylonjs/core';
import {TreeViewSurface} from '../../src/tree-view-surface.js';
import {segmentTriangleDistanceSquared} from './skin-sweep.js';

const clamp=n=>Math.max(0,Math.min(1,n));
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
export function worldSurface(mesh){
 mesh.skeleton?.prepare(true);const raw=mesh.getPositionData(true,true),positions=new Float64Array(raw.length),matrix=mesh.getWorldMatrix().m;
 for(let i=0;i<raw.length;i+=3){const x=raw[i],y=raw[i+1],z=raw[i+2];positions[i]=x*matrix[0]+y*matrix[4]+z*matrix[8]+matrix[12];positions[i+1]=x*matrix[1]+y*matrix[5]+z*matrix[9]+matrix[13];positions[i+2]=x*matrix[2]+y*matrix[6]+z*matrix[10]+matrix[14];}
 return {positions,indices:mesh.getIndices()};
}
export function nearestSurfaceVertexBound(a,b){
 let best=Infinity;
 for(let i=0;i<a.positions.length;i+=3)for(let j=0;j<b.positions.length;j+=3){const x=a.positions[i]-b.positions[j];if(x*x>=best)continue;const y=a.positions[i+1]-b.positions[j+1];if(x*x+y*y>=best)continue;const z=a.positions[i+2]-b.positions[j+2],d=x*x+y*y+z*z;if(d<best)best=d;}
 return Math.sqrt(best);
}
export function exactSurfaceDistance(a,b){
 const tree=new TreeViewSurface({getVerticesData:()=>b.positions,getIndices:()=>b.indices});let best=nearestSurfaceVertexBound(a,b)**2,tests=0;
 for(let t=0;t<a.indices.length;t+=3){
  const tri=[0,1,2].map(k=>at(a.positions,a.positions,a.indices[t+k],0)),lo=[0,1,2].map(k=>Math.min(...tri.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...tri.map(p=>p[k]))),stack=[0];
  while(stack.length){const node=stack.pop(),off=node*6;let gap=0;for(let k=0;k<3;k++){const d=Math.max(0,lo[k]-tree.bounds[off+k+3]-1e-5,tree.bounds[off+k]-hi[k]-1e-5);gap+=d*d;}if(gap>best)continue;const count=tree.ranges[node*2+1];if(!count){stack.push(tree.children[node*2],tree.children[node*2+1]);continue;}
   for(let j=tree.ranges[node*2];j<tree.ranges[node*2]+count;j++){
    const offset=tree.order[j]*3,other=[0,1,2].map(k=>at(b.positions,b.positions,b.indices[offset+k],0));tests++;
    for(let edge=0;edge<3;edge++){best=Math.min(best,segmentTriangleDistanceSquared(tri[edge],tri[(edge+1)%3],...other),segmentTriangleDistanceSquared(other[edge],other[(edge+1)%3],...tri));if(best<1e-16)return {distance:0,trianglePairs:tests};}
   }
  }
 }
 return {distance:Math.sqrt(best),trianglePairs:tests};
}
const at=(old,now,vertex,t)=>[0,1,2].map(k=>old[vertex*3+k]+(now[vertex*3+k]-old[vertex*3+k])*t);
const travel=(a,b)=>{let maximum=0;for(let i=0;i<a.length;i+=3)maximum=Math.max(maximum,Math.hypot(b[i]-a[i],b[i+1]-a[i+1],b[i+2]-a[i+2]));return maximum;};
const bounds=surface=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<surface.positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],surface.positions[i+k]);hi[k]=Math.max(hi[k],surface.positions[i+k]);}return {lo,hi};};
function containment(surface,point){
 const box=bounds(surface);if([0,1,2].some(k=>point[k]<box.lo[k]||point[k]>box.hi[k]))return 'outside';
 const answers=[];
 for(const direction of [[1,.371,.193],[.217,1,.433],[.389,.173,1]]){
  const crossings=[];
  for(let i=0;i<surface.indices.length;i+=3){
   const a=at(surface.positions,surface.positions,surface.indices[i],0),b=at(surface.positions,surface.positions,surface.indices[i+1],0),c=at(surface.positions,surface.positions,surface.indices[i+2],0),e=b.map((v,k)=>v-a[k]),f=c.map((v,k)=>v-a[k]);
   const h=[direction[1]*f[2]-direction[2]*f[1],direction[2]*f[0]-direction[0]*f[2],direction[0]*f[1]-direction[1]*f[0]],det=e.reduce((s,v,k)=>s+v*h[k],0);if(Math.abs(det)<1e-12)continue;
   const s=point.map((v,k)=>v-a[k]),u=s.reduce((n,v,k)=>n+v*h[k],0)/det;if(u<0||u>1)continue;
   const q=[s[1]*e[2]-s[2]*e[1],s[2]*e[0]-s[0]*e[2],s[0]*e[1]-s[1]*e[0]],v=direction.reduce((n,x,k)=>n+x*q[k],0)/det;if(v<0||u+v>1)continue;
   const t=f.reduce((n,x,k)=>n+x*q[k],0)/det;if(t>1e-7)crossings.push({t,sign:Math.sign(det)});
  }
  crossings.sort((a,b)=>a.t-b.t);let sum=0,last=-Infinity;
  for(const hit of crossings)if(hit.t-last>1e-6){sum+=hit.sign;last=hit.t;}
  answers.push(sum!==0);
 }
 return answers.every(Boolean)?'inside':answers.every(value=>!value)?'outside':'ambiguous';
}
function surfacesIntersect(a,b){
 const aa=bounds(a),bb=bounds(b);if([0,1,2].some(k=>aa.lo[k]>bb.hi[k]||bb.lo[k]>aa.hi[k]))return false;
 const scan=(source,target)=>{
  const tree=new TreeViewSurface({getVerticesData:()=>target.positions,getIndices:()=>target.indices}),seen=new Set(),n=source.positions.length/3,p=new Vector3(),q=new Vector3();
  for(let i=0;i<source.indices.length;i+=3)for(let edge=0;edge<3;edge++){
   const from=source.indices[i+edge],to=source.indices[i+(edge+1)%3],key=Math.min(from,to)*n+Math.max(from,to);if(seen.has(key))continue;seen.add(key);
   p.set(...at(source.positions,source.positions,from,0));q.set(...at(source.positions,source.positions,to,0));if(tree.intersects(p,q))return true;
  }return false;
 };return scan(a,b)||scan(b,a);
}
function interpolate(old,now,t){const positions=new Float64Array(now.positions.length);for(let i=0;i<positions.length;i++)positions[i]=old.positions[i]+(now.positions[i]-old.positions[i])*t;return {positions,indices:now.indices};}

// Relative sweep of BOTH the real clipped blade and actual moving skin. The
// sampled distance has a conservative Lipschitz error bound; a current-frame
// endpoint gap is never labelled a whole-window miss.
export function movingBladeSkinGap(old,now,contact,from,to){
 const previous=contact.previous??contact.blade,current=contact.blade,bladeTravel=Math.max(...current.map((p,k)=>distance(p,previous[k]))),skinTravel=travel(old.positions,now.positions)*(to-from),relativeTravel=bladeTravel+skinTravel,steps=Math.max(1,Math.ceil(relativeTravel/.015)),error=relativeTravel/(2*steps),padding=.25;
 const linePoints=[...previous,...current],lo=[0,1,2].map(k=>Math.min(...linePoints.map(p=>p[k]))-padding),hi=[0,1,2].map(k=>Math.max(...linePoints.map(p=>p[k]))+padding);let minimum=Infinity,testedTriangles=0,temporalSamples=0;
 for(let i=0;i<now.indices.length;i+=3){
  const ids=[now.indices[i],now.indices[i+1],now.indices[i+2]],starts=ids.map(id=>at(old.positions,now.positions,id,from)),ends=ids.map(id=>at(old.positions,now.positions,id,to));
  if([0,1,2].some(k=>Math.min(...starts.map(p=>p[k]),...ends.map(p=>p[k]))>hi[k]||Math.max(...starts.map(p=>p[k]),...ends.map(p=>p[k]))<lo[k]))continue;
  testedTriangles++;
  for(let sample=0;sample<=steps;sample++){
   const t=sample/steps,line=current.map((p,j)=>p.map((v,k)=>previous[j][k]+(v-previous[j][k])*t)),triangle=ends.map((p,j)=>p.map((v,k)=>starts[j][k]+(v-starts[j][k])*t));
   minimum=Math.min(minimum,Math.sqrt(segmentTriangleDistanceSquared(...line,...triangle)));temporalSamples++;
  }
 }
 const proved=Math.max(0,Math.min(padding,minimum-error)),initialSkin=interpolate(old,now,from),initialContainment=proved>0?previous.map(point=>containment(initialSkin,point)):['surface','surface'];
 return {minimumDistance:Number.isFinite(minimum)?minimum:null,minimumProvedDistance:proved,initialContainment,insideWitness:initialContainment.includes('inside'),outsideProved:initialContainment.every(value=>value==='outside'),temporalErrorBound:error,steps,testedTriangles,temporalSamples,relativeTravel,scope:'Actual clipped line blade versus interpolated moving wolf skin; conservative temporal distance error plus three-direction signed-ray containment distinguishes embedded weapons from genuine outside misses.'};
}

export class WolfCombatSurfaceProbe{
 constructor(api){this.api=api;this.reset();}
 reset(){this.previous=null;this.rows=[];}
 capture(enemy,sample,result){
  const body=enemy.asset.meshes.find(mesh=>mesh.skeleton&&mesh.morphTargetManager&&!mesh.metadata?.moonforestOutline),now=worldSurface(body),shield=worldSurface(this.api.shieldNode),prior=this.previous?.brain===enemy.brain&&this.previous.actionId===result.actionId?this.previous:null;
  const old=prior?.body??now,oldShield=prior?.shield??shield,oldClip=prior?.clipTime??result.clipTime,delta=result.clipTime-oldClip,rows=[];
  for(const contact of sample?.contacts??[]){
   const from=delta>1e-9?clamp((Math.max(oldClip,contact.window.from)-oldClip)/delta):0,to=delta>1e-9?clamp((Math.min(result.clipTime,contact.window.to)-oldClip)/delta):1,gap=movingBladeSkinGap(old,now,contact,from,to);
   let fullShieldSurfaceWitness=false,fullShieldVolumeWitness=false,witnessAlpha=null,shieldTemporalSamples=0;
   if(result.state==='shieldPush'){
    const count=Math.max(1,Math.ceil((travel(oldShield.positions,shield.positions)+travel(old.positions,now.positions))*(to-from)/.025));
    for(let k=0;k<=count;k++){
     const t=from+(to-from)*k/count,face=interpolate(oldShield,shield,t),skin=interpolate(old,now,t);shieldTemporalSamples++;
     if(surfacesIntersect(face,skin)){fullShieldSurfaceWitness=true;witnessAlpha=t;break;}
     // A shield wholly embedded in the closed wolf has no crossing edges.
     // Test actual shield surface vertices, never invented bounding-box corners.
     const candidates=new Set([0]);for(let axis=0;axis<3;axis++){let low=0,high=0;for(let v=1;v<face.positions.length/3;v++){if(face.positions[v*3+axis]<face.positions[low*3+axis])low=v;if(face.positions[v*3+axis]>face.positions[high*3+axis])high=v;}candidates.add(low);candidates.add(high);}
     if([...candidates].some(v=>containment(skin,at(face.positions,face.positions,v,0))==='inside')){fullShieldVolumeWitness=true;witnessAlpha=t;break;}
    }
   }
   const surfaceContact=gap.minimumDistance!==null&&gap.minimumDistance<=sample.bladeRadius;
   const row={time:this.api.elapsed,playerClipTime:result.clipTime,state:result.state,window:contact.window,bladeRadius:sample.bladeRadius,lineSurfaceContact:surfaceContact,lineVolumeContact:gap.insideWitness,linePhysicalContact:surfaceContact||gap.insideWitness,lineProvedClear:gap.outsideProved&&gap.minimumProvedDistance>sample.bladeRadius,gap,fullShieldSurfaceWitness,fullShieldVolumeWitness,witnessAlpha,shieldTemporalSamples};rows.push(row);this.rows.push(row);
  }
  this.previous={brain:enemy.brain,actionId:result.actionId,clipTime:result.clipTime,body:now,shield};return rows;
 }
}
