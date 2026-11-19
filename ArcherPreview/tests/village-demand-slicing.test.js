import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {VILLAGE_PLACEMENTS,VILLAGE_SPAWN} from '../src/village-layout.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {placementBounds,villageDemand,createVillageDemandIndex,VillageDemandCache,VillageDemandJob,VillageGeometryStreaming,DEMAND_SLICE_UNITS} from '../src/village-demand.js';

// Time-sliced camera demand must end in exactly the plan of the original
// one-burst evaluation, while no single call processes more than its cap.
const base=new URL('../public/assets/',import.meta.url);
const village=JSON.parse(readFileSync(new URL('village.json',base))),plains=JSON.parse(readFileSync(new URL('great-plains.json',base)));
function fixture(t,map){
 const engine=new NullEngine({renderWidth:900,renderHeight:450}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const camera=new ArcRotateCamera('camera',Math.PI*.38,.88,13,new Vector3(VILLAGE_SPAWN.x,1.1,VILLAGE_SPAWN.z),scene);camera.minZ=.05;camera.fov=.65;
 const world={scene,camera,touchDevice:true,terrain:{heightAt:()=>0}};let records;
 if(map==='plains'){
  Object.assign(world,{plains:true,mapId:'great-plains',plainsViewDistance:2.4,terrain:createGreatPlainsTerrain()});camera.maxZ=600;
  records=PLAINS_PLACEMENTS.filter(p=>plains.assets[p.asset]).map(placement=>({placement,bounds:placementBounds(world,placement,plains.assets[placement.asset])}));
 }else records=VILLAGE_PLACEMENTS.map(placement=>({placement,bounds:placementBounds(world,placement,village.assets[placement.asset])}));
 t.after(()=>engine.dispose());return {world,records};
}
function view(world,i,map){
 const c=world.camera,span=map==='plains'?140:40;c.alpha=i*Math.PI/12;c.beta=.7+(i%6)*.1;c.radius=7+(i%9);
 c.setTarget(new Vector3(Math.sin(i*.37)*span,1.1,Math.cos(i*.23)*span));c.getViewMatrix(true);c.getProjectionMatrix(true);
}
function run(job,maxUnits,ms,now){
 const units=[];let done=false;
 for(let n=0;!done&&n<100000;n++){done=job.step(maxUnits,ms,now);units.push(job.units);}
 assert.ok(done,'job finishes');return units;
}

test('sliced demand equals the one-burst plan for direct (village) and indexed (plains) records, within the unit cap',t=>{
 for(const map of ['village','plains']){
  const {world,records}=fixture(t,map),index=records.length>=1000?createVillageDemandIndex(records):null;
  if(map==='plains')assert.ok(index,'plains uses the cell index');
  const flags=new Uint8Array(records.length);let slices=0,nonEmpty=0;
  for(let i=0;i<48;i++){
   view(world,i,map);const oracle=villageDemand(world,records,index);if(oracle.length)nonEmpty++;
   for(const cap of [1,17,DEMAND_SLICE_UNITS]){
    const units=run(new VillageDemandJob(world,records,index,flags),cap,Infinity,null);
    assert.ok(units.every(u=>u>=1&&u<=cap),`${map} view ${i} cap ${cap}: ${Math.max(...units)}`);
    slices+=units.length;
    const job=new VillageDemandJob(world,records,index,flags);run(job,cap,Infinity,null);
    assert.deepEqual(job.result,oracle,`${map} view ${i} cap ${cap}`);
   }
  }
  assert.ok(nonEmpty>=12,map+' views must request scenery');
  t.diagnostic(JSON.stringify({map,records:records.length,indexed:!!index,nonEmptyViews:nonEmpty,slices}));
 }
});

test('a fake clock stops a slice at the next 32-unit checkpoint after the time budget',t=>{
 const {world,records}=fixture(t,'village');let time=0;const now=()=>(time+=1);
 for(let i=0;i<12;i++){
  view(world,i,'village');const job=new VillageDemandJob(world,records,null,null),units=run(job,10000,1,now);
  // 1 ms per clock read: the 1 ms budget is spent at the first checkpoint.
  assert.ok(units.every(u=>u<=32),'time cap '+Math.max(...units));assert.ok(units.length>=Math.floor(records.length/32));
  assert.deepEqual(job.result,villageDemand(world,records));
 }
});

test('the cache commits a sliced plan for the camera it started with and re-evaluates a camera that moved meanwhile',t=>{
 const {world,records}=fixture(t,'plains'),stats={},cache=new VillageDemandCache(world,records,stats),budget={maxUnits:24};
 view(world,3,'plains');const first=villageDemand(world,records,createVillageDemandIndex(records));
 let plan=cache.get(budget),calls=1;while(!plan){plan=cache.get(budget);calls++;}
 assert.ok(calls>1,'plains demand spans several calls at 24 units');assert.deepEqual(plan,first);
 assert.equal(cache.get(budget),plan,'idle camera reuses the plan');assert.ok(stats.demandSliceMaxUnits<=24);
 // Move during a job: the job finishes for its frozen camera, then a new job starts.
 view(world,7,'plains');const second=villageDemand(world,records,cache.index);
 assert.equal(cache.get(budget),null);view(world,11,'plains');const third=villageDemand(world,records,cache.index);
 let result;while(!(result=cache.get(budget)));assert.deepEqual(result,second,'frozen snapshot');
 while(!(result=cache.get(budget)));assert.deepEqual(result,third,'moved camera evaluated next');assert.equal(cache.get(budget),result);
 // Synchronous get() and invalidate() discard a running job.
 view(world,13,'plains');assert.equal(cache.get(budget),null);assert.ok(cache.job);
 assert.deepEqual(cache.get(),villageDemand(world,records,cache.index));assert.equal(cache.job,null);
 view(world,17,'plains');cache.get(budget);cache.invalidate();assert.equal(cache.job,null);
});

test('streaming with sliced demand loads exactly the tiers of the one-burst stream and caps every update',async t=>{
 for(const map of ['village','plains']){
  const {world,records}=fixture(t,map);
  const settle=async budget=>{
   const loaded=new Set(),order=[],stats={};
   const stream=new VillageGeometryStreaming(world,records,async r=>{order.push(r.id+':'+r.level);loaded.add(r.id+':'+r.level);},r=>loaded.has(r.id+':'+r.level),stats);
   stream.demandBudget=budget;stream.active=true;let now=0,frames=0,maxUnits=0;
   for(let v=0;v<6;v++){
    view(world,v*5+1,map);
    for(let i=0;i<1200;i++){now+=16;frames++;stream.update(now);maxUnits=Math.max(maxUnits,stream.demand.job?.units??0);if(stream.pending)await stream.pending;}
   }
   stream.dispose();return {loaded,order,stats,maxUnits};
  };
  const burst=await settle(null),sliced=await settle({maxUnits:32});
  assert.ok(burst.loaded.size>5);assert.deepEqual([...sliced.loaded].sort(),[...burst.loaded].sort(),map+' final resident tiers');
  assert.deepEqual(sliced.order,burst.order,map+' same load order');
  assert.ok(sliced.stats.demandSliceMaxUnits<=32&&sliced.maxUnits<=32,map+' cap');assert.ok(sliced.stats.demandSlices>sliced.stats.demandEvaluations);
  t.diagnostic(JSON.stringify({map,loaded:burst.loaded.size,evaluations:sliced.stats.demandEvaluations,slices:sliced.stats.demandSlices,maxSliceUnits:sliced.stats.demandSliceMaxUnits,maxSlicesPerJob:sliced.stats.demandJobSlicesMax}));
 }
});
