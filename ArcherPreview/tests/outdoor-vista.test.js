import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,Vector3,ArcRotateCamera,DirectionalLight,HemisphericLight,ShadowGenerator} from '@babylonjs/core';
import {createMountainBackdrop} from '../src/mountain-backdrop.js';
import {configureOutdoorVista,plainsVistaPositions,PLAINS_VISTA_FAR} from '../src/outdoor-vista.js';
import {VILLAGE_PLAINS_BOUNDARY as boundary} from '../src/village-plains-boundary.js';
import {SceneLighting} from '../src/scene-lighting.js';

const folder=new URL('../reports/hud-horizon-2026-11-05/',import.meta.url);
function clipAbove(points,y){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=a[1]-y,db=b[1]-y;if(da>=0)out.push(a);if((da<0)!==(db<0)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;}
function nearestRadius(poly){
 let positive=false,negative=false,minimum=Infinity;
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],cross=a[0]*b[2]-b[0]*a[2];positive ||=cross>1e-6;negative ||=cross< -1e-6;const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,-(a[0]*dx+a[2]*dz)/(dx*dx+dz*dz||1)));minimum=Math.min(minimum,Math.hypot(a[0]+dx*t,a[2]+dz*t));}
 return positive&&negative?minimum:0;
}
test('plains vista starts outside the playable envelope and preserves the native palette and camera limits',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=createMountainBackdrop(scene);
 try{
 const base=Float32Array.from(mesh.getVerticesData('position')),colors=Float32Array.from(mesh.getVerticesData('color')),indices=Array.from(mesh.getIndices()),positions=plainsVistaPositions(base);
 let minAboveFloorRadius=Infinity,maxDistance=0;
 for(let i=0;i<positions.length;i+=3){
  assert.ok(Number.isFinite(positions[i]+positions[i+1]+positions[i+2]));
  maxDistance=Math.max(maxDistance,Math.hypot(positions[i],positions[i+1],positions[i+2]));
 }
 for(let i=0;i<indices.length;i+=3){const poly=clipAbove(indices.slice(i,i+3).map(j=>Array.from(positions.slice(j*3,j*3+3))),.12);if(poly.length>=3)minAboveFloorRadius=Math.min(minAboveFloorRadius,nearestRadius(poly));}
 assert.ok(minAboveFloorRadius>106.29,'mountain enters the playable body envelope');assert.ok(maxDistance+106+82<PLAINS_VISTA_FAR,'peak could be clipped from legal play/camera positions');assert.equal(indices.length/3,2944);
 const world={mountains:mesh};configureOutdoorVista(world,{village:true,plains:true});assert.deepEqual(Float32Array.from(mesh.getVerticesData('color')),colors);assert.deepEqual(Array.from(mesh.getIndices()),indices);
 const geometry=mesh.geometry,material=mesh.material,counts=[scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length];
 for(let n=0;n<24;n++){configureOutdoorVista(world,{village:true});assert.deepEqual(Float32Array.from(mesh.getVerticesData('position')),base);assert.deepEqual(mesh.scaling.asArray(),[1.9,1.3,1.9]);configureOutdoorVista(world,{village:true,plains:true});assert.deepEqual(Float32Array.from(mesh.getVerticesData('position')),positions);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.deepEqual([scene.meshes.length,scene.materials.length,scene.geometries.length,scene.textures.length],counts);}
 const result={triangles:indices.length/3,minAboveFloorRadius,maxVertexRadius:maxDistance,legalCameraAndPlayerMargin:188,cameraFar:PLAINS_VISTA_FAR,roundTrips:24,stableResources:counts,extraLights:0,extraShadowPasses:0,extraTextures:0,cachedPositionBytes:base.byteLength+positions.byteLength,scope:'Actual SDK geometry/scene lifetime and resource invariants; not a mobile GPU or gameplay screenshot measurement.'};
 mkdirSync(folder,{recursive:true});writeFileSync(new URL('outdoor-vista-resources.json',folder),JSON.stringify(result,null,2));
 }finally{scene.dispose();engine.dispose();}
});

test('sky, sun and camera range restore exactly after repeated outdoor/cave transitions and quality switches',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mesh=createMountainBackdrop(scene),camera=new ArcRotateCamera('camera',1,1,13,Vector3.Zero(),scene);
 const key=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',new Vector3(.5,-.3,.7),scene),ambient=new HemisphericLight('sky',new Vector3(0,1,.3),scene),shadows=new ShadowGenerator(1024,key);
 const lighting=new SceneLighting(scene,{key,rim,ambient,shadows,village:true,touchDevice:true}),sky={mesh:{rotation:{y:0}}},world={mountains:mesh,camera,sky,lighting};
 try{
  for(let n=0;n<12;n++)for(const quality of ['high','balanced']){
   configureOutdoorVista(world,{village:true});lighting.setQuality(quality);const expected=key.direction.clone(),oldAmbient=ambient.direction.clone(),oldRim=rim.direction.clone();
   configureOutdoorVista(world,{village:true,plains:true});assert.equal(camera.maxZ,1024);assert.equal(sky.mesh.rotation.y,boundary.yaw);const c=Math.cos(boundary.yaw),s=Math.sin(boundary.yaw);assert.ok(Vector3.Distance(key.direction,new Vector3(c*expected.x+s*expected.z,expected.y,-s*expected.x+c*expected.z))<1e-12);
   configureOutdoorVista(world,{village:true});assert.equal(camera.maxZ,350);assert.equal(sky.mesh.rotation.y,0);assert.deepEqual(key.direction.asArray(),expected.asArray());assert.deepEqual(ambient.direction.asArray(),oldAmbient.asArray());assert.deepEqual(rim.direction.asArray(),oldRim.asArray());
  }
 }finally{shadows.dispose();scene.dispose();engine.dispose();}
});
