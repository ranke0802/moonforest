import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptivePerformance,ADAPTIVE_LEVELS,ADAPTIVE_NORMAL_LAST,resumeAdaptiveLevel} from '../src/adaptive-performance.js';

const run=(guard,ms,seconds,options)=>{let changed=null;for(let t=0;t<seconds*1000;t+=ms){const r=guard.sample(ms,options);if(r)changed=r;}return changed;};

test('slow frames step the quality down one level per window, never past the last normal level',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock});
 assert.equal(run(guard,16.7,6),null,'a steady 60 fps changes nothing');
 assert.equal(run(guard,22,2.1)?.actorShadowRange,ADAPTIVE_LEVELS[1].actorShadowRange);
 run(guard,22,30);assert.equal(guard.level,ADAPTIVE_NORMAL_LAST,'ordinary misses (45 fps) stop at the last normal level');
 assert.equal(guard.settings.shadows,true,'ordinary misses never switch shadows off');assert.equal(guard.settings.rangeScale,1);
 // The plains view is the very last thing given up, and only partly.
 assert.ok(ADAPTIVE_LEVELS.slice(0,3).every(level=>level.viewCap===null));assert.equal(guard.settings.viewCap,1.6);assert.ok(ADAPTIVE_LEVELS.slice(0,ADAPTIVE_NORMAL_LAST+1).every(level=>level.shadows&&!level.emergency));
 assert.ok(ADAPTIVE_LEVELS.every(level=>level.scale===1),'the render resolution is never traded (outlines must stay crisp)');
});

test('a long calm stretch steps back up; a quick relapse pins the floor',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock});
 run(guard,22,4.2);assert.equal(guard.level,2);guard.floor=0;
 for(let i=0;i<12;i++){run(guard,16.7,2);clock+=2000;}
 assert.equal(guard.level,1,'stepped up after 20 s calm');
 run(guard,22,2.1);assert.equal(guard.level,2,'relapsed');assert.equal(guard.floor,2);
 for(let i=0;i<30;i++){run(guard,16.7,2);clock+=2000;}
 assert.equal(guard.level,2,'the floor holds');
});

test('pauses, loading and disabled guards are ignored',()=>{
 assert.equal(new AdaptivePerformance({level:2}).settings,ADAPTIVE_LEVELS[2]);assert.equal(new AdaptivePerformance({level:99}).level,ADAPTIVE_LEVELS.length-1);
 const off=new AdaptivePerformance({enabled:false});assert.equal(run(off,40,5),null);
 const guard=new AdaptivePerformance();assert.equal(run(guard,40,5,{active:false}),null);assert.equal(run(guard,400,5),null);
 assert.equal(run(guard,34,2.1,{targetMs:1000/30}),null,'a 30 fps cap is met at 34 ms');
});

test('a session resumes one level lighter than where the last one ended, never on a slowdown level',()=>{
 assert.equal(resumeAdaptiveLevel(null),0);assert.equal(resumeAdaptiveLevel('x'),0);assert.equal(resumeAdaptiveLevel(0),0);assert.equal(resumeAdaptiveLevel(1),0);
 assert.equal(resumeAdaptiveLevel(4),3,'the S23 record started (and stayed) on 4');
 assert.equal(resumeAdaptiveLevel(ADAPTIVE_LEVELS.length-1),ADAPTIVE_NORMAL_LAST-1);assert.equal(resumeAdaptiveLevel(99),ADAPTIVE_NORMAL_LAST-1);
});

test('late frames that the next frame makes up for are jitter, not misses',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock,level:2});
 // 60 fps with a 21+12 ms pair every ten frames: 10 % of frames over 20 ms.
 const pattern=[16.7,16.7,16.7,16.7,16.7,16.7,16.7,16.7,21,12.4];
 for(let i=0;i<1300;i++){clock+=pattern[i%10];guard.sample(pattern[i%10]);}
 assert.equal(guard.level,1,'stepped up after 20 s');assert.ok(guard.inspect().windows.forgiven>100);
 // A real miss (33 ms, the next frame on time) still counts.
 const misses=new AdaptivePerformance({now:()=>clock,level:2});const real=[16.7,16.7,16.7,16.7,16.7,16.7,16.7,16.7,16.7,28];
 for(let i=0;i<1300;i++){clock+=real[i%10];misses.sample(real[i%10]);}
 assert.equal(misses.level,2,'a 28 ms frame in ten (56 fps) still holds the level');
});

test('a sustained slowdown reaches the extra levels; ordinary misses do not; recovery climbs back',()=>{
 let clock=0;const guard=new AdaptivePerformance({now:()=>clock,level:ADAPTIVE_NORMAL_LAST});
 for(let i=0;i<30;i++){run(guard,22,2);clock+=2000;}
 assert.equal(guard.level,ADAPTIVE_NORMAL_LAST,'45 fps stays on the last normal level');
 for(let i=0;i<4;i++){run(guard,30,2);clock+=2000;}
 assert.equal(guard.level,ADAPTIVE_NORMAL_LAST,'8 s at 33 fps is not yet sustained');
 run(guard,30,2.2);clock+=2200;assert.equal(guard.level,ADAPTIVE_NORMAL_LAST+1);
 assert.equal(guard.settings.forceActorShadowRange,true);assert.equal(guard.settings.viewCap,1.4);assert.equal(guard.settings.shadows,true);
 for(let i=0;i<6;i++){run(guard,30,2);clock+=2000;}
 assert.equal(guard.level,ADAPTIVE_NORMAL_LAST+2);assert.equal(guard.settings.shadows,false,'the last level turns shadows off');
 for(let i=0;i<12;i++){run(guard,18,2);clock+=2000;}
 assert.equal(guard.level,ADAPTIVE_NORMAL_LAST+1,'55 fps for 20 s leaves the last level');
 const history=guard.inspect().history;assert.ok(history.length>=3&&history.length<=20);
 assert.deepEqual(Object.keys(history[0]).sort(),['atMs','averageMs','floor','forgiven','from','reason','slowShare','targetMs','to']);
 assert.equal(history.at(-1).reason,'recovered');assert.equal(history.find(h=>h.to===ADAPTIVE_NORMAL_LAST+1).reason,'severe');
 for(let i=0;i<40;i++){run(guard,30,2);clock+=2000;run(guard,16.7,22);clock+=22000;}
 assert.equal(guard.inspect().history.length,20,'the history keeps the last 20 changes');
});
