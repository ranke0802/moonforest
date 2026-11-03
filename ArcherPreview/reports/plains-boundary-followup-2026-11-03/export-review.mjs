// Offline geometric/texture review only. Does not run the game or build assets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {createVillageTransform} from '../../src/village-environment.js';
import {createVillageTerrain} from '../../src/village-terrain.js';
import {createMonsterForestTerrain} from '../../src/monster-forest-terrain.js';
import {createGreatPlainsTerrain} from '../../src/great-plains-terrain.js';
import {VILLAGE_PLACEMENTS} from '../../src/village-layout.js';
import {FOREST_PLACEMENTS} from '../../src/monster-forest-layout.js';
import {PLAINS_PLACEMENTS} from '../../src/great-plains-layout.js';
import {TerrainHeightField} from '../../src/terrain.js';
import {createTerrainGround} from '../../src/terrain-mesh.js';
import {villageOutskirtsSkirtHeight} from '../../src/village-outskirts-skirt.js';
import {makeBoundaryCases} from './boundary-cases.mjs';

const repo=resolve(import.meta.dirname,'../..'),assets=resolve(repo,'public/assets'),out=resolve(import.meta.dirname,'review-data'),stage=process.argv.includes('--baseline')?'baseline':'current',lod=Number(process.argv.find(x=>x.startsWith('--lod='))?.slice(6)??2),beta=Number(process.argv.find(x=>x.startsWith('--beta='))?.slice(7)??1.35),profile=beta===.88?'reset-default':'low-orbit';
if(![0,1,2].includes(lod))throw Error('LOD must be0/1/2');
const json=async p=>JSON.parse(await readFile(p,'utf8')),snapshot=await json(resolve(import.meta.dirname,'baseline-summary.json')),maps=['village','great-plains','monster-forest'];
const currentTerrains={village:createVillageTerrain(),'great-plains':createGreatPlainsTerrain(),'monster-forest':createMonsterForestTerrain()},terrains={};
const layouts=stage==='baseline'?await json(resolve(import.meta.dirname,'baseline-layouts.json')):{village:VILLAGE_PLACEMENTS,'great-plains':PLAINS_PLACEMENTS,'monster-forest':FOREST_PLACEMENTS};
const sidecarPath=resolve(assets,'village-plains-outskirts.json'),sidecar=stage==='current'&&existsSync(sidecarPath)?await json(sidecarPath):null;
if(sidecar)layouts.village=[...layouts.village,...sidecar.placements];
const ktx=process.env.KTX_EXE??'C:/Program Files/KTX-Software/bin/ktx.exe',manifest={},grounds={},configs={},folders={};await mkdir(out,{recursive:true});
function transcode(source,target){if(existsSync(target))return;const r=spawnSync(ktx,['extract','--transcode','rgba8','--level','0',source,target],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('KTX conversion failed: '+source+' '+r.stderr?.slice(-500));}
for(const map of maps){
 const base=stage==='baseline'?resolve(import.meta.dirname,'baseline/public/assets'):assets;
 manifest[map]=await json(resolve(base,map+'.json'));if(map==='village'&&sidecar)manifest[map].assets={...manifest[map].assets,...sidecar.assets};const paint=await json(resolve(base,map+'-ground.json'));
 const texture=resolve(out,'textures',paint.color.url.split('/').at(-1)+'.png');await mkdir(dirname(texture),{recursive:true});transcode(resolve(assets,paint.color.url),texture);grounds[map]={path:texture,span:paint.span};
 if(stage==='baseline'){const t=snapshot.terrains[map],bytes=await readFile(resolve(import.meta.dirname,t.file)),copy=new Float32Array(bytes.length/4);for(let i=0;i<copy.length;i++)copy[i]=bytes.readFloatLE(i*4);const terrain=new TerrainHeightField({size:t.size,subdivisions:t.subdivisions,height:()=>0});terrain.heights=copy;terrains[map]=terrain;}else terrains[map]=currentTerrains[map];
 for(const p of layouts[map]){const c=manifest[map].assets[p.asset];if(!c)throw Error('Missing asset '+map+'/'+p.asset);configs[map+'/'+p.asset]=c;}
}
for(const[key,config]of Object.entries(configs)){
 const configLod=config.lods.find(x=>x.level===lod)??config.lods.at(-1),model=resolve(assets,configLod.model),folder=resolve(out,'decoded',lod+'-'+configLod.model.split('/').at(-1));folders[key]=folder;
 if(existsSync(resolve(folder,'review.gltf')))continue;
 await mkdir(folder,{recursive:true});const{gltf:g,files}=await readRuntimeGltf(pathToFileURL(model));
 for(const b of g.buffers??[])if(b.uri){const target=resolve(folder,b.uri);await mkdir(dirname(target),{recursive:true});await writeFile(target,files.get(b.uri).data);}
 for(const im of g.images??[]){if(!im.uri)throw Error('Embedded image export not implemented');const source=resolve(dirname(model),im.uri);if(!im.uri.endsWith('.ktx2')){im.uri=source.replaceAll('\\','/');continue;}const png=resolve(out,'textures',im.uri.split('/').at(-1)+'.png');transcode(source,png);im.uri=png.replaceAll('\\','/');im.mimeType='image/png';}
 for(const t of g.textures??[])for(const key of['KHR_texture_basisu','EXT_texture_webp'])if(t.extensions?.[key]){t.source=t.extensions[key].source;delete t.extensions[key];}
 for(const key of['extensionsUsed','extensionsRequired'])g[key]=(g[key]??[]).filter(x=>!['KHR_texture_basisu','EXT_texture_webp','EXT_meshopt_compression'].includes(x));await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;const placed={},terrainData={};
try{for(const map of maps){const world={scene,terrain:terrains[map]};placed[map]=layouts[map].map(p=>{const key=map+'/'+p.asset,{root,facing}=createVillageTransform(world,p,configs[key]);root.computeWorldMatrix(true);facing.computeWorldMatrix(true);const matrix=Array.from(facing.getWorldMatrix().m);root.dispose();return {id:p.id,key,matrix,background:!!p.background,sourcePlacement:p.sourcePlacement??null};});
 const ground=createTerrainGround(scene,world.terrain,{borderExtension:map==='great-plains'?310:105,borderHeight:stage==='current'&&map==='village'?villageOutskirtsSkirtHeight:null});
 terrainData[map]={size:world.terrain.size,n:world.terrain.subdivisions,heights:Array.from(world.terrain.heights),positions:Array.from(ground.getVerticesData(VertexBuffer.PositionKind)),normals:Array.from(ground.getVerticesData(VertexBuffer.NormalKind)),indices:Array.from(ground.getIndices()),uvs:Array.from(ground.getVerticesData(VertexBuffer.UVKind)),productionBorderExtension:map==='great-plains'?310:105,villageOutskirtsSkirt:stage==='current'&&map==='village'};ground.dispose();
}}finally{scene.dispose();engine.dispose();}
const cases=makeBoundaryCases(terrains,{beta}),result={stage,profile,lod,configs,folders,grounds,terrains:terrainData,placements:placed,sidecar:sidecar?{path:sidecarPath,placements:sidecar.placements.length,source:sidecar.source}:null,...cases,limitations:['All selected placements are exported; native visibility/LOD policy, outline, dither, toon, shadows, sky and fog are not reproduced.','LOD is fixed explicitly, not selected by the native frame.','The current village sidecar is included when its manifest exists. This does not include world-level mountains/sky/stream/sign labels outside the placement contract.','Production createTerrainGround positions/indices/UV/normals and outer-ring extension are included, including the current town-only lowered far skirt.','Reproducible first-trigger canonical camera, not a recorded player session or a native gameplay screenshot.']};
const destination=resolve(out,stage+'-'+profile+'-lod'+lod+'.json');await writeFile(destination,JSON.stringify(result));console.log(JSON.stringify({stage,profile,lod,destination,assetConfigurations:Object.keys(configs).length,placements:Object.fromEntries(maps.map(m=>[m,placed[m].length])),cameraCases:cases.cases.length,browserAutomation:false}));
