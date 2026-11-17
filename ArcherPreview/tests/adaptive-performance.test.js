import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptivePerformance,ADAPTIVE_LEVELS} from '../src/adaptive-performance.js';

const run=(guard,ms,seconds,options)=>{let changed=null;for(let t=0;t<seconds*1000;t+=ms){const r=guard.sample(ms,options);if(r)changed=r;}return changed;};

test('slow frames step the quality down one level per window, never past the last',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock});
 assert.equal(run(guard,16.7,6),null,'a steady 60 fps changes nothing');
 assert.equal(run(guard,22,2.1)?.viewCap,ADAPTIVE_LEVELS[1].viewCap);
 run(guard,22,30);assert.equal(guard.level,ADAPTIVE_LEVELS.length-1);
 assert.equal(guard.settings.shadows,false);
});

test('a long calm stretch steps back up; a quick relapse pins the floor',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock});
 run(guard,22,4.2);assert.equal(guard.level,2);
 for(let i=0;i<12;i++){run(guard,16.7,2);clock+=2000;}
 assert.equal(guard.level,1,'stepped up after 20 s calm');
 run(guard,22,2.1);assert.equal(guard.level,2,'relapsed');assert.equal(guard.floor,2);
 for(let i=0;i<30;i++){run(guard,16.7,2);clock+=2000;}
 assert.equal(guard.level,2,'the floor holds');
});

test('pauses, loading and disabled guards are ignored',()=>{
 assert.equal(new AdaptivePerformance({level:3}).settings,ADAPTIVE_LEVELS[3]);assert.equal(new AdaptivePerformance({level:99}).level,ADAPTIVE_LEVELS.length-1);
 const off=new AdaptivePerformance({enabled:false});assert.equal(run(off,40,5),null);
 const guard=new AdaptivePerformance();assert.equal(run(guard,40,5,{active:false}),null);assert.equal(run(guard,400,5),null);
 assert.equal(run(guard,34,2.1,{targetMs:1000/30}),null,'a 30 fps cap is met at 34 ms');
});
