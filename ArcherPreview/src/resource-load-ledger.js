import {CONTENT_NAME,PACK_NAME} from './resource-index.js';

const counters=()=>({requestedFiles:0,logicalRequestBytes:0,cacheHits:0,preparedReuses:0,fileRequests:0,bundleRequests:0,extractedFiles:0,completedFiles:0,failedRequests:0,responseBodyBytes:0,observedTransferBytes:0,transferSamples:0});
const kind=name=>/\.(ktx2|png|jpe?g|webp)$/.test(name)?'texture':name.endsWith('.gltf')?'model':name.endsWith('.bin')?'geometry':/\.(js|wasm)$/.test(name)?'decoder':/\.(mp3|wav)$/.test(name)?'audio':'other';
const finite=value=>Number.isFinite(value)&&value>=0?value:null;

/** Per-map preparation evidence, not a list of rendered meshes or GPU memory.
 * No bodies, frame observers or historical event arrays are retained. Browser
 * ResourceTiming is consulted once after each completed fetch, never polled.
 */
export class ResourceLoadLedger{
 constructor({base,sizes={},now=()=>performance.now(),timing=null,maxEntries=4096}={}){
  this.base=base;this.sizes=sizes;this.now=now;this.timing=timing;this.maxEntries=Math.max(1,Math.min(16384,Math.floor(maxEntries)||4096));
  this.startedAtMs=now();this.readyAtMs=null;this.closedAtMs=null;this.files=new Map();this.bundles=new Map();this.phases={initial:counters(),streaming:counters()};this.dropped={files:0,bundles:0};
 }
 phase(){return this.readyAtMs===null?'initial':'streaming';}
 markReady(){if(this.closedAtMs===null&&this.readyAtMs===null)this.readyAtMs=this.now();}
 close(){if(this.closedAtMs===null){this.closedAtMs=this.now();for(const row of [...this.files.values(),...this.bundles.values()])if(['requested','fetching'].includes(row.status))row.status='cancelled';}}
 row(path,phase=this.phase(),bundle=false){
  if(this.closedAtMs!==null)return null;
  let url;try{url=new URL(path,this.base);}catch{return null;}
  const name=url.pathname.split('/').at(-1),safe=bundle?'bundles/'+name:'content/'+name;
  if(bundle?!PACK_NAME.test(safe):!CONTENT_NAME.test(name))return null;
  const rows=bundle?this.bundles:this.files;let row=rows.get(safe);
  if(!row){
   if(this.files.size+this.bundles.size>=this.maxEntries){this.dropped[bundle?'bundles':'files']++;return null;}
   row={path:safe,kind:bundle?'archive':kind(name),logicalBytes:bundle?null:finite(this.sizes[name]),firstAtMs:this.now(),lastAtMs:null,status:'requested',phases:{},transfer:null};rows.set(safe,row);
  }
  row.lastAtMs=this.now();row.phases[phase]??=counters();return row;
 }
 add(row,phase,key,amount=1){if(this.closedAtMs!==null)return;this.phases[phase][key]+=amount;if(row)row.phases[phase][key]+=amount;}
 request(path,phase=this.phase()){
  const row=this.row(path,phase);this.add(row,phase,'requestedFiles');const size=finite(this.sizes[new URL(path,this.base).pathname.split('/').at(-1)]);if(size!==null)this.add(row,phase,'logicalRequestBytes',size);return row;
 }
 cached(row,phase){if(this.closedAtMs!==null)return;this.add(row,phase,'cacheHits');if(row)row.status='cache-storage';}
 reuse(paths,{initial=false}={}){
  if(this.closedAtMs!==null)return;const phase=this.phase();
  for(const path of new Set(paths)){const row=this.request(path,phase);this.add(row,phase,'preparedReuses');if(row)row.status=initial?'initial-plan-reuse':'prepared-reuse';}
 }
 fetchFile(row,phase){if(this.closedAtMs!==null)return;this.add(row,phase,'fileRequests');if(row)row.status='fetching';}
 fetchBundle(pack,phase){const row=this.row(pack.url,phase,true);if(row){row.compressedBytes=pack.bytes;row.unpackedBytes=pack.unpackedBytes;row.memberCount=pack.files.length;row.status='fetching';}this.add(row,phase,'bundleRequests');return row;}
 body(row,phase,bytes){if(bytes>0)this.add(row,phase,'responseBodyBytes',bytes);}
 extracted(row,phase,bundle){if(this.closedAtMs!==null)return;this.add(row,phase,'extractedFiles');this.add(row,phase,'completedFiles');if(row){row.status='bundle-extracted';row.bundle=bundle?.path??null;}}
 complete(row,phase,url,startedAtMs){if(this.closedAtMs!==null)return;this.add(row,phase,'completedFiles');if(row)row.status='prepared';this.transfer(row,phase,url,startedAtMs);}
 finishBundle(row,phase,url,startedAtMs){if(this.closedAtMs!==null)return;if(row)row.status='extracted';this.transfer(row,phase,url,startedAtMs);}
 fail(row,phase,error){if(this.closedAtMs!==null)return;this.add(row,phase,'failedRequests');if(row){row.status='failed';row.error=String(error?.name??'Error').slice(0,64);}}
 deferred(row){if(this.closedAtMs===null&&row)row.status='loader-fallback';}
 transfer(row,phase,url,startedAtMs){
  if(!row||this.closedAtMs!==null)return;
  let entries;try{entries=this.timing?.getEntriesByName?.(url,'resource');}catch{return;}
  const entry=entries?.at(-1);if(!entry||entry.startTime<startedAtMs||entry.responseEnd<entry.startTime)return;
  const transfer=finite(entry.transferSize),encoded=finite(entry.encodedBodySize),decoded=finite(entry.decodedBodySize);
  // Zero transferSize is ambiguous for SW/HTTP cache or restricted timing. It
  // is retained as reported, never asserted to mean zero network traffic.
  row.transfer={reportedTransferBytes:transfer,encodedBodyBytes:encoded,decodedBodyBytes:decoded,networkTransferBytes:transfer>0?transfer:null,source:transfer>0?'resource-timing':'unknown',deliveryType:typeof entry.deliveryType==='string'?entry.deliveryType.slice(0,32):null};
  if(transfer>0){this.add(row,phase,'observedTransferBytes',transfer);this.add(row,phase,'transferSamples');}
 }
 snapshot(){
  const files=[...this.files.values()].map(row=>structuredClone(row)),bundles=[...this.bundles.values()].map(row=>structuredClone(row));
  return {version:1,scope:'resource-preparation',startedAtMs:this.startedAtMs,readyAtMs:this.readyAtMs,closedAtMs:this.closedAtMs,maxEntries:this.maxEntries,dropped:{...this.dropped},phases:structuredClone(this.phases),files,bundles,
   trackedLogicalBytes:files.reduce((sum,row)=>sum+(row.logicalBytes??0),0),
   measurement:'Rows identify requested preparation files and cache checks, not all files rendered or GPU-resident bytes. logicalBytes is uncompressed content-file size. responseBodyBytes counts consumed fetch bodies: compressed archive bytes for bundles, HTTP-decoded bytes for files. Bundle members never duplicate archive response bytes. observedTransferBytes is only available positive ResourceTiming transferSize (including transport overhead); missing/zero timing leaves network bytes unknown. Initial-ready and later-streaming counters are separate. Loader fallback and initial-plan reuse do not prove a network request.'};
 }
}
