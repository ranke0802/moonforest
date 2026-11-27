import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {ResourceDownloads,resourceUrl,recentResourceDownloadStats} from '../src/resource-downloads.js';
import {createLoadingView} from '../src/loading-view.js';
const base='https://example.test/ArcherPreviewSite/assets/',a='content/'+'a'.repeat(64)+'.bin',b='content/'+'b'.repeat(64)+'.ktx2';
function setup(){
 const stored=new Map(),calls=[],events=[];
 const sizes={[a.split('/').at(-1)]:8,[b.split('/').at(-1)]:12};
 const cache={async match(url){return stored.get(url)?.clone();},async put(url,r){stored.set(url,new Response(await r.arrayBuffer()));},async delete(url){stored.delete(url);}};
 const downloads=new ResourceDownloads(sizes,base,{cacheStorage:{async open(){return cache;}},fetcher:async url=>{
  calls.push(url);const length=sizes[new URL(url).pathname.split('/').at(-1)];
  return new Response(new ReadableStream({async start(c){c.enqueue(new Uint8Array(3));await new Promise(r=>setTimeout(r,1));c.enqueue(new Uint8Array(length-3));c.close();}}));
 }});
 return {stored,calls,events,downloads,cache};
}
test('byte progress has a fixed missing-byte denominator, streams chunks, deduplicates revisions and survives reload',async()=>{
 const s=setup();await s.downloads.prepare([a,a+'?rev=old',b],e=>s.events.push(e));
 assert.equal(s.calls.length,2);assert.ok(s.events.every(e=>e.total===20));
 assert.ok(s.events.some(e=>e.loaded===3&&e.ratio===.15));assert.equal(s.events.at(-1).loaded,20);assert.equal(s.events.at(-1).complete,true);
 const state=await s.downloads.prepare([a+'?rev=new',b]);assert.equal(state.total,0);assert.equal(state.cached,20);assert.equal(s.calls.length,2);
 await s.cache.delete(resourceUrl(b,base));const changed=await s.downloads.prepare([a,b]);assert.equal(changed.total,12);assert.equal(s.calls.length,3);
});
test('queued streaming jobs never download concurrently or repeat a shared resource',async()=>{
 const s=setup();let concurrent=0,max=0;const fetcher=s.downloads.fetcher;
 s.downloads.fetcher=async(...args)=>{max=Math.max(max,++concurrent);await new Promise(r=>setTimeout(r,4));const result=await fetcher(...args);concurrent--;return result;};
 await Promise.all([s.downloads.prepare([a,b]),s.downloads.prepare([a]),s.downloads.prepare([b])]);assert.equal(max,1);assert.equal(s.calls.length,2);
});
test('failed or truncated downloads cannot complete progress or remain cached; no automatic retry',async()=>{
 const s=setup();s.downloads.fetcher=async()=>new Response(new Uint8Array(3));
 await assert.rejects(s.downloads.prepare([a],e=>s.events.push(e)),/불완전/);assert.equal(s.stored.size,0);assert.ok(s.events.every(e=>!e.complete));
 s.downloads.fetcher=async()=>new Response('',{status:503});await assert.rejects(s.downloads.prepare([b]),/503/);assert.equal(s.stored.size,0);
});
test('denied persistent storage avoids prefetching a second copy and reports unknown progress',async()=>{
 const s=setup();s.downloads.storage={async open(){throw new Error('denied');}};
 await s.downloads.prepare([a],e=>s.events.push(e));assert.equal(s.calls.length,0);assert.equal(s.events.at(-1).unavailable,true);
});

test('large downloads have one body consumer, bounded reads and throttled byte progress',async()=>{
 const s=setup(),events=[];let produced=0,consumed=0,maximum=0,ticks=0,storedBytes=0;
 s.downloads.sizes[a.split('/').at(-1)]=1000;s.downloads.now=()=>ticks++;
 s.downloads.fetcher=async()=>{
  const response=new Response(new ReadableStream({pull(c){
   if(produced===1000){c.close();return;}produced++;maximum=Math.max(maximum,produced-consumed);c.enqueue(new Uint8Array(1));
  }},{highWaterMark:0}),{headers:{'Content-Encoding':'gzip','Content-Length':'20','Content-Type':'application/octet-stream'}});
  response.clone=()=>{throw new Error('Body must not be cloned');};return response;
 };
 s.cache.put=async(url,response)=>{
  assert.equal(response.headers.get('Content-Encoding'),null);assert.equal(response.headers.get('Content-Length'),'1000');
  const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;consumed+=value.byteLength;storedBytes+=value.byteLength;}
 };
 const result=await s.downloads.prepare([a],x=>events.push(x));
 assert.equal(storedBytes,1000);assert.ok(maximum<=1);assert.ok(events.length<=13,'no per-chunk DOM updates');
 assert.equal(result.loaded,1000);assert.equal(result.complete,true);assert.equal(events.at(-1).ratio,1);
});

