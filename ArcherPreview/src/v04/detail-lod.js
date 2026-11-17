// Far-distance geometry for small scenery (0.4).
// The packed LODs of small props barely differ (a grass tuft is 1,397 /
// 1,397 / 1,329 triangles), so a tuft that covers twenty pixels still costs
// 1,329 triangles: on the plains hill 41 % of all submitted triangles were
// distant grass. Two extra levels are derived at load from the mesh itself
// (vertex clustering, see cluster-decimate.js) and added below the packed
// ones by screen coverage. Nothing is hidden and no distance is shortened.
import {Geometry,SubMesh,VertexData} from '@babylonjs/core';
import {decimateToBudget} from './cluster-decimate.js';

export const DETAIL_LOD=Object.freeze({
 minTriangles:250,
 // coverage: share of the screen the bounding sphere covers (a 0.6 m tuft
 // reaches `mid` at about 30 m and `far` at about 60 m on a phone).
 tiers:Object.freeze([
  Object.freeze({id:'mid',coverage:.0009,share:.18,floor:60}),
  Object.freeze({id:'far',coverage:.00022,share:.04,floor:24}),
 ]),
});
export const DETAIL_LOD_KINDS=new Set(['ground-detail','rock','shrub','fence','garden']);
export const detailLodEnabled=()=>globalThis.document?.documentElement?.dataset?.world==='0.4';

function read(mesh){
 const positions=mesh.getVerticesData('position'),indices=mesh.getIndices();
 if(!positions||!indices?.length)return null;
 const attributes={};
 for(const kind of mesh.getVerticesDataKinds()){
  if(kind==='position')continue;
  const buffer=mesh.getVertexBuffer(kind);if(!buffer||buffer.getIsInstanced())continue;
  const data=mesh.getVerticesData(kind);if(data)attributes[kind]={data,size:buffer.getSize()};
 }
 return {positions,indices,attributes};
}
// Adds the derived levels to `base` and returns the new meshes (the caller
// owns them: preparation, shader warm-up and disposal).
export function installDetailLods(base,{prepare=()=>{},tiers=DETAIL_LOD.tiers}={}){
 if(base.subMeshes?.length!==1||base.skeleton||base.morphTargetManager)return [];
 const source=read(base);if(!source)return [];
 const triangles=source.indices.length/3;if(triangles<DETAIL_LOD.minTriangles)return [];
 const scene=base.getScene(),made=[];let previous=triangles;
 for(const tier of tiers){
  const result=decimateToBudget(source,Math.max(tier.floor,Math.floor(triangles*tier.share)));
  if(!result||result.triangles>previous*.7)continue;
  const copy=base.clone(base.name+'-detail-'+tier.id,null,true);copy.parent=null;
  for(const level of copy.getLODLevels().slice())copy.removeLODLevel(level.mesh);
  const data=new VertexData();data.positions=result.positions;data.indices=result.indices;
  for(const [kind,{data:values}] of Object.entries(result.attributes))data.set(values,kind);
  new Geometry(copy.name,scene,data,false).applyToMesh(copy);
  copy.releaseSubMeshes();new SubMesh(0,0,result.positions.length/3,0,result.indices.length,copy);
  copy.metadata={...base.metadata,villageLodLevel:2,detailLod:tier.id,detailTriangles:result.triangles};copy.isPickable=false;
  prepare(copy);base.addLODLevel(tier.coverage,copy);made.push(copy);previous=result.triangles;
 }
 return made;
}
