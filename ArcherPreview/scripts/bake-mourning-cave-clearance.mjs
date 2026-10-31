// CPU/offline only: preserve source render geometry, bake rotation-independent
// root safety from exact near-LOD surfaces and actual living/death skin envelopes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditElenaClearance} from './audit-elena-clearance.mjs';
import {caveClearance} from '../src/witch-cave-terrain.js';
import {CAVE_BOSS,CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {ELENA_HOME,MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
const out=new URL('../reports/elena-clearance/',import.meta.url);mkdirSync(out,{recursive:true});
const paths=['../src/witch-cave-layout.js','../src/witch-cave-terrain.js','../src/mourning-elena-animation.js','../src/mourning-motion-v2.js','../public/assets/mourning-elena.json','../public/assets/witch-cave.json'];
const fingerprint=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n?/g,'\n')).digest('hex')]));
const hashes=fingerprint();
const step=.25,minX=8,minZ=-52,width=169,height=177,ground=6,groundTolerance=.12,bandStep=.25,margin=.18;
const bands=Array.from({length:32},(_,i)=>({low:.025+i*bandStep,high:.025+(i+1)*bandStep,radius:0}));
const schedules=[];for(const [state,seconds]of [['idle',6],['walk',2.4],['cast',3],['cast_slam',3],['cast_alternate',3],['hit',1.3]])for(let i=0;i<=Math.ceil(seconds*15);i++)schedules.push([state,Math.min(seconds,i/15)]);
for(let t=0;t<48;t+=6)schedules.push(['idle',0,t]);
for(const state of ['cast','cast_slam','cast_alternate'])for(const time of [0,.06,.18,.65,1.3,2,2.8,3.6,4.4,5.2])schedules.push(['dead',time,undefined,undefined,{state,time:1.65,gaitBlend:0}]);
const authoredPoseCount=schedules.length;
for(const [state,times]of [['idle',[0,1.5,3,4.5]],['walk',[0,.6,1.2,1.8]],['cast',[0,.3,.75,1.2,1.8,2.4,2.85,3]],['cast_slam',[.3,1,1.65,2.4]],['cast_alternate',[.3,1,1.65,2.4]]])for(const time of times)for(const pulse of [0,.04,.08,.12,.18,.24,.28,.33,.38])schedules.push([state,time,undefined,pulse]);
let authoredBands;
const context=await auditElenaClearance({geometryOnly:true,schedules,retainPoses:false,onPose(pose){
 if(pose.hitPulseTime!==undefined&&!authoredBands)authoredBands=bands.map(b=>({...b}));
 for(const mesh of pose.meshes){const p=mesh.positions,ids=mesh.indices;for(let t=0;t<ids.length;t+=3){let low=Infinity,high=-Infinity,radius=0;for(let j=0;j<3;j++){const i=ids[t+j]*3;low=Math.min(low,p[i+1]);high=Math.max(high,p[i+1]);radius=Math.max(radius,Math.hypot(p[i],p[i+2]));}const first=Math.max(0,Math.floor((low-.025)/bandStep)),last=Math.min(bands.length-1,Math.floor((high-.025)/bandStep));for(let b=first;b<=last;b++)bands[b].radius=Math.max(bands[b].radius,radius);}}
}});
console.log(JSON.stringify({stage:'pose envelope',poses:context.poses.length,maxRadius:Math.max(...bands.map(b=>b.radius)),bands}));
const candidates={
 current:{home:ELENA_HOME,moves:{}},
};
function clip(poly,axis,bound,sign){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);if(da>=-1e-8)result.push(a);if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.map((v,k)=>v+(b[k]-v)*t));}}return result;}
function distanceField(occupied){const d=new Float32Array(occupied.length);for(let i=0;i<d.length;i++)d[i]=occupied[i]?0:1e4;const diagonal=step*Math.SQRT2;
 for(let z=0;z<height;z++)for(let x=0;x<width;x++){const i=z*width+x;let n=d[i];if(x)n=Math.min(n,d[i-1]+step);if(z){n=Math.min(n,d[i-width]+step);if(x)n=Math.min(n,d[i-width-1]+diagonal);if(x+1<width)n=Math.min(n,d[i-width+1]+diagonal);}d[i]=n;}
 for(let z=height-1;z>=0;z--)for(let x=width-1;x>=0;x--){const i=z*width+x;let n=d[i];if(x+1<width)n=Math.min(n,d[i+1]+step);if(z+1<height){n=Math.min(n,d[i+width]+step);if(x)n=Math.min(n,d[i+width-1]+diagonal);if(x+1<width)n=Math.min(n,d[i+width+1]+diagonal);}d[i]=n;}return d;}
