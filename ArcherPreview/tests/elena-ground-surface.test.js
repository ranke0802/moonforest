import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {ELENA_GROUND_PATTERNS,GroundSpellTelegraph,makeSpellPlan,spellContains,buildGroundSpellGeometry} from '../src/elena-ground-magic.js';
import {ELENA_GROUND_SURFACE} from '../src/elena-ground-surface.js';
import {chargeTouchesPlayer} from '../src/elena-charge.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CaveNavigation} from '../src/witch-cave-navigation.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {MOURNING_SIZE_SCALE,ELENA_HOME} from '../src/elena-spec.js';
import {setWorldCharacter} from '../src/world-limits.js';

const report={scope:'CPU geometry, actual static cave terrain/navigation and Babylon NullEngine only. These timings are not S23/iPhone GPU or thermal measurements.',cases:[],cost:{},constraints:{player8K:true,backgroundMax4K:true,existingLOD:true,noGeneratedAssets:true,noBrowserAutomation:true}};
after(()=>{if(process.env.ELENA_GROUND_REPORT==='1'){const dir=new URL('../reports/ground-warning-u1/',import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(new URL('validation.json',dir),JSON.stringify(report,null,2)+'\n');}});
function fixture(t,terrain,navigation){
  const engine=new NullEngine(),scene=new Scene(engine),world={scene,terrain,navigation},fx=new GroundSpellTelegraph(world);
  t.after(()=>{fx.dispose();scene.dispose();engine.dispose();});return {engine,scene,world,fx};
}
function triangles(part){return Array.from({length:part.indices.length/3},(_,i)=>part.indices.slice(i*3,i*3+3).map(j=>({x:part.positions[j*3],y:part.positions[j*3+1],z:part.positions[j*3+2]})));}
function assertFloorTriangles(plan,terrain,navigation){
  for(const [a,b,c]of triangles(plan.ground.fill)){
    for(const p of [a,b,c])assert.ok(Math.abs(p.y-terrain.heightAt(p.x,p.z)-.045)<1e-6,'a supported vertex follows the exact ground');
    const area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),p={x:(a.x+b.x+c.x)/3,z:(a.z+b.z+c.z)/3};
    if(Math.abs(area)<1e-8)continue;
    const gx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/area,gz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/area;
    assert.ok(Math.hypot(gx,gz)<=ELENA_GROUND_SURFACE.maxSlope+1e-5,'no wall-like fill triangle');
    assert.ok(spellContains(plan,p,{radius:0}),'every visible fill interior is part of the hit domain');
    if(navigation){assert.ok(navigation.free(p,0));assert.ok(navigation.segmentClear(plan.origin,p,0,true));}
  }
}

for(const scale of [1,MOURNING_SIZE_SCALE])test(`all five patterns remove cliff walls AND damage beyond them, scale ${scale}`,t=>{
  const terrain={heightAt:(_x,z)=>z>=4?10:0},nav={free:(p,r)=>p.z+r<4,segmentClear:(_a,b)=>b.z<4},f=fixture(t,terrain,nav);
  for(const pattern of ELENA_GROUND_PATTERNS){
    const options={range:14,scale,bossRadius:.8*scale},plain=makeSpellPlan(pattern,{x:0,y:0,z:0},{x:0,z:6},options),p={x:0,y:10,z:6};
    assert.ok(spellContains(plain,p),'control: old XZ domain damages the raised wall/plateau');
    const raw=buildGroundSpellGeometry(plain,terrain);
    assert.ok(raw.fill.positions.some((n,i)=>i%3===1&&n>9),'control: old renderer raises red vertices onto the cliff');
    const plan=f.fx.aim(pattern,pattern,plain.origin,plain.target,options);
    assert.ok(plan.surface);assert.ok(plan.floorStats.rejectedFillTriangles>0);
    assert.equal(spellContains(plan,p),false,'removed red floor must not leave hidden damage');
    assert.ok(plan.ground.fill.positions.every((n,i)=>i%3!==1||n<.046),'no retained high wall vertices or bounds');
    assert.ok(plan.ground.rim.positions.every((n,i)=>i%3!==1||n<.066),'cut edges also stay on the low floor');
    assertFloorTriangles(plan,terrain,nav);assert.ok(Object.isFrozen(plan.surface.positions));
    // A disc may overlap the warning edge, but clipping cannot expand the
    // original spell at the outer range or into the ring's central refuge.
    for(const probe of [{x:0,z:14.31},{x:0,z:-14.31},{x:14.31,z:0},{x:0,z:0}])if(!spellContains(plain,probe))assert.equal(spellContains(plan,probe),false);
    report.cases.push({case:'cliff-and-hidden-hit',pattern,scale,...plan.floorStats});
  }
});

