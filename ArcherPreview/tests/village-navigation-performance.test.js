import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Load the same route limits and authored obstacles as the v3 scene.
globalThis.location={search:'?character=warrior-v3'};
const { VillageNavigation }=await import('../src/village-navigation.js');
const { ArenaNavigation }=await import('../src/navigation.js');
const { villageObstacles }=await import('../src/village-layout.js');
const { TRAINING_OBSTACLES }=await import('../src/forest-layout.js');
const { ENEMY_ARENA_RADIUS }=await import('../src/world-limits.js');
const nav=new VillageNavigation([...villageObstacles(),...TRAINING_OBSTACLES]);
const radii=[.34,.7],point=([x,z])=>({x,z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
for(const radius of radii)nav.grid(radius,ENEMY_ARENA_RADIUS);
const scenarios=[
  ['west home',[-33,-4],[-20,-4]],
  ['south home',[-6,37],[-6,24]],
  ['chapel',[20,-6],[5,-6]],
  ['east-west',[-34,0],[34,0]],
  ['north-south',[0,-36],[0,46]],
  ['diagonal',[-32,-30],[31,30]],
  ['closed north gate',[0,-46],[0,10]],
  ['disconnected outside',[-44,0],[44,0]],
];
const length=route=>route.reduce((total,p,i)=>total+(i?distance(route[i-1],p):0),0);

test('v3 nearby node search finds the same visible nearest nodes as a full grid scan',()=>{
  assert.equal(ENEMY_ARENA_RADIUS,47.5);
  for(const radius of radii){
    const nodes=nav.grid(radius,ENEMY_ARENA_RADIUS);assert.equal(nodes.length,16129);
    for(const input of scenarios.flatMap(([,a,b])=>[a,b])){
      const p=nav.findFree(point(input),radius,ENEMY_ARENA_RADIUS);
      let expected=-1,cost=Infinity;
      for(let i=0;i<nodes.length;i++)if(nodes[i].free){
        const d=distance(p,nodes[i]);
        if(d<cost&&nav.segmentClear(p,nodes[i],radius)){expected=i;cost=d;}
      }
      assert.equal(nav.nearestNode(p,nodes,radius),expected,`${radius}: nearest ${input}`);
    }
  }
});

test('v3 heap paths preserve reachability and path length, and every segment clears real village obstacles',()=>{
  for(const radius of radii)for(const [name,a,b]of scenarios){
    const start=nav.findFree(point(a),radius,ENEMY_ARENA_RADIUS),goal=nav.findFree(point(b),radius,ENEMY_ARENA_RADIUS);
    const original=ArenaNavigation.prototype.path.call(nav,start,goal,radius,ENEMY_ARENA_RADIUS);
    const actual=nav.path(start,goal,radius,ENEMY_ARENA_RADIUS);
    assert.equal(Boolean(actual.length),Boolean(original.length),`${name}/${radius}: reachability`);
    assert.ok(Math.abs(length(actual)-length(original))<1e-8,`${name}/${radius}: route length`);
    if(!actual.length)continue;
    assert.deepEqual(actual.at(-1),goal);
    let previous=start;
    for(const p of actual){
      assert.ok(nav.free(p,radius,ENEMY_ARENA_RADIUS),`${name}/${radius}: occupied waypoint`);
      assert.ok(nav.segmentClear(previous,p,radius),`${name}/${radius}: collision on route`);
      previous=p;
    }
  }
});

test('ten simultaneous v3 repaths avoid thousands of long visibility tests',t=>{
  const original=nav.segmentClear;let checks=0;
  nav.segmentClear=function(...args){checks++;return original.apply(this,args);};
  try{
    for(const radius of radii){
      const goal=nav.findFree({x:-6,z:24},radius,ENEMY_ARENA_RADIUS);
      const starts=Array.from({length:10},(_,i)=>nav.findFree({x:-10.5+i,z:37.5},radius,ENEMY_ARENA_RADIUS));
      const caches=starts.map(()=>({age:.66,route:[],goal:{...goal}}));
      const before=nav.pathsBuilt;checks=0;
      const time=performance.now();
      const waypoints=starts.map((p,i)=>nav.steer(p,goal,radius,caches[i],1/60));
      const elapsed=performance.now()-time;
      assert.equal(nav.pathsBuilt-before,10);
      assert.ok(checks<300,`ten repaths performed ${checks} visibility tests`);
      assert.ok(waypoints.every((p,i)=>p!==starts[i]),'all enemies must receive a route');
      t.diagnostic(`radius ${radius}: ten repaths ${elapsed.toFixed(2)} ms, ${checks} visibility tests`);
    }
  }finally{nav.segmentClear=original;}
});

test('v3 steering and swept movement reach goals behind homes and across the village',()=>{
  for(const radius of radii)for(const [name,a,b]of [scenarios[1],scenarios[3],scenarios[5]]){
    let p=nav.findFree(point(a),radius,ENEMY_ARENA_RADIUS);
    const goal=nav.findFree(point(b),radius,ENEMY_ARENA_RADIUS),cache={},dt=1/30;
    for(let frame=0;frame<1600&&distance(p,goal)>.15;frame++){
      const waypoint=nav.steer(p,goal,radius,cache,dt),d=distance(p,waypoint);
      if(d<1e-10)continue;
      const step=Math.min(d,3.25*dt);
      const next=nav.move(p,{x:p.x+(waypoint.x-p.x)*step/d,z:p.z+(waypoint.z-p.z)*step/d},radius,ENEMY_ARENA_RADIUS);
      assert.ok(nav.free(next,radius,ENEMY_ARENA_RADIUS),`${name}/${radius}: movement collision`);
      p=next;
    }
    assert.ok(distance(p,goal)<=.15,`${name}/${radius}: did not arrive, remaining ${distance(p,goal)}m`);
  }
});
