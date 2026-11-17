// CI release build (GitHub Actions, Linux): rebuilds MoonForest 0.2 and 0.3
// from the pushed source into ArcherPreviewSite, so a push deploys without a
// local Publish-0.3.cmd run.
// The shared resource graph is the reviewed one already published with 0.1
// (ArcherPreviewSite/assets): it is copied into public/ first, so local,
// uncommitted asset work can never change what 0.1 serves.
import {readFile,mkdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {buildMoonforestV2} from './build-moonforest-0.2.mjs';
import {syncMoonforestV2} from './sync-moonforest-0.2.mjs';
import {buildMoonforestV3} from './build-moonforest-0.3.mjs';
import {syncMoonforestV3} from './sync-moonforest-0.3.mjs';

const project=resolve(import.meta.dirname,'..'),site=resolve(project,'../ArcherPreviewSite'),publicAssets=resolve(project,'public/assets');
async function restoreShippedGraph(){
 const index=JSON.parse(await readFile(resolve(site,'assets/resource-index.json'),'utf8'));
 await copyFile(resolve(site,'assets/resource-index.json'),resolve(publicAssets,'resource-index.json'));
 for(const pack of index.bundles){const target=resolve(publicAssets,pack.url);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(site,'assets',pack.url),target);}
 // Published files that are not in git (reviewed content kept only in the
 // site): restore them from the shipped 0.1 inventory, hash-checked.
 const seen=new Set();let restored=0;
 const items=[];
 for(const name of ['deployment-files.json','deployment-files-moonforest-0.2.json','deployment-files-moonforest-0.3.json']){
  const inv=JSON.parse(await readFile(resolve(site,name),'utf8'));
  for(const item of [...(inv.files||[]),...(inv.additiveContent||[])])if(item.path.startsWith('assets/')&&!seen.has(item.path)){seen.add(item.path);items.push(item);}
 }
 for(const item of items){
  const target=resolve(project,'public',item.path);
  try{await access(target);continue;}catch{/* missing: restore */}
  const bytes=await readFile(resolve(site,item.path));
  const text=/\.(json|js|css|html|txt|md|svg)$/.test(item.path)&&!item.path.startsWith('assets/content/');
  const body=text?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes;
  if(createHash('sha256').update(body).digest('hex')!==item.sha256)throw new Error('Shipped file does not match its inventory: '+item.path);
  await mkdir(dirname(target),{recursive:true});await copyFile(resolve(site,item.path),target);restored++;
 }
 return {revision:index.revision,bundles:index.bundles.length,restored};
}
const graph=await restoreShippedGraph();
console.log('shipped resource graph',graph);
for(const [name,step] of [['build 0.2',buildMoonforestV2],['sync 0.2',syncMoonforestV2],['build 0.3',buildMoonforestV3],['sync 0.3',syncMoonforestV3]]){
 console.log('==',name);const result=await step();if(result&&typeof result==='object')console.log(JSON.stringify(result).slice(0,400));
}
