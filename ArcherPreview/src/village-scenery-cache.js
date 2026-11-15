import {Frustum} from '@babylonjs/core';
import {sceneryDistanceScale} from './scenery-distance-state.js';

// Base placements do not change membership during a map life. Editor overlays
// own separate mutable records/streamers; callers rebuild this index on edits.
export function groupVillageRecords(records){
 const grouped=new Map();
 for(const record of records){const id=record.placement?.asset;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(record);}
 return grouped;
}

const cameras=new WeakMap();
// One immutable-for-this-synchronous-batch view, shared by demand, texture and
// ink selection. Compare exact inputs: no camera tolerance or LOD-policy change.
export function sceneryProjection(camera){
 let view=cameras.get(camera);
 if(!view){view={camera,matrix:new Float64Array(16),revision:0,planes:null,coverage:new WeakMap(),frustumBuilds:0,coverageCalculations:0,coverageCacheHits:0};view.matrix.fill(NaN);cameras.set(camera,view);}
 const matrix=camera.getTransformationMatrix(),m=matrix.m,p=camera.globalPosition;
 let changed=!view.planes||view.mode!==camera.mode||view.minZ!==camera.minZ||view.screenArea!==camera.screenArea||view.x!==p.x||view.y!==p.y||view.z!==p.z;
 for(let i=0;i<16;i++)if(view.matrix[i]!==m[i])changed=true;
 if(changed){view.matrix.set(m);view.mode=camera.mode;view.minZ=camera.minZ;view.screenArea=camera.screenArea;view.x=p.x;view.y=p.y;view.z=p.z;view.revision++;view.planes=Frustum.GetPlanes(matrix);view.frustumBuilds++;}
 return view;
}

export function projectedSceneryCoverage(view,sphere,world){
 const center=sphere.centerWorld??sphere.center,radius=sphere.radiusWorld??sphere.radius;
 let entry=view.coverage.get(sphere);
 if(!entry||entry.revision!==view.revision||entry.x!==center.x||entry.y!==center.y||entry.z!==center.z||entry.radius!==radius){
  const distance=view.mode===1?view.minZ:Math.hypot(center.x-view.x,center.y-view.y,center.z-view.z),projected=radius*view.minZ/Math.max(distance,.001);
  if(!entry){entry={};view.coverage.set(sphere,entry);}
  entry.revision=view.revision;entry.x=center.x;entry.y=center.y;entry.z=center.z;entry.radius=radius;entry.coverage=Math.PI*projected*projected/view.screenArea;view.coverageCalculations++;
 }else view.coverageCacheHits++;
 // Ink intentionally omits world and preserves its original unscaled cutoff;
 // texture/demand retain each world's exact cinematic/plains distance policy.
 const scale=sceneryDistanceScale(world);return scale===1?entry.coverage:entry.coverage*scale*scale;
}
