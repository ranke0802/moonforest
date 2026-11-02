import {NullEngine} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {warmMapNavigation,inspectMapNavigationCache} from '../../src/map-navigation-cache.js';
import {ENEMY_ARENA_RADIUS} from '../../src/world-limits.js';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=nav=>createHash('sha256').update(JSON.stringify([...nav.grids])).digest('hex');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const engine=new NullEngine(),world=createWorld(engine,{village:true,touchDevice:true}),maps=[];
for(const character of ['warrior-v3','warrior-v4','warrior-v5']){
 if(character!=='warrior-v3')replaceWorldMap(world,character);
 const make=()=>new world.navigation.constructor(world.navigation.obstacles.map(value=>({...value}))),before=[],after=[];
 for(let round=0;round<7;round++){
  // Alternate order in one process. Construct independently owned navigators
  // in both paths and compare every node/edge outside the timed section.
  let original,cached;
  const baseline=()=>{const start=performance.now();original=make();original.grid(.34,ENEMY_ARENA_RADIUS);original.grid(.7,ENEMY_ARENA_RADIUS);before.push(performance.now()-start);};
  const optimized=()=>{const start=performance.now();cached=make();warmMapNavigation(engine,cached,world.mapId,ENEMY_ARENA_RADIUS);after.push(performance.now()-start);};
  if(round%2){optimized();baseline();}else{baseline();optimized();}
  assert.equal(hash(original),hash(cached));
 }
 maps.push({map:world.mapId,beforeMs:before,afterMs:after,beforeMedianMs:median(before),afterMedianMs:median(after),allNodesAndEdgesIdentical:true});
}
const cache=inspectMapNavigationCache(engine);engine.dispose();assert.equal(inspectMapNavigationCache(engine),null);
const result={status:'PASS',maps,cache,limits:'Seven alternating CPU runs per map on this computer, original grid() versus exact snapshot restore. Not total map load, phone, browser or GPU time.'};
await writeFile(new URL('./navigation-comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
