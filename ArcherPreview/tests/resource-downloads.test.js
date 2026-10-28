import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ResourceDownloads,resourceUrl} from '../src/resource-downloads.js';
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
test('black curtain is in the initial document and stays up after 100% until the first scene is ready',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<html[^>]+data-loading="true"/);assert.match(html,/#app>#loading\{[^}]+background:#000/);assert.match(html,/html\[data-loading\] #app>:not\(#loading\)\{visibility:hidden!important/);
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',style:{},classList:{remove(){}},attrs:{},setAttribute(k,v){this.attrs[k]=v;},querySelector(){return get('track');}});return nodes.get(id);};
 const doc={getElementById:get,documentElement:{dataset:{}}},view=createLoadingView(doc);view.begin();
 view.download({loaded:25e6,total:100e6,ratio:.25});assert.equal(get('loading-bytes').textContent,'25.0 / 100.0 MB');assert.equal(get('loading-progress').style.width,'25%');assert.equal(get('track').attrs['aria-valuenow'],'25');
 view.download({loaded:100e6,total:100e6,ratio:1,complete:true});view.preparing();assert.equal(get('loading').hidden,false);assert.equal(doc.documentElement.dataset.loading,'true');
 view.reveal();assert.equal(get('loading').hidden,true);assert.equal(doc.documentElement.dataset.loading,undefined);
});
