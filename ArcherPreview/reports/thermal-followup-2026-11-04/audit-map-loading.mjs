// Local CPU/cache-contract evidence only. Does not measure a phone, GPU or FPS.
// node reports/thermal-followup-2026-11-04/audit-map-loading.mjs [diagnostic.json]
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../../src/world.js';
import {prepareVillageStart} from '../../src/village-streamed-environment.js';
import {prepareMapResources} from '../../src/startup-resources.js';
import {DecodeCache,meshoptCacheKey} from '../../src/map-decode-cache.js';
import {worldSpawn} from '../../src/map-route.js';
import {VILLAGE_SPAWN} from '../../src/village-layout.js';

const base=new URL('../../public/assets/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,base))),models=new Set();
const collect=value=>{if(typeof value==='string'&&/^(?:\.\/)?content\/[a-f0-9]{64}\.gltf$/.test(value))models.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
for(const file of readdirSync(base).filter(n=>n.endsWith('.json')))collect(read(file));
const docs=new Map(),identities=new Map(),checkedBuffers=new Set();let views=0,oldDecodedBytes=0;
for(const model of [...models].sort()){
 const doc=read(model),extension={_loader:{gltf:doc}},name=model.split('/').at(-1);docs.set(model,doc);
 for(const [index,view] of (doc.bufferViews??[]).entries()){
  const input=view.extensions?.EXT_meshopt_compression;if(!input)continue;
  const bytes=input.count*input.byteStride,key=meshoptCacheKey(extension,view,name,'/bufferViews/'+index);
  if(!key.startsWith('['))continue;
  const uri=doc.buffers[input.buffer].uri,bufferUrl=new URL(uri,new URL(model,base));
  if(!checkedBuffers.has(bufferUrl.href)){
   const hash=createHash('sha256').update(readFileSync(bufferUrl)).digest('hex');
   if(hash!==uri.replace(/^\.\//,'').replace(/\.bin$/,''))throw Error('Authored buffer SHA mismatch: '+uri);
   checkedBuffers.add(bufferUrl.href);
  }
  views++;oldDecodedBytes+=bytes;
  const entry=identities.get(key)??{bytes,models:[]};entry.models.push(model);identities.set(key,entry);
 }
}
const catalog={models:models.size,verifiedExternalBufferHashes:checkedBuffers.size,eligibleViews:views,distinctDecodeInputs:identities.size,duplicateViewEntries:views-identities.size,
 cumulativeOldDecodedBytes:oldDecodedBytes,cumulativeDistinctDecodedBytes:[...identities.values()].reduce((n,e)=>n+e.bytes,0),
 note:'Whole authored catalog, not resident memory or an observed phone load sequence.',examples:[...identities.entries()].filter(([,e])=>e.models.length>1).slice(0,3).map(([key,e])=>({key,...e}))};

const previous={location:globalThis.location,caches:globalThis.caches,fetch:globalThis.fetch};
const root='https://thermal-audit.test/assets/',index=read('resource-index.json'),allUrls=Object.keys(index.files).map(n=>root+'content/'+n);
const io={keyCalls:0,matchCalls:0,contentFetches:0,jsonFetches:0};
const cache={keys:async()=>{io.keyCalls++;return allUrls.map(url=>({url}));},match:async()=>{io.matchCalls++;throw Error('Warm batch should enumerate inventory, not open response bodies');}};
globalThis.location={href:'https://thermal-audit.test/?character=warrior-v3'};
globalThis.caches={open:async()=>cache};
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.split('/').at(-1);if(!name.endsWith('.json')){io.contentFetches++;throw Error('Unexpected content body read');}
 io.jsonFetches++;return new Response(readFileSync(new URL(name,base)));
};
const engine=new NullEngine({renderWidth:1664,renderHeight:768});
engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
const world=createWorld(engine,{village:true,touchDevice:true});
const oldCache=new DecodeCache(8*1048576),newCache=new DecodeCache(8*1048576);let oldDecodeBytes=0,newDecodeBytes=0;
const visits=[];
try{
 for(const character of ['warrior-v3','warrior-plains','warrior-v4','warrior-v5','warrior-v4','warrior-plains','warrior-v3']){
  for(const record of world.villagePrepared?.records??[])record.root.dispose();world.villagePrepared=null;world.releaseResourceDownloads?.();replaceWorldMap(world,character);
  const spawn=worldSpawn(character,'',VILLAGE_SPAWN),position=new Vector3(spawn.x,1,spawn.z);world.camera.setTarget(position);world.camera.radius=17;world.caveFog?.update?.(position,0,true);
  const start=performance.now();const plan=await prepareVillageStart(world);const planMs=performance.now()-start,before={...io};let state;
  const cachedStart=performance.now();await prepareMapResources(world,new URL(root),s=>state=s);const cachedPrepareMs=performance.now()-cachedStart;
  for(const request of plan.plan){
   const paths=plan.assets.get(request.id).levels.find(l=>l.level===request.level).resources;await world.prefetchResources(paths,{initial:true});
   const model=plan.assets.get(request.id).levels.find(l=>l.level===request.level).model,doc=docs.get(model)??read(model),extension={_loader:{gltf:doc}},name=model.split('/').at(-1);
   for(const [i,view] of (doc.bufferViews??[]).entries()){
    const input=view.extensions?.EXT_meshopt_compression;if(!input)continue;const bytes=input.count*input.byteStride;
    if(!oldCache.get(name+'/bufferViews/'+i)){oldDecodeBytes+=bytes;oldCache.put(name+'/bufferViews/'+i,true,bytes);}
    const key=meshoptCacheKey(extension,view,name,'/bufferViews/'+i);if(!newCache.get(key)){newDecodeBytes+=bytes;newCache.put(key,true,bytes);}
   }
  }
  visits.push({character,records:plan.records.length,initialModels:plan.plan.length,localPlanMs:planMs,localCachedPreparationMs:cachedPrepareMs,
   inventoryScans:io.keyCalls-before.keyCalls,responseMatches:io.matchCalls-before.matchCalls,contentFetches:io.contentFetches-before.contentFetches,
   networkBytes:state.total,initialReuseFiles:world.resourceDownloadStats.initialPrefetchReusedFiles});
 }
}finally{engine.dispose();Object.assign(globalThis,previous);}
const diagnostic=process.argv[2]?readFileSync(process.argv[2]):null,source=diagnostic?JSON.parse(diagnostic.toString('utf8').replace(/^\uFEFF/,'')):null;
const focusedLog=new URL('map-loading-focused.log',import.meta.url),log=existsSync(focusedLog)?readFileSync(focusedLog,'utf8'):'';
const find=(value,key)=>{if(!value||typeof value!=='object')return undefined;if(Object.hasOwn(value,key))return value[key];for(const v of Object.values(value)){const found=find(v,key);if(found!==undefined)return found;}};
const report={generatedAt:new Date().toISOString(),sourceSampleSha256:diagnostic?createHash('sha256').update(diagnostic).digest('hex'):null,
 focusedTests:log?{passed:Number(log.match(/pass (\d+)/)?.[1]),failed:Number(log.match(/fail (\d+)/)?.[1]),log:'reports/thermal-followup-2026-11-04/map-loading-focused.log'}:null,
 sample:source?Object.fromEntries(['loading','loadHistory','mapDecodeCache','ktxWorker','meshoptWorker','resourceDownloads'].map(k=>[k,find(source,k)])):null,
 catalog,warmContract:{visits,io,note:'CacheStorage inventory is a deterministic in-memory fixture. Timings are local Node CPU probes, not browser storage/phone speed.'},
 sequentialInitialPlanReplay:{old:{...oldCache.inspect(),decodedBytes:oldDecodeBytes},content:{...newCache.inspect(),decodedBytes:newDecodeBytes},
 note:'Same bounded 8MiB/256-entry LRU, fixed spawn camera initial model plans in declared visit order. Sequential replay, not runtime concurrent decoder timing or a phone FPS result.'},
 conclusions:[
 'Changed only completed meshopt CPU cache identity and same-loader view promise reuse; no global pending loader/network work is shared.',
  'The cache uses the existing content-addressed file SHA contract, not a new per-view runtime byte hash. Authored external buffers were SHA-verified by this audit; a successfully decoded corrupt cache entry under a correct SHA filename remains an existing integrity assumption, now shared across matching texture variants.',
 '8MiB geometry / 24MiB texture caps and existing texture/geometry quality are unchanged. 4K/8K decoded textures still bypass the CPU texture pool.',
 'Warm resource preparation opens the cache inventory once and does not consume cached model/texture bodies. Later initial model prefetches reuse that fresh inventory proof; normal streaming still checks actual eviction.',
 'The download diagnostic phase also includes prepareVillageStart transform/bounds/demand work and manifest waits. Its 1.5–2.4s is not a direct CacheStorage or network timing.',
 'No burst job timestamp history proves that retaining decoder WASM longer would help this sample. Both worker counts show all created workers terminated, zero active/queued jobs at capture; keep 1s idle retirement and max one worker rather than increase retained memory.',
 'No claim that this transition CPU reduction fixes persistent phone heat or the observed 40FPS. Browser/GPU/phone validation was not performed.'
 ]};
writeFileSync(new URL('map-loading-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({catalog,warmContract:report.warmContract,sequentialInitialPlanReplay:report.sequentialInitialPlanReplay},null,2));
