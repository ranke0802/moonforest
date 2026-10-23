import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaNavigation } from '../src/navigation.js';
import { FOREST_OBSTACLES, TRAINING_OBSTACLES, GRASS_BEDS } from '../src/forest-layout.js';
const trunk={id:'tree',x:0,z:0,radius:1,height:6};
test('swept character and boss collision prevents tunneling even for long dodge/throw steps',()=>{
 const nav=new ArenaNavigation([trunk]);
 for(const r of [.32,.7])for(const length of [4,10,20]){
  const p=nav.move({x:-3,z:0},{x:length,z:0},r,11);
  assert.ok(p.x<-1-r);assert.ok(nav.free(p,r));
 }
 const p=nav.move({x:-3,z:.5},{x:3,z:2},.32);
 assert.ok(nav.free(p,.32));assert.ok(p.z>.5,'Oblique contact slides along obstacle');
 const boundary=nav.move({x:10,z:0},{x:40,z:0},.32);assert.ok(Math.hypot(boundary.x,boundary.z)<=11);
});
test('boss route detours around a tree without crossing its expanded collision hull',()=>{
 const nav=new ArenaNavigation([trunk]),goal={x:4,z:0},cache={};let p={x:-4,z:0},largestZ=0;
 for(let i=0;i<700&&Math.hypot(p.x-goal.x,p.z-goal.z)>.15;i++){
  const q=nav.steer(p,goal,.7,cache,1/60),d=Math.hypot(q.x-p.x,q.z-p.z),s=Math.min(d,3/60);
  const next={x:p.x+(q.x-p.x)/d*s,z:p.z+(q.z-p.z)/d*s};
  const previous=p;p=nav.move(p,next,.7);assert.ok(nav.segmentClear(previous,p,.7));largestZ=Math.max(largestZ,Math.abs(p.z));
 }
 assert.ok(Math.hypot(p.x-goal.x,p.z-goal.z)<.15);assert.ok(largestZ>1.7);assert.ok(nav.pathsBuilt<30);
});
test('training layout has one target and open routes for bears between major arena positions',()=>{
 assert.equal(TRAINING_OBSTACLES.length,1);
 const nav=new ArenaNavigation([...FOREST_OBSTACLES,...TRAINING_OBSTACLES]);
 const points=[{x:0,z:0},{x:0,z:-7},{x:6,z:0},{x:-6,z:4},{x:3,z:8},{x:-8,z:-5}].map(p=>nav.findFree(p,.7,10.5));
 for(const a of points)for(const b of points){
  const route=nav.path(a,b,.7);assert.ok(route.length,'Reachable from '+JSON.stringify(a)+' to '+JSON.stringify(b));
  let previous=a;for(const p of route){assert.ok(nav.segmentClear(previous,p,.7));previous=p;}
 }
 const occupied=[{x:0,z:0,radius:.8}];
 for(let i=0;i<5;i++){const p=nav.findFree({x:-5.3,z:1},.7,6.5,occupied);assert.ok(nav.free(p,.7,6.5));assert.ok(occupied.every(o=>Math.hypot(p.x-o.x,p.z-o.z)>=.7+o.radius+.12));occupied.push({...p,radius:.7});}
});
test('trees interrupt combat sight lines while low obstacles do not',()=>{
 const a={x:-3,z:0},b={x:3,z:0};assert.equal(new ArenaNavigation([trunk]).segmentClear(a,b,0,true),false);
 const low={...trunk,id:'low-rock',height:.4};assert.equal(new ArenaNavigation([low]).segmentClear(a,b,0,true),true);
 assert.equal(new ArenaNavigation([low]).segmentClear(a,b,.7),false);
});

test('warrior, goblin and bear can cross the rendered grass beds; trunks stay solid',()=>{
 assert.ok(FOREST_OBSTACLES.every(o=>o.id.startsWith('tree-')));
 const nav=new ArenaNavigation([...FOREST_OBSTACLES,...TRAINING_OBSTACLES]),bed=GRASS_BEDS[0];
 for(const radius of [.32,.34,.7]){
  const from={x:bed.x-1.5,z:bed.z},to={x:bed.x+1.5,z:bed.z};
  assert.ok(nav.segmentClear(from,to,radius));
  const actual=nav.move(from,to,radius);assert.ok(Math.hypot(actual.x-to.x,actual.z-to.z)<1e-6);
 }
});
