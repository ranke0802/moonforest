import { execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { splitGlb, hash } from './resource-pack.js';
// One-time migration map for the previously deployed monolithic assets.
const root=resolve(import.meta.dirname,'../public/assets');
for(const [manifest,source,url] of [['character','azure-elf.glb','./azure-elf.glb?v=wrist-20261019'],['warrior','violet-warrior.glb','./violet-warrior.glb?v=controlled-run-20261021']]) {
 const bytes=execFileSync('git',['show',`e0c98ab:ArcherPreview/public/assets/${source}`],{cwd:resolve(root,'../../..'),maxBuffer:128*1024*1024});
 const pack=splitGlb(bytes);const name=`legacy-e0c98ab-${manifest}.json`;
 await writeFile(resolve(root,name),JSON.stringify({url,sha256:hash(bytes),files:[...pack.files].filter(([,f])=>f.parts).map(([name,f])=>({name,parts:f.parts,size:f.data.length,type:f.type}))}));
 const path=resolve(root,`${manifest}.json`),config=JSON.parse(await readFile(path,'utf8'));
 config.legacyCacheMap=`./${name}`;await writeFile(path,JSON.stringify(config,null,2)+'\n');
}
