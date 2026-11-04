import {readFile,writeFile,mkdir,stat,realpath,rename,unlink,open} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {CINEMATIC_LIMITS,validateCinematicDocument} from '../src/cinematic-document.js';
import {DEFAULT_CINEMATIC_REFERENCES,listRegisteredCinematics} from '../src/cinematic-registry.js';
import {createBasePlacementManifest,validatePlacementDocument} from '../src/placement-document.js';
import {authoredMapReference} from '../src/authored-map-loader.js';

const projectDefault=resolve(import.meta.dirname,'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function scoped(root,path){
  const target=resolve(path),inside=value=>{const rel=relative(root,value);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);};
  if(!inside(target))throw new Error('Registration target escapes the named project');
  let ancestor=target;
  for(;;){try{const actual=await realpath(ancestor);if(actual!==root&&!inside(actual))throw new Error('Registration target follows a link outside the project');return target;}catch(error){if(error.code!=='ENOENT')throw error;const parent=dirname(ancestor);if(parent===ancestor)throw error;ancestor=parent;}}
}
async function readRegistry(path){try{return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}

export async function registerCinematic({inputPath,projectRoot=projectDefault,apply=false,references=DEFAULT_CINEMATIC_REFERENCES,renameFile=rename}={}){
  if(!inputPath)throw new Error('--input JSON file is required');
  const root=await realpath(resolve(projectRoot)),source=resolve(inputPath),size=(await stat(source)).size;
  if(size>CINEMATIC_LIMITS.bytes)throw new Error('Cinematic input exceeds512KiB');
  const input=await readFile(source),text=new TextDecoder('utf-8',{fatal:true}).decode(input).replace(/\r\n?/g,'\n'),bytes=Buffer.from(text,'utf8');
  if(bytes.length>CINEMATIC_LIMITS.bytes)throw new Error('Cinematic input exceeds512KiB');
  const raw=JSON.parse(text);let validationReferences=references;
  if(['village','great-plains','monster-forest','witch-cave'].includes(raw?.mapId)){
    const base=createBasePlacementManifest(raw.mapId,{catalog:references.catalog}),instanceIds=new Set([...(references.instanceIds??[]),...base.instances.map(value=>value.instanceId)]);
    const overlayIndexPath=await scoped(root,resolve(root,'src/authored-map-index.json')),overlayIndexText=await readRegistry(overlayIndexPath),overlayIndex=overlayIndexText===null?{version:1,maps:{}}:JSON.parse(overlayIndexText),reference=authoredMapReference(raw.mapId,null,overlayIndex);
    if(reference){
      const overlayPath=await scoped(root,resolve(root,'public',reference.path));if((await stat(overlayPath)).size>CINEMATIC_LIMITS.bytes)throw new Error('Registered placement overlay exceeds512KiB');
      const overlayBytes=await readFile(overlayPath);if(hash(overlayBytes)!==reference.sha256)throw new Error('Registered placement overlay SHA256 differs');
      const overlay=JSON.parse(overlayBytes.toString('utf8'));if(overlay.revision!==reference.revision||overlay.baseRevision!==reference.baseRevision)throw new Error('Registered placement overlay metadata differs');
      for(const instance of validatePlacementDocument(overlay,{catalog:references.catalog,baseManifest:base}).instances)instanceIds.add(instance.instanceId);
    }
    validationReferences={...references,instanceIds:[...instanceIds]};
  }
  const validated=validateCinematicDocument(text,validationReferences);if(!validated.valid)throw Object.assign(new Error('Cinematic validation failed'),{errors:validated.errors});
  const document=validated.document,sha256=hash(bytes),url=`authored/cinematics/${sha256}.json`,entry={cutsceneId:document.cutsceneId,mapId:document.mapId,version:document.version,catalogRevision:document.catalogRevision,duration:document.duration,sha256,bytes:bytes.length,url};
  const registryPath=await scoped(root,resolve(root,'src/cinematic-registry.json')),contentPath=await scoped(root,resolve(root,'public',url)),previousText=await readRegistry(registryPath);
  const registry=previousText===null?{version:1,entries:[]}:JSON.parse(previousText),entries=listRegisteredCinematics(registry).filter(value=>value.cutsceneId!==entry.cutsceneId);
  entries.push(entry);entries.sort((a,b)=>a.cutsceneId.localeCompare(b.cutsceneId));const next={version:1,entries};listRegisteredCinematics(next);
  const result={applied:false,cutsceneId:entry.cutsceneId,entry,registryPath,contentPath,document,cleanupWarnings:[]};
  if(!apply)return result;
  let lock,createdContent=false,committed=false;const stages=new Set(),lockPath=await scoped(root,registryPath+'.lock');
  async function removeOwned(path){try{await scoped(root,path);await unlink(path);}catch(error){if(error.code!=='ENOENT')result.cleanupWarnings.push(error.message);}}
  try{
    await mkdir(dirname(registryPath),{recursive:true});await scoped(root,registryPath);
    try{lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,token:randomUUID()})+'\n');}catch(error){if(error.code==='EEXIST')throw new Error('Another cinematic registration is active; registry lock exists');throw error;}
    if(await readRegistry(registryPath)!==previousText)throw new Error('Cinematic registry changed during validation; retry with the current registry');
    await mkdir(dirname(contentPath),{recursive:true});await scoped(root,contentPath);
    let exists=false;try{const info=await stat(contentPath);exists=true;if(info.size!==bytes.length||hash(await readFile(contentPath))!==sha256)throw new Error('Existing content-addressed cinematic differs from its hash');}catch(error){if(error.code!=='ENOENT')throw error;}
    const suffix='.stage-'+randomUUID(),registryStage=await scoped(root,registryPath+suffix),contentStage=await scoped(root,contentPath+suffix);
    if(!exists){stages.add(contentStage);await writeFile(contentStage,bytes,{flag:'wx'});}
    stages.add(registryStage);await writeFile(registryStage,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
    if(!exists){await renameFile(contentStage,contentPath);stages.delete(contentStage);createdContent=true;}
    if(await readRegistry(registryPath)!==previousText)throw new Error('Cinematic registry changed before commit; retry with the current registry');
    await renameFile(registryStage,registryPath);stages.delete(registryStage);committed=true;result.applied=true;return result;
  }catch(error){
    if(createdContent&&!committed){try{if(hash(await readFile(contentPath))===sha256)await removeOwned(contentPath);}catch(cleanupError){result.cleanupWarnings.push(cleanupError.message);}}
    if(result.cleanupWarnings.length)error.cleanupWarnings=result.cleanupWarnings;throw error;
  }finally{
    for(const path of stages)await removeOwned(path);
    if(lock){await lock.close().catch(error=>result.cleanupWarnings.push(error.message));await removeOwned(lockPath);}
  }
}

async function main(){
  const options={};for(let i=2;i<process.argv.length;i++){
    const argument=process.argv[i];if(argument==='--apply')options.apply=true;
    else if(argument==='--input'||argument==='--project'){const value=process.argv[++i];if(!value||value.startsWith('--'))throw new Error('Missing value for '+argument);options[argument==='--input'?'inputPath':'projectRoot']=value;}
    else if(!argument.startsWith('--')&&!options.inputPath)options.inputPath=argument;
    else throw new Error('Unknown registration option: '+argument);
  }
  const result=await registerCinematic(options);console.log(JSON.stringify({mode:result.applied?'applied':'dry-run',entry:result.entry,registryPath:result.registryPath,contentPath:result.contentPath,cleanupWarnings:result.cleanupWarnings}));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))try{await main();}catch(error){console.error(JSON.stringify({error:error.message,...(error.errors?{errors:error.errors}:{}),...(error.cleanupWarnings?{cleanupWarnings:error.cleanupWarnings}:{})}));process.exitCode=1;}
