// Diagnostic only (not a test): village visits of the 0.3 cast through the real
// cinematic visual factory, with the real rigs read from public/assets.
// node --expose-gc tests/actor-source-cache-probe.mjs <budgetMiB> [visits]
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {readMapContainer} from '../src/map-container.js';
import {setAnimationCompaction,animationCompaction} from '../src/animation-compaction.js';
import {CAST_ENTRIES} from '../src/v03/cast-catalog.js';
import {createCinematicVisualFactory} from '../src/cinematic-visual-adapter.js';
import {getCinematicDefinitions} from '../src/cinematic-assets.js';
import {setActorSourceCacheBudget,inspectActorSourceCache} from '../src/actor-source-cache.js';
const budget=Number(process.argv[2]??0),visits=Number(process.argv[3]??4);setActorSourceCacheBudget(budget);setAnimationCompaction(true);
await MeshoptDecoder.ready;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,2,-8),scene);
const pub=new URL('../public/',import.meta.url),catalog={revision:'cast',entries:CAST_ENTRIES};
const gltfOf=new Map(CAST_ENTRIES.map(e=>{const url=new URL(e.runtime.model,pub),gltf=JSON.parse(readFileSync(url));for(const b of gltf.buffers)if(b.uri&&!b.uri.startsWith('data:'))b.uri='data:application/octet-stream;base64,'+readFileSync(new URL(b.uri,url)).toString('base64');return [url.href,gltf];}));
const factory=createCinematicVisualFactory({world:{scene,mapId:'village',terrain:{heightAt:()=>0}},catalog,resolveCatalog:v=>v,resolveNpcSource:async()=>null,initialize:async()=>{},
 readManifest:async url=>JSON.parse(readFileSync(new URL(url))),baseUrl:pub.href,
 loadContainer:async(model,scene)=>readMapContainer(scene,structuredClone(gltfOf.get(model.href)),'',{skipMaterials:true,fileName:model.pathname.split('/').at(-1)}),prepareShaders:async()=>{},prepareInterior:async()=>{}});
const definitions=Object.values(getCinematicDefinitions(catalog)).filter(d=>CAST_ENTRIES.some(e=>e.assetId===d.assetId));
const heap=()=>{globalThis.gc();globalThis.gc();return +(process.memoryUsage().heapUsed/1048576).toFixed(1);};
const rows=[];
for(let visit=0;visit<visits;visit++){
 await new Promise(r=>setTimeout(r,30));const before=heap(),keys=animationCompaction.seenKeys,t=performance.now();
 const adapters=definitions.map(d=>factory(d,{isCurrent:()=>true}));await Promise.all(adapters.map(a=>a.warm()));
 const ms=performance.now()-t,loaded=heap();for(const a of adapters)await a.dispose();await new Promise(r=>setTimeout(r,30));
 rows.push({visit,actors:adapters.length,ms:Math.round(ms),parsedKeys:animationCompaction.seenKeys-keys,heapBeforeMB:before,heapLoadedMB:loaded,heapAfterLeaveMB:heap(),cache:inspectActorSourceCache(scene)});console.log(JSON.stringify(rows.at(-1)));
}
await factory.dispose();await new Promise(r=>setTimeout(r,30));console.log('factory disposed heap',heap(),JSON.stringify(inspectActorSourceCache(scene)));