function raster(occupied,poly){if(!poly.length)return;const x0=Math.max(0,Math.floor((Math.min(...poly.map(v=>v[0]))-minX)/step)),x1=Math.min(width-1,Math.floor((Math.max(...poly.map(v=>v[0]))-minX)/step)),z0=Math.max(0,Math.floor((Math.min(...poly.map(v=>v[2]))-minZ)/step)),z1=Math.min(height-1,Math.floor((Math.max(...poly.map(v=>v[2]))-minZ)/step));
 for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const cell=z*width+x;if(occupied[cell])continue;let p=poly;for(const [axis,bound,sign]of [[0,minX+x*step,1],[0,minX+(x+1)*step,-1],[2,minZ+z*step,1],[2,minZ+(z+1)*step,-1]]){p=clip(p,axis,bound,sign);if(!p.length)break;}if(p.length)occupied[cell]=1;}}
const getIndex=(x,z)=>{const a=Math.floor((x-minX)/step),b=Math.floor((z-minZ)/step);return a<0||b<0||a>=width||b>=height?-1:b*width+a;};
function statistics(safe,home){const seen=new Uint8Array(safe.length),components=[];for(let cell=0;cell<safe.length;cell++)if(safe[cell]&&!seen[cell]){const queue=[cell];seen[cell]=1;for(let q=0;q<queue.length;q++){const i=queue[q],x=i%width,z=Math.floor(i/width);for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+dx,zz=z+dz,j=zz*width+xx;if(xx>=0&&zz>=0&&xx<width&&zz<height&&safe[j]&&!seen[j]){seen[j]=1;queue.push(j);}}}components.push(queue);}components.sort((a,b)=>b.length-a.length);
 const largest=components[0]??[],largestSet=new Set(largest),inside=(x,z)=>largestSet.has(getIndex(x,z));let best={length:0};
 for(const i of largest){const x=minX+(i%width+.5)*step,z=minZ+(Math.floor(i/width)+.5)*step;for(let d=0;d<32;d++){const angle=d*Math.PI/16,dx=Math.sin(angle),dz=Math.cos(angle);let length=0;for(let t=.125;t<=20;t+=.125){if(!inside(x+dx*t,z+dz*t))break;length=t;}if(length>best.length)best={length,from:{x,z},to:{x:x+dx*length,z:z+dz*length},yaw:angle};}}
 const runs=[];for(let i=0;i<safe.length;i++)if(largestSet.has(i)){const start=i;while(i+1<safe.length&&largestSet.has(i+1))i++;runs.push(start,i-start+1);}
 return {safeCells:safe.reduce((n,v)=>n+v,0),components:components.map(c=>c.length),connectedCells:largest.length,connectedArea:largest.length*step*step,homeSafe:inside(home.x,home.z),longestStraight:best,runs};}
