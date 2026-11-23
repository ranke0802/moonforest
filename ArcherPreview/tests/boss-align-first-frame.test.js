import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode} from '@babylonjs/core';
import {BossEncounter} from '../src/boss-encounter.js';

// 2026-11-23: a goblin summoned into the wagon lesson was held by the story before its first
// update, so alignPose ran with no dt, its ground height became NaN and the goblin vanished.
test('aligning before the first update keeps a finite ground height',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const actor=new TransformNode('world',scene),carrier=new TransformNode('carrier',scene),hip=new TransformNode('mixamorig:Hips',scene);
 carrier.parent=actor;hip.parent=carrier;hip.position.set(.1,.9,.2);
 const encounter={actor,carrier,nodes:{'mixamorig:Hips':hip},groundHeight:.075,dt:undefined,
  brain:{state:'Walking',mode:'idle',time:.05},config:{catalog:[{name:'Walking',fps:30,duration:1,groundTrack:[.06,.05,.04]}]}};
 BossEncounter.prototype.alignPose.call(encounter);
 assert.ok(Number.isFinite(encounter.groundHeight));assert.equal(encounter.groundHeight,.075,'no time passed: it stays where it was');
 assert.ok(Number.isFinite(carrier.position.y));
 encounter.dt=1/60;BossEncounter.prototype.alignPose.call(encounter);
 assert.ok(encounter.groundHeight<.075&&encounter.groundHeight>.04,'then it settles toward the track');
 engine.dispose();
});
