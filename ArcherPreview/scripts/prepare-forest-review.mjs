import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readRuntimeGltf} from '../tests/helpers/read-runtime-gltf.js';
import {createMonsterForestTerrain} from '../src/monster-forest-terrain.js';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets'),out=resolve(root,'reports/monster-forest-v4');
const manifest=JSON.parse(await readFile(resolve(assets,'monster-forest.json'),'utf8'));
for(const [id,a]of Object.entries(manifest.assets)){
 const folder=resolve(out,id);await mkdir(folder,{recursive:true});
 const {gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(assets,a.lods[1].model)));
 for(const b of g.buffers)if(b.uri)await writeFile(resolve(folder,b.uri),files.get(b.uri).data);
 for(const [i,im]of g.images.entries()){
  const source=resolve(assets,'content',im.uri),name='color-'+i+'.png';
  const result=spawnSync('C:/Program Files/KTX-Software/bin/ktx.exe',['extract','--transcode','rgba8','--level','0',source,resolve(folder,name)],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(result.stderr);
  im.uri=name;im.mimeType='image/png';
 }
 for(const t of g.textures){t.source=t.extensions.KHR_texture_basisu.source;delete t.extensions;}
 for(const k of ['extensionsUsed','extensionsRequired'])g[k]=g[k].filter(n=>!['KHR_texture_basisu','EXT_meshopt_compression'].includes(n));
 await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const terrain=createMonsterForestTerrain();
await writeFile(resolve(out,'review-scene.json'),JSON.stringify({assets:manifest.assets,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)}}));
console.log(JSON.stringify({offlineReviewMeshes:10,browserAutomation:false}));
