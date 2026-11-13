import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {WolfV02AirReaction,WOLF_V02_AIR_IMPULSE} from '../src/wolf-v02-air-reaction.js';
import {WOLF_V02_AIR_REACTION} from '../src/wolf-v02-spec.js';

test('wolf impact follows the confirmed attack heading, including an overlapped long-body root',()=>{
 for(const [source,yaw] of [[new Vector3(0,0,2.5),Math.PI],[new Vector3(-2,0,0),Math.PI/2],[new Vector3(0,0,-2),0],[new Vector3(0,0,.5),0]]){
  const e={actor:{position:Vector3.Zero(),rotation:{y:.4}},radius:.9,brain:{state:WOLF_V02_AIR_REACTION,time:0},world:{scene:{},mapId:'great-plains'},config:{catalog:[{name:WOLF_V02_AIR_REACTION,endpointModelGlTF:{headMinusPelvis:[0,0,1]}}]}};
  const fall=new WolfV02AirReaction(e),expected=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
  assert.equal(fall.begin(source,source,yaw),true);
  let previous=0;
  for(const time of [.016,.1,.3,.45]){e.brain.time=time;fall.applyMotion();const away=Vector3.Dot(e.actor.position,expected);assert.ok(away>previous,'starts on the first frame and never reverses toward the source');previous=away;assert.ok(Math.abs(e.actor.rotation.y-.4)<.66,'bounded diagonal rotation, no instant heading flip');}
  assert.ok(Math.abs(previous-WOLF_V02_AIR_IMPULSE.distance)<1e-9);
  assert.ok(Math.abs(fall.height)<1e-9);
 }
});
