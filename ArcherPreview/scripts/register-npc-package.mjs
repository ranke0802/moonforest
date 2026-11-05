import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseNpcPackage,npcDigest} from '../src/npc-packages.js';
import {splitGlb} from './resource-pack.js';

// Project registration complements the in-game/browser-local importer. It
// publishes data only; renderer/review scripts inside a ZIP are never shipped.
export async function registerNpcPackage(file,{projectRoot=resolve(import.meta.dirname,'..')}={}){
 const original=await readFile(file),blob=new Blob([original]);Object.defineProperty(blob,'name',{value:basename(file)});
 const parsed=await parseNpcPackage(blob),packed=splitGlb(Buffer.from(parsed.bytes)),assetId=parsed.entry.assetId,assets=resolve(projectRoot,'public/assets'),manifestName='npc-'+assetId.replace(/[^A-Za-z0-9._-]/g,'-')+'.json';
 const config={...parsed.config,model:'./content/'+packed.model,resources:[...packed.files.keys()].map(name=>'./content/'+name),visualReview:'APPROVED',reviewScope:'User-supplied reviewed original; original geometry, rig, textures and all clips retained. Runtime pixel/device validation remains separate.',sourceModelSha256:parsed.entry.npc.sourceSha256};
 await mkdir(resolve(assets,'content'),{recursive:true});
 for(const [name,record]of packed.files){const path=resolve(assets,'content',name);try{const existing=await readFile(path);if(!existing.equals(record.data))throw new Error('Existing content-addressed NPC resource differs: '+name);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,record.data);}}
 const manifest={version:1,complete:true,assets:{[assetId]:config}},path=resolve(assets,manifestName);let old;try{old=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 const text=JSON.stringify(manifest,null,2)+'\n';if(old!==text)await writeFile(path,text);
 return {assetId,version:config.version,manifest:'assets/'+manifestName,sourceZipSha256:await npcDigest(original),sourceModelSha256:parsed.entry.npc.sourceSha256,modelSha256:packed.model.slice(0,64),files:packed.files.size,bytes:[...packed.files.values()].reduce((sum,row)=>sum+row.data.length,0),triangles:parsed.entry.geometry.triangles,bones:parsed.entry.geometry.bones,clips:parsed.entry.geometry.clipNames,height:parsed.entry.referenceHeight,scale:config.scale,npc:config.npc};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];if(!file)throw new Error('Usage: register-npc-package.mjs <NPC package ZIP or GLB>');console.log(JSON.stringify(await registerNpcPackage(resolve(file))));
}
