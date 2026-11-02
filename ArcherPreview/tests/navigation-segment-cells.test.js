import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {visitSegmentCells} from '../src/navigation-segment-cells.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {obstacleClearance,sweepObstacle} from '../src/village-collision.js';
import {villageObstacles} from '../src/village-layout.js';
import {plainsObstacles} from '../src/great-plains-layout.js';
import {forestObstacles} from '../src/monster-forest-layout.js';
import {caveObstacles,CAVE_ENTRY,CAVE_BOSS,CAVE_SEGMENTS} from '../src/witch-cave-layout.js';
import {MAP_PORTALS} from '../src/map-route.js';
import {TRAINING_OBSTACLES} from '../src/forest-layout.js';

const CELL=4,EPS=.002,results=[],summary={segmentQueries:0,orderChecks:0,movementChecks:0,helperChecks:0};
const random=(()=>{let seed=994381;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})();
function rectangle(a,b,radius=0){const keys=[];for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++)keys.push([x,z]);return keys;}
function oldNearby(nav,a,b,radius=0){const near=new Set();for(const [x,z]of rectangle(a,b,radius))for(const obstacle of nav.cells.get(`${x}:${z}`)??[])near.add(obstacle);return near;}
function oldBaseSegment(nav,a,b,radius=0,combat=false){const delta={x:b.x-a.x,z:b.z-a.z},r=radius+EPS;for(const o of oldNearby(nav,a,b,radius)){if(combat&&(o.height<1||o.id.startsWith('dummy-')))continue;if(obstacleClearance(a,o)<r||obstacleClearance(b,o)<r||sweepObstacle(a,delta,o,r))return false;}return true;}
function oldSegment(nav,a,b,radius,combat,cave=false){if(!oldBaseSegment(nav,a,b,radius,combat))return false;if(cave){const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));for(let i=0;i<=count;i++){const t=i/count;if(nav.clearanceAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius)<radius+.08)return false;}}return true;}
function intersectsExpandedCell(a,b,x,z,radius){let begin=0,end=1;for(const axis of ['x','z']){const center=axis==='x'?x:z,low=center*CELL-radius,high=(center+1)*CELL+radius,delta=b[axis]-a[axis];if(!delta){if(a[axis]<low||a[axis]>high)return false;continue;}const u=(low-a[axis])/delta,v=(high-a[axis])/delta;begin=Math.max(begin,Math.min(u,v));end=Math.min(end,Math.max(u,v));if(begin>end)return false;}return true;}
const special=[
 [{x:0,z:0},{x:0,z:0}], [{x:-0,z:-0},{x:16,z:16}], [{x:-16,z:-16},{x:16,z:16}], [{x:-16,z:16},{x:16,z:-16}],
 [{x:-8,z:4},{x:20,z:4}], [{x:4,z:-12},{x:4,z:24}], [{x:-4-1e-10,z:-4+1e-10},{x:20+1e-10,z:20-1e-10}],
 [{x:-80,z:-80},{x:80,z:80}], [{x:-100,z:60},{x:100,z:-60}], [{x:-.000000001,z:0},{x:.000000001,z:96}],
];
const radii=[0,.002,.05,.32,.34,.7,1.5,1.501,2,4,8,16];

test('column traversal conservatively covers the thick segment at negative, corner, axial and large-radius boundaries',()=>{
 const cases=special.flatMap(([a,b])=>radii.map(radius=>({a,b,radius})));
 for(let i=0;i<1200;i++)cases.push({a:{x:random()*240-120,z:random()*240-120},b:{x:random()*240-120,z:random()*240-120},radius:radii[i%radii.length]});
 let oldCells=0,newCells=0;
 for(const {a,b,radius}of cases){
  const actual=[],count=visitSegmentCells(a,b,radius,CELL,(x,z)=>actual.push([x,z])),set=new Set(actual.map(([x,z])=>`${x}:${z}`)),old=rectangle(a,b,radius),oldSet=new Set(old.map(([x,z])=>`${x}:${z}`));
  assert.equal(actual.length,count);assert.equal(actual.length,set.size,'one visit per cell');assert.ok(actual.every(([x,z])=>oldSet.has(`${x}:${z}`)),'no queries outside the original rectangle');
  assert.deepEqual(actual,[...actual].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),'retain original column/row traversal order');
  for(const [x,z]of old)if(intersectsExpandedCell(a,b,x,z,radius))assert.ok(set.has(`${x}:${z}`),JSON.stringify({a,b,radius,missing:[x,z]}));
  oldCells+=old.length;newCells+=count;summary.helperChecks++;
 }
 assert.ok(newCells<oldCells*.65);results.push({case:'conservative-cell-oracle',queries:cases.length,rectangleCells:oldCells,segmentCells:newCells});
});

