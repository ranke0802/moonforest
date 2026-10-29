import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {ResourceDownloads} from '../src/resource-downloads.js';
import {validateResourceIndex,RESOURCE_PACK_LIMITS} from '../src/resource-index.js';
import {buildResourceBundles,verifyResourceBundles} from '../scripts/resource-bundles.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),base='https://example.test/ArcherPreviewSite/assets/';
function fixture(){
 const data=[Buffer.from('model part A '.repeat(1000)),Buffer.from('model part B '.repeat(1000))],names=data.map(b=>hash(b)+'.bin'),encoded=gzipSync(Buffer.concat(data));
 const pack={url:'bundles/'+hash(encoded)+'.mfp.gz',bytes:encoded.length,unpackedBytes:data.reduce((n,b)=>n+b.length,0),files:names};
 const files=Object.fromEntries(names.map((n,i)=>[n,data[i].length])),bundles=[pack],index={version:1,revision:hash(JSON.stringify({files,bundles})),files,bundles};
 const stored=new Map(),calls=[],events=[],cache={async keys(){return [...stored.keys()].map(url=>({url}));},async match(url){return stored.has(url)?new Response(stored.get(url)):undefined;},async put(url,r){stored.set(url,new Uint8Array(await r.arrayBuffer()));},async delete(url){return stored.delete(typeof url==='string'?url:url.url);}};
 const fetcher=async(url,options)=>{calls.push({url,options});const bytes=url.endsWith('.gz')?encoded:data[names.indexOf(url.split('/').at(-1))];return new Response(bytes);};
 const create=()=>new ResourceDownloads(index.files,base,{index,cacheStorage:{open:async()=>cache},fetcher});
 const downloads=create(),paths=names.map(n=>'content/'+n);return {index,data,names,encoded,pack,cache,stored,calls,events,downloads,paths,create};
}

test('cold requests use one compressed bundle; validated extraction reuses unchanged content URLs without caching the archive',async()=>{
 const f=fixture(),state=await f.downloads.prepare(f.paths,s=>f.events.push(s));
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.cache,'no-store');assert.equal(state.total,f.encoded.length);assert.equal(state.loaded,state.total);assert.ok(state.total<f.pack.unpackedBytes);
 assert.ok(f.events.every(s=>s.total===state.total&&s.loaded<=s.total));assert.equal(f.events.at(-1).complete,true);
 assert.equal(f.stored.size,2);for(let i=0;i<2;i++)assert.deepEqual(f.stored.get(base+f.paths[i]),new Uint8Array(f.data[i]));
 assert.ok([...f.stored.keys()].every(u=>u.includes('/content/')));
 const repeat=await f.create().prepare(f.paths.map(p=>p+'?rev=UI-only'));assert.equal(repeat.total,0);assert.equal(f.calls.length,1);
});

test('partial cache and one-resource update fetch only that file, never its otherwise cached bundle',async()=>{
 const f=fixture();await f.downloads.prepare(f.paths);f.calls.length=0;f.stored.delete(base+f.paths[1]);
 const state=await f.create().prepare(f.paths);assert.equal(state.total,f.data[1].length);assert.deepEqual(f.calls.map(c=>c.url),[base+f.paths[1]]);
 const changed=Buffer.from('model part B modified'),name=hash(changed)+'.bin',index={...f.index,files:{[f.names[0]]:f.data[0].length,[name]:changed.length},bundles:[]};
 const downloaded=[];const next=new ResourceDownloads(index.files,base,{index,cacheStorage:{open:async()=>f.cache},fetcher:async url=>{downloaded.push(url);return new Response(changed);}});
 await next.prepare([f.paths[0],'content/'+name]);assert.deepEqual(downloaded,[base+'content/'+name]);
});

test('a plan never pulls distant/unused members just to use a bundle',async()=>{
 const f=fixture();await f.downloads.prepare([f.paths[0]]);assert.deepEqual(f.calls.map(c=>c.url),[base+f.paths[0]]);assert.equal(f.stored.size,1);
});

test('unsupported decompression uses existing individual downloads without requesting a pack',async t=>{
 const old=globalThis.DecompressionStream;globalThis.DecompressionStream=undefined;t.after(()=>globalThis.DecompressionStream=old);
 const f=fixture();await f.downloads.prepare(f.paths);assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.url.includes('/content/')));
});

