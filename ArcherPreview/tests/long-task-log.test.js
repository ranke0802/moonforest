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

test('slow frames name their scripts where the browser reports them',()=>{
 const deliver={};
 class Observer{static supportedEntryTypes=['longtask','long-animation-frame'];constructor(callback){this.callback=callback;}observe(options){deliver[options.type??options.entryTypes[0]]=this.callback;}disconnect(){}}
 const log=createLongTaskLog({frameLimit:2,Observer});
 const script=(duration,invoker,sourceFunctionName,sourceURL,sourceCharPosition)=>({duration,invoker,sourceFunctionName,sourceURL,sourceCharPosition});
 deliver['long-animation-frame']({getEntries:()=>[
  {startTime:10,duration:55,scripts:[script(50,'TimerHandler:setTimeout','a','https://x.test/app/main-abc.js',5)]},
  {startTime:100,duration:824.4,scripts:[script(41,'IMG[src="blob:https://x.test/693a5ccf-09dc"].onload','handler','https://x.test/app/babylon.js',10704),script(3,'tiny','','',0),script(236,'FrameRequestCallback','','https://x.test/app/babylon.js',53898),script(12,'Worker.onmessage','r','https://x.test/app/village.js',98100),script(9,'XMLHttpRequest.onreadystatechange','n','https://x.test/app/babylon.js',13617),script(6,'XMLHttpRequest.onreadystatechange','n','https://x.test/app/babylon.js',13617)]},
  {startTime:2000,duration:70,scripts:[]},{startTime:3000,duration:90,scripts:[script(80,'Response.arrayBuffer.then','','https://x.test/app/loader.js',8196)]},
 ]});
 const frames=log.snapshot().frames;assert.equal(frames.length,2,'bounded; frames under 60 ms are not kept');
 assert.deepEqual(frames[1],{startMs:3000,ms:90,scripts:[{ms:80,by:'Response.arrayBuffer.then',fn:'',file:'loader.js',at:8196}]});
 deliver['long-animation-frame']({getEntries:()=>[{startTime:100,duration:824.4,scripts:[script(41,'IMG[src="blob:https://x.test/693a5ccf-09dc"].onload','handler','https://x.test/app/babylon.js',10704),script(236,'FrameRequestCallback','','https://x.test/app/babylon.js',53898),script(12,'Worker.onmessage','r','https://x.test/app/village.js',98100),script(9,'XMLHttpRequest.onreadystatechange','n','https://x.test/app/babylon.js',13617),script(6,'x','n','',1)]}]});
 const slow=log.snapshot().frames[1];assert.equal(slow.ms,824);
 assert.deepEqual(slow.scripts.map(s=>[s.ms,s.by,s.file,s.at]),[[236,'FrameRequestCallback','babylon.js',53898],[41,'IMG[src="blob"].onload','babylon.js',10704],[12,'Worker.onmessage','village.js',98100],[9,'XMLHttpRequest.onreadystatechange','babylon.js',13617]]);
 log.dispose();assert.deepEqual(log.snapshot().recent,[]);
});
