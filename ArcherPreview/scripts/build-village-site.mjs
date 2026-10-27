import { readFile, readdir, mkdir, copyFile, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { hash } from './resource-pack.js';
import { VILLAGE_ASSET_IDS } from '../src/village-layout.js';

const project=resolve(import.meta.dirname,'..');
const contentName=/^[a-f0-9]{64}\.(?:gltf|bin|png|jpg|jpeg|webp|wav|mp3)$/;

function contentReferences(value,result=[]){
  if(typeof value==='string'&&/^(?:\.\/)?content\//.test(value))result.push(value);
  else if(Array.isArray(value))for(const item of value)contentReferences(item,result);
  else if(value&&typeof value==='object')for(const item of Object.values(value))contentReferences(item,result);
  return result;
}

// Traverse live manifests and glTF dependencies, not public's raw source files.
// Both './content/' and sky.json's 'content/' spelling resolve identically.
export async function collectVillageSiteFiles(publicDirectory,{requireCompleteVillage=true}={}){
  const publicRoot=resolve(publicDirectory),assetsRoot=resolve(publicRoot,'assets'),files=new Map(),pending=[];
  const manifests=(await readdir(assetsRoot,{withFileTypes:true})).filter(e=>e.isFile()&&e.name.endsWith('.json')&&e.name!=='village-fixture.json');
  if(requireCompleteVillage){
    const village=JSON.parse(await readFile(resolve(assetsRoot,'village.json'),'utf8'));
    if(!village.complete||village.developmentFixture||village.availableAssetCount!==25||Object.keys(village.assets??{}).length!==25||VILLAGE_ASSET_IDS.some(id=>village.assets[id]?.visualReview!=='APPROVED'))throw new Error('The production village needs all 25 approved assets; fixtures cannot be published.');
  }
  const enqueue=(url,base)=>{
    if(url.startsWith('data:'))return;
    const absolute=fileURLToPath(new URL(url,pathToFileURL(base))),local=relative(publicRoot,absolute).split(sep).join('/');
    if(!local.startsWith('assets/content/')||!contentName.test(local.slice('assets/content/'.length)))throw new Error(`Unsupported publish dependency: ${url}`);
    pending.push({absolute,local});
  };
  for(const entry of manifests){
    const absolute=resolve(assetsRoot,entry.name),bytes=await readFile(absolute),data=JSON.parse(bytes);
    if(data.developmentFixture)throw new Error(`Development manifest cannot be published: ${entry.name}`);
    files.set(`assets/${entry.name}`,{absolute,bytes:bytes.length});
    for(const url of contentReferences(data))enqueue(url,absolute);
  }
  while(pending.length){
    const {absolute,local}=pending.pop();if(files.has(local))continue;
    const bytes=await readFile(absolute),name=local.split('/').at(-1);
    if(hash(bytes)!==name.slice(0,64))throw new Error(`Content hash mismatch: ${local}`);
    files.set(local,{absolute,bytes:bytes.length});
    if(local.endsWith('.gltf')){
      const gltf=JSON.parse(bytes);
      for(const item of [...(gltf.buffers??[]),...(gltf.images??[])])if(item.uri)enqueue(item.uri,absolute);
    }
  }
  for(const entry of await readdir(publicRoot,{withFileTypes:true})){
    if(!entry.isFile()||!(entry.name==='resource-cache.js'||/notice|licen[cs]e|credits|copying/i.test(entry.name)))continue;
    if(!/\.(?:js|txt|md|html|json)$/i.test(entry.name)&&entry.name.includes('.'))continue;
    const absolute=resolve(publicRoot,entry.name);files.set(entry.name,{absolute,bytes:(await readFile(absolute)).length});
  }
  if(!files.has('resource-cache.js'))throw new Error('Persistent resource-cache worker is missing.');
  return {files,manifestCount:manifests.length};
}

export async function buildVillageSite(){
  // Resolve and check the dedicated generated directory before Vite empties it.
  const outDir=resolve(project,'dist-village'),child=relative(project,outDir);
  if(!child||child.startsWith('..')||isAbsolute(child))throw new Error('Build directory must stay inside the project.');
  try{
    const actualChild=relative(await realpath(project),await realpath(outDir));
    if(!actualChild||actualChild.startsWith('..')||isAbsolute(actualChild))throw new Error('Build directory resolves outside the project.');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const {files,manifestCount}=await collectVillageSiteFiles(resolve(project,'public'));
  await build({root:project,publicDir:false,build:{outDir,emptyOutDir:true}});
  const directories=new Set();
  for(const [local,info]of files){
    const target=resolve(outDir,local),folder=dirname(target);
    if(!directories.has(folder)){await mkdir(folder,{recursive:true});directories.add(folder);}
    await copyFile(info.absolute,target);
  }
  const result={outDir,manifestCount,contentFiles:[...files.keys()].filter(p=>p.startsWith('assets/content/')).length,publishedResourceFiles:files.size,publishedResourceBytes:[...files.values()].reduce((n,f)=>n+f.bytes,0),sourceAssets:25};
  console.log(JSON.stringify(result));return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildVillageSite();
