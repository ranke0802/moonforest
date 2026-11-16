import test from 'node:test';
import assert from 'node:assert/strict';
import {plainsCliffObstacles} from '../src/plains-cliff-collision.js';
import {mapNavigation} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {createAuthoredPlacementNavigation} from '../src/authored-placement-runtime.js';
import {PLAINS_LOOKOUT,PLAINS_RADIUS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {BEAR_V02_SIZE} from '../src/bear-size.js';
import {obstacleClearance} from '../src/village-collision.js';

const hill=PLAINS_LOOKOUT,obstacles=plainsCliffObstacles(),nav=new VillageNavigation(obstacles),ellipse=(radius,angle)=>({x:hill.x+Math.cos(angle)*radius*hill.stretchX,z:hill.z+Math.sin(angle)*radius});
test('static cliff solids cover the full steep band with no rendered geometry and keep the west ramp open',()=>{
 assert.ok(obstacles.length>=32&&obstacles.length<=48);assert.equal(new Set(obstacles.map(o=>o.id)).size,obstacles.length);assert.ok(obstacles.every(o=>o.shape==='box'&&o.terrainBarrier&&o.height>1));
 for(let i=0;i<144;i++){const angle=i*Math.PI/72;for(const radius of [9,10,11,12]){const p=ellipse(radius,angle);if(p.x<hill.x&&Math.abs(p.z-hill.z)<hill.rampHalfWidth+.15)continue;assert.ok(obstacles.some(o=>obstacleClearance(p,o)<=0),'covered band '+radius+'/'+i);}}
 for(const radius of [.4,BEAR_V02_SIZE.radius,1.625])for(const z of [hill.z-.8,hill.z,hill.z+.8]){const bottom={x:hill.rampStartX,z},top={x:hill.x-6,z};assert.equal(nav.segmentClear(bottom,top,radius),true,'west ramp up '+radius);assert.equal(nav.segmentClear(top,bottom,radius),true,'west ramp down '+radius);}
});
test('north and east cliffs stop ascent/descent including a large swept dash before any part of the steep band',()=>{
 for(const angle of [-Math.PI/2,0,Math.PI/3,Math.PI/2])for(const radius of [.4,BEAR_V02_SIZE.radius]){
  const outside=ellipse(18,angle),inside=ellipse(5,angle);assert.equal(nav.segmentClear(outside,inside,radius),false);assert.equal(nav.segmentClear(inside,outside,radius),false);
  const up=nav.move(outside,inside,radius,PLAINS_RADIUS),down=nav.move(inside,outside,radius,PLAINS_RADIUS),r=p=>Math.hypot((p.x-hill.x)/hill.stretchX,p.z-hill.z);
  assert.ok(r(up)>=12,'ascent stops below full band');assert.ok(r(down)<=9,'descent stops above full band');assert.ok(nav.free(up,radius,PLAINS_RADIUS));assert.ok(nav.free(down,radius,PLAINS_RADIUS));
  const across=ellipse(25,angle+Math.PI),dash=nav.move(outside,across,radius,PLAINS_RADIUS);assert.ok(r(dash)>=12,'large displacement cannot tunnel through hill');
 }
});
test('world navigation and placement rebuild preserve cliff barriers, while the approved bear summit stays usable',()=>{
 const worldNav=mapNavigation({plains:true,village:true});assert.ok(worldNav instanceof VillageNavigation);assert.equal(worldNav.obstacles.filter(o=>o.terrainBarrier).length,obstacles.length);
 const edited=createAuthoredPlacementNavigation(worldNav,[],1,{removedIds:['unrelated-scenery'],force:true});assert.equal(edited.obstacles.filter(o=>o.terrainBarrier).length,obstacles.length);assert.equal(edited.segmentClear(ellipse(18,0),ellipse(5,0),.4),false);
 const bear={x:-25,z:-16};assert.equal(worldNav.free(bear,BEAR_V02_SIZE.radius+.25,PLAINS_RADIUS),true);assert.equal(nav.segmentClear(bear,{x:-34,z:-20},BEAR_V02_SIZE.radius),true);
 const terrain=createGreatPlainsTerrain();assert.ok(terrain.heightAt(bear.x,bear.z)>8);assert.equal(worldNav.segmentClear({x:-55,z:-20},{x:-34,z:-20},.4),true);
});
