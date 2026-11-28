// 0.3: builds the next map's terrain heights off the main thread while the current map is
// played (next-map-prefetch.js warmNextMapTerrain). One request, one answer; the page ends
// the worker afterwards. Only plain math modules are loaded here.
import {terrainMessage} from '../map-terrain-factory.js';

self.onmessage=({data})=>{
  try{const message=terrainMessage(data.mapId,data.gameplayV03);self.postMessage(message,[message.heights.buffer]);}
  catch(error){self.postMessage({error:String(error?.message??error)});}
};
