import {Vector3} from '@babylonjs/core';
import {TreeViewSurface} from '../../src/tree-view-surface.js';

// Read-only CPU geometry evidence. Surface-edge/triangle intersections establish
// actual deformed surface overlap. A nearest-vertex distance is only an upper
// bound on surface separation; it must not be described as an exact gap.
function regions(meshes,{names=null,meshFilter=()=>true}={}){
 const result=[];
 for(const mesh of meshes){
  if(!mesh.skeleton||!mesh.getTotalVertices()||mesh.metadata?.moonforestOutline||mesh.name.includes('Outline')||!meshFilter(mesh))continue;
  mesh.skeleton.prepare(true);const raw=mesh.getPositionData(true,true),world=mesh.getWorldMatrix(),p=new Float64Array(raw.length),point=new Vector3();
  const joints=mesh.getVerticesData('matricesIndices'),weights=mesh.getVerticesData('matricesWeights'),joints2=mesh.getVerticesData('matricesIndicesExtra'),weights2=mesh.getVerticesData('matricesWeightsExtra'),selected=new Uint8Array(raw.length/3);
  for(let i=0;i<selected.length;i++){
   let influence=names?0:1;
   if(names)for(let k=0;k<4;k++){const n=i*4+k;if(names.has(mesh.skeleton.bones[joints[n]]?.name))influence+=weights[n];if(joints2&&names.has(mesh.skeleton.bones[joints2[n]]?.name))influence+=weights2[n];}
   selected[i]=influence>=.5?1:0;
   Vector3.TransformCoordinatesFromFloatsToRef(raw[i*3],raw[i*3+1],raw[i*3+2],world,point);p[i*3]=point.x;p[i*3+1]=point.y;p[i*3+2]=point.z;
  }
  const original=mesh.getIndices(),indices=[];
  for(let i=0;i<original.length;i+=3)if(selected[original[i]]+selected[original[i+1]]+selected[original[i+2]]>=2)indices.push(original[i],original[i+1],original[i+2]);
  if(indices.length)result.push({name:mesh.name,positions:p,indices,selected});
 }
 return result;
}

export function measureSkinContact(api,encounter,{part='head',torsoOnly=false}={}){
 const wolf=regions(encounter.asset.meshes,{names:new Set([part])});
 const player=regions(api.playerAsset.meshes,{names:torsoOnly?new Set(['mixamorig:Hips','mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2']):null,meshFilter:mesh=>torsoOnly?mesh.name.startsWith('Warrior_Body'):/^Warrior_(Body|Face|Hair|Neck)/.test(mesh.name)});
 const trees=regions=>regions.map(region=>({...region,tree:new TreeViewSurface({getVerticesData:()=>region.positions,getIndices:()=>region.indices})}));
 const a=new Vector3(),b=new Vector3();let intersectingEdges=0,edgesTested=0;
 const scan=(sources,targets)=>{
  for(const region of sources){
   const seen=new Set(),p=region.positions,n=p.length/3;
   for(let i=0;i<region.indices.length;i+=3)for(let edge=0;edge<3;edge++){
    const from=region.indices[i+edge],to=region.indices[i+(edge+1)%3],key=Math.min(from,to)*n+Math.max(from,to);if(seen.has(key))continue;seen.add(key);
    a.set(p[from*3],p[from*3+1],p[from*3+2]);b.set(p[to*3],p[to*3+1],p[to*3+2]);edgesTested++;
    if(targets.some(target=>target.tree.intersects(a,b))){intersectingEdges++;if(intersectingEdges>=16)return;}
   }
  }
 };
 scan(wolf,trees(player));if(!intersectingEdges)scan(player,trees(wolf));
 let nearestVertexDistance=null;
 if(!intersectingEdges){
  let best=Infinity;
  for(const w of wolf)for(let i=0;i<w.selected.length;i++)if(w.selected[i])for(const p of player)for(let j=0;j<p.selected.length;j++)if(p.selected[j]){
   const dx=w.positions[i*3]-p.positions[j*3];if(dx*dx>=best)continue;
   const dy=w.positions[i*3+1]-p.positions[j*3+1];if(dx*dx+dy*dy>=best)continue;
   const dz=w.positions[i*3+2]-p.positions[j*3+2],d=dx*dx+dy*dy+dz*dz;if(d<best)best=d;
  }
  nearestVertexDistance=Math.sqrt(best);
 }
 return {part,torsoOnly,wolfTriangles:wolf.reduce((n,r)=>n+r.indices.length/3,0),playerTriangles:player.reduce((n,r)=>n+r.indices.length/3,0),edgesTested,intersectingEdges,surfacesIntersect:intersectingEdges>0,nearestVertexDistance,scope:'Actual CPU-deformed wolf part against actual CPU-deformed warrior skin. Intersections prove surface overlap; nearest vertex distance is an upper bound, not an exact surface gap.'};
}
