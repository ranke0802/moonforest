// Read-only near-LOD cave / actual packed morph+skin surface audit. No browser/GPU.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {createVillageTransform} from '../src/village-environment.js';
import {CAVE_PLACEMENTS,CAVE_BOSS,caveRoofHeight,caveObstacles} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {ELENA_HOME,MOURNING_SIZE_SCALE,MOURNING_SIZE} from '../src/elena-spec.js';
import {chooseElenaReposition,chooseElenaCharge} from '../src/elena-reposition.js';
import {setWorldCharacter} from '../src/world-limits.js';
import {mourningCaveClearance} from '../src/mourning-cave-clearance.js';
import {MOURNING_CAVE_CLEARANCE_DATA as mask} from '../src/mourning-cave-clearance-data.js';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Death must enter through transition(): it snapshots all 741 channels before
// the .18-second blend. Directly assigning current='dead' cannot reproduce it.
export function sampleClearancePose(animator,schedule){
 const [state,time,haloTime,hitPulseTime,from]=schedule;
 const living=(s,t,h,p,gait)=>{
  animator.reset();animator.transition(s,{clipTime:s==='cast'?t:0,staggerRemaining:s==='hit'?2:0});
  animator.idleTime=s==='idle'?t:0;animator.walkTime=s==='walk'?t:0;animator.hairTime=s==='walk'?t:0;
  animator.gaitBlend=gait??(s==='walk'?1:0);animator.hitTime=s==='hit'?t:0;
  animator.haloTime=h??t*2;animator.breathClock=t;if(p!==undefined)animator.hitPulseTime=p;animator.sample(0);
 };
 if(state!=='dead'){living(state,time,haloTime,hitPulseTime);return;}
 const origin=from??{state:'cast',time:1.2,gaitBlend:.05};
 living(origin.state,origin.time,haloTime,undefined,origin.gaitBlend);animator.transition('dead');
 for(let elapsed=0;elapsed<time-1e-9;){const dt=Math.min(1/60,time-elapsed);animator.update(dt);elapsed+=dt;}
}

