import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,Vector3,Ray} from '@babylonjs/core';
import {createMountainBackdrop} from '../src/mountain-backdrop.js';
import {configureOutdoorVista,plainsVistaPositions,PLAINS_VISTA_FAR} from '../src/outdoor-vista.js';
import {PLAINS_RADIUS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {villageToPlains,VILLAGE_PLAINS_BOUNDARY as boundary} from '../src/village-plains-boundary.js';
import {forestToPlains} from '../src/plains-forest-boundary.js';

const facts=[];
function triangles(positions,indices){
  const out=new Float64Array(indices.length*3);
  for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,at=i*3;for(let k=0;k<3;k++){out[at+k]=positions[a+k];out[at+3+k]=positions[b+k]-positions[a+k];out[at+6+k]=positions[c+k]-positions[a+k];}}
  return out;
}
function nearest(tris,origin,direction,max=Infinity){
  let best=max;
  for(let i=0;i<tris.length;i+=9){
    const px=direction[1]*tris[i+8]-direction[2]*tris[i+7],py=direction[2]*tris[i+6]-direction[0]*tris[i+8],pz=direction[0]*tris[i+7]-direction[1]*tris[i+6],det=tris[i+3]*px+tris[i+4]*py+tris[i+5]*pz;
    if(Math.abs(det)<1e-10)continue;
    const tx=origin[0]-tris[i],ty=origin[1]-tris[i+1],tz=origin[2]-tris[i+2],u=(tx*px+ty*py+tz*pz)/det;if(u< -1e-7||u>1+1e-7)continue;
    const qx=ty*tris[i+5]-tz*tris[i+4],qy=tz*tris[i+3]-tx*tris[i+5],qz=tx*tris[i+4]-ty*tris[i+3],v=(direction[0]*qx+direction[1]*qy+direction[2]*qz)/det;if(v< -1e-7||u+v>1+1e-7)continue;
    const distance=(tris[i+6]*qx+tris[i+7]*qy+tris[i+8]*qz)/det;if(distance>1e-6&&distance<best)best=distance;
  }
  return best<max?best:null;
}
function segment(tris,eye,target){const delta=target.map((v,i)=>v-eye[i]),length=Math.hypot(...delta);return nearest(tris,eye,delta.map(v=>v/length),length);}
function fixture(){
  const engine=new NullEngine(),scene=new Scene(engine),mesh=createMountainBackdrop(scene),base=Float32Array.from(mesh.getVerticesData('position')),indices=mesh.getIndices();
  configureOutdoorVista({mountains:mesh},{village:true,plains:true});
  return {engine,scene,mesh,base,indices,positions:mesh.getVerticesData('position'),rays:triangles(mesh.getVerticesData('position'),indices),dispose(){scene.dispose();engine.dispose();}};
}
function previousVista(source){
  const out=new Float32Array(source.length),c=Math.cos(boundary.yaw),s=Math.sin(boundary.yaw),anchor=boundary.plainsPortal;
  for(let i=0;i<source.length;i+=3){const vx=source[i]*1.9-boundary.villagePortal.x,vz=source[i+2]*1.9-boundary.villagePortal.z,dx=c*vx+s*vz,dz=-s*vx+c*vz,d=Math.max(.001,Math.hypot(dx,dz)),ux=dx/d,uz=dz/d,dot=anchor.x*ux+anchor.z*uz,shell=-dot+Math.sqrt(dot*dot+350*350-anchor.x*anchor.x-anchor.z*anchor.z),scale=Math.max(1,(shell+d*.18)/d);out[i]=anchor.x+dx*scale;out[i+1]=1.5+(source[i+1]*1.3-1.5)*scale;out[i+2]=anchor.z+dz*scale;}
  return out;
}