test('bad checksum, truncation, extra expanded bytes and HTTP failures never report completion or retry the bundle',async()=>{
 for(const mode of ['checksum','truncated','oversized','503']){
  const f=fixture();let calls=0;
  const wrong=gzipSync(Buffer.concat([Buffer.alloc(f.data[0].length),f.data[1],...(mode==='oversized'?[Buffer.alloc(1)]:[])]));
  if(['checksum','oversized'].includes(mode))f.pack.bytes=wrong.length;
  f.downloads.fetcher=async()=>{calls++;return mode==='503'?new Response('',{status:503}):new Response(mode==='truncated'?f.encoded.subarray(0,-5):wrong);};
  await assert.rejects(f.downloads.prepare(f.paths,s=>f.events.push(s)));
  assert.equal(calls,1);assert.ok(f.events.every(s=>!s.complete));assert.equal(f.stored.size,0);
 }
});

test('departure aborts a pending bundle stream and queued work, with no fallback re-download',async()=>{
 const f=fixture();let ready,cancelled=0;const entered=new Promise(resolve=>ready=resolve);
 f.downloads.fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(f.encoded.subarray(0,8));ready();},cancel(){cancelled++;}},{highWaterMark:0}));
 const pending=f.downloads.prepare(f.paths),queued=f.downloads.prepare(f.paths),settled=Promise.allSettled([pending,queued]);await entered;f.downloads.cancel();
 assert.ok((await settled).every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));assert.equal(cancelled,1);assert.equal(f.stored.size,0);
});

test('bundle quota failure stops prefetch and never stores the compressed archive',async()=>{
 const f=fixture();f.cache.put=async()=>{throw new DOMException('quota','QuotaExceededError');};
 const state=await f.downloads.prepare(f.paths);assert.equal(state.storageAvailable,false);assert.equal(state.complete,false);assert.equal(f.stored.size,0);assert.equal(f.calls.length,1);
 await f.downloads.prepare(f.paths);assert.equal(f.calls.length,1);
});

test('untrusted index paths, duplicate entries and excessive extraction limits are rejected before requests',()=>{
 for(const mutate of [f=>f.pack.url='../escape.gz',f=>f.pack.files.push(f.names[0]),f=>f.index.files[f.names[0]]=RESOURCE_PACK_LIMITS.member+1,f=>f.pack.unpackedBytes++,f=>f.pack.bytes=RESOURCE_PACK_LIMITS.packed+1]){
  const f=fixture();mutate(f);assert.throws(()=>validateResourceIndex(f.index));
 }
});

test('rebuilds retain the same resource revision; a changed file replaces only its content hash and obsolete files are unlisted',async t=>{
 const root=await mkdtemp(join(tmpdir(),'moonforest-packs-'));t.after(async()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));await rm(root,{recursive:true,force:true});});
 await mkdir(join(root,'assets/content'),{recursive:true});const f=fixture();
 const inventory=new Map();
 for(let i=0;i<2;i++){const absolute=join(root,'assets/content',f.names[i]);await writeFile(absolute,f.data[i]);inventory.set('assets/content/'+f.names[i],{absolute,bytes:f.data[i].length});}
 const manifest=join(root,'assets/character.json'),save=async names=>{await writeFile(manifest,JSON.stringify({resources:names.map(n=>'content/'+n)}));inventory.set('assets/character.json',{absolute:manifest});};await save(f.names);
 const first=await buildResourceBundles(root,inventory),second=await buildResourceBundles(root,inventory);assert.deepEqual(first,second);await verifyResourceBundles(root,first);
 const bytes=Buffer.from('changed data '.repeat(100)),name=hash(bytes)+'.bin',absolute=join(root,'assets/content',name);await writeFile(absolute,bytes);
 inventory.delete('assets/content/'+f.names[1]);inventory.set('assets/content/'+name,{absolute,bytes:bytes.length});await save([f.names[0],name]);
 const next=await buildResourceBundles(root,inventory);assert.notEqual(next.revision,first.revision);assert.equal(next.files[f.names[0]],first.files[f.names[0]]);assert.equal(next.files[f.names[1]],undefined);await verifyResourceBundles(root,next);
 await writeFile(join(root,'assets',next.bundles[0].url),'corrupt');await assert.rejects(verifyResourceBundles(root,next),/checksum/);
});
