import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {hash} from './resource-pack.js';

const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const source=resolve(option('--source')??process.env.VILLAGE_LOD_DIR??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28/geometry-lod');
const target=resolve(import.meta.dirname,'../public/assets');
const read=name=>readFile(resolve(source,name),'utf8').then(JSON.parse);
const [baseline,candidate,geometry,high,approval]=await Promise.all(['baseline-manifest.json','assets/village.json','geometry-audit.json','high-textures.json','approval.json'].map(read));
if(!geometry.complete||approval.status!=='APPROVED'||approval.geometryAuditSha256!==hash(await readFile(resolve(source,'geometry-audit.json'))))throw new Error('Reviewed geometry evidence is required.');
const ids=Object.keys(baseline.assets);
if(ids.length!==25||Object.keys(high.assets).length!==25)throw new Error('All 25 original assets need their 8K textures.');
const current=JSON.parse(await readFile(resolve(target,'village.json'),'utf8'));
const resources=new Set();
for(const id of ids){
  const asset=candidate.assets[id],original=baseline.assets[id],textures=high.assets[id];
  if(JSON.stringify(asset.lods[0])!==JSON.stringify(original.lods[0])||asset.mobileNear.model!==original.lods[1].model)throw new Error('Original near geometry changed: '+id);
  if(current.assets[id].lods[0].model!==original.lods[0].model)throw new Error('Source asset changed; review LODs again: '+id);
  if(textures.textures.albedo.width!==8192||textures.textures.albedo.height!==8192)throw new Error('8K source missing: '+id);
  asset.highTextures={textures:textures.textures,resources:textures.resources,colorResolution:8192,colorEncoding:textures.colorEncoding};
  for(const lod of [...asset.lods,asset.mobileNear])for(const ref of lod.resources)resources.add(ref);
  for(const ref of textures.resources)resources.add(ref);
}
candidate.geometryLod.nearColorResolution=8192;
candidate.geometryLod.visualReview='APPROVED';
await mkdir(resolve(target,'content'),{recursive:true});
for(const ref of resources){
  if(!/^\.\/content\/[a-f0-9]{64}\.(gltf|bin|png|jpg|webp)$/.test(ref))throw new Error('Invalid runtime resource');
  const file=resolve(source,'assets',ref),bytes=await readFile(file);
  if(hash(bytes)!==basename(ref).slice(0,64))throw new Error('Resource hash mismatch: '+ref);
  await copyFile(file,resolve(target,ref));
}
await writeFile(resolve(target,'village.json'),JSON.stringify(candidate,null,2)+'\n');
console.log(JSON.stringify({assets:ids.length,nearColor:8192,resources:resources.size}));