test('mid-stream network failure and oversized bodies never become cache hits',async()=>{
 for(const oversized of [false,true]){
  const s=setup();let pulls=0;
  s.downloads.fetcher=async()=>new Response(new ReadableStream({pull(c){
   if(oversized){c.enqueue(new Uint8Array(9));c.close();}
   else if(pulls++===0)c.enqueue(new Uint8Array(3));else c.error(new Error('connection lost'));
  }}));
  await assert.rejects(s.downloads.prepare([a]),oversized?/불완전/:/connection lost/);assert.equal(s.stored.size,0);
 }
});

test('quota rejection cancels the stream and stops prefetch without retrying the plan',async()=>{
 const s=setup();let cancelled=0;
 s.downloads.fetcher=async url=>{s.calls.push(url);return new Response(new ReadableStream({cancel(){cancelled++;}}));};
 s.cache.put=async()=>{throw new DOMException('quota','QuotaExceededError');};
 const state=await s.downloads.prepare([a,b]);
 assert.equal(state.storageAvailable,false);assert.equal(state.complete,false);assert.equal(cancelled,1);assert.equal(s.calls.length,1);
 await s.downloads.prepare([a,b]);assert.equal(s.calls.length,1,'actual loader handles storage fallback; prefetch does not repeat');
});
test("a browser's CacheStorage write error falls back to the HTTP loader",async()=>{
 const s=setup();
 s.cache.put=async()=>{throw new DOMException('Cache.put() encountered a network error','NetworkError');};
 const state=await s.downloads.prepare([a,b],e=>s.events.push(e));
 assert.equal(state.storageAvailable,false);
 assert.equal(state.complete,false);
 assert.equal(s.events.at(-1).unavailable,true);
 assert.equal(s.calls.length,1);
 await s.downloads.prepare([a,b]);
 assert.equal(s.calls.length,1);
});
test('a truncated response cannot fall back when CacheStorage wraps the body error',async()=>{
 const s=setup();
 s.downloads.fetcher=async()=>new Response(new Uint8Array(3));
 s.cache.put=async(url,response)=>{
  try{await response.arrayBuffer();}
  catch{throw new DOMException('Cache.put() encountered a network error','NetworkError');}
 };
 await assert.rejects(s.downloads.prepare([a],e=>s.events.push(e)),/불완전/);
 assert.ok(s.events.every(e=>!e.unavailable&&!e.complete));
});

test('map departure cancels the active stream and queued jobs but preserves completed files for the next map',async()=>{
 const s=setup();await s.downloads.prepare([a]);let signal,cancelled=0,started;
 const reading=new Promise(resolve=>{started=resolve;});
 s.downloads.fetcher=async(url,options)=>{
  s.calls.push(url);signal=options.signal;
  let first=true;
  return new Response(new ReadableStream({pull(c){if(first){first=false;c.enqueue(new Uint8Array(3));}else started();},cancel(){cancelled++;}},{highWaterMark:0}));
 };
 const active=s.downloads.prepare([b]),queued=s.downloads.prepare([b]);
 const results=Promise.allSettled([active,queued]);await reading;
 s.downloads.cancel();s.downloads.cancel();
 const settled=await results;assert.ok(settled.every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));
 assert.ok(signal.aborted);assert.equal(cancelled,1);assert.equal(s.calls.length,2);
 assert.equal(s.stored.size,1);assert.ok(s.stored.has(resourceUrl(a,base)));assert.ok(!s.stored.has(resourceUrl(b,base)));
 const next=new ResourceDownloads(s.downloads.sizes,base,{cacheStorage:s.downloads.storage,fetcher:()=>{throw new Error('Cached bytes should not be requested');}});
 assert.equal((await next.prepare([a])).total,0);
});

test('departure before the queue runs causes no network calls or completed progress',async()=>{
 const s=setup(),pending=s.downloads.prepare([a,b],e=>s.events.push(e));s.downloads.cancel();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(s.calls.length,0);assert.equal(s.events.length,0);
});

