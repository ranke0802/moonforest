import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb } from './resource-pack.js';
const root=resolve(import.meta.dirname,'..'),assets={};
await mkdir(resolve(root,'public/assets/content'),{recursive:true});
for(const name of ['verdant-tree','oak-tree','grass-tuft','grass-cluster','scarecrow']){
  const pack=splitGlb(await readFile(resolve(root,`assets/environment/models/${name}.glb`)));
  for(const [name,file] of pack.files)await writeFile(resolve(root,'public/assets/content',name),file.data);
  assets[name]={model:`./content/${pack.model}`,resources:[...pack.files.keys()].map(name=>`./content/${name}`)};
  console.log(name,[...pack.files.values()].reduce((n,f)=>n+f.data.length,0));
}
await writeFile(resolve(root,'public/assets/environment.json'),JSON.stringify({version:1,assets},null,2)+'\n');
