import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapeSim,CAPE_ROWS,CAPE_COLS,CAPE_TUNING} from '../src/v03/cape-spring.js';

// A flat cape hanging straight down behind the shoulders: rows 0.12 m apart, columns 0.1 m.
const LINK=.12;
function hang(sim,x=0,z=0){
 for(let r=0;r<CAPE_ROWS;r++)for(let c=0;c<CAPE_COLS;c++){const o=(r*CAPE_COLS+c)*3;sim.rest[o]=x+(c-2)*.1;sim.rest[o+1]=1.3-r*LINK;sim.rest[o+2]=z;}
}
const at=(sim,r,c)=>{const o=(r*CAPE_COLS+c)*3;return [sim.pos[o],sim.pos[o+1],sim.pos[o+2]];};
const off=(sim,r,c)=>{const o=(r*CAPE_COLS+c)*3;return Math.hypot(sim.pos[o]-sim.rest[o],sim.pos[o+1]-sim.rest[o+1],sim.pos[o+2]-sim.rest[o+2]);};
const stretch=sim=>{let most=0;for(let r=1;r<CAPE_ROWS;r++)for(let c=0;c<CAPE_COLS;c++){const a=at(sim,r,c),b=at(sim,r-1,c);most=Math.max(most,Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]));}return most;};

test('cape: at rest it stays within a breath of the baked pose and never stretches',()=>{
 const sim=createCapeSim();hang(sim);sim.step(1/60);assert.equal(sim.started,true);
 let most=0;for(let i=0;i<600;i++){hang(sim);sim.step(1/60);most=Math.max(most,off(sim,8,2));assert.ok(stretch(sim)<=LINK*CAPE_TUNING.stretch+1e-5);}
 assert.ok(most>.002&&most<.05,'the idle wind moves the hem a little: '+most.toFixed(4));
 for(let c=0;c<CAPE_COLS;c++)assert.equal(off(sim,0,c),0,'the shoulder row is pinned');
});

test('cape: it lags when the body starts, streams back while running, swings and settles when it stops',()=>{
 const sim=createCapeSim();hang(sim);sim.step(1/60);
 // 4.4 m/s along +z for one second.
 let z=0,lag=0,early=0;
 for(let i=0;i<60;i++){z+=4.4/60;hang(sim,0,z);sim.step(1/60);const behind=sim.rest[(8*CAPE_COLS+2)*3+2]-at(sim,8,2)[2];if(i===5)early=behind;lag=behind;
  assert.ok(off(sim,8,2)<=CAPE_TUNING.leashTop+CAPE_TUNING.leashStep*8+1e-5,'never past its leash');assert.ok(stretch(sim)<=LINK*CAPE_TUNING.stretch+1e-5,'never stretched');}
 assert.ok(early>.03,'the hem is left behind at the start: '+early.toFixed(3));
 assert.ok(lag>.02&&lag<.25,'it streams back while running: '+lag.toFixed(3));
 assert.ok(off(sim,1,2)<off(sim,8,2),'the hem moves more than the shoulders');
 // Stop: it swings past the baked pose, then settles.
 let past=false;for(let i=0;i<180;i++){hang(sim,0,z);sim.step(1/60);if(at(sim,8,2)[2]-z>.004)past=true;}
 assert.ok(past,'it swings past when the body stops');
 assert.ok(off(sim,8,2)<.05,'and settles: '+off(sim,8,2).toFixed(4));
});

test('cape: a teleport starts over, a long frame is split, the body pushes it out',()=>{
 const sim=createCapeSim();hang(sim);sim.step(1/60);
 hang(sim,30,30);sim.step(1/60);assert.ok(off(sim,8,2)<1e-6,'moved 40 m in a frame: on the baked pose again');
 // 15 fps frames stay stable.
 let z=30;for(let i=0;i<60;i++){z+=4.4/15;hang(sim,30,z);sim.step(1/15);assert.ok(Number.isFinite(sim.pos[40*3]));assert.ok(stretch(sim)<=LINK*CAPE_TUNING.stretch+1e-5);}
 assert.ok(off(sim,8,2)<=CAPE_TUNING.leashTop+CAPE_TUNING.leashStep*8+1e-5);
 // A sphere right where the hem's middle hangs.
 const calm=createCapeSim({tuning:{...CAPE_TUNING,gust:0}});hang(calm);calm.step(1/60);
 const o=(8*CAPE_COLS+2)*3,ball=new Float32Array([calm.rest[o],calm.rest[o+1],calm.rest[o+2]+.03,.08]);
 for(let i=0;i<30;i++){hang(calm);calm.step(1/60,ball,1);}
 const p=at(calm,8,2);assert.ok(Math.hypot(p[0]-ball[0],p[1]-ball[1],p[2]-ball[2])>=.08-1e-4,'outside the sphere');
 // dt 0 (a paused game) changes nothing.
 const before=at(calm,8,2);hang(calm);calm.step(0,ball,1);assert.deepEqual(at(calm,8,2),before);
});
