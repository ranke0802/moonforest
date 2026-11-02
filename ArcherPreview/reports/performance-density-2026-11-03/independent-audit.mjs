import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {PLAINS_PLACEMENTS,PLAINS_TREASURE_ANCHORS,PLAINS_SPAWN,PLAINS_RADIUS,plainsObstacles} from '../../src/great-plains-layout.js';
import {FOREST_PLACEMENTS} from '../../src/monster-forest-layout.js';
import {VILLAGE_PLACEMENTS} from '../../src/village-layout.js';
import {CHAPTER_POINTS} from '../../src/chapter-quest-points.js';
import {VillageNavigation} from '../../src/village-navigation.js';
import {greatPlainsHeight} from '../../src/great-plains-terrain.js';
import {placementBounds,villageDemand} from '../../src/village-demand.js';
import {hasVillageGeometry} from '../../src/village-lod.js';
import {villageRenderRange} from '../../src/village-policy.js';
const base=execFileSync('git',['show','01fa3ba:ArcherPreview/src/great-plains-layout.js'],{encoding:'utf8'}).replace("'./village-ground-layout.js'",JSON.stringify(new URL('../../src/village-ground-layout.js',import.meta.url).href));
const old=await import('data:text/javascript;base64,'+Buffer.from(base).toString('base64'));
const manifest=JSON.parse(fs.readFileSync('public/assets/great-plains.json','utf8'));
const previousManifest=JSON.parse(execFileSync('git',['show','01fa3ba:ArcherPreview/public/assets/great-plains.json'],{encoding:'utf8'}));
const nav=new VillageNavigation(plainsObstacles()),step=1,n=213,origin=-106,radius=.35,reachable=new Uint8Array(n*n),queue=new Int32Array(n*n);
let head=0,tail=0;const index=(x,z)=>(z-origin)*n+(x-origin),inside=(x,z)=>x>=origin&&z>=origin&&x<=106&&z<=106;
const sx=Math.round(PLAINS_SPAWN.x),sz=Math.round(PLAINS_SPAWN.z);queue[tail++]=index(sx,sz);reachable[index(sx,sz)]=1;
while(head<tail){const i=queue[head++],x=i%n+origin,z=Math.floor(i/n)+origin;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz;if(!inside(xx,zz))continue;const j=index(xx,zz);if(reachable[j]||!nav.free({x:xx,z:zz},radius,PLAINS_RADIUS)||!nav.segmentClear({x,z},{x:xx,z:zz},radius))continue;reachable[j]=1;queue[tail++]=j;}}
const treasures=CHAPTER_POINTS.filter(p=>p.map==='great-plains'&&p.key?.startsWith('chest:')).map(p=>{
 const actual=nav.findFree(p,.2,105);let best=null;
 for(let x=Math.ceil(actual.x-3);x<=actual.x+3;x++)for(let z=Math.ceil(actual.z-3);z<=actual.z+3;z++){
  if(!inside(x,z)||!reachable[index(x,z)])continue;const d=Math.hypot(x-actual.x,z-actual.z);
  if(d<3&&nav.segmentClear({x,z},actual,.05)&&(!best||d<best.distance))best={x,z,distance:d};
 }
 const near=CHAPTER_POINTS.filter(q=>q!==p&&q.map===p.map&&Math.hypot(q.x-p.x,q.z-p.z)<3).map(q=>q.id);
 return {id:p.id,tier:p.tier,original:{x:p.x,z:p.z},runtime:actual,displacement:Math.hypot(p.x-actual.x,p.z-actual.z),reachableGridPoint:best,otherPointsWithin3m:near};
});
const engine=new NullEngine({renderWidth:1280,renderHeight:720,textureSize:512}),scene=new Scene(engine),camera=new FreeCamera('audit',new Vector3(),scene);camera.minZ=.1;camera.maxZ=300;camera.fov=.8;scene.activeCamera=camera;
const terrain={heightAt:greatPlainsHeight};
const makeRecords=(placements,config)=>placements.map(placement=>({placement,bounds:placementBounds({terrain},placement,config.assets[placement.asset])}));
const oldRecords=makeRecords(old.PLAINS_PLACEMENTS,previousManifest),newRecords=makeRecords(PLAINS_PLACEMENTS,manifest);
const cameraViews=[['village-gate',[-87,-32],[0,1]],['junction',[-5,25],[.7,-.7]],['lookout',[-26,-19],[1,0]],['forest-edge',[61,-58],[.4,-.9]]];
const scenarios=[];
for(const touch of [false,true])for(const [name,[x,z],[dx,dz]]of cameraViews){
 const y=greatPlainsHeight(x,z);camera.position.set(x-dx*16,y+15,z-dz*16);camera.setTarget(new Vector3(x+dx*12,y,z+dz*12));camera.getViewMatrix(true);camera.getProjectionMatrix(true);
 const world={camera,terrain,touchDevice:touch,plains:true,villageOverview:false};
 const measure=(records,assets)=>{for(let i=0;i<4;i++)villageDemand(world,records);const times=[];let result;for(let i=0;i<12;i++){const start=performance.now();result=villageDemand(world,records);times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {demandEntries:result.length,uniqueAssetTypes:new Set(result.map(r=>r.id)).size,roughUncachedBytes:result.reduce((s,r)=>s+(assets.assets[r.id].lods.find(l=>l.level===r.level)?.bytes??0),0),exteriorDemand:result.filter(r=>r.id==='village-approach').map(r=>r.level),medianMs:times[6]};};
 scenarios.push({touch,view:name,before:measure(oldRecords,previousManifest),after:measure(newRecords,manifest)});
}
const exterior=manifest.assets['village-approach'],model=JSON.parse(fs.readFileSync('public/assets/'+exterior.lods[0].model.replace(/^\.\//,''),'utf8'));
const geometry={lods:exterior.lods.map(({level,model,triangles,textureSize})=>({level,model,triangles,textureSize})),primitives:model.meshes.reduce((n,m)=>n+m.primitives.length,0),nativeMeshCount:model.meshes.length,sharedModel:new Set(exterior.lods.map(l=>l.model)).size===1,reuseCheck:hasVillageGeometry({tiers:new Map([[2,{}]]),levels:exterior.lods},0)};
const files=['src/great-plains-layout.js','src/chapter-quest-points.js','src/chapter-quest.js','src/chapter-quest-props.js','src/world.js','src/village-demand.js','public/assets/great-plains.json'];
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const output={timestamp:new Date().toISOString(),baseline:'01fa3ba',hashes,counts:{baseline:oldRecords.length,plains:newRecords.length,village:VILLAGE_PLACEMENTS.length,forest:FOREST_PLACEMENTS.length,reachableGridPoints:tail},treasures,scenarios,geometry,renderRange:{desktop:villageRenderRange(false),mobile:villageRenderRange(true)},method:'1m grid BFS plus swept segment; radius .35, interaction <3m and LOS radius .05. Demand: Babylon NullEngine artificial 1280x720 camera, no models loaded; timings are local JS CPU warm sample medians and not FPS/GPU benchmarks.',limitations:'No browser, actual mesh rendering, quest unlock states, concurrent prop updates, real device or FPS measurement. A negative grid result may reflect resolution.'};
fs.writeFileSync('reports/performance-density-2026-11-03/independent-audit.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));scene.dispose();engine.dispose();