const mapDefinitions=[
 {map:'village',limit:48,obstacles:()=>[...villageObstacles(),...TRAINING_OBSTACLES]},
 {map:'great-plains',limit:106,obstacles:()=>[...plainsObstacles(),...TRAINING_OBSTACLES.map(o=>({...o,x:-55,z:37}))]},
 {map:'monster-forest',limit:62,obstacles:()=>[...forestObstacles(),...TRAINING_OBSTACLES]},
 {map:'witch-cave',limit:74,cave:true,obstacles:()=>[...caveObstacles(),...TRAINING_OBSTACLES.map(o=>({...o,x:-39,z:39}))]},
];
for(const definition of mapDefinitions)test(`${definition.map} analytic LOS and candidate order match the pre-change rectangle oracle`,()=>{
 const nav=new (definition.cave?CaveNavigation:VillageNavigation)(definition.obstacles()),cases=[];
 assert.equal(nav.segmentCellPruningSafe,true,'all actual map OBBs retain the optimized collector');
 for(const [a,b]of special)for(const radius of radii)for(const reverse of [false,true])cases.push({a:reverse?b:a,b:reverse?a:b,radius,combat:cases.length%2===0});
 for(let i=0;i<1800;i++)cases.push({a:{x:(random()*2-1)*definition.limit,z:(random()*2-1)*definition.limit},b:{x:(random()*2-1)*definition.limit,z:(random()*2-1)*definition.limit},radius:radii[i%radii.length],combat:i%2===0});
 // Exact index/shape tangencies, outward escape and point queries target the
 // narrow-phase tolerance rather than relying only on generic random misses.
 for(const o of nav.obstacles.filter((_,i)=>i%13===0).slice(0,45))for(const radius of [0,.34,.7,2]){
  const x=o.x+o.radius+radius+EPS,a={x,z:o.z-20},b={x,z:o.z+20};cases.push({a,b,radius,combat:false});cases.push({a:{x:o.x,z:o.z},b:{x:o.x+8,z:o.z+8},radius,combat:true});
 }
 let clear=0,blocked=0,retained=0,removed=0;
 for(const {a,b,radius,combat}of cases){
  const expected=oldSegment(nav,a,b,radius,combat,definition.cave),actual=nav.segmentClear(a,b,radius,combat);assert.equal(actual,expected,JSON.stringify({map:definition.map,a,b,radius,combat}));actual?clear++:blocked++;summary.segmentQueries++;
  const original=[...oldNearby(nav,a,b,radius)],candidates=[...nav.segmentObstacles(a,b,radius)],set=new Set(candidates);assert.deepEqual(candidates,original.filter(o=>set.has(o)),'retained candidates keep their original first-appearance order');assert.ok(candidates.every(o=>original.includes(o)));retained+=candidates.length;removed+=original.length-candidates.length;summary.orderChecks++;
 }
 results.push({case:'actual-map-LOS-oracle',map:definition.map,obstacles:nav.obstacles.length,queries:cases.length,clear,blocked,retainedCandidates:retained,removedCandidates:removed,exactResultsAndOrder:true,caveTerrainSamplingUnchanged:!!definition.cave});
});