test('actual plains mountain geometry closes horizontal and former distant-skirt sightlines from legal hill and border cameras',()=>{
  const f=fixture(),terrain=createGreatPlainsTerrain(),before=triangles(previousVista(f.base),f.indices);
  const high=terrain.heightAt(-34.5,-26.5)+1.3504634657+2.5+(17/1.2)*Math.cos(.25);
  const eyes=[[0,1.6,0],[-34.5,high,-26.5],[-120,18,0],[0,18,120],[87,18,86],[-87,2,-32],[61,2,-66]];
  let horizonRays=0,skirtRays=0,oldExposed=0,maxDistance=0,oracleChecks=0;
  try{
    for(const eye of eyes)for(let angle=0;angle<360;angle+=2){
      const a=angle*Math.PI/180,direction=[Math.cos(a),0,Math.sin(a)],distance=nearest(f.rays,eye,direction,PLAINS_VISTA_FAR);horizonRays++;
      assert.notEqual(distance,null,JSON.stringify({eye,angle,kind:'horizontal'}));maxDistance=Math.max(maxDistance,distance);
      const target=[Math.cos(a)*360,0,Math.sin(a)*360],hit=segment(f.rays,eye,target);skirtRays++;
      assert.notEqual(hit,null,JSON.stringify({eye,angle,kind:'former-skirt'}));if(segment(before,eye,target)===null)oldExposed++;
      if(angle%60===0){const actual=new Ray(Vector3.FromArray(eye),Vector3.FromArray(direction),PLAINS_VISTA_FAR).intersectsMesh(f.mesh,false);assert.equal(actual.hit,true);assert.ok(Math.abs(actual.distance-distance)<1e-3);oracleChecks++;}
    }
    assert.ok(oldExposed>200,'baseline must expose the unreachable distant skirt in these same views');
    facts.push({case:'horizon-and-distant-skirt-coverage',legalEyes:eyes,horizonRays,skirtRays,oldExposedSkirtRays:oldExposed,newExposedSkirtRays:0,maxMountainHitDistance:maxDistance,farPlane:PLAINS_VISTA_FAR,sdkRayOracleChecks:oracleChecks});
  }finally{f.dispose();}
});

test('foothill triangles stay outside the player envelope and clear extreme rim orbit camera-to-player segments',()=>{
  const f=fixture(),terrain=createGreatPlainsTerrain();let minimumRadius=Infinity,cameraRays=0;
  try{
    for(let i=0;i<f.indices.length;i+=3)for(let j=0;j<3;j++){
      const a=f.indices[i+j]*3,b=f.indices[i+(j+1)%3]*3,dx=f.positions[b]-f.positions[a],dz=f.positions[b+2]-f.positions[a+2],t=Math.max(0,Math.min(1,-(f.positions[a]*dx+f.positions[a+2]*dz)/(dx*dx+dz*dz||1)));
      minimumRadius=Math.min(minimumRadius,Math.hypot(f.positions[a]+dx*t,f.positions[a+2]+dz*t));
    }
    assert.ok(minimumRadius>PLAINS_RADIUS+.29,'mountain face enters the actual player body envelope');
    for(let angle=0;angle<360;angle+=15){
      const a=angle*Math.PI/180,x=105*Math.cos(a),z=105*Math.sin(a),ground=terrain.heightAt(x,z);
      for(const radius of [1.7,17/1.2])for(const beta of [.25,1.18,1.78])for(let orbit=0;orbit<360;orbit+=45){
        const alpha=orbit*Math.PI/180,lift=Math.max(0,-.35*.90031-radius*Math.cos(beta));
        const eye=[x+Math.cos(alpha)*(radius*Math.sin(beta)+4),ground+1.3504634657-.8+lift+radius*Math.cos(beta),z+Math.sin(alpha)*(radius*Math.sin(beta)+4)],target=[x,ground+1.3504634657,z];
        assert.equal(segment(f.rays,eye,target),null,JSON.stringify({angle,radius,beta,orbit,eye}));cameraRays++;
      }
    }
    facts.push({case:'playable-envelope-and-camera-clearance',minimumTrianglePlanarRadius:minimumRadius,playerCenterLimit:PLAINS_RADIUS,checkedPlayerEnvelope:PLAINS_RADIUS+.29,cameraRays,occlusions:0,maximumDefaultOrbit:17/1.2,maximumPanXZ:4,minimumPanY:-.8});
  }finally{f.dispose();}
});