const results={};
for(const [name,variant]of Object.entries(candidates)){
 const occupancy=bands.map(()=>new Uint8Array(width*height));
 for(const mesh of context.geometry){const original=CAVE_PLACEMENTS.find(p=>p.id===mesh.placement),move=variant.moves[mesh.placement],dx=move?move.x-original.x:0,dz=move?move.z-original.z:0,positions=mesh.positions,ids=mesh.indices;
  for(let i=0;i<ids.length;i+=3){const tri=[0,1,2].map(j=>{const at=ids[i+j]*3;return [positions[at]+dx,positions[at+1],positions[at+2]+dz];}),low=Math.min(...tri.map(v=>v[1])),high=Math.max(...tri.map(v=>v[1]));if(high<ground+.025-groundTolerance||low>ground+8.025+groundTolerance)continue;
   for(let b=0;b<bands.length;b++){if(!bands[b].radius||high<ground+bands[b].low-groundTolerance||low>ground+bands[b].high+groundTolerance)continue;let poly=clip(tri,1,ground+bands[b].low-groundTolerance,1);poly=clip(poly,1,ground+bands[b].high+groundTolerance,-1);raster(occupancy[b],poly);}
  }
 }
 const safe=new Uint8Array(width*height).fill(1),circle=new Uint8Array(safe.length).fill(1),footRadius=Math.max(...bands.filter(b=>b.low<.6).map(b=>b.radius)),maxRadius=Math.max(...bands.map(b=>b.radius));
 for(let z=0;z<height;z++)for(let x=0;x<width;x++){const i=z*width+x,xx=minX+(x+.5)*step,zz=minZ+(z+.5)*step,y=context.terrain.heightAt(xx,zz);if(Math.hypot(xx-CAVE_BOSS.x,zz-CAVE_BOSS.z)>CAVE_BOSS.r||Math.abs(y-ground)>groundTolerance-.03||caveClearance(xx,zz)<footRadius+margin+step*Math.SQRT1_2)safe[i]=circle[i]=0;}
 for(let b=0;b<bands.length;b++){if(!bands[b].radius)continue;const d=distanceField(occupancy[b]);for(let i=0;i<safe.length;i++){const lower=d[i]*.9238-step*Math.SQRT2;if(lower<bands[b].radius+margin)safe[i]=0;if(lower<maxRadius+margin)circle[i]=0;}}
 const stacked=statistics(safe,variant.home),uniform=statistics(circle,variant.home);results[name]={home:variant.home,moves:variant.moves,stacked,uniform};console.log(JSON.stringify({stage:'mask complete',name,stacked:{...stacked,runs:undefined},uniform:{...uniform,runs:undefined}}));
}
if(JSON.stringify(hashes)!==JSON.stringify(fingerprint()))throw new Error('Clearance inputs changed while baking; rerun after source edits finish.');
const report={generatedAt:new Date().toISOString(),grid:{step,minX,minZ,width,height},profile:{ground,groundTolerance,bandStep,margin,bands,poseSamples:context.poses.length,authoredPoseCount,hitPulsePoseCount:context.poses.length-authoredPoseCount,authoredBands,hitPulseEnvelopeExtension:bands.map((b,i)=>({low:b.low,high:b.high,extraRadius:b.radius-authoredBands[i].radius})).filter(b=>b.extraRadius>1e-6),poses:context.poses.map(({state,time,haloTime,hitPulseTime,bounds,radius})=>({state,time,haloTime,hitPulseTime,bounds,radius})),method:'15 Hz source transform samples including all three casts, death entries from each cast, 8 complete-halo phases and normal-hit pulse overlays; each intersected height band gets full triangle-vertex max radial envelope; .18 m extra margin; .25m cells conservatively rasterized; octile distance reduced .9238 and both source/root half-cell diagonals removed.'},hashes,results,limits:'Finite motion samples plus .18m margin; not an analytic quaternion-extrema proof. Ground restricted to 6 +/- .09m. This root-safe mask is combined with normal physical-radius navigation.'};
writeFileSync(new URL('mask-current.json',out),JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--write')){
 const data={version:1,step,minX,minZ,width,height,ground,groundTolerance,margin,sizeScale:MOURNING_SIZE_SCALE,hashes,poseSamples:context.poses.length,bands,runs:results.current.stacked.runs};
 writeFileSync(new URL('../src/mourning-cave-clearance-data.js',import.meta.url),'// Generated from unchanged near-LOD meshes and r10 living/death skin poses by scripts/bake-mourning-cave-clearance.mjs.\nexport const MOURNING_CAVE_CLEARANCE_DATA='+JSON.stringify(data)+';\n');
}
context.dispose();
