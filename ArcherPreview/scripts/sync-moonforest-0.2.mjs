import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RELEASE_V2,RELEASE_V2_MANIFEST,sha256,deploymentPath,optionalBytes,assertDescriptor,reviewedDeploymentUnion} from './release-deployment.mjs';

export async function syncMoonforestV2({repository=resolve(import.meta.dirname,'../..'),dist=resolve(repository,'ArcherPreview/dist/moonforest-0.2'),site=resolve(repository,'ArcherPreviewSite'),writeReport=true}={}){
 const manifestBytes=await readFile(resolve(dist,RELEASE_V2_MANIFEST)),manifest=JSON.parse(manifestBytes),primaryBytes=await readFile(resolve(site,'deployment-files.json')),primary=JSON.parse(primaryBytes);
 if(manifest.version!==2||manifest.release!==RELEASE_V2||manifest.baseDeploymentSha256!==sha256(primaryBytes)||manifest.resourceRevision!==primary.resourceRevision)throw new Error('MoonForest 0.2 preserved deployment mismatch');
 // Verify the live releases before adding any new files. The original HTML,
 // manifests, bundles and all referenced chunks remain immutable.
 await reviewedDeploymentUnion(site,{requireResourceIndex:true});
 const protectedPaths=new Set(primary.files.map(item=>item.path));protectedPaths.add('deployment-files.json');
 const ownedEntries=new Set(['moonforest-0.2.html','moonforest-0.2.webmanifest']),unique=new Set(),copies=[];let total=0,reusedBytes=0;
 for(const item of manifest.files){
  if(unique.has(item.path))throw new Error('Unsafe or duplicate deployment path');unique.add(item.path);
  const from=deploymentPath(dist,item.path),target=deploymentPath(site,item.path),staged=await optionalBytes(from),existing=await optionalBytes(target),bytes=staged??existing;
  if(!bytes)throw new Error('Missing release file: '+item.path);assertDescriptor(bytes,item);total+=bytes.length;
  if(staged&&!(await lstat(from)).isFile())throw new Error('Deployment requires regular files');
  if(existing&&!(await lstat(target)).isFile())throw new Error('Deployment requires regular files');
  if(existing&&sha256(existing)===item.sha256){reusedBytes+=existing.length;continue;}
  if(existing&&(protectedPaths.has(item.path)||!ownedEntries.has(item.path)))throw new Error('MoonForest 0.1 deployment path would change: '+item.path);
  if(!staged)throw new Error('Missing staged release file: '+item.path);copies.push({from,target,path:item.path});
 }
 if(total!==manifest.bytes||total>=1_000_000_000||!unique.has('moonforest-0.2.html')||!unique.has('assets/resource-index.json'))throw new Error('MoonForest 0.2 deployment inventory mismatch');
 const index=JSON.parse(await readFile(resolve(site,'assets/resource-index.json'),'utf8')),expected=new Set(Object.keys(index.files).map(name=>'assets/content/'+name)),packs=new Set(index.bundles.map(pack=>'assets/'+pack.url));
 if([...unique].filter(path=>path.startsWith('assets/content/')).some(path=>!expected.delete(path))||expected.size||[...packs].some(path=>!unique.has(path))||[...unique].some(path=>path.startsWith('assets/bundles/')&&!packs.has(path)))throw new Error('MoonForest 0.2 resource graph mismatch');
 const combined=new Map(primary.files.map(item=>[item.path,item]));for(const item of manifest.files)combined.set(item.path,item);
 if([...combined.values()].reduce((sum,item)=>sum+item.bytes,0)>=1_000_000_000)throw new Error('Combined deployment exceeds the 1 GB budget');
 for(const item of copies){await mkdir(dirname(item.target),{recursive:true});await copyFile(item.from,item.target);}
 // Separate inventory: never rewrite the 0.1 inventory to advertise 0.2.
 await writeFile(resolve(site,RELEASE_V2_MANIFEST),manifestBytes);
 const result={release:RELEASE_V2,resourceRevision:manifest.resourceRevision,verifiedFiles:unique.size,bytes:total,reusedBytes,changedPaths:[...copies.map(item=>'ArcherPreviewSite/'+item.path),'ArcherPreviewSite/'+RELEASE_V2_MANIFEST]};
 if(writeReport){const reports=resolve(repository,'ArcherPreview/reports');await mkdir(reports,{recursive:true});await writeFile(resolve(reports,'publish-moonforest-0.2.json'),JSON.stringify(result,null,2)+'\n');}
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await syncMoonforestV2()));
