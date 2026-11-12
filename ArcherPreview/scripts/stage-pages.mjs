import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewedDeploymentUnion} from './release-deployment.mjs';

export async function stagePages(repository,output,{requireResourceIndex=false}={}){
 const root=resolve(repository),site=resolve(root,'ArcherPreviewSite'),destination=resolve(output);
 const reviewed=await reviewedDeploymentUnion(site,{requireResourceIndex});
 for(const item of reviewed.entries){
  const target=resolve(destination,'ArcherPreviewSite',item.path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(site,item.path),target);
 }
 for(const manifest of reviewed.manifests)await copyFile(resolve(site,manifest.name),resolve(destination,'ArcherPreviewSite',manifest.name));
 await copyFile(resolve(root,'index.html'),resolve(destination,'index.html'));
 await writeFile(resolve(destination,'.nojekyll'),'');
 return {files:reviewed.entries.length,bytes:reviewed.bytes,releases:reviewed.manifests.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await stagePages(resolve(import.meta.dirname,'../..'),resolve(process.argv[2]??'_site'),{requireResourceIndex:true})));
