import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets'),out=resolve(root,'reports/witch-cave-v5');
const partial=process.argv.includes('--partial'),bases=new Map();let manifest;
if(partial){
 const source=resolve(process.env.CAVE_SOURCE??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/witch-cave-models/2026-10-29');manifest={assets:{}};
 for(const name of await readdir(resolve(source,'runtime/assets'))){
  const a=JSON.parse(await readFile(resolve(source,'runtime/assets',name),'utf8')),b=a.lods[0].bounds,bounds=[b[1][0]-b[0][0],b[1][2]-b[0][2],b[1][1]-b[0][1]];
  manifest.assets[a.id]={...a,bounds,height:bounds[1]};bases.set(a.id,resolve(source,'runtime'));
 }
 const {CAVE_PLACEMENTS}=await import('../src/witch-cave-layout.js');
 for(const name of ['village','monster-forest']){const old=JSON.parse(await readFile(resolve(assets,name+'.json'),'utf8'));for(const id of new Set(CAVE_PLACEMENTS.map(p=>p.asset)))if(old.assets[id])manifest.assets[id]=old.assets[id];}
}else manifest=JSON.parse(await readFile(resolve(assets,'witch-cave.json'),'utf8'));
for(const [id,a]of Object.entries(manifest.assets)){
 const folder=resolve(out,id);await mkdir(folder,{recursive:true});
 const base=bases.get(id)??assets;
 const {gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(base,a.lods[1].model)));
 for(const b of g.buffers)if(b.uri)await writeFile(resolve(folder,b.uri),files.get(b.uri).data);
 for(const [i,im]of g.images.entries()){
  const source=resolve(base,'content',im.uri),name='color-'+i+'.png';
  const result=spawnSync('C:/Program Files/KTX-Software/bin/ktx.exe',['extract','--transcode','rgba8','--level','0',source,resolve(folder,name)],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr);
  im.uri=name;im.mimeType='image/png';
 }
 for(const t of g.textures){t.source=t.extensions.KHR_texture_basisu.source;delete t.extensions;}
 for(const k of ['extensionsUsed','extensionsRequired'])g[k]=g[k].filter(n=>!['KHR_texture_basisu','EXT_meshopt_compression'].includes(n));
 await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const terrain=createWitchCaveTerrain();
await writeFile(resolve(out,'review-scene.json'),JSON.stringify({assets:manifest.assets,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)}}));
console.log(JSON.stringify({offlineReviewMeshes:Object.keys(manifest.assets).length,partial,browserAutomation:false}));
