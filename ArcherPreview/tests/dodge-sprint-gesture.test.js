import test from 'node:test';
import assert from 'node:assert/strict';
import {DodgeSprintGesture} from '../src/dodge-sprint-input.js';
function fixture(){let now=0;const actions=[],gesture=new DodgeSprintGesture({now:()=>now,onDodge:()=>actions.push(['dodge']),onSprint:(value,seconds)=>actions.push(['sprint',value,seconds])});return {gesture,actions,step:ms=>{now+=ms;}};}
test('short press rolls once and long press sprints without a roll',()=>{
 for(const ms of [0,100,199]){const f=fixture();f.gesture.begin('button:1',{pointerType:'touch'});f.step(ms);f.gesture.end('button:1');assert.deepEqual(f.actions,[['dodge']]);assert.equal(f.gesture.end('button:1'),false);}
 for(const ms of [200,300,1200]){const f=fixture();f.gesture.begin('button:1',{pointerType:'touch'});f.step(ms);f.gesture.advance(.1);f.gesture.end('button:1');assert.deepEqual(f.actions.map(a=>a.slice(0,2)),[['sprint',true],['sprint',false]]);}
});
test('threshold crossing limits sprint time to the part of the current frame after activation',()=>{
 const f=fixture();f.gesture.begin('key:space');f.step(180);f.gesture.advance(.1);assert.deepEqual(f.actions,[]);f.step(40);f.gesture.advance(.04);assert.ok(Math.abs(f.actions[0][2]-.02)<1e-9);f.gesture.cancel();
});
test('cancel never rolls and a second simultaneous source cannot duplicate a tap or sprint',()=>{
 const f=fixture();f.gesture.begin('button:1',{pointerType:'touch'});f.gesture.begin('key:space');f.step(100);f.gesture.end('button:1');assert.deepEqual(f.actions,[]);f.gesture.end('key:space');assert.deepEqual(f.actions,[['dodge']]);
 f.actions.length=0;f.gesture.begin('button:2',{pointerType:'touch'});f.step(350);f.gesture.advance(.1);f.gesture.cancel('button:2');f.gesture.end('button:2');assert.deepEqual(f.actions.map(a=>a.slice(0,2)),[['sprint',true],['sprint',false]]);
});
test('a cancelled earlier source does not age a later still-pending source',()=>{
 const f=fixture();f.gesture.begin('button:1');f.step(200);f.gesture.begin('button:2');f.gesture.cancel('button:1');f.step(100);f.gesture.advance(.1);assert.deepEqual(f.actions,[]);f.gesture.end('button:2');assert.deepEqual(f.actions,[['dodge']]);
});
test('native menu hold ownership distinguishes touchscreen and mouse',()=>{
 const f=fixture();f.gesture.begin('button:1',{pointerType:'touch'});assert.equal(f.gesture.hasTouchHud(undefined),true);f.gesture.begin('button:2',{pointerType:'mouse'});assert.equal(f.gesture.hasTouchHud(undefined),false);assert.equal(f.gesture.hasTouchHud('touch'),true);f.gesture.cancel();
});
