// CPU/lifetime evidence only. Does not launch a browser or measure device GPU/FPS.
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {NullEngine,PBRMaterial,Logger} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';

Logger.LogLevels=Logger.NoneLogLevel;
const output=resolve(process.argv[2]??'reports/optimization-verification/current.json');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const digest=terrain=>createHash('sha256').update(new Uint8Array(terrain.heights.buffer,terrain.heights.byteOffset,terrain.heights.byteLength)).digest('hex');
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],valuesMs:values};};
const engine=new NullEngine({renderWidth:1560,renderHeight:720});
const times={},hashes={},counts=[],transitions=[];
const started=performance.now(),world=createWorld(engine,{village:true,touchDevice:true});
const firstVillageMs=performance.now()-started;
const identity={scene:world.scene,camera:world.camera,terrain:world.terrain};
world.camera.alpha=2.4;world.camera.beta=1.1;world.camera.radius=17;
try{
 for(let round=0;round<9;round++)for(const character of ['warrior-v4','warrior-v5','warrior-v3']){
  const t=performance.now();replaceWorldMap(world,character);const elapsed=performance.now()-t;
  await pause();world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
  const hash=digest(world.terrain);
  if(hashes[character]&&hashes[character]!==hash)throw new Error('Terrain changed on revisit');hashes[character]=hash;
  if(world.scene!==identity.scene||world.camera!==identity.camera||world.terrain!==identity.terrain||world.camera.alpha!==2.4||world.camera.beta!==1.1||world.camera.radius!==17)throw new Error('Travel identity/camera changed');
  if(round)(times[character]??=[]).push(elapsed);
  transitions.push({round,character,elapsedMs:elapsed});
  counts.push({round,character,meshes:world.scene.meshes.length,materials:world.scene.materials.length,textures:world.scene.textures.length,geometries:world.scene.geometries.length,beforeRenderObservers:world.scene.onBeforeRenderObservable.observers.length,materialAddedObservers:world.scene.onNewMaterialAddedObservable.observers.length,materialRemovedObservers:world.scene.onMaterialRemovedObservable.observers.length});
 }
 replaceWorldMap(world,'warrior-v5');await pause();world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
 let deadMaterialVisits=0;const dead=new WeakSet();
 for(const immediateDisposal of [false,true]){
  const batch=Array.from({length:128},(_,i)=>{
   const material=new PBRMaterial('lifetime-probe-'+i,world.scene),original=material.getClassName.bind(material);
   material.getClassName=()=>{if(dead.has(material))deadMaterialVisits++;return original();};
   return material;
  });
  if(!immediateDisposal)await pause();
  for(const material of batch){material.dispose();dead.add(material);}await pause();
 }
 deadMaterialVisits=0;
 for(let frame=0;frame<30;frame++)world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
 const lifetime={disposedMaterials:256,frames:30,deadMaterialVisits,style:world.caveAtmosphere?.inspect?.()??null};
 let terrainCache=null;
 if(existsSync(new URL('../src/map-terrain-cache.js',import.meta.url))){const {inspectMapTerrainCache}=await import('../src/map-terrain-cache.js');terrainCache=inspectMapTerrainCache(engine);}
 const report={version:1,createdAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),resourceRevision:JSON.parse(readFileSync(new URL('../public/assets/resource-index.json',import.meta.url),'utf8')).revision,environment:{node:process.version,platform:process.platform,render:'Babylon NullEngine 1560x720, mobile policy',browserAutomation:false,physicalS23:false,limits:'CPU map construction and object references only; no GPU/thermal/FPS measurement; streaming downloads/models are tested separately'},firstVillageMs,terrainHashes:hashes,warmMapReplacement:Object.fromEntries(Object.entries(times).map(([key,values])=>[key,stats(values)])),transitions,sceneCounts:counts,lifetime,terrainCache};
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output,firstVillageMs,warmMapReplacement:report.warmMapReplacement,lifetime,terrainCache},null,2));
}finally{world.caveAtmosphere?.dispose();engine.dispose();}