export async function auditElenaClearance(options={}){
const base=new URL('../public/assets/',import.meta.url),out=new URL('../reports/elena-clearance/',import.meta.url);mkdirSync(out,{recursive:true});
const quick=options.quick??process.argv.includes('--quick'),boundsOnly=process.argv.includes('--bounds-only');
const safeOnly=options.safeOnly??process.argv.includes('--safe-only');
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const config=JSON.parse(readFileSync(new URL('mourning-elena.json',base))),manifest=JSON.parse(readFileSync(new URL('witch-cave.json',base)));
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const terrain=createWitchCaveTerrain(),world={scene,terrain};setWorldCharacter('warrior-v5');
const navigation=new CaveNavigation(caveObstacles());
const containers=[],loaders=[];
async function load(url){
 const source=await readRuntimeGltf(url),gltf=structuredClone(source.gltf);
 for(const k of ['extensionsUsed','extensionsRequired'])gltf[k]=(gltf[k]??[]).filter(n=>n!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
 for(const group of container.animationGroups)group.stop();containers.push(container);loaders.push(loader);return container;
}
const bounds=p=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[i+k]);hi[k]=Math.max(hi[k],p[i+k]);}return {lo,hi};};
const overlaps=(a,b)=>a.lo[0]<=b.hi[0]&&a.hi[0]>=b.lo[0]&&a.lo[1]<=b.hi[1]&&a.hi[1]>=b.lo[1]&&a.lo[2]<=b.hi[2]&&a.hi[2]>=b.lo[2];
const vector=new Vector3();
function worldPositions(mesh,deform=false){const p=deform?mesh.getPositionData(true,true):mesh.getVerticesData(VertexBuffer.PositionKind),m=mesh.computeWorldMatrix(true),out=new Float32Array(p.length);for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(p[i],p[i+1],p[i+2],m,vector);out[i]=vector.x;out[i+1]=vector.y;out[i+2]=vector.z;}return out;}
const geometry=[];
// Rising terrain is real geometry too. Include the exact rendered diagonals
// near the chamber, excluding its nearly flat foot-contact floor only.
{
 const p=[],ids=[],n=terrain.subdivisions,stride=n+1,used=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++)p.push(col*terrain.step-terrain.half,terrain.heights[row*stride+col],terrain.half-row*terrain.step);
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const a=row*stride+col,d=a+stride+1;
  for(const tri of [[a,a+1,d],[a,d,a+stride]]){
   const points=tri.map(i=>p.slice(i*3,i*3+3));
   if(Math.max(...points.map(v=>v[1]))<=6.25||points.every(v=>Math.hypot(v[0]-ELENA_HOME.x,v[2]-ELENA_HOME.z)>26))continue;
   ids.push(...tri);for(const v of points)used.push(...v);
  }
 }
 geometry.push({placement:'cave-terrain-shoulders',asset:'existing-terrain',name:'cave-terrain-shoulders',positions:Float32Array.from(p),indices:Uint32Array.from(ids),bounds:bounds(used)});
}
// Include every placement whose manifest sphere could meet any point in the
// original boss-home disk plus a 9 m pose margin. Narrow phase uses real meshes.
const nearby=CAVE_PLACEMENTS.filter(p=>{const c=manifest.assets[p.asset];return c&&Math.hypot(p.x-ELENA_HOME.x,p.z-ELENA_HOME.z)<=MOURNING_SIZE.homeRadius+9+Math.hypot(...c.bounds)*p.scale;});
for(const id of new Set(nearby.map(p=>p.asset))){
 const c=manifest.assets[id],container=await load(new URL(c.lods[0].model,base));
 const nodes=[...container.transformNodes,...container.meshes],roots=nodes.filter(n=>!n.parent),ordered=orderPoseNodes(nodes);
 for(const p of nearby.filter(p=>p.asset===id)){
  const {root,facing}=createVillageTransform(world,p,c);for(const n of roots)n.parent=facing;root.computeWorldMatrix(true);facing.computeWorldMatrix(true);refreshPoseMatrices(ordered);
  for(const mesh of container.meshes.filter(m=>m.getTotalVertices())){const positions=worldPositions(mesh),indices=Uint32Array.from(mesh.getIndices());geometry.push({placement:p.id,asset:id,name:mesh.name,positions,indices,bounds:bounds(positions)});}
  for(const n of roots)n.parent=null;root.dispose();
 }
}
// Exact same 64-segment, 12-ring mesh as caveCeiling; camera cutaway only
// discards fragments and never moves these vertices.
{
 const positions=[],indices=[],segments=64,rings=12;
 for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
  const a=i/segments*Math.PI*2,r=ring/rings*72,x=Math.cos(a)*r,z=Math.sin(a)*r;
  positions.push(x,caveRoofHeight(x,z)+.6*Math.sin(x*.24)*Math.cos(z*.19),z);
  if(ring&&i){const at=ring*(segments+1)+i;indices.push(at,at-1,at-segments-2);if(ring>1)indices.push(at,at-segments-2,at-segments-1);}
 }
 const p=Float32Array.from(positions);geometry.push({placement:'cave-distant-ceiling',asset:'procedural-dome',name:'cave-distant-ceiling',positions:p,indices:Uint32Array.from(indices),bounds:bounds(p)});
}
const container=await load(new URL(config.model,base)),asset=instantiateBossModel(container),actor=new TransformNode('clearance-actor',scene),carrier=new TransformNode('clearance-center',scene);
carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);
for(const n of new Set([...asset.meshes,...asset.transformNodes]))if(!n.parent)n.parent=carrier;
const animator=new MourningElenaAnimator(asset,config,actor),body=asset.meshes.filter(m=>m.getTotalVertices());
const baseHashes=body.map(m=>createHash('sha256').update(Buffer.from(Float32Array.from(m.getVerticesData(VertexBuffer.PositionKind)).buffer)).digest('hex'));
const schedules=options.schedules??(quick?[['idle',0],['walk',.6],['cast',1.2],['hit',.35]]:[...Array.from({length:4},(_,i)=>['idle',i*1.5]),...Array.from({length:4},(_,i)=>['walk',i*.6]),...[0,.3,.75,1.2,1.8,2.4,2.85,3].map(t=>['cast',t]),...[.1,.35,.65,1.1].map(t=>['hit',t])]);
if(safeOnly&&!options.schedules){
 for(let t=0;t<48;t+=6)schedules.push(['idle',0,t]);
 const baked=JSON.parse(readFileSync(new URL('mask-current.json',out))).profile.poses;
 for(const pose of [...baked].sort((a,b)=>b.radius-a.radius).slice(0,3))schedules.push([pose.state,pose.time,pose.haloTime,pose.hitPulseTime]);
 for(const pose of [...baked].sort((a,b)=>b.bounds.hi[1]-a.bounds.hi[1]).slice(0,3))schedules.push([pose.state,pose.time,pose.haloTime,pose.hitPulseTime]);
 for(const pose of [...baked].filter(p=>p.hitPulseTime!==undefined).sort((a,b)=>b.radius-a.radius).slice(0,3))schedules.push([pose.state,pose.time,pose.haloTime,pose.hitPulseTime]);
}
const poses=[];
for(const schedule of schedules){
 const [state,time,haloTime,hitPulseTime,from]=schedule;sampleClearancePose(animator,schedule);
 for(const s of asset.skeletons)s.prepare(true);
 const meshes=body.filter(m=>m.isEnabled()).map(m=>{const positions=worldPositions(m,true);return {name:m.name,positions,indices:Uint32Array.from(m.getIndices()),bounds:bounds(positions)};});
 const lo=[0,1,2].map(k=>Math.min(...meshes.map(m=>m.bounds.lo[k]))),hi=[0,1,2].map(k=>Math.max(...meshes.map(m=>m.bounds.hi[k])));let radius=0;
 for(const m of meshes)for(let i=0;i<m.positions.length;i+=3)radius=Math.max(radius,Math.hypot(m.positions[i],m.positions[i+2]));
 const pose={state,time,haloTime:animator.haloTime,hitPulseTime,from,meshes,bounds:{lo,hi},radius};options.onPose?.(pose);poses.push(options.retainPoses===false?{...pose,meshes:undefined}:pose);
}
const dispose=()=>{animator.dispose();for(const c of containers)c.dispose();for(const l of loaders)l.dispose();scene.dispose();engine.dispose();};
if(options.geometryOnly)return {geometry,poses,terrain,navigation,config,placements:nearby,dispose};
console.log(JSON.stringify({stage:'geometry loaded',placements:nearby.length,environmentMeshes:geometry.length,environmentTriangles:geometry.reduce((n,g)=>n+g.indices.length/3,0),poses:poses.map(({state,time,bounds,radius})=>({state,time,bounds,radius}))}));

