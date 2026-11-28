// Diagnostic only (not a test): plains <-> village round trips on the real
// compressed map data; reports what survives a released map.
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const LOG=process.env.PROBE_LOG;const say=(...a)=>{const line=a.join(' ');if(LOG)appendFileSync(LOG,line+'\n');else console.log(line);};const T0=Date.now();
import v8 from 'node:v8';
// Node has no canvas: label textures (plains decor) only need a no-op 2D context.
{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}
import {NullEngine,PBRMaterial,RawTexture,Vector3} from '@babylonjs/core';
import {VillageGroundDetail} from '../src/village-ground.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {createWagonHorse} from '../src/v03/wagon-horse.js';
import {createStarfallAura} from '../src/v03/starfall-aura.js';
// PROBE_MODE (comma list, default none): horse = a mounted riding horse per visit,
// left after the next map loads like riding-horse.js; aura = one scene-lifetime
// Starfall aura bound to that horse root each visit (2026-11-27); v03 = the 0.3 world
// (gameplayV03: settlement scenery, fast route grids) instead of 0.2 (2026-11-28);
// stage (with v03) = before each departure the next map's arrival models are staged by
// v03/next-map-prefetch.js and the loader takes them (2026-11-28).
const MODES=new Set((process.env.PROBE_MODE??'').split(',').map(s=>s.trim()).filter(Boolean));
// Only these are read; any other word (CLAUDE.md once listed resources,ground,frames,materials,cast)
// would otherwise pass silently as if it had been checked (2026-11-27 audit).
const KNOWN_MODES=new Set(['horse','aura','v03','stage']),unknownModes=[...MODES].filter(mode=>!KNOWN_MODES.has(mode));

