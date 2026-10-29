import {TerrainHeightField} from './terrain.js';
import {DecodeCache} from './map-decode-cache.js';

// Only CPU samples of fixed authored maps. Every caller gets its own array;
// meshes, navigation, dynamic surfaces and GPU resources are never retained.
const caches=new WeakMap();
export const MAP_TERRAIN_CACHE_BYTES=512*1024;
const copy=terrain=>Object.assign(Object.create(TerrainHeightField.prototype),terrain,{heights:terrain.heights.slice()});
export function cachedMapTerrain(engine,factory){
 let cache=caches.get(engine);
 if(!cache){
  cache=new DecodeCache(MAP_TERRAIN_CACHE_BYTES,3);caches.set(engine,cache);
  engine.onDisposeObservable.addOnce(()=>{cache.clear();caches.delete(engine);});
 }
 const stored=cache.get(factory);if(stored)return copy(stored);
 const terrain=factory();
 // Future map implementations with mutable/dynamic properties fall back to
 // normal construction instead of accidentally sharing their state.
 if(terrain.constructor===TerrainHeightField&&!terrain.surfaceHeight&&terrain.heights instanceof Float32Array&&
    Object.entries(terrain).every(([key,value])=>key==='heights'||value===null||typeof value==='number')&&
    terrain.heights.byteLength<=cache.limit)cache.put(factory,copy(terrain),terrain.heights.byteLength);
 return terrain;
}
export function inspectMapTerrainCache(engine){return (engine&&caches.get(engine)?.inspect())??null;}
