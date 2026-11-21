import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageNavigation,ROUTE_GRID_RADII} from '../src/village-navigation.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {plainsCliffObstacles} from '../src/plains-cliff-collision.js';
import {createAuthoredPlacementNavigation} from '../src/authored-placement-runtime.js';
import {gridEdges} from '../src/navigation.js';

// An authored overlay must arrive with the map's route grids already decided,
// and they must be exactly the grids a full rebuild would produce.
test('an authored overlay derives the same plains route grids as a full rebuild, without rebuilding the map',t=>{
 const limit=105.5,base=new VillageNavigation([...plainsObstacles(),...plainsCliffObstacles()]);
 for(const radius of ROUTE_GRID_RADII)base.grid(radius,limit);
 const removedId=base.obstacles.find(obstacle=>Math.hypot(obstacle.x,obstacle.z)<60&&obstacle.radius>.4).id;
 const added=[
  {id:'test-wagon',shape:'box',x:-52,z:30,halfWidth:2.4,halfDepth:1.1,yaw:.6,radius:Math.hypot(2.4,1.1),height:2.4},
  {id:'test-post',x:14,z:-9,radius:.9,height:2},
  {id:'test-edge',x:limit-1,z:0,radius:1.4,height:2},
 ];
 const started=performance.now(),derived=createAuthoredPlacementNavigation(base,added,1,{removedIds:[removedId]}),deriveMs=performance.now()-started;
 assert.deepEqual([...derived.grids.keys()],[...base.grids.keys()],'every warmed size is carried over');
 const control=createAuthoredPlacementNavigation(base,added,1,{removedIds:[removedId]});control.grids=new Map();
 let changed=0;const rebuildStarted=performance.now();
 for(const radius of ROUTE_GRID_RADII){
  const key=`${radius}:${limit}`,want=control.grid(radius,limit),got=derived.grids.get(key),before=base.grids.get(key);
  assert.equal(got.length,want.length);
  for(let i=0;i<want.length;i++){
   const a=got[i],b=want[i],edges=gridEdges(got,i),wanted=gridEdges(want,i);
   if(a.x!==b.x||a.z!==b.z||a.free!==b.free||edges.length!==wanted.length||edges.some((edge,k)=>edge[0]!==wanted[k][0]||edge[1]!==wanted[k][1]))assert.fail(`radius ${radius} node ${i} (${b.x},${b.z}) differs from a full rebuild`);
   if(a.free!==before[i].free||edges.length!==gridEdges(before,i).length)changed++;
  }
  assert.equal(derived.grid(radius,limit),got,'the navigator serves the derived grid, it does not build another');
 }
 const rebuildMs=performance.now()-rebuildStarted;
 assert.ok(changed>0,'the overlay really changes cells');
 assert.ok(derived.path({x:-60,z:30},{x:-44,z:30},.5,limit).length>0,'routes still resolve around the new solid');
 t.diagnostic(JSON.stringify({deriveMs:Math.round(deriveMs),fullRebuildMs:Math.round(rebuildMs),changedCells:changed}));
 assert.ok(deriveMs<rebuildMs/4,'deriving is far cheaper than rebuilding');
});
