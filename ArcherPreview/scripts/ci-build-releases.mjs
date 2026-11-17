// CI release build (GitHub Actions, Linux): rebuilds MoonForest 0.2 and 0.3
// from the pushed source into ArcherPreviewSite, so a push deploys without a
// local Publish-0.3.cmd run.
// The shared resource graph is the reviewed one already published with 0.1
// (ArcherPreviewSite/assets): it is copied into public/ first, so local,
// uncommitted asset work can never change what 0.1 serves.
import {readFile,mkdir,copyFile} from 'node:fs/promises';
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
 return {revision:index.revision,bundles:index.bundles.length};
}
const graph=await restoreShippedGraph();
console.log('shipped resource graph',graph);
for(const [name,step] of [['build 0.2',buildMoonforestV2],['sync 0.2',syncMoonforestV2],['build 0.3',buildMoonforestV3],['sync 0.3',syncMoonforestV3]]){
 console.log('==',name);const result=await step();if(result&&typeof result==='object')console.log(JSON.stringify(result).slice(0,400));
}
