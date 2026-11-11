import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateMapPolygons} from '../src/map-polygon-estimate.js';

test('map estimate counts each placement and its terrain without double-counting overrides',()=>{
 const world={mapId:'village',placements:[{id:'a',asset:'rock'},{id:'b',asset:'rock'},{id:'c',asset:'missing'}],ground:{getTotalIndices:()=>300},placementOverlay:{removedBaseIds:['b'],instances:[{sourceInstanceId:'a',assetId:'tree'},{assetId:'tree'}]}};
 const catalog={entries:[{assetId:'rock',geometry:{triangles:700}},{assetId:'tree',geometry:{triangles:3000}}]},stats=estimateMapPolygons(world,catalog);
 assert.deepEqual({total:stats.estimatedTotal,objects:stats.placements,unknown:stats.unknown},{total:6100,objects:3,unknown:1});
});