const base=new URL('../public/assets/',import.meta.url),tick=()=>new Promise(r=>setTimeout(r,0));
const rounds=Number(process.argv[2]??3),snapshot=process.argv[3]??null;
globalThis.location={href:'https://leak.test/game/?character=warrior-plains'};
globalThis.fetch=async url=>{if(String(url).startsWith('file:'))return new Response(readFileSync(new URL(String(url))));const name=new URL(url).pathname.split('/').at(-1);return new Response(readFileSync(new URL(name,base)));};
if(MODES.has('v03')){
 globalThis.matchMedia??=()=>({matches:true});
 const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};
 await (await import('../src/fixed-layouts.js')).prepareFixedLayouts(['village','great-plains']);
}
const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{plains:true,village:true,touchDevice:true,gameplayV03:MODES.has('v03')}),scene=world.scene;
engine.getCaps().instancedArrays=true;scene.defaultMaterial;scene.getOutlineRenderer();
await MeshoptDecoder.ready;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
const readyRaw=()=>{for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
const loadContainer=async(model,scene,options={})=>{
 const file=model.pathname.split('/').at(-1),modelUrl=new URL('content/'+file,base),gltf=JSON.parse(readFileSync(modelUrl));
 for(const b of gltf.buffers)if(b.uri){const bytes=readFileSync(new URL(b.uri,modelUrl));b.uri='data:application/octet-stream;base64,'+bytes.toString('base64');}
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:file,...options}),geometry=container.meshes.filter(m=>m.getTotalVertices()>0);
 const materials=gltf.materials.map((source,i)=>{const m=new PBRMaterial(file+'-'+i,scene);m.albedoTexture=pixel(scene);return m;});
 for(const m of geometry)m.material=materials[gltf.meshes[0]?.primitives[0]?.material??0];container.materials.push(...materials);readyRaw();return container;
};
// Stand-ins for the GPU textures the map code expects (2026-11-20: the plains
// outskirts ground borrows the village floor's detail texture and each
// model's own colour texture).
const pixel=scene=>RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);
const services={initialize:async()=>{},ground:async world=>{const material=world.floorMaterial;if(material&&!material.pluginManager?.getPlugin('MoonforestGroundDetail'))new VillageGroundDetail(material,pixel(world.scene));},loadContainer};
const place=()=>{const p=world.plains?{x:-55,z:37}:{x:0,z:70};world.camera.setTarget(new Vector3(p.x,world.terrain.heightAt(p.x,p.z)+WARRIOR_DIMENSIONS.stableFocusHeight,p.z));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();readyRaw();return p;};
const mb=()=>{globalThis.gc();const m=process.memoryUsage();return {heap:Math.round(m.heapUsed/1e6),ext:Math.round(m.external/1e6),ab:Math.round(m.arrayBuffers/1e6)};};
const weak=[];const log=[];let horse=null;const aura=MODES.has('aura')?createStarfallAura({scene}):null;say('modes',[...MODES].join(',')||'none');if(unknownModes.length)say('unknown modes (not checked):',unknownModes.join(','),'- known:',[...KNOWN_MODES].join(','));
// Staging owner as main.js makes it, with the probe's container reader and no Cache Storage.
let stageClock=0;const stagedWeak=[];
if(MODES.has('stage')){
 const {createNextMapPrefetch}=await import('../src/v03/next-map-prefetch.js');
 world.nextMapPrefetch=createNextMapPrefetch({world,base:new URL('/assets/',location.href),now:()=>stageClock,stageBytes:Infinity,pause:tick,
  loadContainer:async(model,scene,options)=>{const container=await services.loadContainer(model,scene,options);stagedWeak.push(new WeakRef(container));return container;},
  downloads:()=>({prepare:async()=>({total:0,cached:0,loaded:0,complete:true,storageAvailable:true}),cancel(){}})});
}
const {mapPortals}=await import('../src/map-route.js');
for(let visit=0;visit<rounds*2;visit++){
 const character=visit%2?'warrior-v3':'warrior-plains';if(visit)replaceWorldMap(world,character);const p=place();
 say('load',character,Date.now()-T0);let n=0;const svc={...services,loadContainer:async(...a)=>{n++;return services.loadContainer(...a);}};
 // A taken container skips the probe's reader, which is where its stand-in textures are marked ready.
 const marking=world.nextMapPrefetch?setInterval(readyRaw,2):null;
 try{await loadStreamedVillage(world,svc);}finally{clearInterval(marking);}
 say('loaded',character,Date.now()-T0,'containers',n,...(world.nextMapPrefetch?['staged-taken',world.environment.stagedModels??0]:[]));
 if(world.nextMapPrefetch){world.nextMapPrefetch.arrived();stageClock+=60000;world.nextMapPrefetch.update(1,{x:p.x+300,z:p.z},false);say('after arrival',JSON.stringify((({staged,taken,dropped,stagedModels})=>({staged,taken,dropped,stagedModels}))(world.nextMapPrefetch.inspect())));}
await tick();readyRaw();world.lighting.follow(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z),true);world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),.1);scene.render();readyRaw();
 if(horse){horse.dispose();horse=null;}
 let horseRoot=null;if(MODES.has('horse')||MODES.has('aura')){horse=createWagonHorse({scene,heightAt:(x,z)=>world.terrain.heightAt(x,z),wagon:{x:p.x,y:world.terrain.heightAt(p.x,p.z),z:p.z},shadows:world.shadows,mounted:true});await horse.ready;horse.play('Horse_Gallop');horseRoot=horse.root;
  if(aura){await aura.bind(horseRoot);aura.update({actionId:visit,charging:true,chargeProgress:.6,level:2});}readyRaw();scene.render();}
 const loaded={visit,map:world.mapId,meshes:scene.meshes.length,geos:scene.geometries.length,...mb()};
 const refs={visit,map:world.mapId,prepared:new WeakRef(world.villagePrepared),visibility:new WeakRef(world.villageVisibility),streaming:new WeakRef(world.villageStreaming),owner:new WeakRef(world.villageLoadOwner),root:new WeakRef(world.villagePrepared.records[0].root),ground:new WeakRef(world.ground),navigation:new WeakRef(world.navigation),grid:new WeakRef(world.navigation.grids.values().next().value),...(horseRoot?{horse:new WeakRef(horseRoot)}:{})};weak.push(refs);
 if(world.nextMapPrefetch&&visit<rounds*2-1){
  // Walk up to the road to the next map, let the staging finish, then travel.
  const next=visit%2?'warrior-plains':'warrior-v3',portal=mapPortals(world.mapId).find(candidate=>candidate.destination===next);
  stageClock+=1000;world.nextMapPrefetch.update(1,{x:portal.x,z:portal.z},false);
  for(let i=0;i<4000&&world.nextMapPrefetch.inspect().active;i++)await tick();
  const report=world.nextMapPrefetch.inspect();say('staged for',next,report.stagedModels,'models',report.recent.at(-1)?.state,report.recent.at(-1)?.error??'');
  world.nextMapPrefetch.travel(next);
 }
 await world.releaseEnvironment();await tick();await tick();
 loaded.released=mb();loaded.survivors=weak.map(r=>r.visit+':'+['prepared','visibility','streaming','owner','root','ground','navigation','grid','horse'].filter(k=>r[k]?.deref()).join(','));log.push(loaded);say(JSON.stringify(loaded));
}
if(snapshot){globalThis.__probeTargets=weak.slice(0,-1).map(r=>r[process.env.PROBE_TARGET??'prepared']?.deref()).filter(Boolean);say('targets',globalThis.__probeTargets.length);for(const t of globalThis.__probeTargets)t.__LEAK_PROBE_MARK__='leak-probe-mark';globalThis.__probeTargets=null;globalThis.gc();say('snapshot',v8.writeHeapSnapshot(snapshot));}
if(world.nextMapPrefetch){world.nextMapPrefetch.cancel();await tick();globalThis.gc();await tick();globalThis.gc();say('staged containers ever',stagedWeak.length,'still alive after the last release',stagedWeak.filter(ref=>ref.deref()).length,'(the last map was released; none should remain)');}
engine.dispose();