test('a flat plateau beyond an intervening cliff stays excluded without navigation data',t=>{
  const terrain={heightAt:(_x,z)=>z>=3?8:0},f=fixture(t,terrain),plan=f.fx.aim(1,'corridor',{x:0,y:0,z:0},{x:0,z:8});
  assert.ok(plan.surface);assert.equal(spellContains(plan,{x:0,z:9}),false);
  assert.ok(plan.ground.fill.positions.every((n,i)=>i%3!==1||n<.046));
});

test('a real sloping supported floor is retained rather than flattened or limited to caster Y',t=>{
  const terrain={heightAt:(x,z)=>.18*z+.08*x},f=fixture(t,terrain,{free:()=>true,segmentClear:()=>true});
  for(const pattern of ELENA_GROUND_PATTERNS){
    const plan=f.fx.aim(pattern,pattern,{x:0,y:0,z:0},{x:0,z:7});assert.equal(plan.floorStats.rejectedFillTriangles,0);assert.equal(plan.surface,null);
    assert.ok(plan.ground.fill.positions.some((n,i)=>i%3===1&&n>.6));assertFloorTriangles(plan,terrain);
  }
});

test('thin wall between coarse vertices removes warned floor and hits behind it; blocked charge keeps swept-contact rules',t=>{
  const terrain={heightAt:()=>0},nav={free:(p,r)=>Math.abs(p.z-3)>.12+r,segmentClear:(a,b)=>!(Math.min(a.z,b.z)<3.12&&Math.max(a.z,b.z)>2.88)},f=fixture(t,terrain,nav);
  const plan=f.fx.aim(1,'corridor',{x:0,y:0,z:0},{x:0,z:8},{range:10,halfWidth:1,bossRadius:.1});
  assert.equal(spellContains(plan,{x:0,z:6}),false);assert.equal(chargeTouchesPlayer(plan,{x:0,z:0},{x:0,z:7},{x:0,z:6},{reach:1}),false);
  assert.equal(spellContains(plan,{x:0,z:1.5}),true);assert.equal(chargeTouchesPlayer(plan,{x:0,z:0},{x:0,z:2},{x:0,z:1.5},{reach:1}),true);
  assert.equal(chargeTouchesPlayer(plan,{x:0,z:0},{x:0,z:.1},{x:0,z:2},{reach:.5}),false,'no whole-route damage at launch');
});

test('clipped body edges keep the same 30cm round overlap and never expand the original footprint',t=>{
  const f=fixture(t,{heightAt:(_x,z)=>z>=4?10:0},{free:(p,r)=>p.z+r<4,segmentClear:(_a,b)=>b.z<4});
  const options={range:10,halfWidth:1,bossRadius:.1},plan=f.fx.aim(1,'corridor',{x:0,y:0,z:0},{x:0,z:8},options),p=plan.ground.fill.positions;
  let edge={x:0,z:-Infinity};for(let i=0;i<p.length;i+=3)if(p[i+2]>edge.z)edge={x:p[i],z:p[i+2]};
  assert.ok(spellContains(plan,{x:edge.x,z:edge.z+.299}));assert.equal(spellContains(plan,{x:edge.x,z:edge.z+.301}),false);
  const original=makeSpellPlan('corridor',plan.origin,plan.target,options);
  for(const radius of [0,.3,.35])for(let x=-1.5;x<=1.5;x+=.05)for(let z=.2;z<=4;z+=.17)if(spellContains(plan,{x,z},{radius}))assert.ok(spellContains(original,{x,z},{radius}));
});

test('cancel/death/reset and a changed map floor never reuse a stale clipped damage domain or partial draw range',t=>{
  const cliff={heightAt:(_x,z)=>z>=4?10:0},blocked={free:(p,r)=>p.z+r<4,segmentClear:(_a,b)=>b.z<4},flat={heightAt:()=>0},open={free:()=>true,segmentClear:()=>true},f=fixture(t,cliff,blocked);
  let serial=0;
  for(let trip=0;trip<8;trip++)for(const pattern of ELENA_GROUND_PATTERNS){
    f.world.terrain=cliff;f.world.navigation=blocked;
    const a=f.fx.aim(++serial,pattern,{x:0,y:0,z:0},{x:0,z:6});f.fx.show(1,1,{flash:true});f.fx.fired=true;
    assert.equal(spellContains(a,{x:0,z:6}),false);f.fx.reset();assert.equal(f.fx.plan,null);assert.equal(f.fx.mesh.isEnabled(),false);assert.equal(f.fx.rim.isEnabled(),false);
    f.world.terrain=flat;f.world.navigation=open;
    const b=f.fx.aim(++serial,pattern,{x:0,y:0,z:0},{x:0,z:6});assert.notEqual(a,b);assert.ok(spellContains(b,{x:0,z:6}));assert.equal(f.fx.fired,false);
    assert.equal(f.fx.mesh.subMeshes[0].indexCount,b.ground.fill.indices.length);assert.equal(f.fx.rim.subMeshes[0].indexCount,b.ground.rim.indices.length);
    f.fx.reset();assert.ok(f.scene.geometries.length<=14);assert.equal(f.scene.meshes.length,2);
  }
  f.fx.dispose();assert.equal(f.scene.geometries.length,0);
});

