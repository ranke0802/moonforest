import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NullEngine,Observable} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {VillageNavigation} from '../src/village-navigation.js';
import {warmMapNavigation,inspectMapNavigationCache,MAP_NAVIGATION_CACHE_BYTES} from '../src/map-navigation-cache.js';
import {ENEMY_ARENA_RADIUS} from '../src/world-limits.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fakeEngine=()=>({onDisposeObservable:new Observable()});

test('three authored map grids restore exact nodes, edges, components and paths in a fixed CPU budget',t=>{
 const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true}),saved=new Map();t.after(()=>engine.dispose());
 for(const character of ['warrior-v3','warrior-v4','warrior-v5','warrior-v4','warrior-v3','warrior-v4','warrior-v5','warrior-v4','warrior-v3']){
  if(saved.size)replaceWorldMap(world,character);
  const nav=world.navigation,snapshot={grids:[...nav.grids].map(([key,nodes])=>({key,hash:hash(nodes),component:hash(Array.from(nav.gridMetadata.get(nodes).component))}))};
  // Pick free endpoints from the full original graph; prove cached routing and
  // live analytic collision agree, not just a hand-written expected path.
  const radius=.7,nodes=nav.grid(radius,ENEMY_ARENA_RADIUS),free=nodes.filter(node=>node.free),a=free[Math.floor(free.length*.3)],b=free[Math.floor(free.length*.7)];
  snapshot.path=hash(nav.path(a,b,radius,ENEMY_ARENA_RADIUS));
  if(saved.has(character))assert.deepEqual(snapshot,saved.get(character));else saved.set(character,snapshot);
  const info=inspectMapNavigationCache(engine);assert.ok(info.bytes<=MAP_NAVIGATION_CACHE_BYTES);assert.ok(info.entries<=3);assert.equal(info.evictions,0);
 }
 const result=inspectMapNavigationCache(engine);assert.equal(result.misses,3);assert.equal(result.hits,6);assert.equal(result.entries,3);t.diagnostic(JSON.stringify(result));
 engine.dispose();assert.equal(inspectMapNavigationCache(engine),null);
});

test('changed obstacle data or collision implementation invalidates a snapshot; grids are caller-owned',()=>{
 const engine=fakeEngine(),make=x=>new VillageNavigation([{id:'test',x,z:0,radius:.8,height:2}]);
 const a=make(0);warmMapNavigation(engine,a,'village',4);const original=hash([...a.grids]);
 a.grids.values().next().value[0].x=1000;a.grids.values().next().value[0].edges.push([5,777]);
 const b=make(0);warmMapNavigation(engine,b,'village',4);assert.equal(hash([...b.grids]),original);assert.equal(inspectMapNavigationCache(engine).hits,1);
 const c=make(1);warmMapNavigation(engine,c,'village',4);assert.equal(inspectMapNavigationCache(engine).misses,2);assert.notEqual(hash([...c.grids]),original);
 const d=make(1);d.free=()=>false;warmMapNavigation(engine,d,'village',4);assert.equal(inspectMapNavigationCache(engine).misses,3);assert.ok([...d.grids.values()].every(nodes=>nodes.every(n=>!n.free)));assert.equal(inspectMapNavigationCache(engine).entries,0,'instance-bound callbacks cannot retain a map owner in the cache');
 engine.onDisposeObservable.notifyObservers(engine);assert.equal(inspectMapNavigationCache(engine),null);
});

test('repeated signatures do not grow the pool and oversized maps retain no snapshot',()=>{
 const engine=fakeEngine();
 for(let i=0;i<30;i++){const nav=new VillageNavigation([{id:'test'+i,x:i*.01,z:0,radius:.2,height:1}]);warmMapNavigation(engine,nav,['village','monster-forest','witch-cave'][i%3],4);const info=inspectMapNavigationCache(engine);assert.ok(info.entries<=3);assert.ok(info.bytes<=MAP_NAVIGATION_CACHE_BYTES);}
 const huge=new VillageNavigation([{id:'x'.repeat(MAP_NAVIGATION_CACHE_BYTES+1),x:0,z:0,radius:.2,height:1}]);warmMapNavigation(engine,huge,'village',4);assert.equal(inspectMapNavigationCache(engine).entries,2);
 engine.onDisposeObservable.notifyObservers(engine);
});

test('noncanonical edge layouts bypass the compact cache without changing the navigator result',()=>{
 const engine=fakeEngine(),nav=new VillageNavigation([]),grid=nav.grid;
 nav.grid=function(...args){const result=grid.apply(this,args);result[0].x=123;return result;};
 warmMapNavigation(engine,nav,'village',4);assert.equal(inspectMapNavigationCache(engine).entries,0);assert.equal(nav.grid(.34,4)[0].x,123);
 engine.onDisposeObservable.notifyObservers(engine);
});
