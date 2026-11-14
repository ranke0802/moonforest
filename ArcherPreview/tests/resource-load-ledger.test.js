import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {ResourceDownloads,resourceUrl} from '../src/resource-downloads.js';
import {ResourceLoadLedger} from '../src/resource-load-ledger.js';

const base='https://example.test/ArcherPreviewSite/assets/',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture({bundle=false,maxEntries=4096,storage=true}={}){
 const data=[Buffer.from('geometry '.repeat(120)),Buffer.from('texture '.repeat(120))],names=data.map((bytes,i)=>hash(bytes)+(i?'.ktx2':'.bin')),paths=names.map(name=>'content/'+name),sizes=Object.fromEntries(names.map((name,i)=>[name,data[i].length])),stored=new Map(),calls=[];
 const encoded=gzipSync(Buffer.concat(data)),pack={url:'bundles/'+hash(encoded)+'.mfp.gz',bytes:encoded.length,unpackedBytes:data[0].length+data[1].length,files:names},index={version:1,revision:'a'.repeat(64),files:sizes,bundles:bundle?[pack]:[]};
 const cache={async match(url){return stored.has(url)?new Response(stored.get(url)):undefined;},async put(url,response){stored.set(url,new Uint8Array(await response.arrayBuffer()));},async delete(url){stored.delete(url);}};
 let now=0;const downloads=new ResourceDownloads(sizes,base,{index,ledgerMaxEntries:maxEntries,now:()=>++now,cacheStorage:storage?{open:async()=>cache}:undefined,fetcher:async(url,options)=>{calls.push({url,options});return new Response(url.endsWith('.gz')?encoded:data[names.indexOf(url.split('/').at(-1))]);}});
 return {downloads,cache,stored,calls,data,paths,names,sizes,pack,encoded,advance:()=>{now+=100;}};
}

test('per-map ledger distinguishes cache, fetched body and initial plan reuse from later streaming without new fetches',async()=>{
 const f=fixture();f.stored.set(resourceUrl(f.paths[0],base),f.data[0]);
 await f.downloads.prepare([f.paths[0],f.paths[1]+'?rev=secret',f.paths[1]]);
 f.downloads.noteReuse([f.paths[0],f.paths[1]],{initial:true});
 const initial=f.downloads.snapshot();
 assert.equal(initial.files.length,2);assert.deepEqual(initial.files.map(row=>row.kind),['geometry','texture']);assert.equal(initial.phases.initial.cacheHits,1);assert.equal(initial.phases.initial.fileRequests,1);assert.equal(initial.phases.initial.preparedReuses,2);
 assert.equal(initial.phases.initial.responseBodyBytes,f.data[1].length);assert.equal(initial.phases.initial.observedTransferBytes,0);assert.equal(initial.phases.initial.transferSamples,0);assert.ok(initial.files.every(row=>row.transfer===null));
 assert.equal(initial.trackedLogicalBytes,f.data[0].length+f.data[1].length);assert.ok(initial.files.every(row=>!row.path.includes('?')&&!row.path.includes('example.test')));
 f.downloads.markReady();f.advance();await f.downloads.prepare(f.paths);
 const end=f.downloads.snapshot();assert.ok(end.readyAtMs>end.startedAtMs);assert.equal(end.phases.streaming.cacheHits,2);assert.equal(end.phases.streaming.fileRequests,0);assert.equal(f.calls.length,1);assert.deepEqual(end.phases.initial,initial.phases.initial);
 initial.files[0].phases.initial.cacheHits=999;assert.notEqual(f.downloads.snapshot().files[0].phases.initial.cacheHits,999,'snapshot cannot mutate live evidence');
});

