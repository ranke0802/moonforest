import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {MourningCaveNavigation,inspectMourningSpawnSearch} from '../src/mourning-cave-navigation.js';
import {MOURNING_CAVE_CLEARANCE_DATA as data} from '../src/mourning-cave-clearance-data.js';
import {caveObstacles} from '../src/witch-cave-layout.js';
import {MOURNING_SIZE,ELENA_HOME} from '../src/elena-spec.js';
import {setWorldCharacter,ENEMY_ARENA_RADIUS} from '../src/world-limits.js';
import {bossSpawnPositions} from '../src/boss-battle.js';
import {createBossPreparation} from '../src/boss-preparation.js';

function legacyFindFree(nav,p,radius,limit,occupied){
 const available=q=>nav.free(q,radius,limit)&&occupied.every(o=>Math.hypot(q.x-o.x,q.z-o.z)>=radius+(o.radius??radius)+.12);
 if(available(p))return {x:p.x,z:p.z};let best=null,cost=Infinity;
 for(let r=0;r<data.runs.length;r+=2)for(let i=data.runs[r];i<data.runs[r]+data.runs[r+1];i++){
  const q={x:data.minX+(i%data.width+.5)*data.step,z:data.minZ+(Math.floor(i/data.width)+.5)*data.step},d=(q.x-p.x)**2+(q.z-p.z)**2;
  if(d<cost&&available(q)){best=q;cost=d;}
 }
 if(!best)throw new Error('no-room');return best;
}

test('cached nearest ordering preserves exact legacy source-cell choices for the actual twenty-actor radial request',t=>{
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));const nav=new MourningCaveNavigation(caveObstacles()),player={position:new Vector3(-42,6,43),rotation:{y:0}},occupied=[{x:-42,z:43,radius:.8}];
 const positions=bossSpawnPositions(player,20,{radius:MOURNING_SIZE.radius,separationRadius:MOURNING_SIZE.separationRadius});
 for(const p of positions){const expected=legacyFindFree(nav,p,MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,occupied),actual=nav.findFree(p,MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,occupied);assert.deepEqual(actual,expected);occupied.push({...actual,radius:MOURNING_SIZE.radius});}
 assert.equal(occupied.length,21);for(let i=0;i<40;i++)nav.findFree({x:-60+i*.1,z:-60},MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,[]);
 const state=inspectMourningSpawnSearch();assert.equal(state.candidates,2590);assert.ok(state.cachedOrigins<=state.cachedOriginLimit);
});

test('one derived southwest packing retry fits twenty full-radius actors with the player at the story home',async t=>{
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));const nav=new MourningCaveNavigation(caveObstacles()),origin=nav.spawnPackingOrigin(),occupied=[{...ELENA_HOME,radius:.8}],snapshot=structuredClone(origin),preparation=createBossPreparation({frame:async()=>{}});
 for(let i=0;i<20;i++){
  const p=await nav.findFree(origin,MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,occupied,preparation);assert.ok(nav.free(p,MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS));
  for(const other of occupied)assert.ok(Math.hypot(p.x-other.x,p.z-other.z)>=MOURNING_SIZE.radius+other.radius+.12-1e-8);
  assert.deepEqual(p,legacyFindFree(nav,origin,MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,occupied));occupied.push({...p,radius:MOURNING_SIZE.radius});
 }
 assert.equal(occupied.length,21);assert.deepEqual(origin,snapshot);assert.deepEqual(nav.spawnPackingOrigin(),snapshot);assert.ok(preparation.stats.blocks>0);assert.equal(preparation.stats.placementBlocks,preparation.stats.blocks,'Placement work stays separate from vertex/pose preparation proofs');
});

test('incremental no-room searches cancel before scanning every cell without publishing or changing occupancy',async t=>{
 setWorldCharacter('warrior-v5');t.after(()=>setWorldCharacter('warrior'));const nav=new MourningCaveNavigation(caveObstacles()),occupied=[{...ELENA_HOME,radius:100}],before=structuredClone(occupied);let frames=0,current=true,queries=0;const free=nav.free.bind(nav);nav.free=(...args)=>{queries++;return free(...args);};
 const preparation=createBossPreparation({isCurrent:()=>current,maxBlocks:1,frame:async()=>{if(++frames===2)current=false;}});
 await assert.rejects(nav.findFree({x:-60,z:-60},MOURNING_SIZE.radius,ENEMY_ARENA_RADIUS,occupied,preparation),{name:'AbortError'});
 assert.ok(frames>=2);assert.ok(queries<2590,'Cancellation stops the bounded scan before it finishes');assert.deepEqual(occupied,before);
});
