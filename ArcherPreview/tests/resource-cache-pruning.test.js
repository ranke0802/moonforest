import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {registerResourceGraph} from '../src/resource-cache.js';
import {releaseCacheGraph} from '../scripts/release-deployment.mjs';
const scope='https://example.test/ArcherPreviewSite/',a='a'.repeat(64)+'.bin',b='b'.repeat(64)+'.bin',c='c'.repeat(64)+'.bin';
function fixture(){
 const stores=new Map(),f={clients:[]};
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const stored=stores.get(name);return {
  async match(input){const bytes=stored.get(typeof input==='string'?input:input.url);return bytes?new Response(bytes):undefined;},
  async put(input,response){stored.set(typeof input==='string'?input:input.url,new Uint8Array(await response.arrayBuffer()));},
  async keys(){return [...stored.keys()].map(url=>({url}));},async delete(input){return stored.delete(typeof input==='string'?input:input.url);},
 };}};
 f.restart=()=>{
  const listeners={};vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),{URL,Map,Set,Response,console,setTimeout,caches,self:{registration:{scope},clients:{matchAll:async()=>f.clients,claim(){}},skipWaiting(){},addEventListener(type,fn){listeners[type]=fn;}}});
  f.register=async(id,files,revision='1'.repeat(64))=>{let waiting;listeners.message({source:{id,url:scope+'?character=warrior-v3'},data:{type:'RESOURCE_GRAPH_USE',files,revision},waitUntil(p){waiting=p;}});await waiting;};
  f.stats=()=>{let result;listeners.message({data:{type:'RESOURCE_CACHE_STATS'},ports:[{postMessage(v){result=v;}}]});return result;};
  f.read=name=>{let response;listeners.fetch({request:new Request(scope+'assets/content/'+name),respondWith(p){response=p;}});return response;};
 };
 f.seed=async names=>{const cache=await caches.open('moonforest-resources-v1');for(const name of names)await cache.put(scope+'assets/content/'+name,new Response('bytes'));};
 f.names=()=>[...(stores.get('moonforest-resources-v1')?.keys()??[])].map(u=>u.split('/').at(-1)).sort();
 f.restart();return f;
}

test('a new JSON graph prunes obsolete content while retaining unchanged files and never downloading replacements',async()=>{
 const f=fixture();f.clients=[{id:'new',url:scope}];await f.seed([a,b,c]);await f.register('new',[a,c]);
 assert.deepEqual(f.names(),[a,c]);assert.equal(f.stats().prunedFiles,1);assert.equal(f.stats().downloads,0);
});

test('other open tabs protect old versions; worker restart retains their declarations; closed tab versions are then pruned',async()=>{
 const f=fixture();f.clients=[{id:'old',url:scope}];await f.seed([a,b]);await f.register('old',[a,b]);
 f.clients.push({id:'new',url:scope+'?character=warrior-v4'});await f.seed([c]);await f.register('new',[a,c],'2'.repeat(64));assert.deepEqual(f.names(),[a,b,c]);
 f.restart();await f.register('new',[a,c],'2'.repeat(64));assert.deepEqual(f.names(),[a,b,c]);
 f.clients=f.clients.filter(c=>c.id==='new');await f.register('new',[a,c],'2'.repeat(64));assert.deepEqual(f.names(),[a,c]);
});

test('an old or not-yet-registered tab defers deletion instead of breaking its current map',async()=>{
 const f=fixture();f.clients=[{id:'legacy',url:scope},{id:'new',url:scope}];await f.seed([a,b,c]);await f.register('new',[a,c]);
 assert.deepEqual(f.names(),[a,b,c]);assert.equal(f.stats().cleanupDeferred,true);
 f.clients=f.clients.filter(c=>c.id==='new');await f.register('new',[a,c]);assert.deepEqual(f.names(),[a,c]);
});

test('invalid or empty graph declarations cannot purge cached resources',async()=>{
 const f=fixture();f.clients=[{id:'new',url:scope}];await f.seed([a,b]);
 for(const files of [[],['../outside.bin'],[a,'not-a-hash.bin']])await f.register('new',files);
 assert.deepEqual(f.names(),[a,b]);assert.equal(f.stats().prunedFiles,0);
});

test('release additions survive repeat visits and worker replacement; incomplete graphs cannot trigger cleanup',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'serviceWorker'),messages=[],listeners={};
 const first={postMessage:data=>messages.push({worker:1,data})},second={postMessage:data=>messages.push({worker:2,data})};
 const worker={controller:first,addEventListener:(event,fn)=>listeners[event]=fn};
 Object.defineProperty(navigator,'serviceWorker',{value:worker,configurable:true});
 t.after(()=>{if(descriptor)Object.defineProperty(navigator,'serviceWorker',descriptor);else delete navigator.serviceWorker;});
 const index={revision:'3'.repeat(64),files:{[a]:8}};
 const paths=['assets/content/'+b,'assets/actor.json','assets/content/'+a];
 const graph=releaseCacheGraph(index,paths);
 assert.deepEqual(graph.extraFiles,[b]);
 assert.deepEqual(releaseCacheGraph(index,paths.toReversed()),graph);
 assert.notEqual(releaseCacheGraph(index,paths.slice(1)).revision,graph.revision);
 registerResourceGraph(index,null);
 registerResourceGraph({...index,revision:'0'.repeat(64)},graph);
 assert.equal(messages.length,0);
 registerResourceGraph(index,graph);registerResourceGraph(index,graph);assert.equal(messages.length,1);
 worker.controller=second;listeners.controllerchange();assert.equal(messages.length,2);assert.equal(messages[1].worker,2);
 const expected={type:'RESOURCE_GRAPH_USE',revision:graph.revision,files:[a,b]};
 const f=fixture();await f.seed([a,b,c]);
 for(const [visit,{data}] of messages.entries()){
  assert.deepEqual(data,expected);
  f.restart();const id='visit-'+visit;f.clients=[{id,url:scope}];
  await f.register(id,data.files,data.revision);
  assert.deepEqual(f.names(),[a,b]);assert.equal(f.stats().prunedFiles,visit===0?1:0);
  assert.equal(await (await f.read(b)).text(),'bytes');
  assert.equal(f.stats().hits,1);assert.equal(f.stats().downloads,0);
 }
});
