// Offline only. Existing meshes and painted textures are the only inputs.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {simplifyGeometry} from './web-geometry.js';
import {hash} from './resource-pack.js';

const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const base=resolve(import.meta.dirname,'../public/assets');
const out=resolve(option('--out')??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/geometry-lod');
await mkdir(out,{recursive:true});
const baselinePath=resolve(out,'baseline-manifest.json');
try{await access(baselinePath);}catch{await writeFile(baselinePath,await readFile(resolve(base,'village.json')));}
const baseline=JSON.parse(await readFile(baselinePath,'utf8'));
if(baseline.geometryLod)throw new Error('Expected original geometry baseline, not already simplified assets.');
const content=resolve(out,'assets/content');await mkdir(content,{recursive:true});
const manifest=structuredClone(baseline),report=[];
const ids=option('--ids')?.split(',')??Object.keys(baseline.assets);
for(const id of ids){
  const config=baseline.assets[id];if(!config)throw new Error(`Unknown asset ${id}`);
  const revised=manifest.assets[id];
  // Original geometry with a fast placeholder; the streamer supplies 8K nearby.
  revised.mobileNear={...structuredClone(config.lods[1]),level:0};
  revised.geometryLod=true;
  const item={id,nearTriangles:config.lods[0].triangles,lods:[]};
  for(const level of [1,2]){
    const source=JSON.parse(await readFile(resolve(base,config.lods[level].model),'utf8'));
    const files=new Map();
    for(const f of [...source.buffers,...source.images])files.set(f.uri,{data:await readFile(resolve(base,'content',f.uri))});
    const options={ratio:level===1?.5:.22,error:level===1?.02:.05,attributeWeights:[.2,.2,.2,.5,.5],protectUvSeams:true,flags:['Permissive','PreserveFolds']};
    const result=await simplifyGeometry(source,files,()=>options);
    for(const [name,{data}]of result.files)await writeFile(resolve(content,name),data);
    const triangles=result.stats.reduce((s,p)=>s+p.after,0);
    revised.lods[level]={...config.lods[level],model:`./content/${result.model}`,resources:[...result.files.keys()].map(n=>`./content/${n}`),triangles};
    item.lods.push({level,triangles,ratio:triangles/item.nearTriangles,stats:result.stats,options});
  }
  // Copy the exact, previously approved near files, including mobile's 1K tier.
  for(const ref of new Set([...config.lods[0].resources,...config.lods[1].resources])){
    const data=await readFile(resolve(base,ref));await writeFile(resolve(out,'assets',ref),data);
  }
  report.push(item);console.log(JSON.stringify(item));
}
manifest.geometryLod={version:1,method:'attribute-aware-index-simplification',nearGeometryPreserved:true,mobileNearPreserved:true};
await writeFile(resolve(out,'assets/village.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(out,'geometry-audit.json'),JSON.stringify({complete:ids.length===25,baselineSha256:hash(await readFile(baselinePath)),assets:report},null,2)+'\n');
