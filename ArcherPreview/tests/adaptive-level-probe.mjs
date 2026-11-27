// Diagnostic only (not a test): what each frame-guard level removes on the
// plains and in the village (2026-11-27). NullEngine draws nothing, so draw
// calls are counted at the engine draw entry points (main pass + shadow map).
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
// Starfall aura bound to that horse root each visit (2026-11-27).
const MODES=new Set((process.env.PROBE_MODE??'').split(',').map(s=>s.trim()).filter(Boolean));

const base=new URL('../public/assets/',import.meta.url),tick=()=>new Promise(r=>setTimeout(r,0));

globalThis.location={href:'https://leak.test/game/?character=warrior-plains'};
globalThis.fetch=async url=>{if(String(url).startsWith('file:'))return new Response(readFileSync(new URL(String(url))));const name=new URL(url).pathname.split('/').at(-1);return new Response(readFileSync(new URL(name,base)));};
const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{plains:true,village:true,touchDevice:true}),scene=world.scene;
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

// Babylon's SceneLoader reads file: URLs through XMLHttpRequest (the actor stand-ins).
globalThis.XMLHttpRequest??=class{constructor(){this.readyState=0;this.status=0;this.responseType='';this.listeners={};}
 open(method,url){this.url=url;}setRequestHeader(){}getResponseHeader(){return null;}abort(){}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]??[]).filter(f=>f!==fn);}
 send(){queueMicrotask(()=>{try{const bytes=readFileSync(new URL(this.url));this.response=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);this.status=200;}catch{this.status=404;}this.readyState=4;this.onreadystatechange?.();for(const fn of this.listeners.readystatechange??[])fn();for(const fn of this.listeners.load??[])fn({});});}};
import {ADAPTIVE_LEVELS} from '../src/adaptive-performance.js';
import {applyPlainsViewDistance,applyAdaptiveRange,PLAINS_VIEW_DISTANCE_DEFAULT} from '../src/plains-view-distance.js';
let draws=0;for(const k of ['drawElementsType','drawArraysType']){const f=engine[k].bind(engine);engine[k]=(...a)=>{draws++;return f(...a);};}
// The 0.3 default keeps far actor shadows on (quality-restore farActorShadows), as main.js applies it.
const farActorShadows=process.env.FAR_ACTOR_SHADOWS!=='0';
const apply=settings=>{
 const cap=settings.viewCap;applyPlainsViewDistance(world,cap?Math.min(PLAINS_VIEW_DISTANCE_DEFAULT,cap):PLAINS_VIEW_DISTANCE_DEFAULT);applyAdaptiveRange(world,settings.rangeScale,true);world.detailCullRange=settings.detailRange??0;
 world.lighting.actorShadowRange=farActorShadows&&!settings.forceActorShadowRange?Infinity:settings.actorShadowRange??32;
 const map=world.lighting.shadows?.getShadowMap?.();if(map)map.refreshRate=settings.shadowRefresh??1;world.scene.shadowsEnabled=!!world.lighting.shadowsActive&&settings.shadows;
};
const results=[];
for(const character of ['warrior-plains','warrior-v3']){
 if(character!=='warrior-plains')replaceWorldMap(world,character);const p=place();
 await loadStreamedVillage(world,services);await tick();readyRaw();
 // Skinned actors around the player at 6/14/24/40 m (stand-ins for wolves and residents).
 const horses=[];for(const [d,a] of [[6,0],[14,1.6],[24,3.2],[40,4.6]]){const x=p.x+Math.cos(a)*d,z=p.z+Math.sin(a)*d;const h=createWagonHorse({scene,heightAt:(x,z)=>world.terrain.heightAt(x,z),wagon:{x,y:world.terrain.heightAt(x,z),z},shadows:world.shadows,mounted:false});await h.ready;h.play('Horse_Idle');horses.push(h);}
 readyRaw();
 for(let level=0;level<ADAPTIVE_LEVELS.length;level++){
  apply(ADAPTIVE_LEVELS[level]);
  for(let i=0;i<4;i++){world.lighting.follow(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z),true);world.villageVisibility.timer=0;world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),.1);scene.render();readyRaw();}
  let total=0,active=0,casters=0;const frames=8;const t=performance.now();
  for(let i=0;i<frames;i++){draws=0;world.lighting.follow(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z));world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),1/60);scene.render();total+=draws;active+=scene.getActiveMeshes().length;}
  const ms=(performance.now()-t)/frames;
  results.push({map:world.mapId,plains:!!world.plains,horses:horses.filter(h=>h.root).length,level,drawsPerFrame:+(total/frames).toFixed(1),activeMeshes:Math.round(active/frames),renderMs:+ms.toFixed(2),shadows:scene.shadowsEnabled});
  say(JSON.stringify(results.at(-1)));
 }
 for(const h of horses)h.dispose();
 await world.releaseEnvironment();await tick();
}
engine.dispose();
