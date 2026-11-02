import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {readMapManifest} from './map-manifests.js';

let initialized;
// The pinned local decoder is covered by the existing persistent resource cache.
// Babylon decodes on one worker, releasing it after a second of inactivity.
export function initializeVillageMeshopt(options){
  if(initialized)return initialized;
  const pending=(async()=>{
    const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/meshopt-decoder.json`,location.href);
    const config=await readMapManifest(url,options);
    MeshoptCompression.Configuration={decoder:{url:new URL(config.url,url).href}};
  })();initialized=pending;pending.catch(()=>{if(initialized===pending)initialized=undefined;});return pending;
}
