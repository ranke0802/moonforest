// Bake existing near-LOD surfaces once. Runtime collision never loads or rays
// the render meshes, and remains independent of visibility and LOD changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,Vector3,VertexBuffer} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {CAVE_PLACEMENTS,caveSurface} from '../src/witch-cave-layout.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {createVillageTransform} from '../src/village-environment.js';
const base=new URL('../public/assets/',import.meta.url),out=new URL('../src/witch-cave-collision-data.js',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('witch-cave.json',base),'utf8'));
const step=.4,size=400,min=-80,occupied=new Uint8Array(size*size),sight=new Uint8Array(size*size),ground=new Float32Array(size*size),walk=new Uint8Array(size*size);
// Camera occupancy retains the actual vertical range, including empty space
// below arches. Quantised outwards, so no near-LOD wall surface is missed.
const cameraSize=size,cameraBottom=-16,cameraUnit=.25,cameraMasks=new Uint32Array(cameraSize*cameraSize*8);
const terrain=createWitchCaveTerrain();
for(let z=0;z<size;z++)for(let x=0;x<size;x++){
 const xx=min+(x+.5)*step,zz=min+(z+.5)*step,i=z*size+x;
 ground[i]=terrain.heightAt(xx,zz);walk[i]=caveSurface(xx,zz).distance<2;
}
// Clip a triangle against a cell footprint, preserving interpolated Y. This
// handles vertical faces as well as overhangs without filling the arch opening.
function clip(poly,axis,bound,sign){
 const result=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
  if(da>=-1e-7)result.push(a);
  if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.map((v,k)=>v+(b[k]-v)*t));}
 }return result;
}
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const world={scene,terrain},owners={};let triangles=0;
try{
 for(const [id,config]of Object.entries(manifest.assets)){
  // Flat pressure plates intentionally remain walkable.
  if(id==='cave-14-hidden-pressure-stone')continue;
  const {gltf,files}=await readRuntimeGltf(new URL(config.lods[0].model,base));
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+Buffer.from(files.get(b.uri).data).toString('base64');
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const p of CAVE_PLACEMENTS.filter(p=>p.asset===id)){
   const {root,facing}=createVillageTransform(world,p,config),entry=container.instantiateModelsToScene(n=>p.id+n,false,{doNotInstantiate:false});
   for(const node of entry.rootNodes)node.parent=facing;
   for(const mesh of root.getChildMeshes().filter(m=>m.getTotalVertices()>0)){
    const matrix=mesh.computeWorldMatrix(true),positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices(),vertices=[];
    for(let i=0;i<positions.length;i+=3){const v=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);vertices.push([v.x,v.y,v.z]);}
    for(let i=0;i<indices.length;i+=3){
     const points=[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]];triangles++;
     const lowX=Math.max(0,Math.floor((Math.min(...points.map(v=>v[0]))-min)/step)),highX=Math.min(size-1,Math.floor((Math.max(...points.map(v=>v[0]))-min)/step));
     const lowZ=Math.max(0,Math.floor((Math.min(...points.map(v=>v[2]))-min)/step)),highZ=Math.min(size-1,Math.floor((Math.max(...points.map(v=>v[2]))-min)/step));
     for(let z=lowZ;z<=highZ;z++)for(let x=lowX;x<=highX;x++){
      const cell=z*size+x,bodyWanted=!occupied[cell]&&walk[cell],sightWanted=!sight[cell]&&p.kind==='rock';
      const cameraWanted=p.kind==='rock';
      if(!bodyWanted&&!sightWanted&&!cameraWanted)continue;
      let poly=points;
      for(const [axis,bound,sign]of [[0,min+x*step,1],[0,min+(x+1)*step,-1],[2,min+z*step,1],[2,min+(z+1)*step,-1]]){poly=clip(poly,axis,bound,sign);if(!poly.length)break;}
      if(poly.length){
       const high=Math.max(...poly.map(v=>v[1])),low=Math.min(...poly.map(v=>v[1]));
       if(bodyWanted&&high>=ground[cell]+.22&&low<=ground[cell]+1.75){occupied[cell]=1;owners[cell]=p.id+' '+id;}
       if(sightWanted&&high>=ground[cell]+1.5&&low<=ground[cell]+2.1)sight[cell]=1;
       if(cameraWanted){const at=(z*cameraSize+x)*8,from=Math.max(0,Math.floor((low-cameraBottom)/cameraUnit)),to=Math.min(255,Math.floor((high-cameraBottom)/cameraUnit));for(let layer=from;layer<=to;layer++)cameraMasks[at+(layer>>5)]|=1<<(layer&31);}
      }
     }
    }
   }root.dispose();
  }container.dispose();
 }
}finally{engine.dispose();}
const runs=[];
for(let i=0;i<occupied.length;i++)if(occupied[i]){const start=i;while(i+1<occupied.length&&occupied[i+1])i++;runs.push(start,i-start+1);}
const terrainSource=await readFile(new URL('../src/witch-cave-terrain.js',import.meta.url),'utf8');
const layoutSource=await readFile(new URL('../src/witch-cave-layout.js',import.meta.url),'utf8');
// Git checkouts may use CRLF on Windows and LF on Linux; geometry is identical.
const fingerprint=createHash('sha256').update(layoutSource.replace(/\r\n?/g,'\n')).update(terrainSource.replace(/\r\n?/g,'\n')).digest('hex');
const data={step,size,min,fingerprint,runs};
await writeFile(out,'// Generated by scripts/bake-cave-collision.mjs from existing near-LOD meshes.\nexport const CAVE_COLLISION_DATA='+JSON.stringify(data)+';\n');
const report={triangles,occupiedCells:occupied.reduce((a,b)=>a+b,0),runs:runs.length/2,bytes:JSON.stringify(data).length,fingerprint,newModels:0};
await mkdir(new URL('../reports/witch-cave-v5-improved/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/witch-cave-v5-improved/collision-bake.json',import.meta.url),JSON.stringify(report,null,2));
await writeFile(new URL('../reports/witch-cave-v5-improved/collision-owners.json',import.meta.url),JSON.stringify({step,size,min,owners}));
const sightRuns=[];for(let i=0;i<sight.length;i++)if(sight[i]){const start=i;while(i+1<sight.length&&sight[i+1])i++;sightRuns.push(start,i-start+1);}
const sightData={step,size,min,fingerprint,heightRange:[1.5,2.1],kind:'rock',runs:sightRuns};
await writeFile(new URL('../src/witch-cave-sight-data.js',import.meta.url),'// Generated from actual near-LOD rock triangles; arched openings remain open.\nexport const CAVE_SIGHT_DATA='+JSON.stringify(sightData)+';\n');
await mkdir(new URL('../reports/cave-enclosure/',import.meta.url),{recursive:true});
const visibility={triangles,occupiedCells:sight.reduce((a,b)=>a+b,0),runs:sightRuns.length/2,bytes:JSON.stringify(sightData).length,fingerprint,heightRange:sightData.heightRange,kind:sightData.kind,newModels:0};
await writeFile(new URL('../reports/cave-enclosure/sight-bake.json',import.meta.url),JSON.stringify(visibility,null,2)+'\n');
console.log(JSON.stringify({collision:report,visibility}));
const cameraRuns=[];
let cameraCells=0;
for(let i=0;i<cameraSize*cameraSize;i++)if(cameraMasks.subarray(i*8,i*8+8).some(v=>v!==0)){const start=i,masks=Array.from(cameraMasks.subarray(i*8,i*8+8));while(i+1<cameraSize*cameraSize&&masks.every((v,k)=>cameraMasks[(i+1)*8+k]===v))i++;cameraCells+=i-start+1;cameraRuns.push(start,i-start+1,...masks);}
const cameraData={step,size:cameraSize,min,bottom:cameraBottom,unit:cameraUnit,layers:256,fingerprint,runs:cameraRuns};
const cameraLookup=new Uint16Array(cameraSize*cameraSize),cameraProfiles=[0,0,0,0,0,0,0,0],profileIds=new Map();
for(let i=0;i<cameraRuns.length;i+=10){const values=cameraRuns.slice(i+2,i+10),key=values.join(',');let id=profileIds.get(key);if(id===undefined){id=cameraProfiles.length/8;profileIds.set(key,id);cameraProfiles.push(...values);}cameraLookup.fill(id,cameraRuns[i],cameraRuns[i]+cameraRuns[i+1]);}
if(cameraProfiles.length/8>65535)throw new Error('Camera field profile capacity exceeded');
delete cameraData.runs;
cameraData.lookup=Buffer.from(cameraLookup.buffer).toString('base64');cameraData.profiles=Buffer.from(Uint32Array.from(cameraProfiles).buffer).toString('base64');
await writeFile(new URL('../src/witch-cave-camera-data.js',import.meta.url),'// Actual near-LOD rock voxels preserve gaps below arches; no runtime mesh rays.\nexport const CAVE_CAMERA_DATA='+JSON.stringify(cameraData)+';\n');
await mkdir(new URL('../reports/cave-gpu-followup/',import.meta.url),{recursive:true});
await writeFile(new URL('../reports/cave-gpu-followup/camera-bake.json',import.meta.url),JSON.stringify({triangles,placements:CAVE_PLACEMENTS.length,lowerShoulders:CAVE_PLACEMENTS.filter(p=>p.lowerShoulder),cameraCells,bytes:JSON.stringify(cameraData).length,runtimeBytes:cameraLookup.byteLength+cameraProfiles.length*4,uniqueProfiles:cameraProfiles.length/8,fingerprint,terrainUnchanged:true,sourceLod:0},null,2)+'\n');
