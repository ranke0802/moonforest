import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { splitGlb, hash } from './resource-pack.js';

const root=resolve(import.meta.dirname,'..');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const source=resolve(option('--source')??process.env.VILLAGE_SOURCE_DIR??'C:/Users/ryank/Documents/ChatGPT/MM Project/output/village-warrior-v3/2026-10-28');
const fixture=process.argv.includes('--fixture');
const plan=JSON.parse(await readFile(resolve(source,'asset-plan.json'),'utf8'));
if(plan.assets.length!==25||new Set(plan.assets.map(a=>a.id)).size!==25)throw new Error('Village needs exactly 25 unique source assets.');
const content=resolve(root,'public/assets/content');await mkdir(content,{recursive:true});
const assets={},missing=[],written=new Set();
for(const entry of plan.assets){
  const folder=resolve(source,'runtime',entry.id),auditPath=resolve(folder,'asset-audit.json');
  try{await access(auditPath);}catch{missing.push(entry.id);continue;}
  const audit=JSON.parse(await readFile(auditPath,'utf8'));
  if(audit.visual_review?.status!=='APPROVED'){missing.push(entry.id);continue;}
  const size=audit.runtime_bounds_m_z_up?.size;
  if(!size?.every(n=>Number.isFinite(n)&&n>0))throw new Error(`${entry.id}: invalid runtime bounds.`);
  const lods=[];
  for(let level=0;level<3;level++){
    const info=audit.lods.find(l=>l.level===level);
    if(!info)throw new Error(`${entry.id}: LOD ${level} missing.`);
    const bytes=await readFile(resolve(folder,info.file));
    if(hash(bytes)!==info.sha256)throw new Error(`${entry.id}: LOD ${level} hash differs from its audit.`);
    const packed=splitGlb(bytes);
    for(const [name,file]of packed.files){if(!written.has(name)){await writeFile(resolve(content,name),file.data);written.add(name);}}
    lods.push({level,model:`./content/${packed.model}`,resources:[...packed.files.keys()].map(n=>`./content/${n}`),triangles:info.triangles,textureSize:info.texture_base_max,normalMap:info.normal_map});
  }
  const frontYawOffset=audit.frontYawOffset??audit.visual_review.frontYawOffset;
  if(!Number.isFinite(frontYawOffset))throw new Error(`${entry.id}: approved front orientation missing.`);
  const c=Math.abs(Math.cos(frontYawOffset)),s=Math.abs(Math.sin(frontYawOffset));
  assets[entry.id]={name:entry.name,category:entry.category,height:entry.height,bounds:[size[0]*c+size[1]*s,size[2],size[1]*c+size[0]*s],origin:'bottom-center',frontYawOffset,visualReview:'APPROVED',lods};
}
if(missing.length&&!fixture)throw new Error(`Village runtime assets not ready: ${missing.join(', ')}. No manifest was replaced.`);
const manifest={version:1,complete:missing.length===0,developmentFixture:fixture,sourceAssetCount:25,availableAssetCount:Object.keys(assets).length,assets,missing};
const target=resolve(root,`public/assets/${fixture?'village-fixture':'village'}.json`);await mkdir(dirname(target),{recursive:true});
await writeFile(target,JSON.stringify(manifest,null,2)+'\n');
if(!fixture)await rm(resolve(root,'public/assets/village-fixture.json'),{force:true});
console.log(JSON.stringify({villageAssets:Object.keys(assets).length,uniqueResources:written.size,complete:manifest.complete,manifest:target}));
