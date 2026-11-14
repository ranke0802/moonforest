// Explicit, on-demand estimate. Placement catalog numbers describe the near
// asset tier; streamed/visible render counts are intentionally separate.
export function captureMapPolygonInputs(world){
 if(!world?.mapId)throw new Error('현재 맵 정보가 준비되지 않았습니다.');
 const overlay=world.placementOverlay,removed=new Set(overlay?.removedBaseIds??[]),modified=new Set((overlay?.instances??[]).map(item=>item.sourceInstanceId).filter(Boolean)),groups=new Map();
 const add=id=>groups.set(id,(groups.get(id)??0)+1);
 for(const source of world.placements??[])if(!removed.has(source.id)&&!modified.has(source.id))add(source.asset);
 for(const item of overlay?.instances??[])add(item.assetId);
 const indices=world.ground?.getTotalIndices?.();
 return {mapId:world.mapId,assets:[...groups].map(([assetId,placements])=>({assetId,placements})),groundTriangles:Number.isFinite(indices)?Math.floor(indices/3):null};
}
export function estimateMapPolygonInputs(input,catalog){
 if(!input?.mapId||!catalog?.entries)throw new Error('현재 맵 정보가 준비되지 않았습니다.');
 const lookup=new Map();for(const item of catalog.entries)if(Number.isFinite(item.geometry?.triangles)&&!lookup.has(item.assetId))lookup.set(item.assetId,item);
 let triangles=0,placements=0,unknown=0;
 const assets=input.assets.map(({assetId,placements:count})=>{const item=lookup.get(assetId),perAsset=item?.geometry?.triangles;placements+=count;if(Number.isFinite(perAsset))triangles+=perAsset*count;else unknown+=count;return {assetId,name:item?.name??assetId,category:item?.category??'unknown',placements:count,trianglesEach:perAsset??null,triangles:Number.isFinite(perAsset)?perAsset*count:null};}).sort((a,b)=>(b.triangles??-1)-(a.triangles??-1));
 const groundTriangles=input.groundTriangles;
 return {map:input.mapId,placementTriangles:triangles,groundTriangles,estimatedTotal:groundTriangles===null?null:triangles+groundTriangles,placements,unknown,assets,scope:'Placement near-tier asset metadata plus current ground mesh; unloaded placements included. Unknown assets, actors, effects and shadows excluded. Not current rendered triangles.'};
}
export function estimateMapPolygons(world,catalog){
 return estimateMapPolygonInputs(captureMapPolygonInputs(world),catalog);
}
