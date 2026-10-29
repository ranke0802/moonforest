import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyResourceBundles} from './resource-bundles.mjs';
const repo=resolve(import.meta.dirname,'../..'),dist=resolve(repo,'ArcherPreview/dist-village'),site=resolve(repo,'ArcherPreviewSite');
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(await readFile(resolve(dist,'deployment-files.json'),'utf8'));
if(manifest.version!==2)throw new Error('Run the current build:village pipeline first');
const index=JSON.parse(await readFile(resolve(dist,'assets/resource-index.json'),'utf8'));
if(index.revision!==manifest.resourceRevision)throw new Error('Build resource revision mismatch');
await verifyResourceBundles(dist,index);
const entries=[];let total=0;
// Validate the complete build before touching the published checkout.
for(const item of manifest.files){
 const from=resolve(dist,item.path),local=relative(dist,from);
 if(!local||local.startsWith('..')||isAbsolute(local))throw new Error('Unsafe build path');
 const data=await readFile(from);if(data.length!==item.bytes||hash(data)!==item.sha256)throw new Error('Build checksum mismatch: '+item.path);
 total+=data.length;entries.push(item);
}
if(total!==manifest.bytes||total>=1_000_000_000)throw new Error('Build size mismatch');
const paths=[];
for(const item of entries){
 const target=resolve(site,item.path);let same=false;
 try{same=hash(await readFile(target))===item.sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!same){await mkdir(dirname(target),{recursive:true});await copyFile(resolve(dist,item.path),target);paths.push('ArcherPreviewSite/'+item.path);}
}
await copyFile(resolve(dist,'deployment-files.json'),resolve(site,'deployment-files.json'));paths.push('ArcherPreviewSite/deployment-files.json');
const report=resolve(repo,'ArcherPreview/reports');await mkdir(report,{recursive:true});
await writeFile(resolve(report,'publish-village-paths.txt'),paths.join('\n')+'\n');
const result={resourceRevision:index.revision,verifiedFiles:entries.length,bytes:total,changedPaths:paths};
await writeFile(resolve(report,'publish-village-build.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({resourceRevision:index.revision,verifiedFiles:entries.length,bytes:total,changedFiles:paths.length}));
