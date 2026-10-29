import {readFile,copyFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyResourceBundles} from './resource-bundles.mjs';

export async function stagePages(repository,output,{requireResourceIndex=false}={}){
 const root=resolve(repository),site=resolve(root,'ArcherPreviewSite'),destination=resolve(output);
 const manifest=JSON.parse(await readFile(resolve(site,'deployment-files.json'),'utf8'));
 if(requireResourceIndex&&manifest.version!==2)throw new Error('Rebuild with the current resource bundle/version pipeline before deployment');
 const unique=new Set();let total=0;
 for(const item of manifest.files){
  const source=resolve(site,item.path),local=relative(site,source);
  if(!local||local.startsWith('..')||isAbsolute(local)||unique.has(local))throw new Error('Unsafe or duplicate deployment path');
  unique.add(local);if(!(await lstat(source)).isFile())throw new Error('Deployment requires regular files');
  const bytes=await readFile(source);
  if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Deployment file differs from reviewed build: '+item.path);
  total+=bytes.length;
 }
 if(total!==manifest.bytes||total>=1_000_000_000)throw new Error('Deployment size budget mismatch');
 if(manifest.version>=2){
   const published=new Set(manifest.files.map(f=>f.path.replaceAll('\\','/')));
   if(!published.has('assets/resource-index.json'))throw new Error('Resource version index missing from deployment');
   const index=JSON.parse(await readFile(resolve(site,'assets/resource-index.json'),'utf8'));
   if(index.revision!==manifest.resourceRevision)throw new Error('Deployment resource revision mismatch');
   const expected=new Set(Object.keys(index.files).map(n=>'assets/content/'+n));
   if([...published].filter(p=>p.startsWith('assets/content/')).some(p=>!expected.delete(p))||expected.size)throw new Error('Deployment content differs from the live resource index');
   const packPaths=new Set(index.bundles.map(p=>'assets/'+p.url));
   if(index.bundles.some(p=>!published.has('assets/'+p.url))||[...published].some(p=>p.startsWith('assets/bundles/')&&!packPaths.has(p)))throw new Error('Deployment bundle missing or obsolete');
   await verifyResourceBundles(site,index,{verifyFiles:false});
 }
 for(const item of manifest.files){
  const target=resolve(destination,'ArcherPreviewSite',item.path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(site,item.path),target);
 }
 await copyFile(resolve(site,'deployment-files.json'),resolve(destination,'ArcherPreviewSite/deployment-files.json'));
 await copyFile(resolve(root,'index.html'),resolve(destination,'index.html'));
 await writeFile(resolve(destination,'.nojekyll'),'');
 return {files:unique.size,bytes:total};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await stagePages(resolve(import.meta.dirname,'../..'),resolve(process.argv[2]??'_site'),{requireResourceIndex:true})));