test('initial loading curtain stays up after all download bytes until the first scene is ready',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<html[^>]+data-loading="true"/);assert.match(html,/#app>#loading\{[^}]+background:#000/);assert.match(html,/html\[data-loading\] #app>:not\(#loading\)\{visibility:hidden!important/);
 const {document:doc}=parseHTML(html),get=id=>doc.getElementById(id),view=createLoadingView(doc);view.begin('warrior-v3');
 view.download({loaded:25e6,total:100e6,ratio:.25});assert.equal(get('loading-text').textContent,'불러오는 중 (25.0/100.0MB)');assert.equal(get('loading-progress').style.width,'17.5%');assert.equal(doc.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'18');
 view.download({loaded:100e6,total:100e6,ratio:1,complete:true});view.preparing();assert.equal(get('loading').hidden,false);assert.equal(doc.documentElement.dataset.loading,'true');
 assert.equal(get('loading-progress').style.width,'70%');view.reveal();assert.equal(get('loading-progress').style.width,'100%');assert.equal(get('loading').hidden,true);assert.equal(doc.documentElement.dataset.loading,undefined);
});

test('Cache Storage reads are counted apart from transfers: key lists, matches and their time',async()=>{
 const names=Array.from({length:20},(_,i)=>'content/'+String(i).padStart(2,'0').repeat(32)+'.bin'),sizes=Object.fromEntries(names.map(n=>[n.split('/').at(-1),4]));
 let clock=0,keyLists=0;const stored=new Set(names.map(n=>resourceUrl(n,base)));
 const cache={async keys(){keyLists++;clock+=7;return [...stored].map(url=>({url}));},async match(url){clock+=2;return stored.has(url)?new Response(new Uint8Array(4)):undefined;},async put(){},async delete(){}};
 const downloads=new ResourceDownloads(sizes,base,{cacheStorage:{async open(){return cache;}},now:()=>clock,fetcher:async()=>{throw new Error('no transfer expected');}});
 await downloads.prepare(names);await downloads.prepare(names);await downloads.prepare(names.slice(0,3));
 const stats=downloads.stats;
 assert.equal(stats.jobs,3);assert.equal(stats.cacheKeyLists,2);assert.equal(keyLists,2,'each large job lists the keys again (the current policy)');
 assert.equal(stats.cacheKeyListMs,14);assert.equal(stats.cacheKeyListMaxMs,7);assert.equal(stats.cacheEntries,20);
 assert.equal(stats.cacheMatches,3);assert.equal(stats.cacheMatchMs,6);assert.equal(stats.downloadBytes,0);assert.equal(stats.cacheHits,43);
 const recent=recentResourceDownloadStats();assert.deepEqual(recent.at(-1),{...stats});assert.notEqual(recent.at(-1),stats,'records get copies');
 assert.ok(recent.length<=8);
});

test('a competing successful writer keeps its bytes when another tab receives a truncated response',async()=>{
 const s=setup(),url=resourceUrl(a,base);
 s.downloads.fetcher=async()=>{
  s.stored.set(url,new Response(new Uint8Array(8).fill(42)));
  return new Response(new Uint8Array(3));
 };
 await assert.rejects(s.downloads.prepare([a]),/불완전/);
 assert.deepEqual(new Uint8Array(await (await s.cache.match(url)).arrayBuffer()),new Uint8Array(8).fill(42));
 assert.equal((await s.downloads.prepare([a])).cached,8);
});
test('storage permission revoked during either cache read falls back to the real loader once',async()=>{
 for(const method of ['keys','match']){
  const s=setup();let refusals=0;
  const paths=Array.from({length:method==='keys'?18:3},(_,i)=>'content/'+i.toString(16).padStart(64,'0')+'.bin');
  for(const path of paths)s.downloads.sizes[path.slice(8)]=4;
  s.cache[method]=async()=>{refusals++;throw new DOMException('Read permission revoked','SecurityError');};
  for(let i=0;i<2;i++){
   const result=await s.downloads.prepare(paths,e=>s.events.push(e));
   assert.equal(result.storageAvailable,false);assert.equal(result.complete,false);
  }
  assert.equal(refusals,1);assert.equal(s.calls.length,0);
  assert.equal(s.events.at(-1).unavailable,true);
  assert.ok(s.downloads.snapshot().files.every(row=>row.status==='loader-fallback'));
 }
});

