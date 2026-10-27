import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';

globalThis.location={search:'?character=warrior-v3'};
const { VillageNavigation }=await import('../src/village-navigation.js');
const { ArenaNavigation }=await import('../src/navigation.js');
const { obstacleClearance, sweepObstacle }=await import('../src/village-collision.js');
const { constrainDodge }=await import('../src/dodge-collision.js');
const { BossGrab }=await import('../src/boss-grab.js');
const { villageObstacles }=await import('../src/village-layout.js');
const { TRAINING_OBSTACLES }=await import('../src/forest-layout.js');
const box=(width=4,depth=2,yaw=0,x=0,z=0)=>({id:'wall',shape:'box',x,z,yaw,halfWidth:width/2,halfDepth:depth/2,radius:Math.hypot(width,depth)/2,height:3});
const world=(p,o)=>({x:o.x+p.x*Math.cos(o.yaw)+p.z*Math.sin(o.yaw),z:o.z-p.x*Math.sin(o.yaw)+p.z*Math.cos(o.yaw)});
const local=(p,o)=>({x:(p.x-o.x)*Math.cos(o.yaw)-(p.z-o.z)*Math.sin(o.yaw),z:(p.x-o.x)*Math.sin(o.yaw)+(p.z-o.z)*Math.cos(o.yaw)});
const close=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('OBBs use their faces and round player-radius corners, not enclosing circles or enlarged square corners',()=>{
  for(const yaw of [0,.37,Math.PI/2,2.6]){
    const o=box(8,.6,yaw,3,-2),nav=new VillageNavigation([o]);
    assert.ok(nav.free(world({x:0,z:.8},o),.32),'clear strip next to a thin wall must stay open');
    assert.equal(nav.free(world({x:0,z:.5},o),.32),false);
    assert.ok(nav.free(world({x:4.3,z:.6},o),.4),'outside a rounded corner, inside its expanded square');
    assert.equal(nav.free(world({x:4.25,z:.55},o),.4),false);
    assert.ok(nav.segmentClear(world({x:-4,z:.8},o),world({x:4,z:.8},o),.32));
    assert.equal(nav.segmentClear(world({x:-6,z:0},o),world({x:6,z:0},o),.32),false);
  }
});

test('continuous OBB sweeps stop long player, goblin and bear steps without corner tunneling',()=>{
  for(const yaw of [0,.43,1.7])for(const radius of [.32,.34,.7]){
    const o=box(4,2,yaw),nav=new VillageNavigation([o]);
    for(const end of [4,12,30]){
      const start=world({x:-4,z:0},o),result=nav.move(start,world({x:end,z:0},o),radius,47.5),p=local(result,o);
      assert.ok(p.x<=-2-radius-.002);assert.ok(nav.free(result,radius,47.5));close(p.z,0);
    }
    const start=world({x:-4,z:-3},o),end=world({x:4,z:3},o),delta={x:end.x-start.x,z:end.z-start.z};
    const hit=sweepObstacle(start,delta,o,radius);
    assert.ok(hit&&hit.time>0&&hit.time<1);
    const contact={x:start.x+delta.x*hit.time,z:start.z+delta.z*hit.time};
    close(obstacleClearance(contact,o),radius,1e-6);
    close(Math.hypot(hit.nx,hit.nz),1);
    assert.ok(nav.free(nav.move(start,end,radius),radius));
  }
});

test('OBB contacts reject sampled intersections and preserve clear paths under arbitrary rotations',()=>{
  let seed=73421;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<500;i++){
    const o=box(1+random()*5,.2+random()*3,random()*6.28),nav=new VillageNavigation([o]),radius=[.32,.34,.7][i%3];
    const a={x:random()*14-7,z:random()*14-7},b={x:random()*14-7,z:random()*14-7};
    if(!nav.free(a,radius)||!nav.free(b,radius))continue;
    const clear=nav.segmentClear(a,b,radius);
    if(clear)for(let j=0;j<=100;j++){
      const p={x:a.x+(b.x-a.x)*j/100,z:a.z+(b.z-a.z)*j/100};
      assert.ok(obstacleClearance(p,o)>=radius+.002-1e-7,'reported-clear segment crosses the solid');
    }
    const moved=nav.move(a,b,radius);assert.ok(Number.isFinite(moved.x)&&Number.isFinite(moved.z));assert.ok(nav.free(moved,radius));
  }
});

test('v3 circle-only scenes retain v2 analytic collision and movement results',()=>{
  const obstacles=[{id:'a',x:0,z:0,radius:1,height:3},{id:'b',x:3,z:3,radius:.6,height:2}];
  const original=new ArenaNavigation(obstacles),village=new VillageNavigation(obstacles);
  for(const radius of [.32,.7])for(const [a,b]of [
    [{x:-4,z:0},{x:4,z:0}],[{x:-4,z:.5},{x:4,z:2}],[{x:2,z:-4},{x:4,z:5}],
  ]){
    assert.equal(village.segmentClear(a,b,radius),original.segmentClear(a,b,radius));
    const expected=original.move(a,b,radius),actual=village.move(a,b,radius);
    close(actual.x,expected.x,1e-6);close(actual.z,expected.z,1e-6);
  }
});

