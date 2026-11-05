import {Vector3,VertexBuffer} from '@babylonjs/core';
import {EDITOR_CAVE_COLLISION_DATA as data} from './editor-cave-collision-data.js';
import {CAVE_COLLISION_DATA} from './witch-cave-collision-data.js';
import {caveClearance} from './witch-cave-terrain.js';
import {caveSurface} from './witch-cave-layout.js';
import {caveLaboratoryClearance} from './cave-laboratory-collision.js';
import {laboratoryEnabled,laboratoryLegacySource,clipLaboratoryCeiling} from './cave-laboratory-geometry.js';
import {rasterizeCaveGeometry,encodeCaveCells,fillCaveRuns,encodeCaveCamera,fillCaveCamera,caveDistanceField,sampleCaveDistance,caveSightBlocked,caveCameraCellsBlocked} from './editor-cave-grid.js';

// Complete ownership preserves overlapping retained meshes. Bake only before a
// paused edit transaction publishes; frame/camera queries read these arrays.
export function prepareEditedCaveClearance(runtime,document,records){
 if(data.fingerprint!==CAVE_COLLISION_DATA.fingerprint)throw Error('Cave editor ownership certificate is stale');
 const changed=new Set([...(document.removedBaseIds??[]),...document.instances.map(row=>row.sourceInstanceId).filter(Boolean)]),solid=document.instances.filter(row=>row.collision==='solid');
 if(!changed.size&&!solid.length)return null;const preparedKey=JSON.stringify([[...changed].sort(),solid]);if(runtime.caveEditorPrepared?.key===preparedKey)return runtime.caveEditorPrepared.value;
 const occupied=new Uint8Array(data.size**2),sight=new Uint8Array(occupied.length),camera=new Uint32Array(occupied.length*8),ground=runtime.caveEditorGround??=new Float32Array(occupied.length),mask=runtime.caveEditorMask??=new Uint8Array(occupied.length);
 if(!runtime.caveEditorGroundReady){for(let z=0;z<data.size;z++)for(let x=0;x<data.size;x++){const i=z*data.size+x,xx=data.min+(x+.5)*data.step,zz=data.min+(z+.5)*data.step;ground[i]=runtime.world.terrain.heightAt(xx,zz);mask[i]=caveSurface(xx,zz).distance<2?1:0;}runtime.caveEditorGroundReady=true;}
 for(const [id,runs]of Object.entries(data.owners))if(!changed.has(id)){fillCaveRuns(occupied,runs);fillCaveRuns(sight,data.sightOwners[id]);fillCaveCamera(camera,data.cameraOwners[id]);}
 const cache=runtime.caveEditorMasks??=new Map();let scratch;
 for(const instance of solid){
  const record=records.get(instance.instanceId),key=JSON.stringify(instance);let entry=cache.get(key);
  if(!entry){scratch??={cells:new Uint8Array(occupied.length),eye:new Uint8Array(occupied.length),voxels:new Uint32Array(camera.length)};const {cells,eye,voxels}=scratch;cells.fill(0);eye.fill(0);voxels.fill(0);const saved=record.instance;try{
    runtime._setTransform(record,instance);
    const native=instance.sourceInstanceId&&runtime._baseVisualFrame(instance.sourceInstanceId),matrix=record.facing.getWorldMatrix();
    const unchanged=native&&native.m.every((value,index)=>Math.abs(value-matrix.m[index])<1e-5);
    if(unchanged){fillCaveRuns(cells,data.owners[instance.sourceInstanceId]??[]);fillCaveRuns(eye,data.sightOwners[instance.sourceInstanceId]??[]);fillCaveCamera(voxels,data.cameraOwners[instance.sourceInstanceId]??[]);}
    else {const source=instance.sourceInstanceId&&runtime.baseManifest.instances.find(row=>row.instanceId===instance.sourceInstanceId)?.source,category=record.entry.catalog.category,structural=source?source.kind==='rock'||record.entry.config.category==='rock':['rock','building','wall','fence','defense'].includes(category);
     for(const mesh of record.meshes){
      const vertices=mesh.getVerticesData(VertexBuffer.PositionKind),world=mesh.computeWorldMatrix(true),positions=new Float32Array(vertices.length),point=new Vector3();
      for(let i=0;i<vertices.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(vertices[i],vertices[i+1],vertices[i+2],world,point);positions[i]=point.x;positions[i+1]=point.y;positions[i+2]=point.z;}
      const geometry=laboratoryEnabled()&&laboratoryLegacySource(record.entry.catalog.assetId)?clipLaboratoryCeiling({positions,indices:mesh.getIndices()}):{positions,indices:mesh.getIndices()};
      rasterizeCaveGeometry(geometry.positions,geometry.indices,ground,{...data,mask,occupied:cells,sight:eye,camera:voxels,structural});
     }
    }
   }finally{runtime._setTransform(record,saved);}
   entry={body:encodeCaveCells(cells),sight:encodeCaveCells(eye),camera:encodeCaveCamera(voxels)};entry.bytes=64+key.length*2+8*(entry.body.length+entry.sight.length+entry.camera.length);cache.set(key,entry);runtime.caveEditorMaskBytes=(runtime.caveEditorMaskBytes??0)+entry.bytes;while(cache.size>256||runtime.caveEditorMaskBytes>16*1024*1024){const oldest=cache.keys().next().value;runtime.caveEditorMaskBytes-=cache.get(oldest).bytes;cache.delete(oldest);}
  }fillCaveRuns(occupied,entry.body);fillCaveRuns(sight,entry.sight);fillCaveCamera(camera,entry.camera);
 }
 const field=caveDistanceField(occupied,data);
 runtime.stats.caveCollisionBakes=(runtime.stats.caveCollisionBakes??0)+1;
 const value={clearanceAt:(x,z)=>Math.min(caveClearance(x,z),sampleCaveDistance(field,x,z,data),caveLaboratoryClearance(x,z)),cameraBlocked:(x,y,z,padding)=>caveCameraCellsBlocked(camera,x,y,z,padding,data),sightBlocked:(x,z,halfExtent)=>caveSightBlocked(sight,x,z,halfExtent,data)};runtime.caveEditorPrepared={key:preparedKey,value};return value;
}
