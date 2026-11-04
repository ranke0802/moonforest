import test from 'node:test';
import assert from 'node:assert/strict';
import {ActorPopulation,ActorPopulationLimitError} from '../src/actor-population.js';
import {createBossPreparation} from '../src/boss-preparation.js';
import {ACTOR_DEFINITIONS,validateActorSpawn} from '../src/actor-definitions.js';

const deferred=()=>{let resolve,reject;return {promise:new Promise((a,b)=>{resolve=a;reject=b;}),get resolve(){return resolve;},get reject(){return reject;}};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const definition=(id,category='monster',extra={})=>({actorDefinitionId:id,category,population:{maxPooled:20,estimatedBytes:100,idleSeconds:10},respawn:{enabled:true,delaySeconds:2},scheduling:{nearDistance:10,farDecisionSeconds:.5},...extra});
function fixture(t,{definitions={bear:definition('bear'),goblin:definition('goblin'),npc:definition('npc','npc')},create,limits={},...options}={}){
 const counts={create:0,warm:0,reset:0,activate:0,hide:0,dispose:0,update:0,decide:0,resources:0,peakResources:0},adapters=[];
 const make=def=>{
  counts.create++;counts.resources++;counts.peakResources=Math.max(counts.peakResources,counts.resources);
  const state={active:false,dead:false,dying:false,corpseGone:false,rewardGranted:false,position:{x:100,z:0}},adapter={definition:def,state,
   async warm(){counts.warm++;},reset(){counts.reset++;Object.assign(state,{dead:false,dying:false,corpseGone:false,rewardGranted:false,target:null,hitFlash:0,audio:false,timers:0});},
   async activate(context){counts.activate++;state.active=true;if(context.position)state.position=context.position;},
   update(){counts.update++;},decide(){counts.decide++;},hide(){counts.hide++;state.active=false;},
   dispose(){if(adapter.disposed)return;adapter.disposed=true;counts.dispose++;counts.resources--;state.active=false;},estimate(){return {estimatedBytes:100,triangles:12345};},snapshot(){return {...state};}
  };adapters.push(adapter);return adapter;
 };
 const manager=new ActorPopulation({definitions,createAdapter:create?((def,context)=>create(def,context,make)):async def=>make(def),preparationFactory:opts=>createBossPreparation({...opts,incremental:false,timeoutMs:1000}),limits:{total:20,estimatedMemoryBytes:10000,...limits},...options});
 t.after(()=>manager.dispose());return {manager,counts,adapters,make};
}

test('warm reuse keeps one prepared resource set and resets independent per-life state',async t=>{
 const f=fixture(t,{create:async(def,owner,make)=>{
  const adapter=make(def),reset=adapter.reset,activate=adapter.activate;
  adapter.reset=context=>{assert.equal(owner.isCurrent(),true,'adapter lifetime survives the original preparation task');reset(context);};
  adapter.activate=async context=>{assert.equal(owner.isCurrent(),true);await activate(context);};return adapter;
 }}),record=await f.manager.spawn('bear',{position:{x:2,z:3}});
 for(let i=0;i<50;i++){
  Object.assign(record.adapter.state,{target:{},hitFlash:1,audio:true,timers:3,dead:true,rewardGranted:true});
  f.manager.clear({dispose:false});
  assert.equal(record.state,'dormant');assert.equal(record.adapter.state.active,false);
  assert.equal(await f.manager.spawn('bear',{}),record);
  assert.deepEqual(record.flags,{death:false,reward:false,respawn:false});
  assert.equal(record.adapter.state.hitFlash,0);assert.equal(record.adapter.state.target,null);assert.equal(record.adapter.state.audio,false);
 }
 assert.equal(f.counts.create,1);assert.equal(f.counts.warm,1);assert.equal(f.counts.activate,51);assert.equal(f.counts.resources,1);
 assert.equal(f.manager.diagnostics().estimatedBytes,100);
});

test('caps account for overlapping requests, categories, exact memory and hard maximum twenty',async t=>{
 const gate=deferred(),entered=deferred();let first=true;
 const f=fixture(t,{limits:{total:2,perDefinition:1,perType:{monster:2,npc:1}},create:async(def,context,make)=>{if(first){first=false;entered.resolve();await gate.promise;}return make(def);}});
 const one=f.manager.spawn('bear');await entered.promise;
 await assert.rejects(f.manager.spawn('bear'),error=>error instanceof ActorPopulationLimitError&&error.reason==='definition');
 const two=f.manager.spawn('goblin');
 await assert.rejects(f.manager.spawn('npc'),error=>error.reason==='total');
 assert.equal(f.manager.diagnostics().entries,2);assert.equal(f.manager.diagnostics().currentPreparations,1);
 gate.resolve();await Promise.all([one,two]);assert.equal(f.counts.peakResources,2);
 const mem=fixture(t,{limits:{estimatedMemoryBytes:150}});await mem.manager.spawn('bear');
 await assert.rejects(mem.manager.spawn('goblin'),error=>error.reason==='estimated-memory');
 const type=fixture(t,{limits:{perType:{monster:1}}});await type.manager.spawn('bear');
 await assert.rejects(type.manager.spawn('goblin'),error=>error.reason==='type');
 const hard=fixture(t,{limits:{total:100,active:100}});assert.equal(hard.manager.limits.total,20);assert.equal(hard.manager.limits.active,20);
});

test('prewarm rejects oversized reservations atomically and actual estimates cannot overrun memory cap',async t=>{
 const f=fixture(t,{limits:{total:2}});
 await assert.rejects(f.manager.prewarm('bear',3),ActorPopulationLimitError);
 assert.equal(f.counts.create,0);assert.equal(f.manager.records.size,0);
 const warm=await f.manager.prewarm('bear',2);assert.equal(warm.length,2);assert.ok(warm.every(record=>record.state==='dormant'));
 assert.equal(f.counts.activate,0);assert.equal(f.counts.warm,2);
 const partial=fixture(t,{limits:{total:2}}),[retained]=await partial.manager.prewarm('bear',1);
 await partial.manager.spawn('goblin');
 await assert.rejects(partial.manager.prewarm('bear',2),error=>error.reason==='total');
 assert.equal(partial.manager.records.get(retained.id),retained,'a selected warm record cannot evict itself to satisfy its own batch');
 assert.equal(retained.state,'dormant');assert.equal(partial.counts.create,2);
 const g=fixture(t,{limits:{estimatedMemoryBytes:150},create:async(def,context,make)=>{const adapter=make(def);adapter.estimate=()=>({estimatedBytes:200});return adapter;}});
 await assert.rejects(g.manager.spawn('bear'),error=>error.reason==='estimated-memory-after-warm');
 assert.equal(g.counts.resources,0);assert.equal(g.manager.records.size,0);
});

test('death reward acknowledgment and respawn occur once per life; pause freezes countdown',async t=>{
 const events={death:0,reward:0,respawn:0};
 const f=fixture(t,{onDeath:()=>events.death++,onReward:()=>events.reward++,onRespawn:()=>events.respawn++}),record=await f.manager.spawn('bear');
 Object.assign(record.adapter.state,{dead:true,dying:true,rewardGranted:true});
 for(let i=0;i<20;i++)f.manager.observe();
 assert.equal(record.state,'dying');assert.deepEqual(events,{death:1,reward:1,respawn:0});
 record.adapter.state.dying=false;f.manager.observe();assert.equal(record.state,'corpse');
 record.adapter.state.corpseGone=true;f.manager.observe();f.manager.observe();
 assert.equal(record.state,'dormant');assert.equal(record.respawnRemaining,2);assert.equal(record.flags.respawn,true);
 f.manager.setPaused(true);f.manager.update(10);assert.equal(record.respawnRemaining,2);
 f.manager.setPaused(false);f.manager.update(1);assert.equal(record.respawnRemaining,1);
 f.manager.update(1);for(let i=0;i<10;i++)f.manager.update(0);await flush();
 assert.equal(record.state,'active');assert.equal(record.lifeId,2);assert.deepEqual(events,{death:1,reward:1,respawn:1});
 assert.equal(f.counts.create,1);assert.equal(f.counts.warm,1);
 f.manager.clear();f.manager.update(100);await flush();assert.equal(events.respawn,1);
});

test('map generation cancellation rejects promptly, retains bounded reservation and disposes late creation',async t=>{
 const gate=deferred(),entered=deferred();let first=true;
 const f=fixture(t,{limits:{total:2,concurrentPreparations:1},create:async(def,context,make)=>{if(first){first=false;entered.resolve();await gate.promise;}return make(def);}});
 const old=f.manager.spawn('bear');await entered.promise;
 f.manager.leaveMap();await assert.rejects(old,{name:'AbortError'});
 assert.equal(f.manager.diagnostics().entries,1,'unresolved old work stays charged against pool/memory caps');
 const fresh=await f.manager.spawn('goblin');assert.equal(fresh.state,'active');assert.equal(f.counts.activate,1);
 gate.resolve();await flush();
 assert.equal(f.counts.create,2);assert.equal(f.counts.dispose,1);assert.equal(f.counts.resources,1);
 assert.equal(f.manager.records.size,1);assert.equal(f.counts.activate,1,'late old-map adapter never activates');
});

test('late activation cancellation hides again and queued jobs never create after disposal',async t=>{
 const gate=deferred(),entered=deferred();
 const f=fixture(t,{create:async(def,context,make)=>{const adapter=make(def),activate=adapter.activate;adapter.activate=async spawn=>{entered.resolve();await gate.promise;await activate(spawn);};return adapter;}});
 const pending=f.manager.spawn('bear');await entered.promise;const queued=f.manager.spawn('goblin');
 f.manager.dispose();await assert.rejects(pending,{name:'AbortError'});await assert.rejects(queued,{name:'AbortError'});
 gate.resolve();await flush();
 assert.equal(f.counts.create,1);assert.equal(f.counts.resources,0);assert.equal(f.adapters[0].state.active,false);
 assert.equal(f.manager.records.size,0);assert.equal(f.manager.diagnostics().pending,0);
});

test('only far peaceful NPC decisions are staggered; update and meaningful threats stay full frequency',async t=>{
 const f=fixture(t),npc=await f.manager.spawn('npc'),enemy=await f.manager.spawn('bear');
 const context={player:{position:{x:0,z:0}}};
 for(let i=0;i<4;i++)f.manager.update(.1,context);
 assert.equal(f.counts.update,8);assert.equal(f.counts.decide,0);
 f.manager.update(.1,context);assert.equal(f.counts.decide,1);
 for(const field of ['combat','incoming','projectile','questRelevant']){npc.adapter.state[field]=true;f.manager.update(.01,context);npc.adapter.state[field]=false;}
 assert.equal(f.counts.decide,5);
 npc.adapter.state.position={x:1,z:1};f.manager.update(.01,context);assert.equal(f.counts.decide,6);
 enemy.adapter.state.position={x:10000,z:10000};f.manager.update(.01,context);assert.equal(f.counts.update,22,'combat adapter still receives every update invocation; real adapter makes this a no-op under BossBattle');
});

test('clear and external hide do not emit rewards or respawn; idle eviction releases only unleased resources',async t=>{
 const events=[];const f=fixture(t,{onDeath:()=>events.push('death'),onReward:()=>events.push('reward')}),record=await f.manager.spawn('bear');
 record.adapter.state.active=false;f.manager.observe();assert.equal(record.state,'dormant');assert.equal(record.respawnRemaining,null);
 f.manager.setPaused(true);f.manager.update(100);assert.equal(f.counts.resources,1);
 f.manager.setPaused(false);f.manager.update(9);assert.equal(f.counts.resources,1);f.manager.update(1);assert.equal(f.counts.resources,0);
 assert.deepEqual(events,[]);assert.equal(f.manager.records.size,0);
 const blocked=fixture(t,{validateSpawn:()=>({allowed:false,reason:'outside navigation region'})});
 await assert.rejects(blocked.manager.spawn('bear'),/outside navigation region/);assert.equal(blocked.counts.create,0);
 const invalid=fixture(t,{validateSpawn:()=>({valid:false,reason:'blocked authored spawn'})});
 await assert.rejects(invalid.manager.spawn('bear'),/blocked authored spawn/);assert.equal(invalid.counts.create,0);
 await assert.rejects(invalid.manager.spawn('bear',null),TypeError);
});

test('actual definition validator injection rejects safety, map, navigation and occupancy before resource creation',async t=>{
 const world={mapId:'village',navigation:{free:position=>position.x>=0}},player={position:{x:0,z:0}};
 const f=fixture(t,{definitions:ACTOR_DEFINITIONS,limits:{estimatedMemoryBytes:1024*1024*1024},validateSpawn:(def,context)=>validateActorSpawn(def,world,context)});
 await assert.rejects(f.manager.spawn('guardian-bear.standard',{position:{x:0,z:0},player}),/player-safety-distance/);
 await assert.rejects(f.manager.spawn('guardian-bear.standard',{position:{x:-5,z:0},player}),/blocked-navigation/);
 await assert.rejects(f.manager.spawn('guardian-bear.standard',{position:{x:5,z:0},player,occupied:[{x:5,z:0}]}),/occupied/);
 world.mapId='monster-forest';await assert.rejects(f.manager.spawn('village.guard',{position:{x:5,z:0},player}),/wrong-map/);
 assert.equal(f.counts.create,0);
 assert.equal((await f.manager.spawn('guardian-bear.standard',{position:{x:5,z:0},player})).state,'active');
});

test('a temporarily blocked respawn retries the same ticket without duplicating death or reward',async t=>{
 let allowed=true,respawns=0,errors=0;
 const f=fixture(t,{validateSpawn:()=>({valid:allowed,reason:'temporarily occupied'}),onRespawn:()=>respawns++,onError:()=>errors++}),record=await f.manager.spawn('bear');
 Object.assign(record.adapter.state,{dead:true,corpseGone:true,rewardGranted:true});f.manager.observe();allowed=false;
 f.manager.update(2);assert.equal(record.state,'dormant');assert.equal(record.respawnRemaining,1);assert.equal(errors,1);
 allowed=true;f.manager.update(1);await flush();
 assert.equal(record.lifeId,2);assert.equal(respawns,1);assert.equal(f.counts.create,1);assert.equal(f.manager.stats.deaths,1);assert.equal(f.manager.stats.rewardsObserved,1);
});

test('a preparation timeout frees the scheduling slot but charges and eventually reclaims its late work',async t=>{
 const gate=deferred();let first=true;
 const f=fixture(t,{preparationFactory:options=>createBossPreparation({...options,incremental:false,timeoutMs:10}),create:async(def,context,make)=>{const adapter=make(def);if(first){first=false;adapter.warm=async()=>gate.promise;}return adapter;}});
 await assert.rejects(f.manager.spawn('bear'),{name:'TimeoutError'});
 assert.equal(f.manager.diagnostics().currentPreparations,0);assert.equal(f.manager.diagnostics().entries,1);
 const fresh=await f.manager.spawn('goblin');assert.equal(fresh.state,'active');
 gate.resolve();await flush();assert.equal(f.counts.resources,1);assert.equal(f.manager.records.size,1);
});

test('asynchronous disposal retains its memory reservation until the owned resource actually releases',async t=>{
 const gate=deferred();let first=true;
 const f=fixture(t,{limits:{total:1},create:async(def,context,make)=>{const adapter=make(def),dispose=adapter.dispose;if(first){first=false;adapter.dispose=async()=>{await gate.promise;dispose();};}return adapter;}});
 await f.manager.spawn('bear');f.manager.clear({dispose:true});
 assert.equal(f.manager.diagnostics().states.disposing,1);assert.equal(f.manager.diagnostics().estimatedBytes,100);
 await assert.rejects(f.manager.spawn('goblin'),error=>error.reason==='total');
 gate.resolve();await flush();assert.equal(f.manager.records.size,0);
 assert.equal((await f.manager.spawn('goblin')).state,'active');
});

test('clear at the respawn completion boundary reclaims the cancelled life exactly once',async t=>{
 let manager;const f=fixture(t,{onRespawn:()=>manager.clear()});manager=f.manager;
 const record=await manager.spawn('bear');Object.assign(record.adapter.state,{dead:true,corpseGone:true});manager.observe();
 manager.update(2);await flush();
 assert.equal(manager.records.size,0);assert.equal(f.counts.resources,0);assert.equal(f.counts.dispose,1);assert.equal(manager.diagnostics().pending,0);
});
