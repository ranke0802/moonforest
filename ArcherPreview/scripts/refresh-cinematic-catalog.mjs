import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildAssetCatalog,catalogModule,editableIndexModule} from './build-asset-catalog.mjs';

// Called after the verified resource index is regenerated, before Vite reads
// source modules. New registered manifests require no hand-maintained palette.
export async function refreshCinematicCatalog({projectRoot=resolve(import.meta.dirname,'..')}={}){
 const result=await buildAssetCatalog({projectRoot}),changed=[];
 for(const [name,text]of [['asset-catalog.js',catalogModule(result.catalog)],['editable-asset-index.js',editableIndexModule(result.catalog)]]){
  const file=resolve(projectRoot,'src',name);let old;try{old=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(old!==text){await writeFile(file,text);changed.push(name);}
 }
 return {...result,changed};
}