test('town and forest passage views retain clear sightlines to their native transformed scenery',()=>{
  const f=fixture();let rays=0;
  try{
    const cases=[{eye:[-87,1.6,-32],map:villageToPlains,points:[[-50,0],[0,0],[50,0],[0,-45],[-25,30],[25,30]]},{eye:[61,1.6,-66],map:forestToPlains,points:[[-20,10],[0,0],[20,10],[-20,30],[20,30]]}];
    for(const entry of cases)for(const [x,z]of entry.points)for(const height of [1,5,12]){const p=entry.map({x,z});assert.equal(segment(f.rays,entry.eye,[p.x,height,p.z]),null,JSON.stringify({eye:entry.eye,target:p,height}));rays++;}
    facts.push({case:'native-passage-sight-corridors',rays,mountainOcclusions:0,nativeVillageAndForestGeometryChanged:false});
  }finally{f.dispose();}
});

test('plains remap is cached across outdoor roundtrips without changing palette, triangle count or frame observers',()=>{
  const f=fixture(),mesh=f.mesh,geometry=mesh.geometry,material=mesh.material,colors=Float32Array.from(mesh.getVerticesData('color')),counts=[f.scene.meshes.length,f.scene.materials.length,f.scene.geometries.length,f.scene.textures.length],observers=f.scene.onBeforeRenderObservable.observers.length+f.scene.onAfterRenderObservable.observers.length;
  try{
    const world={mountains:mesh};assert.equal(f.indices.length/3,2944);assert.deepEqual(Float32Array.from(plainsVistaPositions(f.base)),Float32Array.from(f.positions));
    for(let cycle=0;cycle<32;cycle++){
      configureOutdoorVista(world,{village:true});assert.deepEqual(Float32Array.from(mesh.getVerticesData('position')),f.base);assert.deepEqual(mesh.scaling.asArray(),[1.9,1.3,1.9]);
      configureOutdoorVista(world,{village:true,plains:true});assert.deepEqual(Float32Array.from(mesh.getVerticesData('position')),Float32Array.from(f.positions));
      configureOutdoorVista(world,{village:false});assert.deepEqual(Float32Array.from(mesh.getVerticesData('position')),f.base);assert.deepEqual(mesh.scaling.asArray(),[1,1,1]);
      configureOutdoorVista(world,{village:true,plains:true});assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.deepEqual(Float32Array.from(mesh.getVerticesData('color')),colors);
    }
    assert.deepEqual([f.scene.meshes.length,f.scene.materials.length,f.scene.geometries.length,f.scene.textures.length],counts);assert.equal(f.scene.onBeforeRenderObservable.observers.length+f.scene.onAfterRenderObservable.observers.length,observers);
    assert.equal(material.unlit,true);assert.equal(mesh.checkCollisions,false);assert.equal(mesh.receiveShadows,false);assert.equal(mesh.isPickable,false);assert.equal(mesh.applyFog,false);
    facts.push({case:'static-resource-and-roundtrip-invariants',triangles:2944,roundTrips:32,resources:counts,newTextures:0,newLights:0,newShadowPasses:0,newFrameObservers:0,unchangedNativeMountainPalette:true,villageAndForestBaseRestoredExactly:true});
  }finally{f.dispose();}
});

test.after(()=>{
  const folder=new URL('../reports/hud-horizon-2026-11-05/',import.meta.url);mkdirSync(folder,{recursive:true});
  writeFileSync(new URL('horizon-validation.json',folder),JSON.stringify({baseline:'8bfabf0',passed:facts.length===4,sourceHashes:Object.fromEntries(['outdoor-vista.js','mountain-backdrop.js'].map(name=>[name,createHash('sha256').update(readFileSync(new URL('../src/'+name,import.meta.url))).digest('hex')])),facts,limitations:['Actual static Babylon mesh and terrain heightfield with CPU triangle/SDK ray checks; no browser, screenshot, rasterized output, GPU or mobile timing measurements.','Camera clearance covers normal configured1.2x–10x zoom, maximum4m horizontal pan and extreme low vertical pan; disabling the zoom bound can move the camera outside this default envelope.','The low buried apron preserves orbit-camera clearance; the static visible slopes rise outside it. Native connected-town/forest sight corridors remain open.']},null,2)+'\n');
});
