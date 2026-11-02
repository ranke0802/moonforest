import test from 'node:test';
import assert from 'node:assert/strict';
import {ResourceDownloads} from '../src/resource-downloads.js';

const base='https://map-travel.test/assets/',file='content/'+'a'.repeat(64)+'.bin';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function clock(){let now=0,id=0;const pending=new Map();return {now:()=>now,setTimeout(fn,ms){pending.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>pending.delete(id),advance(ms){now+=ms;for(const [id,item]of [...pending])if(item.at<=now){pending.delete(id);item.fn();}},get size(){return pending.size;}};}

for(const stage of ['open','keys','match','response','body','write'])test(`map transfer stalls in ${stage}: bounded failure, manual retry and late owner isolation`,async()=>{
 const timers=clock(),entered=defer(),blocked=defer(),events=[],stored=new Map();let cancelled=0,requests=0;
 const wait=()=>{entered.resolve();return blocked.promise;};
 const paths=stage==='keys'?Array.from({length:16},(_,i)=>'content/'+i.toString(16).padStart(64,'0')+'.bin'):[file];
 const sizes=Object.fromEntries(paths.map(p=>[p.split('/').at(-1),4]));
 const cache={keys:async()=>[],match:async()=>null,put:async(u,r)=>{const bytes=await r.arrayBuffer();if(stage==='write')await wait();stored.set(u,bytes);},delete:async u=>stored.delete(u)};
 if(stage==='keys')cache.keys=wait;if(stage==='match')cache.match=wait;
 const options={timers,cacheStorage:{open:stage==='open'?wait:async()=>cache},fetcher:async()=>{requests++;if(stage==='response')return wait();return new Response(stage==='body'?new ReadableStream({start(){entered.resolve();},cancel(){cancelled++;}}):new Uint8Array(4));}};
 const old=new ResourceDownloads(sizes,base,options),pending=old.prepare(paths,e=>events.push(e)).catch(e=>e);
 await entered.promise;timers.advance(30000);const error=await pending;assert.equal(error.name,'TimeoutError');assert.match(error.stage,/resource-/);assert.equal(timers.size,0);assert.ok(events.every(e=>!e.complete));
 const eventCount=events.length,oldBytes=old.stats.downloadBytes;
 const freshCache={keys:async()=>[],match:async()=>null,put:async(u,r)=>stored.set(u,await r.arrayBuffer()),delete:async u=>stored.delete(u)};
 const fresh=new ResourceDownloads(sizes,base,{timers,cacheStorage:{open:async()=>freshCache},fetcher:async()=>new Response(new Uint8Array([1,2,3,4]))});
 assert.equal((await fresh.prepare(paths)).complete,true);
 blocked.resolve(stage==='response'?new Response(new ReadableStream({cancel(){cancelled++;}})):stage==='open'?freshCache:stage==='keys'?[]:null);
 await tick();await tick();assert.equal(events.length,eventCount);assert.equal(old.stats.downloadBytes,oldBytes);assert.equal(timers.size,0);assert.equal(stored.size,paths.length);
 // Late cache writes contain the exact immutable file bytes in production;
 // this fixture checks they cannot delete the new owner's committed entry.
 if(stage==='body'||stage==='response')assert.equal(cancelled,1);
 assert.ok(requests<=1,'no automatic network retry');
});

test('healthy transfer can exceed 45 seconds while real byte progress renews only the idle deadline',async()=>{
 const timers=clock(),entered=defer();let source;
 const cache={match:async()=>null,put:async(u,r)=>{const bytes=await r.arrayBuffer();assert.equal(bytes.byteLength,4);}};
 const downloads=new ResourceDownloads({[file.split('/').at(-1)]:4},base,{timers,cacheStorage:{open:async()=>cache},fetcher:async()=>new Response(new ReadableStream({start(c){source=c;entered.resolve();}}))});
 const pending=downloads.prepare([file]);await entered.promise;await tick();
 for(let i=0;i<4;i++){timers.advance(20000);source.enqueue(new Uint8Array([i]));await tick();}
 source.close();const result=await pending;assert.equal(result.complete,true);assert.equal(timers.now(),80000);assert.equal(timers.size,0);assert.equal(result.loaded,4);
});

test('departure interrupts CacheStorage wait immediately and cancels queued jobs without clearing persistent cache',async()=>{
 const timers=clock(),entered=defer(),blocked=defer();let opens=0;
 const downloads=new ResourceDownloads({[file.split('/').at(-1)]:4},base,{timers,cacheStorage:{open:()=>{opens++;entered.resolve();return blocked.promise;}}});
 const settled=Promise.allSettled([downloads.prepare([file]),downloads.prepare([file])]);await entered.promise;downloads.cancel();
 assert.ok((await settled).every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));assert.equal(opens,1);assert.equal(timers.size,0);blocked.resolve({});await tick();
});
