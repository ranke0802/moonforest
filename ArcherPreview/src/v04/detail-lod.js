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
export const DETAIL_LOD_KINDS=new Set(['ground-detail','rock','shrub','fence','garden','tree','wall','prop']);
// 0.3 (phone budget): the packed "far" levels are nearly full detail (round
// oak 2,383 / 3,085, bush 2,238 / 2,499), so at the village edge 122 bushes
// and 83 trees up to 125 m away cost ~520K triangles (measured 2026-11-19).
// Derived levels start by screen coverage per size class: a round oak reaches
// `mid` at ~35 m and `far` at ~60 m, a bush at ~25 m / ~45 m.
const tiers=(mid,far)=>Object.freeze([Object.freeze({id:'mid',...mid}),Object.freeze({id:'far',...far})]);
const TREE_TIERS=tiers({coverage:.03,share:.35,floor:400},{coverage:.01,share:.12,floor:150});
const WALL_TIERS=tiers({coverage:.008,share:.3,floor:120},{coverage:.0025,share:.1,floor:40});
const SMALL_TIERS=tiers({coverage:.004,share:.2,floor:60},{coverage:.0012,share:.06,floor:24});
export const DETAIL_LOD_KIND_TIERS=Object.freeze({tree:TREE_TIERS,wall:WALL_TIERS,prop:WALL_TIERS,fence:WALL_TIERS,garden:WALL_TIERS,shrub:SMALL_TIERS,rock:SMALL_TIERS,'ground-detail':SMALL_TIERS});
const SIZE_CLASS=[TREE_TIERS,WALL_TIERS,SMALL_TIERS];
// One asset can be placed as several kinds; it takes the largest class among
// them (later = smaller), so nothing switches earlier than its biggest use.
// The 0.4 world keeps its original (distance-preserving) tiers.
export const detailTiersFor=(kinds,{world=globalThis.document?.documentElement?.dataset?.world}={})=>{
 if(world==='0.4')return DETAIL_LOD.tiers;
 let best=-1;for(const kind of new Set(kinds)){const at=SIZE_CLASS.indexOf(DETAIL_LOD_KIND_TIERS[kind]);if(at<0)return null;if(best<0||at<best)best=at;}
 return best<0?null:SIZE_CLASS[best];
};
// 0.4 world. In 0.3 only with ?detaillod=1: it cuts triangles, and the
// phone bench (2026-11-19) showed the GPU was not the limit, so the coarser
// distance is not worth the look by default.
export const detailLodEnabled=()=>{const data=globalThis.document?.documentElement?.dataset;if(!data)return false;if(data.world==='0.4')return true;
 return !!data.edition&&new URLSearchParams(globalThis.location?.search??'').get('detaillod')==='1';};

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
// One decimated copy of `base` (same material and flags, its own geometry)
// with at most `maxTriangles`, or null when the mesh cannot be reduced.
export function deriveDetailMesh(base,maxTriangles,name,source=read(base)){
 if(!source||base.subMeshes?.length!==1||base.skeleton||base.morphTargetManager)return null;
 const result=decimateToBudget(source,maxTriangles);if(!result)return null;
 const scene=base.getScene(),copy=base.clone(name,null,true);copy.parent=null;
 for(const level of copy.getLODLevels().slice())copy.removeLODLevel(level.mesh);
 const data=new VertexData();data.positions=result.positions;data.indices=result.indices;
 for(const [kind,{data:values}] of Object.entries(result.attributes))data.set(values,kind);
 new Geometry(copy.name,scene,data,false).applyToMesh(copy);
 copy.releaseSubMeshes();new SubMesh(0,0,result.positions.length/3,0,result.indices.length,copy);
 copy.metadata={...base.metadata,villageLodLevel:2,detailTriangles:result.triangles};copy.isPickable=false;
 return copy;
}
// Adds the derived levels to `base` and returns the new meshes (the caller
// owns them: preparation, shader warm-up and disposal).
export function installDetailLods(base,{prepare=()=>{},tiers=DETAIL_LOD.tiers}={}){
 const source=read(base);if(!source)return [];
 const triangles=source.indices.length/3;if(triangles<DETAIL_LOD.minTriangles)return [];
 const made=[];let previous=triangles;
 for(const tier of tiers){
  const copy=deriveDetailMesh(base,Math.max(tier.floor,Math.floor(triangles*tier.share)),base.name+'-detail-'+tier.id,source);
  if(!copy)continue;
  if(copy.metadata.detailTriangles>previous*.7){copy.dispose();continue;}
  copy.metadata.detailLod=tier.id;
  prepare(copy);base.addLODLevel(tier.coverage,copy);made.push(copy);previous=copy.metadata.detailTriangles;
 }
 return made;
}
