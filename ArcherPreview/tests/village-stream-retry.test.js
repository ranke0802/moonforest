import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AssetContainer,MeshBuilder,NullEngine,PBRMaterial,ShaderMaterial,Vector3} from '@babylonjs/core';
import {createWorld} from '../src/world.js';
import {loadStreamedVillage,prepareVillageStart} from '../src/village-streamed-environment.js';
import {villageDemand} from '../src/village-demand.js';

const pine='tree-02-slender-pine';
const base=new URL('../public/assets/',import.meta.url);
const clock=()=>{
 let now=0;
 const timers=new Map();let id=0;
 return {
  now:()=>now,
  setTimeout(fn,ms){const key=++id;timers.set(key,{at:now+ms,fn});return key;},
  clearTimeout:key=>timers.delete(key),
  elapseWithoutDeliveringCallbacks(ms){now+=ms;},
  set(time){now=time;for(const [key,timer] of timers)if(timer.at<=now){timers.delete(key);timer.fn();}},
  get pending(){return timers.size;},
 };
};

async function fixture(t,stage,{edition='moonforest-0.3',persistent=false,plains=false}={}){
 const originalLocation=globalThis.location;
 globalThis.location={href:'https://stream-timeout.test/moonforest-0.3.html'};
 t.after(()=>{globalThis.location=originalLocation;});
 t.mock.method(globalThis,'fetch',async url=>new Response(readFileSync(new URL(new URL(url).pathname.split('/').at(-1),base))));
 const engine=new NullEngine({renderWidth:844,renderHeight:390});
 engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const world=createWorld(engine,{village:true,plains,touchDevice:true,gameplayV03:edition==='moonforest-0.3'});
 world.edition=edition;
 t.after(()=>engine.dispose());
 world.placements=world.placements.filter(p=>p.asset===pine).slice(0,1);
 const [placement]=world.placements;
 assert.ok(placement,'the approved pine is present');
 const camera=world.camera;
 camera.setTarget(new Vector3(placement.x,world.terrain.heightAt(placement.x,placement.z)+3,placement.z));
 const timers=clock(),prepared=await prepareVillageStart(world,{timers});
 // Keep the usual far geometry resident before moving closer. Demand for the
 // middle tier is produced by the original camera planner below.
 prepared.plan.splice(0,prepared.plan.length,{id:pine,level:2});
 const desired=()=>villageDemand(world,prepared.records).find(x=>x.id===pine&&x.level!==2)?.level;
 for(let radius=6;radius<=80;radius++){
  camera.radius=radius;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
  if(desired()===1)break;
 }
 assert.equal(desired(),1,'real camera prioritizes the unloaded pine LOD1');
 const models=prepared.assets.get(pine).levels,loads=[],disposals=[];
 let shaderTime=0,armed=false,timeouts=0;
 const stall=()=>{
  if(!armed||(!persistent&&timeouts>0))return false;
  // Delay the model timer callback so the nested shader job notices the
  // expired deadline first, as in the recorded warning.
  timeouts++;shaderTime+=45000;timers.elapseWithoutDeliveringCallbacks(45000);return true;
 };
 const shaderReady=ShaderMaterial.prototype.isReady;
 t.mock.method(globalThis.performance,'now',()=>shaderTime);
 if(stage==='outlines')t.mock.method(ShaderMaterial.prototype,'isReady',function(...args){
  return this.name.startsWith('village-ink')&&stall()?false:shaderReady.apply(this,args);
 });
 const loadContainer=async(url,scene)=>{
  const level=models.find(m=>url.pathname.endsWith('/'+m.model.split('/').at(-1)))?.level;
  loads.push({level,at:timers.now()});
  if(stage==='http'&&level===1)throw new Error('HTTP 503');
  const container=new AssetContainer(scene),mesh=MeshBuilder.CreateBox('pine-'+level,{height:4},scene),material=new PBRMaterial('pine-'+level,scene);
  material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  mesh.material=material;container.meshes.push(mesh);container.materials.push(material);container.removeAllFromScene();
  for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;
  const dispose=container.dispose.bind(container);container.dispose=()=>{disposals.push(level);dispose();};
  if(stage==='materials'&&level===1){const ready=material.isReadyForSubMesh.bind(material);material.isReadyForSubMesh=(...args)=>stall()?false:ready(...args);}
  return container;
 };
 const report=await loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},modelTimers:timers,loadContainer});
 const stream=world.villageStreaming,asset=prepared.assets.get(pine);
 stream.active=true;armed=true;
 t.mock.method(console,'warn',()=>{});
 return {world,stream,asset,loads,disposals,report,timers,get timeouts(){return timeouts;},
  async update(at){timers.set(at);stream.update(at);await stream.pending;},
 };
}

