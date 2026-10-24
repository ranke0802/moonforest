import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb } from './resource-pack.js';
import { simplifyGeometry } from './web-geometry.js';
const root=resolve(import.meta.dirname,'..'),base=resolve(root,'public/assets');
// Always start with the preserved authoring export, never a previous reduction.
let input;
try{input=await readFile(resolve(root,'assets/models/violet-warrior-v2.glb'));}
catch{input=await readFile(resolve(base,'violet-warrior-v2.glb'));}
const source=splitGlb(input);
const result=await simplifyGeometry(source.gltf,source.files,(mesh,p,gltf)=>{
 const triangles=gltf.accessors[p.indices].count/3;
 if(triangles<15000)return null;
 return {ratio:mesh.name.includes('002')?.15:.28,error:.0015};
});
await mkdir(resolve(base,'content'),{recursive:true});
for(const [name,{data}] of result.files)await writeFile(resolve(base,'content',name),data);
const config=JSON.parse(await readFile(resolve(base,'warrior-v2.json'),'utf8'));
config.model='./content/'+result.model;config.resources=[...result.files.keys()].map(n=>'./content/'+n);
await writeFile(resolve(base,'warrior-v2.json'),JSON.stringify(config,null,2)+'\n');
await mkdir(resolve(root,'reports'),{recursive:true});
await writeFile(resolve(root,'reports/web-warrior.json'),JSON.stringify({source:source.model,model:result.model,stats:result.stats},null,2)+'\n');
console.log(JSON.stringify(result.stats));
