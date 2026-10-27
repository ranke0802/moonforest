import {readFile,copyFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function stagePages(repository,output){
 const root=resolve(repository),site=resolve(root,'ArcherPreviewSite'),destination=resolve(output);
 const manifest=JSON.parse(await readFile(resolve(site,'deployment-files.json'),'utf8'));
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
 for(const item of manifest.files){
  const target=resolve(destination,'ArcherPreviewSite',item.path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(site,item.path),target);
 }
 await copyFile(resolve(site,'deployment-files.json'),resolve(destination,'ArcherPreviewSite/deployment-files.json'));
 await copyFile(resolve(root,'index.html'),resolve(destination,'index.html'));
 await writeFile(resolve(destination,'.nojekyll'),'');
 return {files:unique.size,bytes:total};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await stagePages(resolve(import.meta.dirname,'../..'),resolve(process.argv[2]??'_site'))));