for(const stage of ['materials','outlines']){
 test('streamed pine LOD1 retries '+stage+' after one shader-preparation timeout',async t=>{
  const f=await fixture(t,stage,{plains:stage==='materials'});
  const far=f.asset.tiers.get(2),root=f.world.villageRenderRecords[0].root;
  await f.update(200);
  const first=f.report.modelFailure,installed=f.asset.tiers.get(1)??null;
  assert.equal(f.timeouts,1);assert.equal(first?.name,'TimeoutError');assert.equal(first?.modelWait?.step,stage);
  assert.match(first.message,/화면 준비 시간이 초과/);
  assert.equal(f.asset.tiers.get(2),far);assert.equal(root.isDisposed(),false);
  const failedAt=f.timers.now();
  t.diagnostic(JSON.stringify({stage,failedAt,first,attempts:f.loads,permanent:f.stream.failed.has(pine+':1')}));
  await f.update(failedAt+999);assert.equal(f.report.loadedLods[1],0);
  const camera=f.world.camera,target=camera.target.clone();
  camera.setTarget(target.add(new Vector3(10000,0,0)));
  await f.update(failedAt+1200);assert.equal(f.report.loadedLods[1],0,'outside camera demand');
  camera.setTarget(target);
  await f.update(failedAt+1400);assert.equal(f.report.loadedLods[1],1);
  assert.deepEqual(f.loads.map(x=>x.level),stage==='materials'?[2,1,1]:[2,1]);
  if(installed)assert.equal(f.asset.tiers.get(1),installed,'resume the installed tier on outline failure');
  assert.deepEqual(f.disposals,stage==='materials'?[1]:[]);
  assert.equal(f.report.geometryRetries.recovered,1);
  t.diagnostic(JSON.stringify({map:f.world.mapId,stage,attempts:f.loads,first,disposals:f.disposals,retries:f.report.geometryRetries,loaded:f.report.loadedLods}));
  await f.world.releaseEnvironment();assert.equal(f.timers.pending,0);
 });
}

test('persistent timeout stops after the bounded retry',async t=>{
 const f=await fixture(t,'materials',{persistent:true});
 await f.update(200);await f.update(f.timers.now()+1200);await f.update(f.timers.now()+6000);
 assert.equal(f.timeouts,2);assert.deepEqual(f.loads.map(x=>x.level),[2,1,1]);assert.deepEqual(f.disposals,[1,1]);
 assert.equal(f.report.geometryRetries.exhausted,1);assert.ok(f.stream.failed.has(pine+':1'));
 await f.world.releaseEnvironment();assert.equal(f.timers.pending,0);
});

test('timeout recovery reuses the model if it is already installed under another LOD',async t=>{
 const f=await fixture(t,'materials');
 await f.update(200);
 const far=f.asset.levels.find(level=>level.level===2);
 f.asset.levels=f.asset.levels.map(level=>level.level===1?{...level,model:far.model}:level);
 await f.update(f.timers.now()+1200);
 assert.deepEqual(f.loads.map(x=>x.level),[2,1]);
 assert.equal(f.report.loadedLods[1],0);
 assert.equal(f.report.geometryRetries.recovered,1);
 await f.world.releaseEnvironment();
});

test('an ordinary load error in 0.3 does not enter timeout recovery',async t=>{
 const f=await fixture(t,'http');
 await f.update(200);await f.update(1400);
 assert.deepEqual(f.loads.map(x=>x.level),[2,1]);assert.ok(f.stream.failed.has(pine+':1'));
 assert.equal(f.report.geometryError,'HTTP 503');assert.equal(f.report.geometryRetries.scheduled,0);
 await f.world.releaseEnvironment();
});

test('0.2 streamed timeouts still stop immediately and quitting before the backoff cancels the 0.3 retry',async t=>{
 await t.test('0.2',async tt=>{
  const f=await fixture(tt,'materials',{edition:'moonforest-0.2'});
  await f.update(200);await f.update(f.timers.now()+1200);
  assert.deepEqual(f.loads.map(x=>x.level),[2,1]);assert.ok(f.stream.failed.has(pine+':1'));
  await f.world.releaseEnvironment();
 });
 await t.test('map disposal',async tt=>{
  const f=await fixture(tt,'materials');
  await f.update(200);await f.world.releaseEnvironment();await f.update(f.timers.now()+1200);
  assert.deepEqual(f.loads.map(x=>x.level),[2,1]);assert.equal(f.timers.pending,0);
 });
});
