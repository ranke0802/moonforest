import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameWorkCoordinator} from '../src/frame-work-coordinator.js';
import {createBossPreparation} from '../src/boss-preparation.js';

test('a long stretch between preparation boundaries is recorded under the boundary it followed',async()=>{
 let time=0;const now=()=>time,coordinator=new FrameWorkCoordinator({now});coordinator.begin({active:true,frameId:1,generation:1});
 const frame=()=>Promise.resolve().then(()=>{coordinator.begin({active:true,frameId:coordinator.frameId+1,generation:1});});
 const preparation=createBossPreparation({now,frame,coordinator,scene:{}});
 await preparation.step('clone',()=>{time+=1;});
 time+=9;                                   // the caller's own code after that step
 await preparation.step('paint',()=>{time+=1;});
 await preparation.wait(Promise.resolve(),'asset');time+=7;preparation.checkpoint();
 time+=5;preparation.checkpoint('shader:body');
 await preparation.sleep(0);time+=4;preparation.checkpoint();   // a sleep keeps the boundary's name
 const steps=Object.fromEntries(coordinator.snapshot().overrunsByStep.map(row=>[row.step,row.ms]));
 assert.deepEqual(steps,{'after clone':9,'after asset':11,'shader:body':5});   // 7 after the wait + 4 after the sleep that followed it
});
