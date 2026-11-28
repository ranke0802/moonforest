import {createVillageTerrain} from './village-terrain.js';
import {createMonsterForestTerrain} from './monster-forest-terrain.js';
import {createGreatPlainsTerrain,createGreatPlainsV03Terrain} from './great-plains-terrain.js';
import {createWitchCaveTerrain} from './witch-cave-terrain.js';

// The terrain a world map is built from. replaceWorldMap (world.js), the next-map
// preparation (v03/next-map-prefetch.js) and its worker (v03/terrain-worker.js) must name
// the same one; the terrain cache is keyed by this function's identity. No engine imports:
// the worker loads this file.
export function mapTerrainFactory(mapId,gameplayV03=false){
  return mapId==='great-plains'?(gameplayV03?createGreatPlainsV03Terrain:createGreatPlainsTerrain):mapId==='witch-cave'?createWitchCaveTerrain:mapId==='monster-forest'?createMonsterForestTerrain:createVillageTerrain;
}
// What the worker posts for one map: every field in the field's own order, the heights
// apart so their buffer can be transferred.
export function terrainMessage(mapId,gameplayV03){
  const terrain=mapTerrainFactory(mapId,gameplayV03)(),heights=terrain.heights;
  return {mapId,gameplayV03:!!gameplayV03,entries:Object.entries(terrain).map(([key,value])=>[key,key==='heights'?null:value]),heights};
}
