import {readFile,writeFile,readdir,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {collectVillageSiteFiles} from './build-village-site.mjs';
import {verifyResourceBundles} from './resource-bundles.mjs';
import {verifyRuntimeModuleGraph} from './runtime-module-graph.mjs';
import {RELEASE_V2,RELEASE_V2_MANIFEST,sha256,publishedBytes,deploymentPath,optionalBytes,assertDescriptor,assertDeploymentContentGraph} from './release-deployment.mjs';

const project=resolve(import.meta.dirname,'..');
export async function buildMoonforestV2(){
 const outDir=resolve(project,'dist/moonforest-0.2'),site=resolve(project,'../ArcherPreviewSite'),publicRoot=resolve(project,'public');
 const child=relative(project,outDir);
 if(!child||child.startsWith('..')||isAbsolute(child))throw new Error('Build directory must stay inside the project');
 for(const directory of [resolve(project,'dist'),outDir])try{
  const actual=relative(await realpath(project),await realpath(directory));
  if(!actual||actual.startsWith('..')||isAbsolute(actual))throw new Error('Build directory resolves outside the project');
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const primaryBytes=await readFile(resolve(site,'deployment-files.json')),primary=JSON.parse(primaryBytes);
 if(primary.version!==2)throw new Error('MoonForest 0.2 requires the preserved version 2 deployment inventory');
 const baseline=new Map(primary.files.map(item=>[item.path,item]));
 const indexBytes=publishedBytes('assets/resource-index.json',await readFile(resolve(publicRoot,'assets/resource-index.json'))),resourceIndex=JSON.parse(indexBytes);
 if(resourceIndex.revision!==primary.resourceRevision)throw new Error('Shared resource graph changed; preserve 0.1 and register an additive graph before building');
 assertDescriptor(indexBytes,baseline.get('assets/resource-index.json'));
 const bundleAudit=await verifyResourceBundles(publicRoot,resourceIndex);
 const {files,manifestCount}=await collectVillageSiteFiles(publicRoot);
 for(const path of ['assets/resource-index.json',...resourceIndex.bundles.map(pack=>'assets/'+pack.url),'moonforest-0.2.webmanifest']){
  const absolute=deploymentPath(publicRoot,path);files.set(path,{absolute,bytes:(await readFile(absolute)).length});
 }
 const reused=[],pending=[];
 // Mutable runtime manifests stay at their approved paths and bytes. A future
 // asset change must first provide separately routed release manifests.
 for(const [path,info]of files){
  const bytes=publishedBytes(path,await readFile(info.absolute)),item={path,bytes:bytes.length,sha256:sha256(bytes)},approved=baseline.get(path);
  if(approved&&(approved.sha256!==item.sha256||approved.bytes!==item.bytes))throw new Error('MoonForest 0.1 shared file would change: '+path);
  const existing=await optionalBytes(deploymentPath(site,path));
  if(existing){
   if(sha256(existing)!==item.sha256&&path!=='moonforest-0.2.webmanifest')throw new Error('Existing deployment path would change: '+path);
   if(sha256(existing)===item.sha256){reused.push(item);continue;}
  }
  pending.push({item,bytes});
 }
 let runtimeGraph;
 await build({root:project,publicDir:publicRoot,plugins:[{name:'verify-moonforest-0.2-runtime',generateBundle(_options,bundle){runtimeGraph=verifyRuntimeModuleGraph(bundle);}}],build:{outDir,emptyOutDir:true,copyPublicDir:false,rolldownOptions:{input:{moonforestV2:resolve(project,'moonforest-0.2.html')}}}});
 for(const {item,bytes}of pending){const target=deploymentPath(outDir,item.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
 const deploymentFiles=[...reused];let stagedBytes=0;
 async function inventory(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const full=resolve(directory,entry.name);
   if(entry.isDirectory())await inventory(full);
   else if(entry.isFile()){
    let bytes=await readFile(full);const path=relative(outDir,full).split(sep).join('/');
    const normalized=publishedBytes(path,bytes);if(!normalized.equals(bytes)){await writeFile(full,normalized);bytes=normalized;}
    deploymentFiles.push({path,bytes:bytes.length,sha256:sha256(bytes)});stagedBytes+=bytes.length;
   }else throw new Error('Deployment cannot contain links');
  }
 }
 await inventory(outDir);
 const unique=new Map();for(const item of deploymentFiles){const old=unique.get(item.path);if(old&&(old.bytes!==item.bytes||old.sha256!==item.sha256))throw new Error('Conflicting release file: '+item.path);unique.set(item.path,item);}
 const reviewedFiles=[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)),bytes=reviewedFiles.reduce((sum,item)=>sum+item.bytes,0);
 if(bytes>=1_000_000_000)throw new Error('MoonForest 0.2 exceeds the 1 GB budget');
 const sharedContent=new Set(Object.keys(resourceIndex.files).map(name=>'assets/content/'+name));
 const additiveContent=reviewedFiles.filter(item=>item.path.startsWith('assets/content/')&&!sharedContent.has(item.path));
 const manifest={version:2,release:RELEASE_V2,baseDeploymentSha256:sha256(primaryBytes),resourceRevision:resourceIndex.revision,bytes,files:reviewedFiles,...(additiveContent.length?{additiveContent}:{})};
 assertDeploymentContentGraph(manifest,resourceIndex);
 await writeFile(resolve(outDir,RELEASE_V2_MANIFEST),JSON.stringify(manifest,null,2)+'\n');
 const result={outDir,release:RELEASE_V2,manifestCount,runtimeGraph,bundleAudit,files:reviewedFiles.length,bytes,reusedFiles:reused.length,reusedBytes:reused.reduce((sum,item)=>sum+item.bytes,0),stagedBytes};
 console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildMoonforestV2();
