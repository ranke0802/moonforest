import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PLAINS_PLACEMENTS,PLAINS_SPAN,PLAINS_ROUTES,PLAINS_CLEARINGS,PLAINS_STREAM,PLAINS_LOOKOUT} from '../src/great-plains-layout.js';
import {VILLAGE_PLAINS_BOUNDARY} from '../src/village-plains-boundary.js';
import {FOREST_PLAINS_BOUNDARY} from '../src/plains-forest-boundary.js';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'public/assets'),out=resolve(root,'reports/region-continuity-2026-11-03');
await mkdir(out,{recursive:true});
const read=async name=>JSON.parse(await readFile(resolve(assets,name+'.json'),'utf8'));
const plains=await read('great-plains'),forest=await read('monster-forest');
for(const p of PLAINS_PLACEMENTS.filter(p=>p.forestBoundary))plains.assets[p.asset]=forest.assets[p.asset];
plains.availableAssetCount=Object.keys(plains.assets).length;plains.placementCount=PLAINS_PLACEMENTS.length;
await writeFile(resolve(assets,'great-plains.json'),JSON.stringify(plains,null,2)+'\n');
await writeFile(resolve(out,'layout.json'),JSON.stringify({span:PLAINS_SPAN,routes:PLAINS_ROUTES,clearings:PLAINS_CLEARINGS,stream:PLAINS_STREAM,lookout:PLAINS_LOOKOUT,placements:PLAINS_PLACEMENTS,boundary:VILLAGE_PLAINS_BOUNDARY,forestBoundary:FOREST_PLAINS_BOUNDARY}));
for(const [manifest,target]of [['village-ground','ground-color.png'],['monster-forest-ground','forest-ground-color.png']]){
 const source=await read(manifest);
 const r=spawnSync('C:/Program Files/KTX-Software/bin/ktx.exe',['extract','--transcode','rgba8','--level','0',resolve(assets,source.color.url),resolve(out,target)],{stdio:'inherit',windowsHide:true});
 if(r.error)throw r.error;if(r.status)throw Error('Cannot decode existing ground: '+manifest);
}
console.log(JSON.stringify({placements:plains.placementCount,forestCopies:PLAINS_PLACEMENTS.filter(p=>p.forestBoundary).length,assets:plains.availableAssetCount,originalForestWritten:false,report:out}));
