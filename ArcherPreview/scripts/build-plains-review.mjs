import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {build} from 'vite';
import {collectVillageSiteFiles} from './build-village-site.mjs';
import {buildResourceBundles,verifyResourceBundles} from './resource-bundles.mjs';
import {PLAINS_SPAN,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM,PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
const root=resolve(import.meta.dirname,'..'),pub=resolve(root,'public'),report=resolve(root,process.env.PLAINS_REVIEW_DIR??'reports/great-plains-2026-11-02'),outDir=resolve(report,'playable');
await mkdir(report,{recursive:true});
for(const file of ['resource-index.json','resource-sizes.json']){
 const backup=resolve(report,'baseline-'+file);try{await readFile(backup);}catch{await copyFile(resolve(pub,'assets',file),backup);}
}
await writeFile(resolve(report,'layout.json'),JSON.stringify({span:PLAINS_SPAN,routes:PLAINS_ROUTES,clearings:PLAINS_CLEARINGS,stream:PLAINS_STREAM,placements:PLAINS_PLACEMENTS}));
let inventory=await collectVillageSiteFiles(pub);
const sizes=Object.fromEntries([...inventory.files].filter(([p])=>p.startsWith('assets/content/')).map(([p,f])=>[p.split('/').at(-1),f.bytes]).sort(([a],[b])=>a.localeCompare(b)));
await writeFile(resolve(pub,'assets/resource-sizes.json'),JSON.stringify({version:1,files:sizes})+'\n');
inventory=await collectVillageSiteFiles(pub);
const index=await buildResourceBundles(pub,inventory.files),audit=await verifyResourceBundles(pub,index);
for(const file of ['resource-index.json',...index.bundles.map(b=>b.url)])inventory.files.set('assets/'+file,{absolute:resolve(pub,'assets',file)});
await build({root,mode:'plains-review',build:{outDir,emptyOutDir:false,copyPublicDir:false,rolldownOptions:{input:{game:resolve(root,'index.html'),assets:resolve(root,'quest-assets.html'),overview:resolve(root,'plains-overview.html')}}}});
for(const [path,info]of inventory.files){const dest=resolve(outDir,path);await mkdir(dirname(dest),{recursive:true});await copyFile(info.absolute,dest);}
await writeFile(resolve(report,'build-result.json'),JSON.stringify({outDir,revision:index.revision,audit,files:inventory.files.size},null,2));
console.log(JSON.stringify({outDir,revision:index.revision,audit}));
