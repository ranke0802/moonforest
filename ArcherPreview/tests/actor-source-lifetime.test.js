import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene} from '@babylonjs/core';
import {BossModelLibrary} from '../src/boss-models.js';
import {readMapContainer} from '../src/map-container.js';
import {MapLoadLifetime} from '../src/map-load-lifetime.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<50;i++){if(check())return;await tick();}assert.fail('Expected source loading boundary');}
function fakeClock(){let now=0,serial=0;const timers=new Map();return {now:()=>now,setTimeout(fn,ms){timers.set(++serial,{fn,at:now+ms});return serial;},clearTimeout:id=>timers.delete(id),advance(ms){now+=ms;for(const [id,entry]of [...timers])if(entry.at<=now){timers.delete(id);entry.fn();}},get size(){return timers.size;}};}
function fixture(t){const engine=new NullEngine(),scene=new Scene(engine),fetch=globalThis.fetch,location=globalThis.location;globalThis.location=new URL('https://actor-source.test/');t.after(()=>{scene.dispose();engine.dispose();globalThis.fetch=fetch;globalThis.location=location;});return {engine,scene};}
function triangle(){
 const bytes=Buffer.alloc(78);new Float32Array(bytes.buffer,bytes.byteOffset,9).set([-1,0,0,1,0,0,0,1,0]);new Float32Array(bytes.buffer,bytes.byteOffset+36,9).set([0,0,1,0,0,1,0,0,1]);bytes.writeUInt16LE(0,72);bytes.writeUInt16LE(1,74);bytes.writeUInt16LE(2,76);
 return {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2}]}],buffers:[{byteLength:78,uri:'data:application/octet-stream;base64,'+bytes.toString('base64')}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5123,count:3,type:'SCALAR'}]};
}

test('scoped actor source cancellation settles immediately while shared JSON cache owns one bounded fetch',async t=>{
 const {scene}=fixture(t),timers=fakeClock(),signals=[];globalThis.fetch=(_url,options)=>{signals.push(options.signal);return new Promise(()=>{});};
 const library=new BossModelLibrary(scene,'scoped-hung-manifest',{scoped:true,timers,timeoutMs:100});
 const pending=library.load();const rejected=assert.rejects(pending,{name:'AbortError'});await until(()=>signals.length===1);
 library.dispose();await rejected;assert.equal(library.container,null);assert.equal(library.loads,0);
 // One caller must not abort a shared immutable manifest still used elsewhere.
 timers.advance(100);await tick();assert.equal(signals[0].aborted,true);assert.equal(timers.size,0);
});

test('scoped model deadline rejects hung transport and ignores its late result before constructing meshes',async t=>{
 const {scene}=fixture(t),timers=fakeClock();let late,modelSignal;
 globalThis.fetch=(url,options)=>String(url).endsWith('.gltf')?(modelSignal=options.signal,new Promise(resolve=>{late=resolve;})):Promise.resolve({ok:true,json:async()=>({model:'./scoped-hung-model.gltf',version:'test'})});
 const library=new BossModelLibrary(scene,'scoped-hung-model',{scoped:true,timers,timeoutMs:100});const pending=library.load(),rejected=assert.rejects(pending,{name:'TimeoutError'});
 await until(()=>!!late);timers.advance(100);await rejected;assert.equal(modelSignal.aborted,true);assert.equal(scene.meshes.length,0);assert.equal(library.pending,null);
 late({ok:true,json:async()=>triangle()});await tick();assert.equal(scene.meshes.length,0);assert.equal(library.loads,0);assert.equal(timers.size,0);
});

test('scoped source loads once, reuses a prepared container and releases all owned scene resources',async t=>{
 const {scene}=fixture(t);let fetches=0;globalThis.fetch=async url=>{fetches++;return {ok:true,json:async()=>String(url).endsWith('.gltf')?triangle():{model:'./scoped-triangle.gltf',version:'test'}};};
 const library=new BossModelLibrary(scene,'scoped-triangle',{scoped:true});await library.load();await library.load();assert.equal(library.loads,1);assert.equal(fetches,2);
 assert.equal(library.container.meshes.filter(mesh=>mesh.getTotalVertices()>0).length,1);
 library.dispose();library.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.geometries.length,0);assert.equal(scene.skeletons.length,0);
});

test('scoped map import invokes the existing mesh preparation hook and detaches its lifetime on disposal',async t=>{
 const {scene}=fixture(t);let callbacks=0;const container=await readMapContainer(scene,triangle(),'https://actor-source.test/',{onMeshLoaded:()=>callbacks++});
 assert.ok(callbacks>0);container.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.geometries.length,0);
});