test('v3 rolls pass beside long thin walls, stop at their faces, and escape existing overlaps',()=>{
  for(const yaw of [0,.7]){
    const o=box(8,.4,yaw),nav=new VillageNavigation([o]);
    const from=world({x:-3,z:.8},o),p=world({x:3,z:.8},o);constrainDodge(p,from,nav,[]);
    const q=local(p,o);close(q.x,3);close(q.z,.8);
    const near=world({x:0,z:-2},o),through=world({x:0,z:3},o);constrainDodge(through,near,nav,[]);
    assert.ok(local(through,o).z<=-.52);assert.ok(nav.free(through,.32));
    const overlapped=world({x:0,z:-.3},o),away=world({x:0,z:-2},o);constrainDodge(away,overlapped,nav,[]);
    close(local(away,o).z,-2);assert.ok(nav.free(away,.32));
  }
});

test('v3 enemy-assisted dodges cannot cross OBB walls or move enemies at any frame rate',()=>{
  const wall=box(10,.3,0,0,2),nav=new VillageNavigation([wall]);
  for(const fps of [1,30,60,120]){
    const enemy={active:true,actor:{position:{x:0,z:1}},radius:.34,brain:{hp:100,mode:'idle'}},p={x:0,z:-1};
    for(let i=0;i<fps;i++){
      const previous={...p};p.z+=5/fps;constrainDodge(p,previous,nav,[enemy]);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));
      assert.ok(obstacleClearance(p,wall)>=.32-1e-7);assert.ok(p.z<2);
      assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<=5/fps+1e-8);
    }
    assert.deepEqual(enemy.actor.position,{x:0,z:1});
  }
});

test('actual village rolls keep navigation clearance so the following walk never snaps away from a wall',()=>{
  const nav=new VillageNavigation([...villageObstacles(),...TRAINING_OBSTACLES]);
  let seed=790343;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<300;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*46;
    const from=nav.findFree({x:Math.cos(angle)*r,z:Math.sin(angle)*r},.32,47.5);
    const direction=random()*Math.PI*2,length=.05+random()*5;
    const p={x:from.x+Math.cos(direction)*length,z:from.z+Math.sin(direction)*length};
    constrainDodge(p,from,nav,[],47.5);
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));assert.ok(nav.free(p,.32,47.5),'roll ended inside navigation clearance');
    const next=nav.move(p,{x:p.x+Math.cos(direction)*.01,z:p.z+Math.sin(direction)*.01},.32,47.5);
    assert.ok(Math.hypot(next.x-p.x,next.z-p.z)<=.010001,'walking must not relocate a completed roll');
    const landing=nav.move(from,{x:from.x+Math.cos(direction)*10,z:from.z+Math.sin(direction)*10},.32,47.5);
    assert.ok(nav.free(landing,.32,47.5),'long landing sweep must remain safe');
  }
});

test('goblin and bear heap paths navigate rotated buildings and L-shaped walls',()=>{
  const nav=new VillageNavigation([box(4,3,.6),box(4,.8,0,6,5),box(.8,4,0,4.4,6.6)]);
  for(const radius of [.34,.7]){
    let p={x:-6,z:0};const goal={x:9,z:7},cache={};
    for(let frame=0;frame<1100&&Math.hypot(p.x-goal.x,p.z-goal.z)>.15;frame++){
      const q=nav.steer(p,goal,radius,cache,1/30),d=Math.hypot(q.x-p.x,q.z-p.z);if(!d)continue;
      const step=Math.min(d,3.25/30);p=nav.move(p,{x:p.x+(q.x-p.x)*step/d,z:p.z+(q.z-p.z)*step/d},radius);
      assert.ok(nav.free(p,radius));
    }
    assert.ok(Math.hypot(p.x-goal.x,p.z-goal.z)<.15,'enemy must arrive around the solid');
  }
});

test('BossGrab landing callback stops a thrown player at an actual OBB face',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
  const player=new TransformNode('player',scene);player.position.x=-2;
  const foot=new TransformNode('foot',scene),head=new TransformNode('head',scene);foot.parent=player;head.parent=player;foot.position.y=.1;head.position.y=1.7;
  const wall=box(.3,6),nav=new VillageNavigation([wall]);
  const grab=new BossGrab(()=>{},()=>{},{heightAt:()=>0,constrainLanding:(to,from)=>nav.constrain(to,from,.32,47.5)});
  assert.ok(grab.start(player,{'mixamorig:RightFoot':foot,'mixamorig:Head':head},1));
  grab.velocity.copyFrom(new Vector3(1,0,0));grab.throw();
  assert.ok(grab.flightEnd.x<-.472);assert.ok(nav.free(grab.flightEnd,.32));
  for(let i=0;i<100;i++)grab.update(.02,{});
  assert.equal(grab.active,false);assert.ok(nav.free(player.position,.32));close(player.position.y,0);
});
