import test from 'node:test';
import assert from 'node:assert/strict';
import {placementShapesOverlap,checkPlacement,capturePlacementActors} from '../src/placement-preview.js';

test('candidate footprint detects rotated boxes, circles, player and map limits',()=>{
 const box={shape:'box',x:0,z:0,halfWidth:2,halfDepth:1,yaw:Math.PI/4,radius:Math.sqrt(5)};
 assert.equal(placementShapesOverlap(box,{x:0,z:0,radius:.2}),true);assert.equal(placementShapesOverlap(box,{x:8,z:0,radius:.2}),false);
 assert.equal(placementShapesOverlap(box,{shape:'box',x:1,z:0,halfWidth:1,halfDepth:1,yaw:.4,radius:Math.sqrt(2)}),true);assert.equal(placementShapesOverlap(box,{shape:'box',x:8,z:0,halfWidth:1,halfDepth:1,yaw:.4,radius:Math.sqrt(2)}),false);
 const record={min:{x:-1,y:0,z:-1},max:{x:1,y:2,z:1},obstacle:{shape:'box',x:0,z:0,halfWidth:1,halfDepth:1,yaw:0,radius:Math.SQRT2}},world={mapId:'great-plains',terrain:{half:144},navigation:{obstacles:[]}};
 assert.equal(checkPlacement(world,record,{position:{x:0,z:0}}).valid,false);assert.equal(checkPlacement(world,record,{position:{x:5,z:0}}).valid,true);world.navigation.obstacles.push({x:1.5,z:0,radius:.6});assert.equal(checkPlacement(world,record,null).valid,false);
 world.navigation.obstacles=[];const actors=capturePlacementActors([{isEnabled:()=>true,getHierarchyBoundingVectors:()=>({min:{x:-.5,z:-.5},max:{x:.5,z:.5}})}]);assert.equal(checkPlacement(world,record,null,actors).valid,false);
});
