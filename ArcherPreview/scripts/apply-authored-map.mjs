import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ASSET_CATALOG} from '../src/asset-catalog.js';
import {createBasePlacementManifest,validatePlacementDocument} from '../src/placement-document.js';

const within=(root,path)=>{const local=relative(root,path);if(!local||local.startsWith('..')||isAbsolute(local))throw new Error('Project output escaped its target directory');return path;};
async function atomic(path,bytes){await mkdir(dirname(path),{recursive:true});const temporary=path+'.pending';await writeFile(temporary,bytes);await rename(temporary,path);}
export async function applyAuthoredMap(input,{projectRoot=resolve(import.meta.dirname,'..'),dryRun=true}={}){
 const file=resolve(input);if((await stat(file)).size>512*1024)throw new Error('Placement file exceeds512KiB');
 const bytes=Buffer.from((await readFile(file,'utf8')).replaceAll('\r\n','\n')),raw=JSON.parse(bytes.toString('utf8'));
 const document=validatePlacementDocument(raw,{catalog:ASSET_CATALOG,baseManifest:createBasePlacementManifest(raw.mapId,{catalog:ASSET_CATALOG})});
 const root=resolve(projectRoot),path='authored/maps/'+document.mapId+'.json',target=within(root,resolve(root,'public',path)),indexPath=within(root,resolve(root,'src/authored-map-index.json'));
 const sha256=createHash('sha256').update(bytes).digest('hex');let index;
 try{index=JSON.parse(await readFile(indexPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;index={version:1,maps:{}};}
 if(index.version!==1||!index.maps||typeof index.maps!=='object')throw new Error('Unsupported authored map registry');
 const old=index.maps[document.mapId];
 if(old&&old.sha256!==sha256&&document.revision<=old.revision)throw new Error('Project placement revision conflict');
 const entry={path,sha256,revision:document.revision,baseRevision:document.baseRevision};
 if(!dryRun){await atomic(target,bytes);index.maps[document.mapId]=entry;await atomic(indexPath,JSON.stringify(index,null,2)+'\n');}
 return {valid:true,dryRun,mapId:document.mapId,instances:document.instances.length,entry,target,indexPath,sourceUnmodified:true,validation:'Strict IDs/version/transform/revision checks; physical support is rechecked atomically by the game runtime.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),file=args.find(value=>!value.startsWith('--'));if(!file)throw new Error('Usage: node scripts/apply-authored-map.mjs <export.json> [--apply]');
 console.log(JSON.stringify(await applyAuthoredMap(file,{dryRun:!args.includes('--apply')})));
}