test('actual cave corridors, portal and boss room preserve clear short segments and exact .4m sampling boundaries',()=>{
 const definition=mapDefinitions.find(d=>d.cave),nav=new CaveNavigation(definition.obstacles()),anchors=[{...CAVE_ENTRY,zone:'entry'}, {...MAP_PORTALS['witch-cave'],zone:'portal'}, {...CAVE_BOSS,zone:'boss'}];
 for(const {a,b}of CAVE_SEGMENTS)for(const t of [.2,.5,.8])anchors.push({x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,zone:'corridor',heading:Math.atan2(b[1]-a[1],b[0]-a[0])});
 for(let i=0;i<8;i++)anchors.push({x:CAVE_BOSS.x+Math.cos(i*Math.PI/4)*6,z:CAVE_BOSS.z+Math.sin(i*Math.PI/4)*6,zone:'boss'});
 const lengths=[0,.4-1e-9,.4,.4+1e-9,.8-1e-9,.8,.8+1e-9,1.2-1e-9,1.2,1.2+1e-9,3.6,4,7.2,10,14.4,20],zones={},clearanceAt=nav.clearanceAt.bind(nav);let sampleCalls=[],queries=0,clear=0,blocked=0,optimizedCollects=0,optimizedClear=0,terrainSamples=0,shortClear=0;
 nav.clearanceAt=(x,z,radius)=>{sampleCalls.push([x,z,radius]);return clearanceAt(x,z,radius);};
 for(const anchor of anchors)for(const radius of [0,.34,.7]){
  if(!nav.free(anchor,radius,74))continue;
  for(const length of lengths)for(const turn of [0,Math.PI/4,Math.PI/2,Math.PI]){
   const heading=(anchor.heading??Math.PI/4)+turn,a={x:anchor.x,z:anchor.z},b={x:a.x+Math.cos(heading)*length,z:a.z+Math.sin(heading)*length};
   if(!nav.free(b,radius,74))continue;
   sampleCalls=[];const expected=oldSegment(nav,a,b,radius,false,true),oldSamples=sampleCalls;sampleCalls=[];const actual=nav.segmentClear(a,b,radius),newSamples=sampleCalls;
   assert.equal(actual,expected,JSON.stringify({zone:anchor.zone,a,b,radius}));assert.deepEqual(newSamples,oldSamples,'the exact original cave terrain sample points and early termination remain unchanged');
   const original=[...oldNearby(nav,a,b,radius)],candidates=[...nav.segmentObstacles(a,b,radius)],set=new Set(candidates);assert.deepEqual(candidates,original.filter(o=>set.has(o)));summary.segmentQueries++;summary.orderChecks++;queries++;terrainSamples+=newSamples.length;
   const zone=zones[anchor.zone]??={queries:0,clear:0,blocked:0};zone.queries++;actual?(clear++,zone.clear++):(blocked++,zone.blocked++);
   if(actual&&length<=10)shortClear++;
   const xs=Math.floor((Math.max(a.x,b.x)+radius)/CELL)-Math.floor((Math.min(a.x,b.x)-radius)/CELL)+1,zs=Math.floor((Math.max(a.z,b.z)+radius)/CELL)-Math.floor((Math.min(a.z,b.z)-radius)/CELL)+1;if(xs*zs>16&&a.x!==b.x&&a.z!==b.z){optimizedCollects++;if(actual)optimizedClear++;}
  }
 }
 assert.ok(shortClear>1000,'clear 0-10m real cave routes supplement blocked random queries');assert.ok(optimizedClear>0,'also verify clear longer segments outside the short-query fallback');for(const zone of ['entry','portal','boss','corridor'])assert.ok(zones[zone].clear>0,`${zone} has verified clear cases`);
 results.push({case:'actual-cave-free-endpoint-short-segments',queries,clear,blocked,zones,clearShortQueries0To10Metres:shortClear,lengthsMetres:lengths,optimizedCollectorQueries:optimizedCollects,optimizedCollectorClear:optimizedClear,terrainSampleCallsCompared:terrainSamples,exactResultsOrderAndSamplePoints:true});
});

test('undersized legacy box index bounds retain the old rectangle and all exact OBB results',()=>{
 let comparisons=0;
 for(const yaw of [0,Math.PI/6,Math.PI/4,Math.PI/2])for(const radius of [0,.3,.7,2,16]){
  const box={id:'undersized',x:0,z:0,shape:'box',halfWidth:20,halfDepth:.2,yaw,radius:0,height:4},nav=new VillageNavigation([box]);assert.equal(nav.segmentCellPruningSafe,false);
  const pairs=[[{x:-12,z:28},{x:28,z:-12}],...special];
  for(const [a,b]of pairs){assert.deepEqual([...nav.segmentObstacles(a,b,radius)],[...oldNearby(nav,a,b,radius)]);assert.equal(nav.segmentClear(a,b,radius),oldSegment(nav,a,b,radius,false));comparisons++;}
  if(yaw===0&&radius===.3)assert.equal(nav.segmentClear(pairs[0][0],pairs[0][1],radius),false,'original underbound OBB blocking counterexample');
 }
 const box={id:'padding-boundary',x:0,z:0,shape:'box',halfWidth:2,halfDepth:.2,yaw:Math.PI/4,height:4},bound=Math.hypot(box.halfWidth,box.halfDepth)+EPS-1.5;
 assert.equal(new VillageNavigation([{...box,radius:bound-1e-9}]).segmentCellPruningSafe,false,'the original narrow-phase EPS is included in the safety certificate');assert.equal(new VillageNavigation([{...box,radius:bound+1e-9}]).segmentCellPruningSafe,true);
 results.push({case:'legacy-undersized-OBB-fallback',comparisons,wholeNavigatorRectangleFallback:true,includesNarrowPhaseEps:true,actualMapsStillOptimized:true});
});

