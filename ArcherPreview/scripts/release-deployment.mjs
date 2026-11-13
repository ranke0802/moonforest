import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyResourceBundles} from './resource-bundles.mjs';

export const RELEASE_V2='moonforest-0.2';
export const RELEASE_V2_MANIFEST='deployment-files-moonforest-0.2.json';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// Match the existing village publisher's platform-independent text bytes.
// Content-addressed files encode their exact source bytes and stay untouched.
export function publishedBytes(path,bytes){
 return !path.startsWith('assets/content/')&&/\.(?:js|css|html|json|txt|md|webmanifest)$/i.test(path)?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes;
}
export function deploymentPath(root,path){
 if(typeof path!=='string'||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Unsafe deployment path');
 const full=resolve(root,path),local=relative(root,full);
 if(!local||local.startsWith('..')||isAbsolute(local))throw new Error('Unsafe deployment path');
 return full;
}
export async function optionalBytes(path){try{return await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;return null;}}
export function assertDescriptor(bytes,item){
 if(!item||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256)||bytes.length!==item.bytes||sha256(bytes)!==item.sha256)throw new Error('Deployment file differs from reviewed build: '+item?.path);
}

// 0.2 may append content-addressed actors without rewriting 0.1's cache index.
// Every addition is explicitly reviewed and must match both its file descriptor
// and hash filename. The original graph and its bundle set remain mandatory.
export function assertDeploymentContentGraph(manifest,index){
 const files=new Map(manifest.files.map(item=>[item.path,item])),expected=new Set(Object.keys(index.files).map(name=>'assets/content/'+name));
 const additions=manifest.additiveContent??[];
 if(!Array.isArray(additions)||additions.length&&manifest.release!==RELEASE_V2)throw new Error('Invalid additive content inventory');
 for(const item of additions){
  const actual=files.get(item.path);
  if(!/^assets\/content\/[a-f0-9]{64}\.(?:gltf|bin|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/.test(item.path)||item.path.split('/').at(-1).slice(0,64)!==item.sha256||!actual||actual.sha256!==item.sha256||actual.bytes!==item.bytes||expected.has(item.path))throw new Error('Invalid additive content descriptor: '+item.path);
  expected.add(item.path);
 }
 if([...files.keys()].filter(path=>path.startsWith('assets/content/')).some(path=>!expected.delete(path))||expected.size)throw new Error('Deployment content differs from the live resource index or declared additions');
 const packs=new Set(index.bundles.map(pack=>'assets/'+pack.url));
 if([...packs].some(path=>!files.has(path))||[...files.keys()].some(path=>path.startsWith('assets/bundles/')&&!packs.has(path)))throw new Error('Deployment bundle missing or obsolete');
}

// Each release retains its complete reviewed graph. The final site is their
// union, with one physical copy of each shared content-addressed resource.
export async function reviewedDeploymentUnion(site,{requireResourceIndex=false}={}){
 const primaryBytes=await readFile(resolve(site,'deployment-files.json'));
 const manifests=[{name:'deployment-files.json',bytes:primaryBytes,data:JSON.parse(primaryBytes)}];
 const extraBytes=await optionalBytes(resolve(site,RELEASE_V2_MANIFEST));
 if(extraBytes){
  const data=JSON.parse(extraBytes);
  if(data.release!==RELEASE_V2||data.version!==2||data.baseDeploymentSha256!==sha256(primaryBytes))throw new Error('MoonForest 0.2 preserved deployment mismatch');
  manifests.push({name:RELEASE_V2_MANIFEST,bytes:extraBytes,data});
 }
 const entries=new Map(),verified=new Set(),verifiedGraphs=new Set();
 for(const {data:manifest}of manifests){
  if(requireResourceIndex&&manifest.version!==2)throw new Error('Rebuild with the current resource bundle/version pipeline before deployment');
  if(!Array.isArray(manifest.files))throw new Error('Deployment files missing');
  const unique=new Set();let total=0;
  for(const item of manifest.files){
   if(!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('Invalid deployment descriptor');
   const source=deploymentPath(site,item.path);
   if(unique.has(item.path))throw new Error('Unsafe or duplicate deployment path');
   unique.add(item.path);
   const previous=entries.get(item.path);
   if(previous&&(previous.sha256!==item.sha256||previous.bytes!==item.bytes))throw new Error('Releases disagree on shared deployment path: '+item.path);
   entries.set(item.path,item);total+=item.bytes;
   if(!verified.has(item.path)){
    if(!(await lstat(source)).isFile())throw new Error('Deployment requires regular files');
    assertDescriptor(await readFile(source),item);verified.add(item.path);
   }
  }
  if(total!==manifest.bytes||total>=1_000_000_000)throw new Error('Deployment size budget mismatch');
  if(manifest.version>=2){
   if(!unique.has('assets/resource-index.json'))throw new Error('Resource version index missing from deployment');
   const index=JSON.parse(await readFile(resolve(site,'assets/resource-index.json'),'utf8'));
   if(index.revision!==manifest.resourceRevision)throw new Error('Deployment resource revision mismatch');
   assertDeploymentContentGraph(manifest,index);
   if(!verifiedGraphs.has(index.revision)){await verifyResourceBundles(site,index,{verifyFiles:false});verifiedGraphs.add(index.revision);}
  }
 }
 const bytes=[...entries.values()].reduce((sum,item)=>sum+item.bytes,0);
 if(bytes>=1_000_000_000)throw new Error('Combined deployment exceeds the 1 GB budget');
 return {entries:[...entries.values()],manifests,bytes};
}
