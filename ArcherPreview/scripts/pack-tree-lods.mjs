// Native, distance-selected geometry with atlas color baked before reduction.
// Full-detail source geometry, textures and transforms remain untouched.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { simplifyGeometry } from './web-geometry.js';
import { bakePaintedColors } from './tree-painted-colors.mjs';
const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets');
const manifest=JSON.parse(await readFile(resolve(base,'environment.json'),'utf8')),report=[];
for(const key of ['verdant-tree','oak-tree']){
 const config=manifest.assets[key],source=JSON.parse(await readFile(resolve(base,config.model),'utf8')),files=new Map();
 for(const item of [...source.buffers,...source.images])files.set(item.uri,{data:await readFile(resolve(base,'content',item.uri))});
 const painted=await bakePaintedColors(source,files);
 config.lods=[];
 for(const [level,distance,ratio,error] of [['near',5,.25,.004],['mid',11,.09,.01],['distant',17,.018,.04],['background',28,.006,.075]]){
  const result=await simplifyGeometry(painted.gltf,painted.files,()=>({ratio,error,paintedColors:true}));
  for(const [name,{data}] of result.files)await writeFile(resolve(base,'content',name),data);
  config.lods.push({distance,material:distance>=17?'painted-vertex-lit':'painted-vertex-color',model:'./content/'+result.model,resources:[...result.files.keys()].map(n=>'./content/'+n)});
  report.push({key,level,distance,primitives:result.stats});
  console.log(JSON.stringify(report.at(-1)));
 }
}
manifest.version=6;
await writeFile(resolve(base,'environment.json'),JSON.stringify(manifest,null,2)+'\n');
await mkdir(resolve(root,'reports'),{recursive:true});
await writeFile(resolve(root,'reports/tree-lods.json'),JSON.stringify(report,null,2)+'\n');
