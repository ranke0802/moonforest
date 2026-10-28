// Budget actual selected LOD triangles, rather than a fixed count of objects.
// Small nearby props then keep ink even with many large trees in the view.
export const VILLAGE_INK_MIN_COVERAGE=.0015;
export function outlineTriangleCount(mesh,coverage){
  const source=mesh.sourceMesh??mesh;let chosen=source;
  if(source.useLODScreenCoverage){
    for(const level of [...source.getLODLevels()].sort((a,b)=>b.distance-a.distance)){
      if(coverage<level.distance)chosen=level.mesh;
    }
  }
  return chosen?Math.ceil(chosen.getTotalIndices()/3):0;
}
export function selectVillageOutlines(entries,touch,previous=new Set()){
  const budget=touch?160000:260000,limit=touch?96:144;
  const ranked=entries.map(entry=>({entry,triangles:outlineTriangleCount(entry.mesh,entry.coverage),
    rank:Math.sqrt(entry.coverage)*(previous.has(entry)?1.15:1)}))
    .filter(v=>v.entry.coverage>VILLAGE_INK_MIN_COVERAGE&&v.triangles>0)
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
