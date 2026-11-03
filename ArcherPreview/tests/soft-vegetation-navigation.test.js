import test from 'node:test';
import assert from 'node:assert/strict';
import {VILLAGE_PLACEMENTS,villageObstacles} from '../src/village-layout.js';
import {FOREST_PLACEMENTS,forestObstacles} from '../src/monster-forest-layout.js';
import {PLAINS_PLACEMENTS,plainsObstacles} from '../src/great-plains-layout.js';
import {CAVE_PLACEMENTS,caveObstacles} from '../src/witch-cave-layout.js';
import {VillageNavigation} from '../src/village-navigation.js';

const maps=[['village',VILLAGE_PLACEMENTS,villageObstacles,48],['forest',FOREST_PLACEMENTS,forestObstacles,62],['plains',PLAINS_PLACEMENTS,plainsObstacles,106],['cave',CAVE_PLACEMENTS,caveObstacles,64]];
// Independent asset list: a placement radius still controls visual spacing,
// but must never turn these leaves/grass/fungi into an invisible solid.
const vegetation=new Set(['bush','grass-tuft','forest-05-thorn-bramble','forest-04-poison-fungi']);
for(const [name,placements,build,limit]of maps){
 test(`${name}: soft vegetation has no movement collider; real solids still block`,t=>{
  const obstacles=build(),nav=new VillageNavigation(obstacles),soft=placements.filter(p=>vegetation.has(p.asset));
  for(const p of soft)assert.ok(!obstacles.some(o=>o.id===p.id||o.id.startsWith(p.id+'-')),p.id+' must be passable');
  let crossed=0;
  for(const p of soft){
   const a={x:p.x-.55,z:p.z},b={x:p.x+.55,z:p.z};
   // A bush under a tree does not make the trunk or the map boundary passable.
   if(Math.hypot(p.x,p.z)>limit-1||!nav.segmentClear(a,b,.29))continue;
   const moved=nav.move(a,b,.29,limit);assert.ok(Math.hypot(moved.x-b.x,moved.z-b.z)<.004,p.id+' walking interrupted');
   assert.equal(nav.obstacleContact(a,{x:1.1,z:0},.23),null,p.id+' dodge interrupted');
   assert.ok(nav.segmentClear(a,b,.27,true),p.id+' combat route obstructed');crossed++;
  }
  if(soft.length)assert.ok(crossed>0,'at least one real plant must be traversed');
  const solids=obstacles.filter(o=>o.radius>.3&&Math.hypot(o.x,o.z)<limit-2);
  assert.ok(solids.length>0);
  for(const o of solids){assert.equal(nav.free(o,.29,limit),false,o.id+' solid lost');}
  for(const p of placements.filter(p=>p.kind==='tree'&&p.colliderRadius&&Math.hypot(p.x,p.z)<45&&!p.decorative))assert.ok(obstacles.some(o=>o.id===p.id),p.id+' trunk lost');
  t.diagnostic(JSON.stringify({map:name,vegetation:soft.length,crossed,retainedSolidObstacles:obstacles.length}));
 });
}
test('explicit collision radii and footprints cannot make decorative grass or shrubs solid',()=>{
 const p={id:'soft',asset:'bush',kind:'shrub',x:0,z:0,yaw:0,scale:1,colliderRadius:2,colliderFootprint:[4,4]};
 assert.deepEqual(villageObstacles([p]),[]);
 const rock={...p,id:'rock',asset:'rock-01-mossy-boulder',kind:'rock'};
 assert.equal(villageObstacles([rock]).length,1);
 const bed={...p,id:'bed',asset:'garden-bed',kind:'prop'};
 assert.equal(villageObstacles([bed]).length,1,'raised wooden garden beds remain solid');
});
