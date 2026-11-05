import {sourcePath, projectPath, toolPath} from '../../Sources/resolve-source.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {VILLAGE_PLACEMENTS} from '../src/village-layout.js';
import {createVillageTerrain} from '../src/village-terrain.js';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {createGreatPlainsTerrain} from '../src/great-plains-terrain.js';
import {villageToPlains,VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets'),report=resolve(root,'reports/boundary-continuity-2026-11-03'),out=projectPath("ArcherPreview/reports/archive/boundary-continuity/2026-11-03");
await mkdir(out,{recursive:true});const read=async p=>JSON.parse(await readFile(p,'utf8'));
const before=await read(resolve(report,'before.json')),village=await read(resolve(assets,'village.json')),plains=await read(resolve(assets,'great-plains.json')),selection=await read(resolve(report,'village-exterior.json'));
const ktx=toolPath('ktx'),configs={beforeFacade:before.plainsManifest.assets['village-approach'],afterFacade:plains.assets['village-approach']};
for(const p of VILLAGE_PLACEMENTS.filter(p=>selection.selected.includes(p.id)||p.kind==='tree'))configs[p.asset]=village.assets[p.asset];
for(const[id,config]of Object.entries(plains.assets))configs[id]=config;
const folders={};
for(const [id,config]of Object.entries(configs)){
 const folder=resolve(out,'decoded',id);await mkdir(folder,{recursive:true});folders[id]=folder;
 const {gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(assets,config.lods.at(-1).model)));
 for(const b of g.buffers??[])if(b.uri){const target=resolve(folder,b.uri);await mkdir(dirname(target),{recursive:true});await writeFile(target,files.get(b.uri).data);}
 for(const [i,im]of(g.images??[]).entries()){
  const source=resolve(assets,'content',im.uri),png=resolve(out,'textures',im.uri+'.png');await mkdir(dirname(png),{recursive:true});
  if(!im.uri.endsWith('.ktx2')){im.uri=source.replaceAll('\\','/');continue;}
  if(!existsSync(png)){const r=spawnSync(ktx,['extract','--transcode','rgba8','--level','0',source,png],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);}
  im.uri=png.replaceAll('\\','/');im.mimeType='image/png';
 }
 for(const t of g.textures??[])for(const key of['KHR_texture_basisu','EXT_texture_webp'])if(t.extensions?.[key]){t.source=t.extensions[key].source;delete t.extensions[key];}
 for(const key of['extensionsUsed','extensionsRequired'])g[key]=(g[key]??[]).filter(n=>!['KHR_texture_basisu','EXT_texture_webp','EXT_meshopt_compression'].includes(n));
 await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const grounds={};for(const[id,config]of Object.entries({beforeVillage:before.villageGround,beforePlains:before.plainsGround,afterVillage:await read(resolve(assets,'village-ground.json')),afterPlains:await read(resolve(assets,'great-plains-ground.json'))})){
 const png=resolve(out,id+'.png'),r=spawnSync(ktx,['extract','--transcode','rgba8','--level','0',resolve(assets,config.color.url),png],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);grounds[id]={path:png,span:config.span};
}
const villageTerrain=createVillageTerrain(),plainsTerrain=createGreatPlainsTerrain();
const placed=(p,config,terrain)=>{let y=terrain.heightAt(p.x,p.z);if(['wall','fence'].includes(p.kind)){const half=(p.length??p.footprint?.[0]??2)*.5,dx=Math.cos(p.yaw)*half,dz=-Math.sin(p.yaw)*half;y=Math.min(y,terrain.heightAt(p.x+dx,p.z+dz),terrain.heightAt(p.x-dx,p.z-dz));}return{...p,rootY:(p.elevation??(p.topElevation!==undefined?p.topElevation-config.height*p.scale:y))-.025+(p.yOffset??0)};};
const oldFacade=before.plainsPlacements.find(p=>p.id==='village-exterior'),newFacade=PLAINS_PLACEMENTS.find(p=>p.id==='village-exterior');
const data={out,configs,folders,grounds,villageTerrain:{size:villageTerrain.size,n:villageTerrain.subdivisions,heights:Array.from(villageTerrain.heights)},plainsTerrain:{size:plainsTerrain.size,n:plainsTerrain.subdivisions,heights:Array.from(plainsTerrain.heights)},beforePlains:[placed({...oldFacade,asset:'beforeFacade'},configs.beforeFacade,plainsTerrain),...before.plainsPlacements.filter(p=>p.composition==='village-arrival').map(p=>placed(p,configs[p.asset],plainsTerrain))],afterPlains:[placed({...newFacade,asset:'afterFacade'},configs.afterFacade,plainsTerrain),...PLAINS_PLACEMENTS.filter(p=>p.villageBoundary).map(p=>placed(p,configs[p.asset],plainsTerrain))],actualVillage:VILLAGE_PLACEMENTS.filter(p=>selection.selected.includes(p.id)||p.kind==='tree'&&p.z>30&&Math.abs(p.x)<45).map(p=>placed(p,configs[p.asset],villageTerrain)),camera:{village:[.35,90,8],villageTarget:[.35,40,3]}};
Object.assign(data.camera,{villageOverview:[.35,62,72],villageOverviewTarget:[.35,62,0]});
data.plainsScenery=PLAINS_PLACEMENTS.map(p=>placed(p,configs[p.asset],plainsTerrain));Object.assign(data.camera,{plainsLandscape:[34,54,15],plainsLandscapeTarget:[-25,-13,4]});
data.boundaryYaw=VILLAGE_PLAINS_BOUNDARY.yaw;
for(const name of['village','villageTarget','villageOverview','villageOverviewTarget']){const[x,z,y]=data.camera[name],p=villageToPlains({x,z});data.camera[name.replace('village','plains')]=[p.x,p.z,y];}
await writeFile(resolve(out,'scene.json'),JSON.stringify(data));console.log(JSON.stringify({out,assets:Object.keys(configs).length,actualVillage:data.actualVillage.length,matchingTrees:PLAINS_PLACEMENTS.filter(p=>p.villageBoundary).length,browserAutomation:false}));