test('long movement contacts, equal-time ties, dash sweeps and subsequent slides remain byte-for-byte identical',()=>{
 const tied=[{id:'first',x:0,z:1,radius:1,height:3},{id:'second',x:0,z:-1,radius:1,height:3},{id:'dummy-test',x:4,z:4,radius:.3,height:.5}];
 for(const definition of [{map:'tie',limit:30,obstacles:()=>tied},...mapDefinitions]){
  const Type=definition.cave?CaveNavigation:VillageNavigation,nav=new Type(definition.obstacles()),baseline=new Type(definition.obstacles());baseline.segmentClear=(a,b,radius=0,combat=false)=>oldSegment(baseline,a,b,radius,combat,definition.cave);
  for(let i=0;i<90;i++){
   const a={x:(random()*2-1)*definition.limit*.7,z:(random()*2-1)*definition.limit*.7},delta={x:random()*80-40,z:random()*80-40},radius=[.32,.34,.7,1.8,3][i%5];
   assert.deepEqual(nav.obstacleContact(a,delta,radius),baseline.obstacleContact(a,delta,radius));
   // Constrain only valid starting positions; free/findFree behavior is also
   // unchanged, and does not need speculative world-boundary replacements.
   if(nav.free(a,radius,definition.limit)){const b={x:a.x+delta.x,z:a.z+delta.z};assert.deepEqual(nav.move(a,b,radius,definition.limit),baseline.move(a,b,radius,definition.limit));summary.movementChecks++;}
  }
  const from={x:-12,z:0},delta={x:24,z:0};assert.deepEqual(nav.obstacleContact(from,delta,.34),baseline.obstacleContact(from,delta,.34));
 }
 results.push({case:'unchanged-contact-and-movement',movementComparisons:summary.movementChecks,tieOrderingPreserved:true,nearbyAndContactImplementationsUnchanged:true});
});

test('actual long diagonal queries request fewer index cells; CPU timing is informational only',()=>{
 for(const definition of mapDefinitions){
  const nav=new (definition.cave?CaveNavigation:VillageNavigation)(definition.obstacles()),get=nav.cells.get.bind(nav.cells);let requests=0;nav.cells.get=key=>{requests++;return get(key);};
  const l=definition.limit,queries=Array.from({length:80},(_,i)=>({a:{x:-l+i*.05,z:i%2?-l:l},b:{x:l-i*.04,z:i%2?l:-l},radius:[0,.34,.7,2][i%4]}));
  let before=0,after=0;for(const q of queries){requests=0;oldNearby(nav,q.a,q.b,q.radius);before+=requests;requests=0;nav.segmentObstacles(q.a,q.b,q.radius);after+=requests;}
  assert.ok(after<before*.35,definition.map+' long diagonals must avoid the broad rectangle');
  const run=fn=>{const start=performance.now();for(let repeat=0;repeat<3;repeat++)for(const q of queries)fn(q);return performance.now()-start;};
  run(q=>nav.segmentClear(q.a,q.b,q.radius));run(q=>oldSegment(nav,q.a,q.b,q.radius,false,definition.cave));
  const baselineCpuMs=run(q=>oldSegment(nav,q.a,q.b,q.radius,false,definition.cave)),optimizedCpuMs=run(q=>nav.segmentClear(q.a,q.b,q.radius));
  results.push({case:'cell-requests-and-informational-CPU',map:definition.map,scenario:'80 map-spanning long diagonals with radii 0/.34/.7/2; not a representative frame or short-route workload',queries:queries.length,baselineCellRequests:before,optimizedCellRequests:after,reduction:1-after/before,timedQueries:queries.length*3,timedScope:'full segmentClear: candidate collection, original-order sorting, analytic narrow phase, and cave terrain sampling when reached',baselineCpuMs,optimizedCpuMs,physicalFpsMeasured:false});
 }
});

test.after(()=>{
 const folder=new URL('../reports/repeated-work-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('navigation-validation.json',folder),JSON.stringify({baseline:'9ca3561',passed:results.length===12,summary,cases:results,unchanged:['Analytic obstacleClearance/sweepObstacle predicates and EPS .002','Original nearby and obstacleContact traversal/order; movement dash/slide contacts','CaveNavigation .4m LOS samples and .2m sweep samples','Player/background textures, geometry, LOD and view-distance settings'],limitations:['Node CPU correctness and work-count evidence only; timings are machine/load dependent and not mobile FPS, GPU or thermal measurements.','The timed workload is 80 map-spanning long diagonals repeated three times. It does not establish typical per-frame cost or an FPS improvement.','The grid index already assumes immutable obstacle placement. No cross-query result cache or new invalidation requirement was added.','Navigators with any OBB extending beyond its padded index radius retain the original rectangle collector. All four actual map layouts satisfy the conservative safety certificate.'],browserAutomation:false},null,2)+'\n');
});
