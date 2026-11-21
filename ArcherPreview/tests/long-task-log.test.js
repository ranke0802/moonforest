import test from 'node:test';
import assert from 'node:assert/strict';
import {createLongTaskLog} from '../src/long-task-log.js';
import {FrameWorkCoordinator} from '../src/frame-work-coordinator.js';

test('long tasks: the last ones are kept with their start and length, nothing without browser support',()=>{
 let deliver=null,disconnected=false;
 class Observer{static supportedEntryTypes=['longtask'];constructor(callback){deliver=callback;}observe(options){assert.deepEqual(options,{entryTypes:['longtask']});}disconnect(){disconnected=true;}}
 const log=createLongTaskLog({limit:3,Observer});assert.equal(log.supported,true);
 deliver({getEntries:()=>[{startTime:1000.4,duration:61.2},{startTime:2000,duration:130},{startTime:3000,duration:55},{startTime:4000,duration:90}]});
 assert.deepEqual(log.snapshot(),{supported:true,total:4,totalMs:336,recent:[{startMs:2000,ms:130},{startMs:3000,ms:55},{startMs:4000,ms:90}]});
 log.dispose();assert.equal(disconnected,true);
 class None{static supportedEntryTypes=['paint'];}
 assert.deepEqual(createLongTaskLog({Observer:None}).snapshot(),{supported:false,total:0,totalMs:0,recent:[]});
 assert.equal(createLongTaskLog({Observer:undefined}).supported,false);
});

test('preparation steps that run over the budget are kept by name, the largest first',()=>{
 const c=new FrameWorkCoordinator({budgetMs:2});c.begin({active:true,frameId:1});
 c.charge(1,'cheap');c.charge(31.7,'model-clone');c.charge(5,'instance:oak');c.charge(9,'instance:oak');c.charge(3);
 const snap=c.snapshot();assert.equal(snap.atomicOverruns,4);
 assert.deepEqual(snap.overrunsByStep,[{step:'model-clone',count:1,ms:31.7,maxMs:31.7},{step:'instance:oak',count:2,ms:14,maxMs:9},{step:'unlabelled',count:1,ms:3,maxMs:3}]);
 for(let i=0;i<40;i++)c.charge(4,'step-'+i);assert.ok(c.snapshot().overrunsByStep.length<=12);assert.equal(c.worst.size,24,'bounded');
});