// Full triangle SAT. The extra in-plane axes handle coplanar triangles; zero
// area triangles are excluded rather than treated as closed solid geometry.
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function triHit(a,b){
 const ea=[sub(a[1],a[0]),sub(a[2],a[1]),sub(a[0],a[2])],eb=[sub(b[1],b[0]),sub(b[2],b[1]),sub(b[0],b[2])],na=cross(ea[0],ea[1]),nb=cross(eb[0],eb[1]);
 if(dot(na,na)<1e-18||dot(nb,nb)<1e-18)return false;
 const axes=[na,nb];for(const e of ea)for(const f of eb)axes.push(cross(e,f));for(const e of ea)axes.push(cross(na,e));for(const e of eb)axes.push(cross(nb,e));
 for(const axis of axes){const length=Math.hypot(...axis);if(length<1e-12)continue;const pa=a.map(v=>dot(v,axis)),pb=b.map(v=>dot(v,axis)),eps=1e-7*length;if(Math.max(...pa)<Math.min(...pb)-eps||Math.max(...pb)<Math.min(...pa)-eps)return false;}return true;
}
function triangle(mesh,t){return [0,1,2].map(j=>{const i=mesh.indices[t*3+j]*3;return [mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]];});}
function makeBVH(mesh){
 const total=mesh.indices.length/3,boxes=new Array(total);for(let t=0;t<total;t++)boxes[t]=bounds(triangle(mesh,t).flat());
 function build(ids){const lo=[0,1,2].map(k=>{let n=Infinity;for(const t of ids)n=Math.min(n,boxes[t].lo[k]);return n;}),hi=[0,1,2].map(k=>{let n=-Infinity;for(const t of ids)n=Math.max(n,boxes[t].hi[k]);return n;}),node={lo,hi};
  if(ids.length<=24){node.ids=ids;return node;}let axis=0;for(let k=1;k<3;k++)if(hi[k]-lo[k]>hi[axis]-lo[axis])axis=k;ids.sort((a,b)=>(boxes[a].lo[axis]+boxes[a].hi[axis])-(boxes[b].lo[axis]+boxes[b].hi[axis]));const mid=ids.length>>1;node.left=build(ids.slice(0,mid));node.right=build(ids.slice(mid));return node;}
 return {root:build(Array.from({length:total},(_,i)=>i)),boxes,mesh};
}
function query(tree,tri,box,node=tree.root){if(!overlaps(node,box))return -1;if(node.ids){for(const t of node.ids)if(overlaps(tree.boxes[t],box)&&triHit(triangle(tree.mesh,t),tri))return t;return -1;}const left=query(tree,tri,box,node.left);return left>=0?left:query(tree,tri,box,node.right);}
function queryBox(tree,box,node=tree.root,result=[]){if(!overlaps(node,box))return result;if(node.ids){for(const t of node.ids)if(overlaps(tree.boxes[t],box))result.push(t);}else{queryBox(tree,box,node.left,result);queryBox(tree,box,node.right,result);}return result;}
function transformedBox(box,p,yaw){const c=Math.cos(yaw),s=Math.sin(yaw),points=[];for(const x of [box.lo[0],box.hi[0]])for(const z of [box.lo[2],box.hi[2]])for(const y of [box.lo[1],box.hi[1]])points.push(p.x+c*x+s*z,p.y+y,p.z-s*x+c*z);return bounds(points);}
const locations=[{...ELENA_HOME,label:'home'}],unique=new Set(['29.00,-27.00']);
function addPoint(p,label){if(!p)return;const key=p.x.toFixed(2)+','+p.z.toFixed(2);if(unique.has(key))return;unique.add(key);locations.push({x:p.x,z:p.z,label});}
for(let i=0;i<(quick?8:16);i++)for(const r of [3,6,9]){const angle=i*Math.PI*2/(quick?8:16),p={x:ELENA_HOME.x+Math.sin(angle)*r,z:ELENA_HOME.z+Math.cos(angle)*r};if(navigation.free(p,MOURNING_SIZE.radius))addPoint(p,'navigation-free ring');}
for(let i=0;i<16;i++){const a=i*Math.PI/8,player={x:ELENA_HOME.x+Math.sin(a)*6,z:ELENA_HOME.z+Math.cos(a)*6},origin={...ELENA_HOME,y:terrain.heightAt(ELENA_HOME.x,ELENA_HOME.z)};
 for(const [type,target]of [['reposition',chooseElenaReposition(origin,player,{phase:2,radius:MOURNING_SIZE.radius,navigation,terrain})],['charge',chooseElenaCharge(origin,player,{radius:MOURNING_SIZE.radius,navigation,terrain})]])if(target)for(const t of [.25,.5,.75,1])addPoint({x:origin.x+(target.x-origin.x)*t,z:origin.z+(target.z-origin.z)*t},type+' accepted path');}