test('default manual library times out its shared model task, retries freshly and ignores old transport completion',async t=>{
 const {scene}=fixture(t),timers=fakeClock();let finishOld,modelRequests=0,oldJsonReads=0,oldSignal;
 globalThis.fetch=(url,options)=>{
  if(!String(url).endsWith('.gltf'))return Promise.resolve({ok:true,json:async()=>({model:'./manual-retry.gltf',version:'test'})});
  modelRequests++;if(modelRequests===1){oldSignal=options.signal;return new Promise(resolve=>finishOld=resolve);}
  return Promise.resolve({ok:true,json:async()=>triangle()});
 };
 const library=new BossModelLibrary(scene,'default-manual-retry',{timers,timeoutMs:100});
 const a=library.load(),b=library.load(),rejected=Promise.all([assert.rejects(a,{name:'TimeoutError'}),assert.rejects(b,{name:'TimeoutError'})]);
 await until(()=>!!finishOld);assert.equal(modelRequests,1);timers.advance(100);await rejected;
 assert.equal(oldSignal.aborted,true);assert.equal(library.pending,null);assert.equal(library.config,undefined);
 await library.load();const current=library.container;assert.equal(modelRequests,2);assert.equal(library.loads,1);
 finishOld({ok:true,json:async()=>{oldJsonReads++;return triangle();}});await tick();
  assert.equal(oldJsonReads,0);assert.strictEqual(library.container,current);assert.equal(library.loads,1);assert.equal(current.meshes.filter(mesh=>mesh.getTotalVertices()>0).length,1);assert.equal(timers.size,0);
 library.dispose();assert.equal(scene.meshes.length,0);
});

test('one manual consumer cancelling its wait does not abort another consumer or replace the shared source',async t=>{
 const {scene}=fixture(t),timers=fakeClock();let finish,modelSignal,requests=0;
 globalThis.fetch=(url,options)=>String(url).endsWith('.gltf')?(requests++,modelSignal=options.signal,new Promise(resolve=>finish=resolve)):Promise.resolve({ok:true,json:async()=>({model:'./manual-shared.gltf'})});
 const library=new BossModelLibrary(scene,'default-manual-shared',{timers,timeoutMs:100}),consumer=new MapLoadLifetime({timers,timeoutMs:50});
 const cancelled=consumer.wait(library.load()),rejected=assert.rejects(cancelled,{name:'AbortError'}),other=library.load();
 await until(()=>!!finish);consumer.abort();consumer.close();await rejected;assert.equal(modelSignal.aborted,false);assert.equal(requests,1);
 finish({ok:true,json:async()=>triangle()});await other;assert.equal(library.loads,1);assert.equal(timers.size,0);library.dispose();
});

test('only an exclusively speculative source stops on departure and the next caller can retry immediately',async t=>{
 const {scene}=fixture(t),library=new BossModelLibrary(scene,'cancel-warning-source'),warning=new AbortController();
 let finishManifest,modelRequests=0;
 globalThis.fetch=async url=>{
  if(String(url).endsWith('.gltf')){modelRequests++;return Response.json(triangle());}
  return new Promise(resolve=>{finishManifest=()=>resolve(Response.json({model:'./cancel-warning.gltf'}));});
 };
 const cancelled=assert.rejects(library.load({preloadSignal:warning.signal}),{name:'AbortError'});
 await until(()=>!!finishManifest);warning.abort();await cancelled;
 assert.equal(library.pending,null);assert.equal(library.loads,0);assert.equal(modelRequests,0);
 // A new summon can attach to the shared manifest even while its old read is
 // outstanding. The old warning cannot fetch or install a second model.
 const summon=library.load();finishManifest();await summon;
 assert.equal(modelRequests,1);assert.equal(library.loads,1);library.dispose();
});

test('joining summon, second preview and completed source survive release of the warning',async t=>{
 for(const claimant of ['later-summon','earlier-summon','other-warning','ready']){
  await t.test(claimant,async t=>{
   const {scene}=fixture(t),library=new BossModelLibrary(scene,'owned-'+claimant),warning=new AbortController(),other=new AbortController();
   let finish,transport,requests=0;
   globalThis.fetch=async(url,options)=>{
    if(!String(url).endsWith('.gltf'))return Response.json({model:'./shared.gltf'});
    requests++;transport=options.signal;return new Promise(resolve=>{finish=()=>resolve(Response.json(triangle()));});
   };
   const earlier=claimant==='earlier-summon'?library.load():null;
   const preload=library.load({preloadSignal:warning.signal});await until(()=>!!finish);
   const joined=claimant==='later-summon'?library.load():claimant==='other-warning'?library.load({preloadSignal:other.signal}):null;
   if(claimant==='ready'){finish();await preload;}
   warning.abort();assert.equal(transport.aborted,false);
   finish();await Promise.all([earlier,preload,joined]);other.abort();
   assert.equal(requests,1);assert.equal(library.loads,1);assert.ok(library.container);library.dispose();
  });
 }
});
