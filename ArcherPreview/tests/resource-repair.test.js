import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {repairCachedResource} from '../src/resource-repair.js';

const good=new TextEncoder().encode('verified resource bytes'),hash=createHash('sha256').update(good).digest('hex');
const url=`https://example.test/game/assets/content/${hash}.ktx2`;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function clock(){let time=0,id=0;const pending=new Map();return {now:()=>time,setTimeout(fn,ms){pending.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>pending.delete(key),advance(ms){time+=ms;for(const [key,timer]of [...pending])if(timer.at<=time){pending.delete(key);timer.fn();}},get size(){return pending.size;}};}
function fixture(bytes=good){
  const stored=new Map([[url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}})]]),events=[],calls=[];
  const cache={async match(key){events.push('match');return stored.get(key)?.clone();},async delete(key){events.push('delete');return stored.delete(key);},async put(key,response){events.push('put');stored.set(key,new Response(await response.arrayBuffer(),{headers:response.headers}));}};
  const storage={async open(name){assert.equal(name,'moonforest-resources-v1');return cache;}};
  const fetcher=async(key,options)=>{events.push('fetch');calls.push({url:key,options});return new Response(good,{headers:{'Content-Type':'text/html','Content-Encoding':'gzip'}});};
  return {stored,events,calls,cache,storage,options:{expectedSize:good.length,cacheStorage:storage,fetcher}};
}

test('failed resource validation keeps healthy bytes and never fetches, evicts, or writes',async()=>{
  const f=fixture(),result=await repairCachedResource(url+'?revision=old',f.options);
  assert.equal(result.status,'valid');assert.equal(result.repaired,false);assert.equal(result.actualHash,hash);
  assert.deepEqual(f.events,['match']);assert.equal(f.calls.length,0);assert.equal(f.stored.size,1);
});

test('one corrupt resource is replaced by one checked fetch with canonical MIME and no HTTP-cache reuse',async()=>{
  const f=fixture('bad cached body'),unrelated=url.replace(hash,'a'.repeat(64));f.stored.set(unrelated,new Response('untouched'));
  const result=await repairCachedResource(url,f.options);
  assert.equal(result.status,'repaired');assert.equal(result.repaired,true);assert.equal(f.calls.length,1);
  assert.deepEqual(f.events,['match','fetch','put']);assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.headers['X-Moonforest-Cache-Repair'],'1');
  assert.equal(f.stored.get(url).headers.get('Content-Type'),'image/ktx2');assert.equal(f.stored.get(url).headers.get('Content-Encoding'),null);
  assert.deepEqual(new Uint8Array(await f.stored.get(url).clone().arrayBuffer()),good);assert.equal(await f.stored.get(unrelated).text(),'untouched');
  assert.equal((await repairCachedResource(url,f.options)).status,'valid');assert.equal(f.calls.length,1);
});

test('a missing entry or unavailable storage cannot trigger automatic network repair',async()=>{
  const f=fixture();f.stored.clear();assert.equal((await repairCachedResource(url,f.options)).status,'missing');assert.equal(f.calls.length,0);
  assert.equal((await repairCachedResource(url,{cacheStorage:null})).status,'unavailable');
  assert.equal((await repairCachedResource(url,{cacheStorage:{async open(){throw new DOMException('denied','SecurityError');}}})).status,'unavailable');
});

test('fresh incorrect same-length bytes and HTTP failures never enter the cache and never retry',async()=>{
  for(const status of [200,503]){
    const f=fixture('bad cached body');let fetches=0;
    f.options.fetcher=async()=>{fetches++;return new Response(new Uint8Array(good.length),{status});};
    await assert.rejects(repairCachedResource(url,f.options),{code:status===200?'RESOURCE_REPAIR_CHECKSUM':'RESOURCE_REPAIR_HTTP',resourceUrl:url});
    assert.equal(fetches,1);assert.equal(await f.stored.get(url).clone().text(),'bad cached body');assert.equal(f.events.includes('put'),false);
  }
});

test('metadata size disagreement cannot evict healthy hash bytes or install a mismatched replacement',async()=>{
  const healthy=fixture();assert.equal((await repairCachedResource(url,{...healthy.options,expectedSize:good.length+1})).status,'valid');assert.deepEqual(healthy.events,['match']);
  const corrupt=fixture('bad cached body');await assert.rejects(repairCachedResource(url,{...corrupt.options,expectedSize:good.length+1}),{code:'RESOURCE_REPAIR_SIZE'});
  assert.equal(corrupt.calls.length,1);assert.ok(!corrupt.events.includes('put'));assert.ok(!corrupt.events.includes('delete'));
  await assert.rejects(repairCachedResource(url,{...corrupt.options,expectedSize:-1}),RangeError);
});