test('targeted cache comparison checks current keys with bounded concurrency across revisits',async()=>{
 const paths=Array.from({length:19},(_,i)=>'content/'+i.toString(16).padStart(64,'0')+'.bin');
 const sizes=Object.fromEntries(paths.map(p=>[p.slice(8),4]));
 const resident=new Set(paths.map(p=>resourceUrl(p,base)));
 let active=0,peak=0,queries=0,writes=0;
 const cache={async keys(url,options){
   assert.ok(url);assert.equal(options.ignoreVary,true);queries++;peak=Math.max(peak,++active);
   await Promise.resolve();active--;return resident.has(url)?[{url}]:[];
 },async put(url,response){assert.equal((await response.arrayBuffer()).byteLength,4);resident.add(url);writes++;}};
 const dl=new ResourceDownloads(sizes,base,{probeCacheKeys:true,cacheStorage:{open:async()=>cache},
   fetcher:async()=>new Response(new Uint8Array(4))});
 assert.equal((await dl.prepare(paths)).cached,76);assert.equal(writes,0);
 resident.delete(resourceUrl(paths[3],base));
 const revisit=await dl.prepare(paths);assert.equal(revisit.loaded,4);assert.equal(revisit.cached,72);
 assert.equal(queries,38);assert.equal(peak,4);assert.equal(writes,1);
 assert.equal(dl.stats.cacheKeyLists,0);assert.equal(dl.stats.cacheMatches,0);assert.equal(dl.stats.cacheProbeBatches,10);
 cache.keys=async()=>{throw new DOMException('Denied','NotAllowedError');};
 assert.equal((await dl.prepare(paths)).storageAvailable,false);assert.equal(writes,1);
});

test('blocked CacheStorage getter still lets the normal loader fetch once',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'caches');
 Object.defineProperty(globalThis,'caches',{configurable:true,get(){throw new DOMException('Storage blocked','SecurityError');}});
 try{
  const downloads=new ResourceDownloads({[a.split('/').at(-1)]:8},base,{fetcher:()=>assert.fail('unexpected prefetch')});
  const state=await downloads.prepare([a]);assert.equal(state.storageAvailable,false);
  const {repairCachedResource}=await import('../src/resource-repair.js');
  assert.equal((await repairCachedResource(resourceUrl(a,base))).status,'unavailable');
 }finally{if(previous)Object.defineProperty(globalThis,'caches',previous);else delete globalThis.caches;}
});

test('adaptive map preparation validates only requested keys on a warm revisit and detects eviction across managers',async()=>{
 const paths=Array.from({length:1270},(_,i)=>'content/'+i.toString(16).padStart(64,'0')+'.bin');
 const sizes=Object.fromEntries(paths.map(path=>[path.slice(8),4])),resident=new Set(paths.map(path=>resourceUrl(path,base)));
 let clock=0,listCalls=0,returnedKeys=0,probeCalls=0,fetches=0,probeCost=1,active=0,peak=0,pendingRead;
 const cache={
   async keys(url){
     if(!url){listCalls++;clock+=1669.7;returnedKeys+=resident.size;return [...resident].map(url=>({url}));}
     probeCalls++;peak=Math.max(peak,++active);await pendingRead;active--;clock+=probeCost;
     if(!resident.has(url))return [];
     returnedKeys++;return [{url}];
   },
   async put(url,response){assert.equal((await response.arrayBuffer()).byteLength,4);resident.add(url);}
 };
 const storage={open:async()=>cache};
 const create=(cacheStorage=storage)=>new ResourceDownloads(sizes,base,{cacheStorage,adaptiveCacheKeys:true,now:()=>clock,
   fetcher:async()=>{fetches++;return new Response(new Uint8Array(4));}});
 await create().prepare(paths.slice(0,115));
 assert.equal(listCalls,1);assert.equal(returnedKeys,1270);
 const before=returnedKeys,requested=paths.slice(100,315);
 resident.delete(resourceUrl(requested.at(-1),base));
 const visit=create(),result=await visit.prepare(requested);
 assert.equal(listCalls,1);assert.equal(probeCalls,215);assert.equal(returnedKeys-before,214);
 assert.equal(result.cached,214*4);assert.equal(result.loaded,4);assert.equal(fetches,1);assert.equal(peak,4);
 // Expensive exact reads on the same device switch back to a full snapshot.
 probeCost=40;
 await create().prepare(requested);
 assert.equal(listCalls,2);assert.equal(probeCalls,219);
 await create().prepare(requested);
 assert.equal(listCalls,3);assert.equal(probeCalls,219,'an equally large visit skips known slow probes');
 // A new CacheStorage context must learn its own full-list cost.
 const newStorage={open:async()=>cache};
 await create(newStorage).prepare(requested);assert.equal(listCalls,4);
 // A stalled native metadata batch must not hold up the fallback. Even a
 // late negative result cannot schedule a download or overwrite a newer hit.
 let resume;pendingRead=new Promise(resolve=>{resume=resolve;});
 const stalled=create(newStorage);
 try{
   assert.equal((await stalled.prepare(requested)).cached,215*4);
   assert.equal(listCalls,5);assert.equal(stalled.stats.cacheAdaptiveFallbacks,1);assert.equal(probeCalls,223);
 }finally{resume();}
 assert.equal(fetches,1);
});
