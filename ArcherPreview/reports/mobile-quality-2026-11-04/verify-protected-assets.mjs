// Read-only protection audit. The explicit --create-baseline mode writes only
// its new sidecar baseline, from immutable Git manifests and verified content.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,basename,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),project=resolve(here,'../..'),repo=resolve(project,'..');
const base='5c65642fddca6472af614b4a8f12829d744cb37e';
const baselinePath=resolve(here,'protected-assets-baseline.json');
const bossNames=['guardian-bear.json','hooded-goblin.json','elena.json','mourning-elena.json'];
const rawBossPaths=['ArcherPreview/public/assets/guardian-bear.glb','ArcherPreview/assets/models/hooded-goblin.glb'];
const prefix='ArcherPreview/public/assets/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const canonicalHash=value=>hash(JSON.stringify(sorted(value)));
const git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:256*1024*1024});
const gitBytes=path=>git('show',base+':'+path);
const json=bytes=>JSON.parse(bytes.toString('utf8'));
const local=path=>resolve(repo,path);
const repoPath=path=>relative(repo,path).replaceAll('\\','/');
const protectedEntry=(id,value)=>value?.category==='building'||id==='village-approach'||id.startsWith('house')||id==='chapel';
function references(value,result=[]){
 if(typeof value==='string'&&/^(?:\.\/)?content\//.test(value))result.push(value);
 else if(Array.isArray(value))for(const item of value)references(item,result);
 else if(value&&typeof value==='object')for(const item of Object.values(value))references(item,result);
 return result;
}
function contentPath(reference,parent){
 const result=fileURLToPath(new URL(reference,pathToFileURL(local(parent)))),path=repoPath(result);
 if(!path.startsWith(prefix+'content/')||!/^\w{64}\.(?:gltf|bin|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/.test(basename(path))||!/^[a-f0-9]{64}\./.test(basename(path)))throw Error('Unsafe/non-hashed protected resource: '+reference);
 return path;
}
async function verifiedContent(path,read=path=>readFile(local(path))){
 const bytes=await read(path),sha256=hash(bytes);
 if(sha256!==basename(path).split('.')[0])throw Error('Content filename hash mismatch: '+path);
 return {bytes,sha256};
}
async function graph(value,manifest,read){
 const queue=references(value).map(reference=>contentPath(reference,manifest)),files=new Map();
 while(queue.length){
  const path=queue.pop();if(files.has(path))continue;
  const {bytes,sha256}=await verifiedContent(path,read);files.set(path,{path,sha256,bytes:bytes.length,type:extname(path).slice(1)});
  if(path.endsWith('.gltf'))for(const entry of [...(json(bytes).buffers??[]),...(json(bytes).images??[])])if(entry.uri&&!entry.uri.startsWith('data:'))queue.push(contentPath(entry.uri,path));
 }
 return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
const graphHash=files=>canonicalHash(files.map(({path,sha256,bytes})=>({path,sha256,bytes})));
function forbiddenProfile(value,path=''){
 if(!value||typeof value!=='object')return [];
 const failures=[];for(const [key,item]of Object.entries(value)){
  if(/mobile.*texture|texture.*mobile/i.test(key))failures.push(path+'/'+key);
  failures.push(...forbiddenProfile(item,path+'/'+key));
 }
 return failures;
}
function originalEnvironment(value,source,path){
 const copy=structuredClone(value),additions=[];
 for(const [id,asset]of Object.entries(copy.assets??{})){
  if(!Object.hasOwn(asset,'mobileHighTextures'))continue;
  if(protectedEntry(id,asset)||protectedEntry(id,source.assets?.[id]))throw Error('Protected asset has mobileHighTextures: '+path+'#'+id);
  if(!source.assets?.[id])throw Error('New asset is outside the texture-only allowance: '+path+'#'+id);
  if(Object.hasOwn(source.assets[id],'mobileHighTextures'))throw Error('Baseline unexpectedly already contains a mobile profile');
  additions.push(id);delete asset.mobileHighTextures;
 }
 return {copy,additions};
}

async function createBaseline(){
 const paths=git('ls-tree','-r','--name-only',base,'--',prefix).toString('utf8').trim().split(/\r?\n/).filter(path=>new RegExp('^'+prefix+'[^/]+\\.json$').test(path));
 const manifests=[],protectedAssets=[],sharedGraphs=new Map(),contents=new Map();
 for(const path of paths){
  const bytes=gitBytes(path),data=json(bytes),boss=bossNames.includes(basename(path)),environment=!!data.assets&&typeof data.assets==='object'&&!Array.isArray(data.assets);
  if(!boss&&!environment)continue;
  manifests.push({path,kind:boss?'boss':'environment',sourceBytesSha256:hash(bytes),originalFieldsSha256:canonicalHash(data),assetCount:environment?Object.keys(data.assets).length:null});
  if(boss){
   if(forbiddenProfile(data).length)throw Error('Baseline boss already contains alternate mobile textures');
   const files=await graph(data,path);protectedAssets.push({manifest:path,id:basename(path,'.json'),reason:'all-boss-fields-and-model-graph',definitionSha256:canonicalHash(data),graphSha256:graphHash(files),contentPaths:files.map(file=>file.path)});
   for(const file of files)contents.set(file.path,file);
  }
  if(environment)for(const [id,asset]of Object.entries(data.assets)){
   // Record all graph owners to expose facade/shared-resource dependencies.
   const files=await graph(asset,path);sharedGraphs.set(path+'#'+id,files.map(file=>file.path));
   if(protectedEntry(id,asset)){
    if(forbiddenProfile(asset).length)throw Error('Baseline house already contains alternate mobile textures');
    protectedAssets.push({manifest:path,id,reason:asset.category==='building'?'category-building':'village-approach-facade',definitionSha256:canonicalHash(asset),graphSha256:graphHash(files),contentPaths:files.map(file=>file.path)});
    for(const file of files)contents.set(file.path,file);
   }
  }
 }
 const rawBossFiles=[];for(const path of rawBossPaths){const original=gitBytes(path);rawBossFiles.push({path,sha256:hash(original),bytes:original.length});}
 const protectedKeys=new Set(protectedAssets.map(asset=>asset.manifest+'#'+asset.id)),sharedWith=[];
 for(const [key,paths]of sharedGraphs){if(protectedKeys.has(key))continue;const shared=paths.filter(path=>contents.has(path));if(shared.length)sharedWith.push({asset:key,protectedSharedPaths:shared});}
 const files=[...contents.values()].sort((a,b)=>a.path.localeCompare(b.path));
 return {schemaVersion:1,baseCommit:base,method:'Git show for original manifests/raw boss sources; current content-addressed graph read and filename SHA-256 verification. Canonical hashes include every original JSON field. Only new assets[id].mobileHighTextures on nonprotected environment entries may be stripped for comparison. Player manifests are outside this audit.',allowedAddition:'assets[nonprotectedId].mobileHighTextures only',manifests,protectedAssets,contentGraphSha256:graphHash(files),contentFiles:files,rawBossFiles,sharedWith,totals:{protectedAssets:protectedAssets.length,contentFiles:files.length,textureFiles:files.filter(file=>['png','jpg','jpeg','webp','ktx2'].includes(file.type)).length,contentBytes:files.reduce((sum,file)=>sum+file.bytes,0),rawBossBytes:rawBossFiles.reduce((sum,file)=>sum+file.bytes,0)}};
}

async function verify(baseline,{manifestOverrides=new Map(),contentOverrides=new Map()}={}){
 const failures=[],additions=[],read=path=>contentOverrides.has(path)?Promise.resolve(contentOverrides.get(path)):readFile(local(path));
 if(baseline.baseCommit!==base)throw Error('Unexpected baseline source');
 const current=new Map();
 for(const expected of baseline.manifests){
  try{
   const source=json(gitBytes(expected.path));if(canonicalHash(source)!==expected.originalFieldsSha256)throw Error('Baseline fields hash differs from Git source');
   const bytes=manifestOverrides.get(expected.path)??await readFile(local(expected.path)),data=json(bytes);current.set(expected.path,data);
   if(expected.kind==='boss'){
    if(hash(bytes)!==expected.sourceBytesSha256)throw Error('Boss manifest bytes changed');
    if(forbiddenProfile(data).length)throw Error('Boss alternate mobile texture profile present');
    if(canonicalHash(data)!==expected.originalFieldsSha256)throw Error('Boss original fields changed');
   }else{
    const result=originalEnvironment(data,source,expected.path);
    if(canonicalHash(result.copy)!==expected.originalFieldsSha256)throw Error('Environment original fields changed beyond the allowed addition');
    additions.push(...result.additions.map(id=>expected.path+'#'+id));
   }
  }catch(error){failures.push({scope:expected.path,error:error.message});}
 }
 for(const expected of baseline.protectedAssets){
  try{
   const document=current.get(expected.manifest),definition=bossNames.includes(basename(expected.manifest))?document:document?.assets?.[expected.id];
   if(!definition||canonicalHash(definition)!==expected.definitionSha256)throw Error('Protected full definition changed');
   if(forbiddenProfile(definition).length)throw Error('Protected alternate mobile texture profile present');
   const files=await graph(definition,expected.manifest,read);if(graphHash(files)!==expected.graphSha256)throw Error('Protected recursive graph changed');
  }catch(error){failures.push({scope:expected.manifest+'#'+expected.id,error:error.message});}
 }
 for(const expected of baseline.contentFiles){
  try{const {bytes,sha256}=await verifiedContent(expected.path,read);if(sha256!==expected.sha256||bytes.length!==expected.bytes)throw Error('Protected content bytes changed');}
  catch(error){failures.push({scope:expected.path,error:error.message});}
 }
 for(const expected of baseline.rawBossFiles){
  try{const bytes=await readFile(local(expected.path));if(hash(bytes)!==expected.sha256||bytes.length!==expected.bytes)throw Error('Tracked raw boss model bytes changed');}
  catch(error){failures.push({scope:expected.path,error:error.message});}
 }
 // A profile must never be attached to a protected ID in a new/copied manifest.
 const protectedIds=new Set(baseline.protectedAssets.map(asset=>asset.id));
 for(const name of (await readdir(resolve(project,'public/assets'))).filter(name=>name.endsWith('.json'))){
  try{const data=json(await readFile(resolve(project,'public/assets',name)));for(const [id,asset]of Object.entries(data.assets??{}))if((protectedIds.has(id)||protectedEntry(id,asset))&&forbiddenProfile(asset).length)throw Error('Protected asset has alternate profile in '+name+'#'+id);}
  catch(error){failures.push({scope:name,error:error.message});}
 }
 return {ok:failures.length===0,baseCommit:base,protectedGraphSha256:baseline.contentGraphSha256,...baseline.totals,environmentManifests:baseline.manifests.filter(item=>item.kind==='environment').length,bossManifests:bossNames,allowedMobileProfileAdditions:additions,sharedResourceOwners:baseline.sharedWith.map(item=>item.asset),failures};
}

async function selfTest(baseline){
 const asset=baseline.protectedAssets.find(asset=>asset.reason==='category-building'),path=asset.manifest,source=json(gitBytes(path));
 const changed=structuredClone(source);changed.assets[asset.id].height+=1;
 const mobile=structuredClone(source);mobile.assets[asset.id].mobileHighTextures={resources:[]};
 const allowed=structuredClone(source),nonprotected=Object.keys(allowed.assets).find(id=>!protectedEntry(id,allowed.assets[id]));allowed.assets[nonprotected].mobileHighTextures={resources:[]};
 const originalInputs=new Map(await Promise.all(baseline.manifests.map(async manifest=>[manifest.path,gitBytes(manifest.path)])));
 const probe=async (name,{manifest,content},expected)=>{
  const overrides=new Map(originalInputs);if(manifest)overrides.set(path,Buffer.from(JSON.stringify(manifest)));
  const result=await verify(baseline,{manifestOverrides:overrides,contentOverrides:content??new Map()});
  if(result.ok!==expected)throw Error('Protection self-test failed: '+name+' '+JSON.stringify(result.failures));return {name,passed:true};
 };
 const bytes=await readFile(local(baseline.contentFiles[0].path)),corrupt=Buffer.from(bytes);corrupt[0]^=1;
 return [await probe('house definition mutation is rejected',{manifest:changed},false),await probe('house mobile alternate profile is rejected',{manifest:mobile},false),await probe('nonprotected alternate addition preserves every original field',{manifest:allowed},true),await probe('protected content byte mutation is rejected',{content:new Map([[baseline.contentFiles[0].path,corrupt]])},false)];
}

if(process.argv.includes('--create-baseline')){
 const baseline=await createBaseline();await writeFile(baselinePath,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({created:baselinePath,...baseline.totals,protectedGraphSha256:baseline.contentGraphSha256},null,2));
}else{
 const baseline=json(await readFile(baselinePath)),result=await verify(baseline);
 if(process.argv.includes('--self-test'))result.selfTests=await selfTest(baseline);
 console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