test('an entirely unsupported cast remains disabled and harmless through reset, map reuse, and repeated disposal',t=>{
  const f=fixture(t,{heightAt:()=>0},{free:()=>false,segmentClear:()=>false});
  for(let i=0;i<12;i++){
    const plan=f.fx.aim(i,ELENA_GROUND_PATTERNS[i%5],{x:0,y:0,z:0},{x:0,z:6});
    f.fx.show(1,1,{flash:true});assert.equal(f.fx.mesh.isEnabled(),false);assert.equal(f.fx.rim.isEnabled(),false);assert.equal(spellContains(plan,{x:0,z:6}),false);
    f.fx.reset();assert.equal(f.fx.plan,null);assert.equal(f.fx.fired,false);
  }
  assert.ok(f.scene.geometries.length<=14);f.fx.dispose();f.fx.dispose();assert.equal(f.scene.geometries.length,0);
});

test('actual cave masks every retained fill triangle to legal ground/LOS; fixed cast clock does no further sampling',t=>{
  setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));
  const terrain=createWitchCaveTerrain(),navigation=new CaveNavigation(caveObstacles()),f=fixture(t,terrain,navigation),origin={...ELENA_HOME,y:terrain.heightAt(ELENA_HOME.x,ELENA_HOME.z)},durations=[];
  let serial=0,removed=0,maxTriangles=0,maxRimTriangles=0,maxVertices=0,maxPlanBytes=0;
  for(const scale of [1,MOURNING_SIZE_SCALE])for(let direction=0;direction<8;direction++)for(const pattern of ELENA_GROUND_PATTERNS){
    const angle=direction*Math.PI/4,target={x:origin.x+Math.sin(angle)*8,z:origin.z+Math.cos(angle)*8},start=performance.now();
    const plan=f.fx.aim(++serial,pattern,origin,target,{range:14,scale,bossRadius:.8*scale});durations.push(performance.now()-start);
    assertFloorTriangles(plan,terrain,navigation);removed+=plan.floorStats.rejectedFillTriangles;
    const before=JSON.stringify(plan.floorStats),locked=f.fx.aim(serial,'ring',{x:-20,y:0,z:10},{x:0,z:0});assert.equal(locked,plan);
    for(let i=0;i<60;i++)f.fx.show(i/30,1.5);assert.equal(JSON.stringify(plan.floorStats),before);
    assert.equal(f.scene.meshes.length,2);assert.ok(f.scene.geometries.length<=14);
    maxTriangles=Math.max(maxTriangles,plan.ground.fill.indices.length/3);
    maxRimTriangles=Math.max(maxRimTriangles,plan.ground.rim.indices.length/3);maxVertices=Math.max(maxVertices,(plan.ground.fill.positions.length+plan.ground.rim.positions.length)/3);
    maxPlanBytes=Math.max(maxPlanBytes,JSON.stringify(plan).length);
    for(let x=origin.x-14.5;x<=origin.x+14.5;x+=1.5)for(let z=origin.z-14.5;z<=origin.z+14.5;z+=1.5){
      if(spellContains(plan,{x,z})){const plain=makeSpellPlan(pattern,origin,target,{range:14,scale,bossRadius:.8*scale});assert.ok(spellContains(plain,{x,z}),'clipping never adds damage outside original footprint');}
    }
  }
  assert.ok(removed>0,'this audit must exercise actual cave boundaries');
  f.fx.reset();assert.equal(f.fx.plan,null);assert.equal(f.fx.mesh.isEnabled(),false);assert.equal(f.fx.rim.isEnabled(),false);
  const sorted=durations.toSorted((a,b)=>a-b);report.cost={casts:durations.length,medianAimMs:sorted[Math.floor(sorted.length*.5)],p95AimMs:sorted[Math.floor(sorted.length*.95)],maxAimMs:sorted.at(-1),maxFillTriangles:maxTriangles,maxRimTriangles,maxFillAndRimVertices:maxVertices,maxPlanJsonBytes:maxPlanBytes,retainedGeometryCount:f.scene.geometries.length,maxRetainedGeometryCount:14,perFrameFloorSampling:0,measurement:'Single Node process, no GPU; includes cast geometry creation/cache lookup/freezing and cold navigation field initialization. Device performance must be checked separately.'};
  t.diagnostic(JSON.stringify(report.cost));
});
