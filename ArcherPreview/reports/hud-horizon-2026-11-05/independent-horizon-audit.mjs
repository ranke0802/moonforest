import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {createMountainBackdrop} from '../../src/mountain-backdrop.js';
import {configureOutdoorVista,PLAINS_VISTA_FAR} from '../../src/outdoor-vista.js';
import {createGreatPlainsTerrain} from '../../src/great-plains-terrain.js';
import {plainsObstacles} from '../../src/great-plains-layout.js';
import {VillageNavigation} from '../../src/village-navigation.js';
import {setWorldCharacter} from '../../src/world-limits.js';
import {WARRIOR_DIMENSIONS} from '../../src/player-dimensions.js';
import {CameraPitch} from '../../src/camera-pitch.js';
import {villageToPlains} from '../../src/village-plains-boundary.js';
import {forestToPlains} from '../../src/plains-forest-boundary.js';

const directory=new URL('./',import.meta.url),root=new URL('../../',import.meta.url);
const audit=JSON.parse(readFileSync(new URL('navigation-camera-audit.json',directory)));
const hash=data=>createHash('sha256').update(data).digest('hex');
const vertexHash=data=>hash(Buffer.from(Float32Array.from(data).buffer));
const report={baseline:'8bfabf0',scope:'Independent CPU ray/triangle intersection audit of the actual candidate mountain buffer and native camera/terrain/navigation. No browser, GPU, screenshot, texture or asset generation.',sourceHashes:{},coverage:[],cameraObstructions:[],portalObstructions:[],failures:[]};
for(const [file,expected]of Object.entries(audit.protectedSourceHashes)){
  const actual=hash(readFileSync(new URL(file,root)));report.sourceHashes[file]=actual;
  if(actual!==expected)report.failures.push('Protected traversal/camera source changed: '+file);
}
setWorldCharacter('warrior-plains');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const mountains=createMountainBackdrop(scene),camera=new ArcRotateCamera('independent-horizon-camera',0,1,17,Vector3.Zero(),scene);
const world={mountains,camera,sky:{mesh:{rotation:{y:0}}}},terrain=createGreatPlainsTerrain(),navigation=new VillageNavigation(plainsObstacles());
const base=Float32Array.from(mountains.getVerticesData('position')),colors=Float32Array.from(mountains.getVerticesData('color')),indices=Array.from(mountains.getIndices());
if(vertexHash(base)!==audit.baselineGeometry.positionHash)report.failures.push('Village/forest base mountain positions changed');
if(vertexHash(colors)!==audit.baselineGeometry.colorHash)report.failures.push('Mountain palette changed');
if(hash(Buffer.from(Uint32Array.from(indices).buffer))!==audit.baselineGeometry.indexHash)report.failures.push('Mountain topology changed');
configureOutdoorVista(world,{village:true,plains:true});
const positions=Float32Array.from(mountains.getVerticesData('position')),triangles=[];
for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  triangles.push([positions[a],positions[a+1],positions[a+2],positions[b]-positions[a],positions[b+1]-positions[a+1],positions[b+2]-positions[a+2],positions[c]-positions[a],positions[c+1]-positions[a+1],positions[c+2]-positions[a+2]]);
}
// Moller-Trumbore against raw actual triangles, including both face directions.
function intersection(origin,target){
  const dx=target[0]-origin[0],dy=target[1]-origin[1],dz=target[2]-origin[2];let nearest=Infinity;
  for(const [ax,ay,az,ux,uy,uz,vx,vy,vz]of triangles){
    const px=dy*vz-dz*vy,py=dz*vx-dx*vz,pz=dx*vy-dy*vx,det=ux*px+uy*py+uz*pz;
    if(Math.abs(det)<1e-10)continue;
    const inverse=1/det,tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az,u=(tx*px+ty*py+tz*pz)*inverse;
    if(u< -1e-7||u>1+1e-7)continue;
    const qx=ty*uz-tz*uy,qy=tz*ux-tx*uz,qz=tx*uy-ty*ux,v=(dx*qx+dy*qy+dz*qz)*inverse;
    if(v< -1e-7||u+v>1+1e-7)continue;
    const t=(vx*qx+vy*qy+vz*qz)*inverse;if(t>1e-7&&t<nearest)nearest=t;
  }
  return nearest;
}
function triangleRadius(triangle){
  const [x,y,z,ux,uy,uz,vx,vy,vz]=triangle,points=[[x,z],[x+ux,z+uz],[x+vx,z+vz]];let positive=false,negative=false,minimum=Infinity;
  for(let i=0;i<3;i++){
    const a=points[i],b=points[(i+1)%3],cross=a[0]*b[1]-b[0]*a[1];positive ||=cross>1e-7;negative ||=cross< -1e-7;
    const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dz)/(dx*dx+dz*dz||1)));minimum=Math.min(minimum,Math.hypot(a[0]+dx*t,a[1]+dz*t));
  }
  return positive&&negative?minimum:0;
}
report.minimumTrianglePlanarRadius=Math.min(...triangles.map(triangleRadius));
if(report.minimumTrianglePlanarRadius<106+WARRIOR_DIMENSIONS.moveRadius)report.failures.push('Mountain triangle enters reachable player capsule envelope');
const actors=[{id:'hill',x:audit.highestLegalSample.x,z:audit.highestLegalSample.z},{id:'village-arrival',x:-87,z:-32},{id:'forest-arrival',x:61,z:-66},{id:'junction',x:-5,z:25}];
for(let i=0;i<12;i++){
  const angle=i*Math.PI/6,p=navigation.findFree({x:105*Math.cos(angle),z:105*Math.sin(angle)},WARRIOR_DIMENSIONS.moveRadius,106);actors.push({id:'rim-'+i,...p});
}
const pitch=new CameraPitch(camera,{warrior:true});pitch.setBodyScale(WARRIOR_DIMENSIONS.ratio);
let cameraCases=0,maxVertexDistance=0;
for(const actor of actors){
  const ground=terrain.heightAt(actor.x,actor.z),head=[actor.x,ground+WARRIOR_DIMENSIONS.stableFocusHeight,actor.z];
  for(const radius of [1.7,17/1.2])for(const beta of [.25,.88,1.35,1.78])for(let orbit=0;orbit<8;orbit++)for(const panY of [-.8,2.5]){
    const alpha=orbit*Math.PI/4,pan=panY<0?4:0;
    camera.radius=radius;camera.beta=beta;camera.alpha=alpha;
    pitch.follow(new Vector3(head[0]+pan*Math.cos(alpha),head[1]+panY,head[2]+pan*Math.sin(alpha)),0,{snap:true});camera.getViewMatrix(true);
    const eye=camera.globalPosition.asArray(),t=intersection(eye,head);cameraCases++;
    if(t<1-1e-6)report.cameraObstructions.push({actor:actor.id,radius,beta,alpha,panY,eye,hitFraction:t});
    for(let i=0;i<positions.length;i+=3)maxVertexDistance=Math.max(maxVertexDistance,Math.hypot(positions[i]-eye[0],positions[i+1]-eye[1],positions[i+2]-eye[2]));
  }
}
report.cameraCases=cameraCases;report.maximumSampledVertexEyeDistance=maxVertexDistance;report.cameraFar=camera.maxZ;
if(maxVertexDistance>PLAINS_VISTA_FAR)report.failures.push('Mountain vertex can exceed camera far clip');
if(report.cameraObstructions.length)report.failures.push('Mountain obstructs a sampled legal camera-to-player line');
// The two portal sight sectors intentionally retain the native adjacent scenery.
// Native corridor extents plus about8 degrees for legal orbit/pan parallax.
const openingSectors=[{centerDegrees:-159.5,halfWidthDegrees:30},{centerDegrees:-50,halfWidthDegrees:24}];
report.portalOpeningSectors=openingSectors;
const opening=angle=>openingSectors.some(({centerDegrees,halfWidthDegrees})=>Math.abs(Math.atan2(Math.sin(angle-centerDegrees*Math.PI/180),Math.cos(angle-centerDegrees*Math.PI/180)))<=halfWidthDegrees*Math.PI/180);
for(const actor of actors.slice(0,4)){
  const eye=[actor.x,terrain.heightAt(actor.x,actor.z)+WARRIOR_DIMENSIONS.stableFocusHeight+2.5+17/1.2*Math.cos(.25),actor.z];
  for(const radius of [160,220,300,420]){
    let tested=0,hidden=0;const open=[];
    for(let i=0;i<144;i++){
      const angle=-Math.PI+i*Math.PI/72;if(opening(angle))continue;
      const target=[radius*Math.cos(angle),.12,radius*Math.sin(angle)],t=intersection(eye,target);tested++;
      if(t<1-1e-6)hidden++;else open.push(angle*180/Math.PI);
    }
    report.coverage.push({actor:actor.id,targetRadius:radius,tested,hidden,percent:100*hidden/tested,uncoveredDegrees:open});
  }
}
if(report.coverage.some(row=>row.hidden!==row.tested))report.failures.push('Unreachable ground ray remains exposed outside native portal sight sectors');
for(const [id,from,targets]of [
  ['village',{x:-87,z:-32},[villageToPlains({x:0,z:0}),villageToPlains({x:-30,z:40}),villageToPlains({x:30,z:40})]],
  ['forest',{x:61,z:-66},[forestToPlains({x:-29,z:24}),forestToPlains({x:29,z:24}),forestToPlains({x:0,z:24})]],
]){
  const eye=[from.x,terrain.heightAt(from.x,from.z)+WARRIOR_DIMENSIONS.stableFocusHeight,from.z];
  for(const target of targets){const t=intersection(eye,[target.x,terrain.heightAt(target.x,target.z)+2,target.z]);if(t<1-1e-6)report.portalObstructions.push({id,from,target,hitFraction:t});}
}
if(report.portalObstructions.length)report.failures.push('Mountain screens a sampled native portal scenery sightline');
const resourceCounts=()=>[scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length],counts=resourceCounts(),geometry=mountains.geometry,material=mountains.material;
for(let i=0;i<32;i++){
  configureOutdoorVista(world,{village:true});
  if(vertexHash(mountains.getVerticesData('position'))!==audit.baselineGeometry.positionHash)report.failures.push('Village base failed to restore');
  configureOutdoorVista(world,{village:true,plains:true});
  if(vertexHash(mountains.getVerticesData('position'))!==vertexHash(positions))report.failures.push('Plains positions changed on repeated entry');
  configureOutdoorVista(world,{village:true});
  if(resourceCounts().some((value,index)=>value!==counts[index])||mountains.geometry!==geometry||mountains.material!==material)report.failures.push('Vista resources grew on mode round trip');
}
report.roundTrips=32;report.resourceCounts=counts;report.triangles=indices.length/3;report.plainsPositionHash=vertexHash(positions);report.failures=[...new Set(report.failures)];report.passed=report.failures.length===0;
writeFileSync(new URL('independent-horizon-validation.json',directory),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,minimumTrianglePlanarRadius:report.minimumTrianglePlanarRadius,cameraCases:report.cameraCases,cameraObstructions:report.cameraObstructions.length,portalObstructions:report.portalObstructions.length,maxVertexDistance,coverage:report.coverage.map(row=>({actor:row.actor,radius:row.targetRadius,percent:row.percent})),failures:report.failures}));
scene.dispose();engine.dispose();
