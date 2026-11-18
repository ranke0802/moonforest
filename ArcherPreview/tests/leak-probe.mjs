// Diagnostic only (not a test): plains <-> village round trips on the real
// compressed map data; reports what survives a released map.
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const LOG=process.env.PROBE_LOG;const say=(...a)=>{const line=a.join(' ');if(LOG)appendFileSync(LOG,line+'\n');else console.log(line);};const T0=Date.now();
import v8 from 'node:v8';
import {NullEngine,PBRMaterial,Vector3} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';

const base=new URL('../public/assets/',import.meta.url),tick=()=>new Promise(r=>setTimeout(r,0));
const rounds=Number(process.argv[2]??3),snapshot=process.argv[3]??null;
globalThis.location={href:'https://leak.test/game/?character=warrior-plains'};
globalThis.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);return new Response(readFileSync(new URL(name,base)));};
const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{plains:true,village:true,touchDevice:true}),scene=world.scene;
engine.getCaps().instancedArrays=true;scene.defaultMaterial;scene.getOutlineRenderer();
await MeshoptDecoder.ready;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
const readyRaw=()=>{for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
const loadContainer=async(model,scene,options={})=>{
 const file=model.pathname.split('/').at(-1),modelUrl=new URL('content/'+file,base),gltf=JSON.parse(readFileSync(modelUrl));
 for(const b of gltf.buffers)if(b.uri){const bytes=readFileSync(new URL(b.uri,modelUrl));b.uri='data:application/octet-stream;base64,'+bytes.toString('base64');}
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:file,...options}),geometry=container.meshes.filter(m=>m.getTotalVertices()>0);
 const materials=gltf.materials.map((source,i)=>{const m=new PBRMaterial(file+'-'+i,scene);return m;});
 for(const m of geometry)m.material=materials[gltf.meshes[0]?.primitives[0]?.material??0];container.materials.push(...materials);readyRaw();return container;
};
const services={initialize:async()=>{},ground:async()=>{},loadContainer};
const place=()=>{const p=world.plains?{x:-55,z:37}:{x:0,z:70};world.camera.setTarget(new Vector3(p.x,world.terrain.heightAt(p.x,p.z)+WARRIOR_DIMENSIONS.stableFocusHeight,p.z));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();readyRaw();return p;};
const mb=()=>{globalThis.gc();const m=process.memoryUsage();return {heap:Math.round(m.heapUsed/1e6),ext:Math.round(m.external/1e6),ab:Math.round(m.arrayBuffers/1e6)};};
const weak=[];const log=[];
for(let visit=0;visit<rounds*2;visit++){
 const character=visit%2?'warrior-v3':'warrior-plains';if(visit)replaceWorldMap(world,character);const p=place();
 say('load',character,Date.now()-T0);let n=0;const svc={...services,loadContainer:async(...a)=>{n++;return services.loadContainer(...a);}};
 await loadStreamedVillage(world,svc);say('loaded',character,Date.now()-T0,'containers',n);await tick();readyRaw();world.lighting.follow(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z),true);world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),.1);scene.render();readyRaw();
 const loaded={visit,map:world.mapId,meshes:scene.meshes.length,geos:scene.geometries.length,...mb()};
 const refs={visit,map:world.mapId,prepared:new WeakRef(world.villagePrepared),visibility:new WeakRef(world.villageVisibility),streaming:new WeakRef(world.villageStreaming),owner:new WeakRef(world.villageLoadOwner),root:new WeakRef(world.villagePrepared.records[0].root),ground:new WeakRef(world.ground)};weak.push(refs);
 await world.releaseEnvironment();await tick();await tick();
 loaded.released=mb();loaded.survivors=weak.map(r=>r.visit+':'+['prepared','visibility','streaming','owner','root','ground'].filter(k=>r[k].deref()).join(','));log.push(loaded);say(JSON.stringify(loaded));
}
if(snapshot){globalThis.__probeTargets=weak.slice(0,-1).map(r=>r.prepared.deref()).filter(Boolean);say('targets',globalThis.__probeTargets.length);for(const t of globalThis.__probeTargets)t.__LEAK_PROBE_MARK__='leak-probe-mark';globalThis.__probeTargets=null;globalThis.gc();say('snapshot',v8.writeHeapSnapshot(snapshot));}
engine.dispose();
