// Offline composition review only. Never changes game assets or manifests.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readRuntimeGltf} from '../../tests/helpers/read-runtime-gltf.js';
import {createGreatPlainsTerrain} from '../../src/great-plains-terrain.js';
import {PLAINS_PLACEMENTS,PLAINS_ROUTES,PLAINS_STREAM} from '../../src/great-plains-layout.js';
import {CHAPTER_POINTS} from '../../src/chapter-quest-points.js';
const out=import.meta.dirname,root=resolve(out,'../..'),assets=resolve(root,'public/assets');
await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(assets,'great-plains.json'),'utf8'));
const extract=(source,target)=>{const result=spawnSync('C:/Program Files/KTX-Software/bin/ktx.exe',['extract','--transcode','rgba8','--level','0',source,target],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr);};
for(const [id,a]of Object.entries(manifest.assets)){
 const folder=resolve(out,'models',id);try{await access(resolve(folder,'review.gltf'));continue;}catch{}
 await mkdir(folder,{recursive:true});
 const lod=a.lods.find(v=>v.level===1)??a.lods[0];
 const {gltf:g,files}=await readRuntimeGltf(pathToFileURL(resolve(assets,lod.model)));
 for(const b of g.buffers)if(b.uri)await writeFile(resolve(folder,b.uri),files.get(b.uri).data);
 for(const [i,im]of (g.images??[]).entries()){
  const source=resolve(assets,'content',im.uri),name='color-'+i+'.png';
  if(im.uri.endsWith('.ktx2'))extract(source,resolve(folder,name));
  else await writeFile(resolve(folder,name),await readFile(source));
  im.uri=name;im.mimeType='image/png';
 }
 for(const t of g.textures??[])if(t.extensions?.KHR_texture_basisu){t.source=t.extensions.KHR_texture_basisu.source;delete t.extensions.KHR_texture_basisu;}
 for(const k of ['extensionsUsed','extensionsRequired'])if(g[k])g[k]=g[k].filter(n=>!['KHR_texture_basisu','EXT_meshopt_compression'].includes(n));
 await writeFile(resolve(folder,'review.gltf'),JSON.stringify(g));
}
const ground=JSON.parse(await readFile(resolve(assets,'great-plains-ground.json'),'utf8'));
try{await access(resolve(out,'ground.png'));}catch{extract(resolve(assets,ground.color.url),resolve(out,'ground.png'));}
const terrain=createGreatPlainsTerrain();
await writeFile(resolve(out,'review-scene.json'),JSON.stringify({assets:manifest.assets,terrain:{size:terrain.size,subdivisions:terrain.subdivisions,heights:Array.from(terrain.heights)}}));
await writeFile(resolve(out,'current-layout.json'),JSON.stringify({placements:PLAINS_PLACEMENTS,routes:PLAINS_ROUTES,stream:PLAINS_STREAM,chests:CHAPTER_POINTS.filter(p=>p.map==='great-plains'&&p.model==='chest-common')}));
console.log(JSON.stringify({models:Object.keys(manifest.assets).length,placements:PLAINS_PLACEMENTS.length,browserAutomation:false}));
