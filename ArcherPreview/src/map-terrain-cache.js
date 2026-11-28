import {TerrainHeightField} from './terrain.js';
import {DecodeCache} from './map-decode-cache.js';

// Only CPU samples of fixed authored maps. Every caller gets its own array;
// meshes, navigation, dynamic surfaces and GPU resources are never retained.
const caches=new WeakMap();
export const MAP_TERRAIN_CACHE_BYTES=512*1024;
const copy=terrain=>Object.assign(Object.create(TerrainHeightField.prototype),terrain,{heights:terrain.heights.slice()});
const cacheFor=engine=>{
 let cache=caches.get(engine);
 if(!cache){
  cache=new DecodeCache(MAP_TERRAIN_CACHE_BYTES,3);caches.set(engine,cache);
  engine.onDisposeObservable.addOnce(()=>{cache.clear();caches.delete(engine);});
 }
 return cache;
};
// Future map implementations with mutable/dynamic properties fall back to
// normal construction instead of accidentally sharing their state.
const keep=(cache,factory,terrain)=>{
 if(terrain.constructor===TerrainHeightField&&!terrain.surfaceHeight&&terrain.heights instanceof Float32Array&&
    Object.entries(terrain).every(([key,value])=>key==='heights'||value===null||typeof value==='number')&&
    terrain.heights.byteLength<=cache.limit){cache.put(factory,copy(terrain),terrain.heights.byteLength);return true;}
 return false;
};
export function cachedMapTerrain(engine,factory){
 const cache=cacheFor(engine);
 const stored=cache.get(factory);if(stored)return copy(stored);
 const terrain=factory();
 keep(cache,factory,terrain);
 return terrain;
}
// 0.3: build a map's terrain before it is needed, a row at a time, and leave it in the
// cache cachedMapTerrain reads (a first visit otherwise builds it in one call inside the
// map change: 0.43-0.95 s at 3x CPU throttle, Astra 2026-11-28). `run(work)` steps the
// generator - during play that is the shared preparation budget (boss-preparation.js).
// Resolves true when the terrain is cached, false when this factory has no row form or
// it could not be kept. Rejects with whatever `run` rejects with (cancellation).
export async function warmMapTerrain(engine,factory,run){
 const cache=cacheFor(engine);
 if(cache.entries.has(factory))return true;
 if(typeof factory?.sliced!=='function')return false;
 const terrain=await run(factory.sliced());
 return !engine.isDisposed&&keep(cache,factory,terrain);
}
export const mapTerrainCached=(engine,factory)=>cacheFor(engine).entries.has(factory);
// The same, from a terrain another thread built (v03/terrain-worker.js posts
// map-terrain-factory.js terrainMessage). Anything but a complete plain height field is
// refused, and the map change then builds the terrain itself as before.
export function adoptMapTerrain(engine,factory,message){
 const cache=cacheFor(engine);
 if(cache.entries.has(factory))return true;
 const entries=message?.entries,heights=message?.heights;
 if(engine.isDisposed||!Array.isArray(entries)||!(heights instanceof Float32Array))return false;
 const terrain=Object.create(TerrainHeightField.prototype);
 for(const entry of entries){if(!Array.isArray(entry)||typeof entry[0]!=='string')return false;terrain[entry[0]]=entry[0]==='heights'?heights:entry[1];}
 const n=terrain.subdivisions+1;
 if(terrain.heights!==heights||!Number.isInteger(n)||heights.length!==n*n||!(terrain.size>0)||terrain.step!==terrain.size/terrain.subdivisions||terrain.half!==terrain.size/2)return false;
 return keep(cache,factory,terrain);
}
export function inspectMapTerrainCache(engine){return (engine&&caches.get(engine)?.inspect())??null;}
