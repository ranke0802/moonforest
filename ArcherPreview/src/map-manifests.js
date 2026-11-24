// A running document keeps a consistent immutable asset graph across travel.
// JSON only (bounded); GPU textures/models are still released on map departure.
import {MapLoadLifetime} from './map-load-lifetime.js';
const manifests=new Map();
// Server round trips for manifests in this document (each is a no-cache revalidation).
export const manifestReadStats={requests:0,ms:0,maxMs:0};
export function readMapManifest(url,{timeoutMs,timers}={}){
  const key=new URL(url).href;
  if(!manifests.has(key)){
    if(manifests.size>=24)manifests.delete(manifests.keys().next().value);
    // Shared immutable entry owns this deadline. One caller cancelling its map
    // must not abort a second caller waiting for the same document.
    const lifetime=new MapLoadLifetime({timeoutMs,timers,stage:'manifest'});
    const pending=lifetime.run(async()=>{
      const started=performance.now();manifestReadStats.requests++;
      const response=await lifetime.run(()=>fetch(key,{cache:'no-cache',signal:lifetime.signal}));
      {const ms=performance.now()-started;manifestReadStats.ms=Math.round((manifestReadStats.ms+ms)*10)/10;manifestReadStats.maxMs=Math.round(Math.max(manifestReadStats.maxMs,ms)*10)/10;}
      if(!response.ok)throw new Error(`리소스 목록을 불러오지 못했습니다 (${response.status}).`);
      return lifetime.run(()=>response.json());
    }).finally(()=>lifetime.close());
    manifests.set(key,pending);pending.catch(()=>{if(manifests.get(key)===pending)manifests.delete(key);});
  }
  return manifests.get(key);
}
