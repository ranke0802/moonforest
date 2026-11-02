import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {readMapManifest} from './map-manifests.js';
import {installMeshoptWorkerSupervisor,recoverMeshoptWorkerPool} from './meshopt-worker-supervisor.js';

let initialized;
// The pinned local decoder is covered by the existing persistent resource cache.
// Own one bounded worker, preserving an already-shared external SDK decoder.
export function initializeVillageMeshopt(options){
  if(initialized){recoverMeshoptWorkerPool();return initialized;}
  const pending=(async()=>{
    const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/meshopt-decoder.json`,location.href);
    const config=await readMapManifest(url,options);
    const decoderUrl=new URL(config.url,url).href;MeshoptCompression.Configuration={decoder:{url:decoderUrl}};
    installMeshoptWorkerSupervisor(MeshoptCompression,{decoderUrl});
  })();initialized=pending;pending.catch(()=>{if(initialized===pending)initialized=undefined;});return pending;
}
