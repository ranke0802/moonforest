import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3} from '@babylonjs/core';
import {PlayerMeleeAim} from '../../src/player-melee-aim.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const baseline=read('baseline-final.json'),final=read('with-aim-final.json');
assert.equal(final.cases.length,20);assert.equal(final.runtimeSourcesUnchanged,true);assert.equal(baseline.runtimeSourcesUnchanged,true);
for(const [name,hash] of Object.entries(final.runtimeSourceHashes))if(name!=='player-melee-aim.js')assert.equal(hash,baseline.runtimeSourceHashes[name],'unchanged physical collision gate: '+name);
for(const result of final.cases){
 const prior=baseline.cases.find(row=>row.id===result.id&&row.action===result.action&&row.outside===result.outside);
 assert.ok(prior);assert.equal(result.manifestSha256,prior.manifestSha256);assert.equal(result.hurtProfileSha256,prior.hurtProfileSha256,'no anatomy enlargement');
 assert.equal(result.stanceDistance,prior.stanceDistance,'same legitimate pre-input stance');assert.equal(result.accepted,true);assert.ok(result.contactFrames>0);
 assert.equal(result.aim.ancestry.Right,true);assert.equal(result.aim.ancestry.Left,true);assert.equal(result.aim.checkedJointNames.length,6);
 assert.equal(result.aim.armLocalPositionChange,0,'shoulder/elbow/wrist offsets remain native');assert.equal(result.aim.armLocalScaleChange,0);assert.equal(result.aim.restoreRotationMaximumError,0);
 assert.ok(result.aim.maximumPitchRadians<=1.17+1e-8);assert.ok(result.aim.maximumYawRadians<=1.04+1e-8);assert.ok(result.aim.maximumElbowExtensionRadians<=Math.PI/3+1e-8);
 if(result.aim.minimumExtendedElbowBendRadians!=null)assert.ok(result.aim.minimumExtendedElbowBendRadians>=.119,'actual extended elbow keeps its native pre-bend');
 if(result.outside){assert.equal(result.damage,0);assert.ok(result.minimumWeaponHurtGapMeters>2);assert.equal(result.aim.appliedFrames,0);}
 else{assert.ok(result.damage>0,JSON.stringify(result));assert.ok(result.minimumWeaponHurtGapMeters<=0);}
}
// A movement-directed action must never reach backward through auto-aim.
const aim=new PlayerMeleeAim({transformNodes:[],meshes:[]}),player={position:Vector3.Zero(),rotation:{y:0}};
const target={regularWolfId:'fox',active:true,brain:{hp:300},actor:{position:new Vector3(0,0,-1)}};
aim.begin({actionId:1},player,target);assert.equal(aim.target,null);target.actor.position.z=1;aim.begin({actionId:2},player,target);assert.equal(aim.target,target);
console.log(JSON.stringify({pass:true,cases:20,physicalHits:15,outsideMisses:5,unchangedNativeJointOffsetsAndScales:true,restoreExact:true,anatomyProfilesUnchanged:true,forwardHemisphereGuard:true}));