for(const p of locations)p.y=terrain.heightAt(p.x,p.z);
if(safeOnly){
 locations.splice(0,locations.length);unique.clear();addPoint(ELENA_HOME,'relocated home');
 for(let r=0;r<mask.runs.length;r+=2)for(let i=mask.runs[r];i<mask.runs[r]+mask.runs[r+1];i++)if(i%11===0){const x=mask.minX+(i%mask.width+.5)*mask.step,z=mask.minZ+(Math.floor(i/mask.width)+.5)*mask.step;if(mourningCaveClearance(x,z)>=.08)addPoint({x,z},'full-pose safe grid');}
 for(let x=25.5;x<=31.8;x+=.35)addPoint({x,z:-24.125},'6.3m charge path');
}
if(options.locations){locations.splice(0,locations.length,...options.locations.map(p=>({...p})));}
for(const p of locations)p.y=terrain.heightAt(p.x,p.z);
const contacts=[],samples=[],yaws=options.yaws??Array.from({length:quick?4:8},(_,i)=>i*Math.PI*2/(quick?4:8)),yawCount=yaws.length;let tested=0,pairs=0;
// Environment BVHs only reject disjoint triangle AABBs. This is equivalent to
// the former full mesh scan, but avoids millions of irrelevant terrain checks.
const environmentTrees=boundsOnly?null:new Map(geometry.map(g=>[g,makeBVH(g)]));
if(!boundsOnly)for(const pose of poses){
 const trees=pose.meshes.map(makeBVH);let poseContacts=0;
 for(const p of locations)for(const yaw of yaws){
  const c=Math.cos(yaw),s=Math.sin(yaw),box=transformedBox(pose.bounds,p,yaw),candidates=geometry.filter(g=>overlaps(g.bounds,box));tested++;let hits=0;
  for(const g of candidates){
   for(const tree of trees){const meshBox=transformedBox(tree.mesh.bounds,p,yaw);if(!overlaps(meshBox,g.bounds))continue;pairs++;let contact;
    for(const t of queryBox(environmentTrees.get(g),meshBox)){
     const worldTri=triangle(g,t),worldBox=bounds(worldTri.flat());if(!overlaps(worldBox,box))continue;
     const local=worldTri.map(([x,y,z])=>{x-=p.x;z-=p.z;return [c*x-s*z,y-p.y,s*x+c*z];}),localBox=bounds(local.flat()),hit=query(tree,local,localBox);
     if(hit>=0){contact={placement:g.placement,asset:g.asset,environmentTriangle:t,bodyMesh:tree.mesh.name,bodyTriangle:hit,worldEnvironmentTriangle:worldTri};break;}
    }
    if(contact){contacts.push({state:pose.state,time:pose.time,from:pose.from,haloTime:pose.haloTime,position:p,yaw,...contact});hits++;poseContacts++;}
   }
  }
  samples.push({state:pose.state,time:pose.time,x:p.x,z:p.z,yaw,contacts:hits});
 }
 console.log(JSON.stringify({stage:'pose complete',state:pose.state,time:pose.time,contacts:poseContacts,tested}));
}
const maxY=Math.max(...poses.map(p=>p.bounds.hi[1])),maxRadius=Math.max(...poses.map(p=>p.radius));
let minCeilingGap=Infinity,minDomeHeight=Infinity;
const swept={lo:[Math.min(...locations.map(p=>p.x))-maxRadius,-Infinity,Math.min(...locations.map(p=>p.z))-maxRadius],hi:[Math.max(...locations.map(p=>p.x))+maxRadius,Infinity,Math.max(...locations.map(p=>p.z))+maxRadius]},dome=geometry.find(g=>g.asset==='procedural-dome');
for(let t=0;t<dome.indices.length/3;t++){const tri=triangle(dome,t);if(overlaps(bounds(tri.flat()),swept))minDomeHeight=Math.min(minDomeHeight,...tri.map(v=>v[1]));}
minCeilingGap=minDomeHeight-Math.max(...locations.map(p=>p.y))-maxY;
const afterHashes=body.map(m=>createHash('sha256').update(Buffer.from(Float32Array.from(m.getVerticesData(VertexBuffer.PositionKind)).buffer)).digest('hex'));
const report={generatedAt:new Date().toISOString(),scope:'Read-only actual near-LOD cave geometry against the current packed morph+skin model at 5.7 m body scale, CPU NullEngine',source:{model:config.model,revision:config.rigRevision,scale:config.scale*MOURNING_SIZE_SCALE,layoutSha256:sha('../src/witch-cave-layout.js'),samplerSha256:sha('../src/mourning-elena-animation.js'),manifestSha256:sha('../public/assets/witch-cave.json')},method:{quick,boundsOnly,coordinateSystem:'Babylon RH world xyz',environmentLod:0,skin:'getPositionData(true,true), skeleton.prepare(true), world transform',narrowPhase:'All triangle surfaces, BVH AABB then 3D triangle SAT with coplanar axes; first contact per environment mesh/body mesh pair',yawCount,poseSamples:poses.length,locationSamples:locations.length,poseLocationYawSamples:tested,candidateMeshPairs:pairs,limitations:'Finite animation and route samples, no continuous all-time guarantee; surfaces are tested rather than assuming scanned meshes are watertight solids. No GPU/material/camera visibility measurement.'},existingNavigation:{radius:MOURNING_SIZE.radius,collisionBakeVerticalRange:[.22,1.75],note:'Existing baked field covers player height only. Navigation-free center does not certify full creature pose clearance.'},poseBounds:poses.map(({state,time,haloTime,bounds,radius})=>({state,time,haloTime,bounds,radius})),ceiling:{exists:true,geometry:'cave-distant-ceiling',roofFormula:'7 + .4*sqrt(max(0,67^2-x^2-z^2)) plus ripple +/-0.6m',cutaway:'Fragment discard around eye-focus segment, radius21m at eye to14m at focus. Camera-dependent visibility, no physical collision.',conservativeSampledDomeMinY:minDomeHeight,maxCreatureLocalY:maxY,minimumEstimatedGap:minCeilingGap,note:'Dome analytic sampling estimate; actual overhead props separately tested from near-LOD triangles.'},locations,environment:geometry.map(({placement,asset,name,bounds,indices})=>({placement,asset,name,bounds,triangles:indices.length/3})),contacts,summary:{contacts:contacts.length,contactPlacements:[...new Set(contacts.map(c=>c.placement+' '+c.asset))],homeContacts:contacts.filter(c=>c.position.label==='home').length,maxHorizontalRadius:maxRadius,navigationRadius:MOURNING_SIZE.radius,baseGeometryUnchanged:JSON.stringify(baseHashes)===JSON.stringify(afterHashes)}};
report.method.safeOnly=safeOnly;report.ceiling.cutaway='No camera cutaway in ceiling; physical dome unchanged, camera guard remains below actual dome triangles.';report.ceiling.note='Lower bound of exact dome triangle vertex heights for every triangle whose XZ bounds touch the complete swept character rectangle; actual dome triangles also included in narrow phase.';
report.method.normalHitPulseSamples=poses.filter(p=>p.hitPulseTime!==undefined).length;
report.floor={minimumCreatureLocalY:Math.min(...poses.map(p=>p.bounds.lo[1])),note:'The nearly flat foot-contact floor is excluded from wall/prop SAT. Negative local Y is recorded separately; no correction is applied to source motion.'};
report.method.deathTransitionSamples=poses.filter(p=>p.state==='dead').length;
report.method.deathSampling='transition(dead) from specified living snapshot, then update(dt) at 60 Hz to the requested time; final 5.2-second pose clamped';
report.poseBounds.forEach((p,i)=>{if(poses[i].from)p.from=poses[i].from;});
report.poseBounds.forEach((p,i)=>{if(poses[i].hitPulseTime!==undefined)p.hitPulseTime=poses[i].hitPulseTime;});
writeFileSync(new URL(options.outputName??(boundsOnly?'geometry-bounds.json':quick?'geometry-audit-quick.json':'geometry-audit.json'),out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
animator.dispose();for(const c of containers)c.dispose();for(const l of loaders)l.dispose();scene.dispose();engine.dispose();
return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await auditElenaClearance();
 if(report.summary.contacts||!report.summary.baseGeometryUnchanged)process.exitCode=1;
}
