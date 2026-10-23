import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb } from './resource-pack.js';
const root=resolve(import.meta.dirname,'..'),config=JSON.parse(await readFile(resolve(root,'assets/goblin/config.json'),'utf8'));
const pack=splitGlb(await readFile(resolve(root,'assets/models/hooded-goblin.glb')));
for(const [name,file] of pack.files)await writeFile(resolve(root,'public/assets/content',name),file.data);
config.model=`./content/${pack.model}`;config.resources=[...pack.files.keys()].map(name=>`./content/${name}`);
await writeFile(resolve(root,'public/assets/hooded-goblin.json'),JSON.stringify(config,null,2)+'\n');
console.log('Goblin',config.catalog.length,'motions',pack.files.size,'immutable resources');