test('bundle compressed body cost is separate from member logical sizes and extraction never double-counts archive traffic',async()=>{
 const f=fixture({bundle:true});await f.downloads.prepare(f.paths);const s=f.downloads.snapshot();
 assert.equal(f.calls.length,1);assert.equal(s.bundles.length,1);assert.equal(s.phases.initial.bundleRequests,1);assert.equal(s.phases.initial.fileRequests,0);assert.equal(s.phases.initial.responseBodyBytes,f.encoded.length);assert.equal(s.phases.initial.extractedFiles,2);
 assert.equal(s.bundles[0].compressedBytes,f.pack.bytes);assert.equal(s.bundles[0].unpackedBytes,f.pack.unpackedBytes);assert.equal(s.bundles[0].phases.initial.responseBodyBytes,f.encoded.length);
 assert.equal(s.trackedLogicalBytes,f.pack.unpackedBytes);assert.ok(s.files.every(row=>row.phases.initial.responseBodyBytes===0&&row.status==='bundle-extracted'&&row.bundle===f.pack.url));
 assert.ok(s.files.every(row=>row.transfer===null));assert.equal(s.bundles[0].transfer,null);
});

test('storage fallback and failed download remain explicitly incomplete rather than invented cached or network bytes',async()=>{
 const fallback=fixture({storage:false});fallback.downloads.storage=undefined;
 await fallback.downloads.prepare(fallback.paths);const unavailable=fallback.downloads.snapshot();assert.equal(fallback.calls.length,0);assert.ok(unavailable.files.every(row=>row.status==='loader-fallback'));assert.equal(unavailable.phases.initial.responseBodyBytes,0);assert.equal(unavailable.phases.initial.completedFiles,0);
 const f=fixture();f.downloads.fetcher=async()=>new Response(new Uint8Array(5));await assert.rejects(f.downloads.prepare([f.paths[0]]));const failed=f.downloads.snapshot();assert.equal(failed.files[0].status,'failed');assert.equal(failed.files[0].error,'Error');assert.equal(failed.phases.initial.failedRequests,1);assert.equal(failed.phases.initial.completedFiles,0);assert.equal(failed.phases.initial.responseBodyBytes,5);
});

test('ledger row limits and map cancellation bound ownership without retaining bodies or accepting late mutations',async()=>{
 const f=fixture({maxEntries:1});await f.downloads.prepare(f.paths);let s=f.downloads.snapshot();assert.equal(s.files.length+s.bundles.length,1);assert.equal(s.dropped.files,1);assert.equal(s.phases.initial.requestedFiles,2);assert.equal(s.phases.initial.fileRequests,2);
 f.downloads.cancel();s=f.downloads.snapshot();assert.ok(s.closedAtMs!==null);const before=JSON.stringify(s);f.downloads.noteReuse(f.paths);f.downloads.markReady();f.downloads.ledger.complete(f.downloads.ledger.files.values().next().value,'initial',resourceUrl(f.paths[0],base),0);await assert.rejects(f.downloads.prepare(f.paths),{name:'AbortError'});assert.equal(JSON.stringify(f.downloads.snapshot()),before);
});

test('optional one-shot ResourceTiming evidence keeps unavailable/zero transfer unknown and records positive reported bytes only',()=>{
 const path='content/'+'b'.repeat(64)+'.ktx2',url=new URL(path,base).href,sizes={[path.split('/').at(-1)]:120};let reads=0,entry={startTime:10,responseEnd:20,transferSize:0,encodedBodySize:100,decodedBodySize:120};
 const ledger=new ResourceLoadLedger({base,sizes,now:()=>30,timing:{getEntriesByName(name,type){reads++;assert.equal(name,url);assert.equal(type,'resource');return [entry];}}}),row=ledger.request(path);
 ledger.complete(row,'initial',url,10);assert.equal(reads,1);assert.equal(ledger.snapshot().files[0].transfer.networkTransferBytes,null);assert.equal(ledger.snapshot().phases.initial.transferSamples,0);
 entry={...entry,transferSize:400};ledger.complete(row,'initial',url,10);assert.equal(reads,2);assert.equal(ledger.snapshot().files[0].transfer.networkTransferBytes,400);assert.equal(ledger.snapshot().phases.initial.observedTransferBytes,400);
 ledger.complete(row,'initial',url,40);assert.equal(reads,3);assert.equal(ledger.snapshot().phases.initial.observedTransferBytes,400,'old resource timing cannot be assigned to a later request');
});
