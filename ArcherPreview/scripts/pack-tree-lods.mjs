// Native, distance-selected geometry; identical painted textures and transforms.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { simplifyGeometry } from './web-geometry.js';
const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets');
const manifest=JSON.parse(await readFile(resolve(base,'environment.json'),'utf8')),report=[];
for(const key of ['verdant-tree','oak-tree']){
 const config=manifest.assets[key],source=JSON.parse(await readFile(resolve(base,config.model),'utf8')),files=new Map();
 for(const item of [...source.buffers,...source.images])files.set(item.uri,{data:await readFile(resolve(base,'content',item.uri))});
 config.lods=[];
 for(const [level,distance,ratio,error] of [['near',5,.25,.004],['mid',11,.09,.01],['distant',20,.035,.02]]){
  const result=await simplifyGeometry(source,files,()=>({ratio,error}));
  for(const [name,{data}] of result.files)await writeFile(resolve(base,'content',name),data);
  config.lods.push({distance,model:'./content/'+result.model,resources:[...result.files.keys()].map(n=>'./content/'+n)});
  report.push({key,level,distance,primitives:result.stats});
  console.log(JSON.stringify(report.at(-1)));
 }
}
manifest.version=4;
await writeFile(resolve(base,'environment.json'),JSON.stringify(manifest,null,2)+'\n');
await mkdir(resolve(root,'reports'),{recursive:true});
await writeFile(resolve(root,'reports/tree-lods.json'),JSON.stringify(report,null,2)+'\n');
