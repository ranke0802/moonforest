import test from 'node:test';
import assert from 'node:assert/strict';
import {crownBoxes,insideCrown,clearRadius,CROWN} from '../src/v03/title-camera.js';

const oak={placement:{asset:'tree-01-round-oak'},min:{x:5,y:0,z:-5},max:{x:15,y:10,z:5}};
const rock={placement:{asset:'rock-01-mossy-boulder'},min:{x:-3,y:0,z:-3},max:{x:3,y:6,z:3}};
const far={placement:{asset:'tree-02-slender-pine'},min:{x:95,y:0,z:95},max:{x:105,y:12,z:105}};

test('only nearby trees give crown boxes, and the trunk height stays open',()=>{
 const boxes=crownBoxes([oak,rock,far],{x:0,z:0});
 assert.equal(boxes.length,1);
 assert.equal(insideCrown(boxes,10,6,0),true);
 assert.equal(insideCrown(boxes,10,1,0),false,'beside the trunk, under the leaves');
 assert.equal(insideCrown(boxes,0,6,0),false);
});
test('the arm shortens only while the circle crosses a crown',()=>{
 const boxes=crownBoxes([oak],{x:0,z:0}),target={x:0,y:1.6,z:0},beta=1.24;
 // alpha 0 looks from +x: the camera at 10.5 m would sit in the oak crown.
 const blocked=clearRadius(boxes,target,0,beta,10.5,1);
 assert.ok(blocked<10.5&&blocked>=1);
 const x=target.x+Math.cos(0)*Math.sin(beta)*blocked,y=target.y+Math.cos(beta)*blocked;
 assert.equal(insideCrown(boxes,x,y,0),false);
 // From the opposite side nothing is in the way.
 assert.equal(clearRadius(boxes,target,Math.PI,beta,10.5,1),10.5);
 assert.equal(clearRadius([],target,0,beta,10.5,1),10.5);
 assert.equal(CROWN.steps[0],1);
});
