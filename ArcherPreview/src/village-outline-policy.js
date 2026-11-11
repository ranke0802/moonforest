// Budget actual selected LOD triangles, rather than a fixed count of objects.
// Small nearby props then keep ink even with many large trees in the view.
export const VILLAGE_INK_MIN_COVERAGE=.0015;
function triangleCount(mesh,coverage,lodCache,triangleCache){
  const source=mesh.sourceMesh??mesh;let chosen=source;
  if(source.useLODScreenCoverage){
    let levels=lodCache?.get(source);
    if(!levels){levels=[...source.getLODLevels()].sort((a,b)=>b.distance-a.distance);lodCache?.set(source,levels);}
    for(const level of levels){
      if(coverage<level.distance)chosen=level.mesh;
    }
  }
  if(!chosen)return 0;
  if(triangleCache?.has(chosen))return triangleCache.get(chosen);
  const triangles=Math.ceil(chosen.getTotalIndices()/3);triangleCache?.set(chosen,triangles);return triangles;
}
export function outlineTriangleCount(mesh,coverage){return triangleCount(mesh,coverage);}
export function selectVillageOutlines(entries,touch,previous=new Set(),minimumCoverage=VILLAGE_INK_MIN_COVERAGE){
  const budget=touch?160000:260000,limit=touch?96:144;
  // Restrict memoization to this synchronous selection: streamed LOD promotion
  // and index changes must be observed by the very next selection.
  const lodCache=new Map(),triangleCache=new Map();
  const ranked=entries.map(entry=>({entry,triangles:triangleCount(entry.mesh,entry.coverage,lodCache,triangleCache),
    rank:Math.sqrt(entry.coverage)*(previous.has(entry)?1.15:1)}))
    .filter(v=>v.entry.coverage>minimumCoverage&&v.triangles>0)
    .sort((a,b)=>b.rank-a.rank);
  const chosen=new Set();let triangles=0;
  for(const v of ranked){
    if(chosen.size===limit)break;
    if(triangles+v.triangles>budget)continue;
    triangles+=v.triangles;chosen.add(v.entry);
  }
  return {chosen,triangles};
}
export function villageInkWidth(kind){return kind==='tree'?.007:['shrub','garden','ground-detail'].includes(kind)?.004:.012;}
