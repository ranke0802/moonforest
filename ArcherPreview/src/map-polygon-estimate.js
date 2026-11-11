// Explicit, on-demand estimate. Placement catalog numbers describe the near
// asset tier; streamed/visible render counts are intentionally separate.
export function estimateMapPolygons(world,catalog){
 if(!world?.mapId||!catalog?.entries)throw new Error('현재 맵 정보가 준비되지 않았습니다.');
 const lookup=new Map();for(const item of catalog.entries)if(Number.isFinite(item.geometry?.triangles)&&!lookup.has(item.assetId))lookup.set(item.assetId,item.geometry.triangles);
 const overlay=world.placementOverlay,removed=new Set(overlay?.removedBaseIds??[]),modified=new Set((overlay?.instances??[]).map(item=>item.sourceInstanceId).filter(Boolean));let triangles=0,placements=0,unknown=0;
 const add=id=>{placements++;const n=lookup.get(id);if(Number.isFinite(n))triangles+=n;else unknown++;};
 for(const source of world.placements??[])if(!removed.has(source.id)&&!modified.has(source.id))add(source.asset);
 for(const item of overlay?.instances??[])add(item.assetId);
 const groundIndices=world.ground?.getTotalIndices?.(),groundTriangles=Number.isFinite(groundIndices)?Math.floor(groundIndices/3):null;
 return {map:world.mapId,placementTriangles:triangles,groundTriangles,estimatedTotal:groundTriangles===null?null:triangles+groundTriangles,placements,unknown,scope:'Placement near-tier asset metadata plus current ground mesh; unloaded placements included. Unknown assets, actors, effects and shadows excluded. Not current rendered triangles.'};
}
