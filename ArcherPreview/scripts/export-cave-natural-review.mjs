import {sourcePath, projectPath, toolPath} from '../../Sources/resolve-source.mjs';
// Snapshot current authored geometry for the offline Blender review. Does not
// change any game asset, runtime scene, or rendered-quality setting.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
import {CAVE_PLACEMENTS,CAVE_POOLS,caveRoofHeight} from '../src/witch-cave-layout.js';
import {CAVE_LABORATORY_GEOMETRY,clipLaboratoryCeiling} from '../src/cave-laboratory-geometry.js';
import {appendLaboratoryVault} from '../src/cave-laboratory-vault.js';

const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets');
const out=resolve(process.env.CAVE_NATURAL_REVIEW_OUT??projectPath("ArcherPreview/reports/archive/cave-natural-review/2026-11-03"));
const old=resolve(root,'reports/witch-cave-v5'),manifest=JSON.parse(await readFile(resolve(assets,'witch-cave.json'),'utf8'));
const previous=JSON.parse(await readFile(resolve(old,'review-scene.json'),'utf8'));await mkdir(out,{recursive:true});
const folders={};
for(const [id,a]of Object.entries(manifest.assets)){
 const oldFolder=resolve(old,id),oldModel=previous.assets[id]?.lods?.[1]?.model;
 if(oldModel===a.lods[1]?.model&&existsSync(resolve(oldFolder,'review.gltf'))){folders[id]=oldFolder;continue;}
 const folder=resolve(out,'decoded',id);await mkdir(folder,{recursive:true});
 const {gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(assets,a.lods[1].model)));
 for(const b of g.buffers??[])if(b.uri){const dest=resolve(folder,b.uri);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,files.get(b.uri).data);}
 for(const [i,im]of (g.images??[]).entries()){
  const filename=`color-${i}.png`,source=resolve(assets,'content',im.uri);
  const r=spawnSync(toolPath('ktx'),['extract','--transcode','rgba8','--level','0',source,resolve(folder,filename)],{encoding:'utf8',windowsHide:true});
  if(r.status!==0)throw Error(`Texture decode ${id}: ${r.stderr}`);im.uri=filename;im.mimeType='image/png';
 }
 for(const t of g.textures??[])if(t.extensions?.KHR_texture_basisu){t.source=t.extensions.KHR_texture_basisu.source;delete t.extensions.KHR_texture_basisu;}
 for(const key of ['extensionsUsed','extensionsRequired'])g[key]=(g[key]??[]).filter(n=>!['KHR_texture_basisu','EXT_meshopt_compression'].includes(n));
 await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));folders[id]=folder;
}
const terrain=createWitchCaveTerrain();
const placements=CAVE_PLACEMENTS.map(p=>{const config=manifest.assets[p.asset];let y=terrain.heightAt(p.x,p.z);if(['wall','fence'].includes(p.kind)){const half=(p.length??p.footprint?.[0]??2)*.5,dx=Math.cos(p.yaw)*half,dz=-Math.sin(p.yaw)*half;y=Math.min(y,terrain.heightAt(p.x+dx,p.z+dz),terrain.heightAt(p.x-dx,p.z-dz));}return {...p,rootY:(p.elevation??(p.topElevation!==undefined?p.topElevation-config.height*p.scale:y))-.025+(p.yOffset??0)};});
const positions=[],indices=[],segments=64,rings=12;
for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
 const angle=i/segments*Math.PI*2,x=Math.cos(angle)*ring*6,z=Math.sin(angle)*ring*6;positions.push(x,caveRoofHeight(x,z)+.6*Math.sin(x*.24)*Math.cos(z*.19),z);
 if(ring&&i){const at=ring*(segments+1)+i;indices.push(at,at-1,at-segments-2);if(ring>1)indices.push(at,at-segments-2,at-segments-1);}
}
const edge=positions.length/3;for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.cos(a)*180,-28,Math.sin(a)*180);if(i){const prev=rings*(segments+1)+i;indices.push(prev,edge+i-1,edge+i,prev,prev-1,edge+i-1);}}
const roof=appendLaboratoryVault(clipLaboratoryCeiling({positions,indices},CAVE_LABORATORY_GEOMETRY),CAVE_LABORATORY_GEOMETRY);
const data={assets:manifest.assets,folders,placements,pools:CAVE_POOLS,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)},roof:{positions:Array.from(roof.positions),indices:Array.from(roof.indices)},laboratory:CAVE_LABORATORY_GEOMETRY};
await writeFile(resolve(out,'scene-snapshot.json'),JSON.stringify(data));
await copyFile(resolve(old,'cave-ground.png'),resolve(out,'cave-ground.png'));
console.log(JSON.stringify({out,placements:placements.length,assets:Object.keys(folders).length,browserAutomation:false,lighting:'Blender approximation, not Babylon GPU'}));