test('pre-abort or a changed owner cannot delete healthy/newer cache state',async()=>{
  const f=fixture('bad cached body'),controller=new AbortController();controller.abort();
  await assert.rejects(repairCachedResource(url,{...f.options,signal:controller.signal}),{name:'AbortError'});assert.deepEqual(f.events,[]);
  let checks=0;const error=Object.assign(new Error('map changed'),{name:'AbortError'});
  await assert.rejects(repairCachedResource(url,{...f.options,check(){if(++checks>=6)throw error;}}),error);
  assert.ok(!f.events.includes('delete'));assert.equal(f.calls.length,0);assert.ok(f.stored.has(url));
});

test('abort during a pending response cancels a late body and prevents a late write',async()=>{
  const f=fixture('bad cached body'),controller=new AbortController(),response=deferred(),started=deferred();let cancelled=0;
  f.options.fetcher=async()=>{started.resolve();return response.promise;};
  const pending=repairCachedResource(url,{...f.options,signal:controller.signal});await started.promise;controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  response.resolve(new Response(new ReadableStream({cancel(){cancelled++;}})));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);assert.ok(!f.events.includes('put'));assert.equal(await f.stored.get(url).clone().text(),'bad cached body');
});

test('bounded repair read cancels oversized data and leaves unproven cached bytes untouched',async()=>{
  const f=fixture('bad cached body');await assert.rejects(repairCachedResource(url,{...f.options,maxBytes:3}),{code:'RESOURCE_REPAIR_LIMIT'});
  assert.ok(f.stored.has(url));assert.equal(f.calls.length,0);assert.ok(!f.events.includes('delete'));
});

test('overlapping repairs serialize so the second validates the first replacement without another fetch',async()=>{
  const f=fixture('bad cached body'),response=deferred(),started=deferred();let fetches=0;
  f.options.fetcher=async()=>{fetches++;started.resolve();return response.promise;};
  const first=repairCachedResource(url,f.options);await started.promise;const second=repairCachedResource(url,f.options);response.resolve(new Response(good));
  const results=await Promise.all([first,second]);assert.deepEqual(results.map(x=>x.status),['repaired','valid']);assert.equal(fetches,1);
});

test('repair timeout prevents stale later response from writing cached bytes',async()=>{
  const f=fixture('bad cached body'),response=deferred(),started=deferred(),timers=clock();let cancelled=0;
  f.options.fetcher=async()=>{started.resolve();return response.promise;};
  const pending=repairCachedResource(url,{...f.options,timeoutMs:25,timers});await started.promise;
  const rejected=assert.rejects(pending,{name:'TimeoutError'});timers.advance(25);await rejected;response.resolve(new Response(new ReadableStream({cancel(){cancelled++;}})));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);assert.ok(!f.events.includes('put'));assert.equal(timers.size,0);
});

test('an already started put may finish late but can only replace the same verified immutable bytes',async()=>{
  const f=fixture('bad cached body'),writing=deferred(),release=deferred(),timers=clock();
  f.cache.put=async(key,response)=>{f.events.push('put');const bytes=await response.arrayBuffer();writing.resolve();await release.promise;f.stored.set(key,new Response(bytes,{headers:response.headers}));};
  const pending=repairCachedResource(url,{...f.options,timeoutMs:25,timers});await writing.promise;
  const rejected=assert.rejects(pending,{name:'TimeoutError'});timers.advance(25);await rejected;
  // A subsequent owner has already stored the only valid body for this URL.
  f.stored.set(url,new Response(good,{headers:{'Content-Type':'image/ktx2'}}));
  assert.equal((await repairCachedResource(url,f.options)).status,'valid');release.resolve();
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(new Uint8Array(await f.stored.get(url).arrayBuffer()),good);assert.ok(!f.events.includes('delete'));assert.equal(timers.size,0);
});

test('repair worker request bypasses persistent cache and concurrent copies with a no-store network read',async()=>{
  const listeners={},calls=[];let matches=0,writes=0;
  const context={URL,Map,Response,console,self:{registration:{scope:'https://example.test/game/'},addEventListener(type,fn){listeners[type]=fn;}},caches:{async open(){return {async match(){matches++;return new Response('poison');},async put(){writes++;}};}},async fetch(key,options){calls.push({key,options});return new Response(good);}};
  vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),context);
  let response;const request=new Request(url,{cache:'no-store',headers:{'X-Moonforest-Cache-Repair':'1'}});
  listeners.fetch({request,respondWith(value){response=value;}});assert.deepEqual(new Uint8Array(await (await response).arrayBuffer()),good);
  assert.equal(matches,0);assert.equal(writes,0);assert.equal(calls.length,1);assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.signal,request.signal);
});
