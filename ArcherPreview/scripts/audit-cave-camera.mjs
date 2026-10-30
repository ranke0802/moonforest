import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {caveSafeCameraRadius,caveCameraBlocked} from '../src/witch-cave-camera.js';
import {CAVE_ROUTES,CAVE_PLACEMENTS} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain,caveClearance} from '../src/witch-cave-terrain.js';
import {CAVE_COLLISION_DATA} from '../src/witch-cave-collision-data.js';
const out=new URL('../reports/cave-gpu-followup/',import.meta.url);await mkdir(out,{recursive:true});
const terrain=createWitchCaveTerrain(),anchors=[],seen=new Set();
for(const route of CAVE_ROUTES)for(let k=1;k<route.length;k++){
 const a=route[k-1],b=route[k],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);
 for(let i=0;i<=count;i++){const x=a[0]+(b[0]-a[0])*i/count,z=a[1]+(b[1]-a[1])*i/count,key=x+','+z;if(!seen.has(key)){seen.add(key);anchors.push({x,z,y:terrain.heightAt(x,z)+1.55});}}
}
const failures=[],radii=[];let cases=0,clamped=0;
for(const base of anchors)for(const beta of [.25,1.18,1.78,Math.PI-.035])for(const requested of [8,24,82])for(let a=0;a<24;a++){
 const alpha=a*Math.PI/12,radius=caveSafeCameraRadius(terrain,base,alpha,beta,requested),lift=Math.max(0,-.35-radius*Math.cos(beta));
 const eye={x:base.x+Math.cos(alpha)*Math.sin(beta)*radius,y:base.y+lift+Math.cos(beta)*radius,z:base.z+Math.sin(alpha)*Math.sin(beta)*radius};
 cases++;if(radius<requested)clamped++;radii.push(radius);
 if(caveCameraBlocked(terrain,eye.x,eye.y,eye.z))failures.push({base,alpha,beta,requested,radius,eye});
}
const baseline=execFileSync('git',['show','26c2957:ArcherPreview/src/witch-cave-collision-data.js'],{encoding:'utf8'}),oldData=JSON.parse(baseline.slice(baseline.indexOf('={')+1,baseline.lastIndexOf(';')));
const sourceHash={};for(const file of ['witch-cave-layout.js','witch-cave-camera.js','witch-cave-visibility.js','cave-rock-shell.js','witch-cave-surfaces.js'])sourceHash[file]=createHash('sha256').update(await readFile(new URL('../src/'+file,import.meta.url))).digest('hex');
const ownerData=JSON.parse(await readFile(new URL('../reports/witch-cave-v5-improved/collision-owners.json',import.meta.url),'utf8')),owners=ownerData.owners;
const lowerIds=new Set(CAVE_PLACEMENTS.filter(p=>p.lowerShoulder).map(p=>p.id));
const newBodyCells=Object.entries(owners).filter(([cell,owner])=>lowerIds.has(owner.split(' ')[0])).map(([cell,owner])=>{const x=ownerData.min+(Number(cell)%ownerData.size+.5)*ownerData.step,z=ownerData.min+(Math.floor(Number(cell)/ownerData.size)+.5)*ownerData.step;let maxExistingClearance=-Infinity;for(const dx of [-.2,0,.2])for(const dz of [-.2,0,.2])maxExistingClearance=Math.max(maxExistingClearance,caveClearance(x+dx,z+dz));return {x,z,owner,maxExistingClearance};});
const views=[];for(const v of [{name:'entry-facing-rock',x:-42,z:43,alpha:Math.PI/2,beta:1.35,radius:14},{name:'branch-return',x:-30,z:19,alpha:Math.PI,beta:1.18,radius:24}]){
 const base={x:v.x,y:terrain.heightAt(v.x,v.z)+1.55,z:v.z},safe=caveSafeCameraRadius(terrain,base,v.alpha,v.beta,v.radius),eye=r=>[v.x+Math.cos(v.alpha)*Math.sin(v.beta)*r,base.y+Math.max(0,-.35-r*Math.cos(v.beta))+Math.cos(v.beta)*r,v.z+Math.sin(v.alpha)*Math.sin(v.beta)*r];
 views.push({...v,safeRadius:safe,requestedEye:eye(v.radius),eye:eye(safe),target:[base.x,base.y+Math.max(0,-.35-safe*Math.cos(v.beta)),base.z]});
}
radii.sort((a,b)=>a-b);
const report={baseline:'26c2957',scope:'Actual near-LOD source triangle occupancy, terrain and ceiling; CPU only, no browser or GPU output claim',anchors:anchors.length,cameraCases:cases,clampedCases:clamped,blockedEyes:failures.length,failures,minRadius:radii[0],medianRadius:radii[Math.floor(radii.length/2)],newBodyCollisionCells:newBodyCells,newBodyCellsAllAlreadyUnwalkable:newBodyCells.every(p=>p.maxExistingClearance<0),ordinaryCollisionRunsUnchanged:JSON.stringify(oldData.runs)===JSON.stringify(CAVE_COLLISION_DATA.runs),terrainSourceUnchanged:execFileSync('git',['diff','26c2957','--','src/witch-cave-terrain.js'],{encoding:'utf8'}).trim()==='',placements:CAVE_PLACEMENTS.length,addedActualRockInstances:lowerIds.size,addedModels:0,addedTextures:0,addedPerFrameMeshRaycasts:0,sourceHash,views};
await writeFile(new URL('camera-audit.json',out),JSON.stringify(report,null,2)+'\n');await writeFile(new URL('lower-rock-layout.json',out),JSON.stringify(CAVE_PLACEMENTS.filter(p=>p.lowerShoulder)));
console.log(JSON.stringify({...report,failures:failures.slice(0,2),sourceHash:undefined,views:undefined}));
if(failures.length||!report.newBodyCellsAllAlreadyUnwalkable)process.exitCode=1;
