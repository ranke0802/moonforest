import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {registerResourceGraph} from '../src/resource-cache.js';
import {releaseCacheGraph} from '../scripts/release-deployment.mjs';

const scope='https://example.test/ArcherPreviewSite/';
const hash=(n,ext='bin')=>n.toString(16).padStart(64,'0')+'.'+ext;

// The published worker in a memory Cache Storage (same harness as resource-cache-pruning.test.js).
function workerFixture(){
 const stores=new Map(),f={clients:[]};
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const stored=stores.get(name);return {
  async match(input){const bytes=stored.get(typeof input==='string'?input:input.url);return bytes?new Response(bytes):undefined;},
  async put(input,response){stored.set(typeof input==='string'?input:input.url,new Uint8Array(await response.arrayBuffer()));},
  async keys(){return [...stored.keys()].map(url=>({url}));},async delete(input){return stored.delete(typeof input==='string'?input:input.url);},
 };}};
 const listeners={};
 vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),{URL,Map,Set,Response,console,setTimeout,caches,self:{registration:{scope},clients:{matchAll:async()=>f.clients,claim(){}},skipWaiting(){},addEventListener(type,fn){listeners[type]=fn;}},fetch:async()=>new Response('network')});
 f.message=async(source,data)=>{let waiting;listeners.message({source,data,waitUntil(p){waiting=p;}});await waiting;};
 f.stats=()=>{let result;listeners.message({data:{type:'RESOURCE_CACHE_STATS'},ports:[{postMessage(v){result=v;}}]});return result;};
 f.read=name=>{let response;listeners.fetch({request:new Request(scope+'assets/content/'+name),respondWith(p){response=p;}});return response;};
 f.seed=async names=>{const cache=await caches.open('moonforest-resources-v1');for(const name of names)await cache.put(scope+'assets/content/'+name,new Response('bytes'));};
 f.names=()=>[...(stores.get('moonforest-resources-v1')?.keys()??[])].map(u=>u.split('/').at(-1)).sort();
 return f;
}

// The inline script of moonforest-shell.html with a browser-shaped stand-in.
function shellFixture(navigatorOverride){
 const html=readFileSync(new URL('../moonforest-shell.html',import.meta.url),'utf8'),code=html.match(/<script id="moonforest-shell">([\s\S]*?)<\/script>/)[1];
 const posted=[],windowListeners={},workerListeners={},frame={contentWindow:{focus(){}},setAttribute(){},addEventListener(){}};
 const activeWorker={postMessage:data=>posted.push(data)},workers={controller:null,ready:Promise.resolve({active:activeWorker}),addEventListener:(type,fn)=>{workerListeners[type]=fn;}};
 let mountedFrame;
 const window={addEventListener:(type,fn)=>{windowListeners[type]=fn;}};
 const context={window,location:{origin:'https://example.test',search:'?character=warrior-plains'},URLSearchParams,Promise,
  navigator:navigatorOverride??{serviceWorker:workers},screen:{},document:{documentElement:{},body:{appendChild(value){mountedFrame=value;}},createElement:()=>frame}};
 vm.runInNewContext(code,context);
 const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
 return {posted,frame,mountedFrame,workers,activeWorker,shell:window.__moonforestShell,
  send:async(data,{source=frame.contentWindow,origin='https://example.test'}={})=>{windowListeners.message({data,source,origin});await settle();},
  controllerChange:async()=>{workerListeners.controllerchange();await settle();}};
}

test('the game frame hands its release declaration to a same-origin parent once per release',t=>{
 const sent=[],descriptor=Object.getOwnPropertyDescriptor(navigator,'serviceWorker');
 Object.defineProperty(navigator,'serviceWorker',{value:{controller:{postMessage(){}},addEventListener(){}},configurable:true});
 globalThis.location={origin:'https://example.test'};globalThis.parent={postMessage:(data,origin)=>sent.push({data,origin})};
 t.after(()=>{delete globalThis.parent;delete globalThis.location;if(descriptor)Object.defineProperty(navigator,'serviceWorker',descriptor);else delete navigator.serviceWorker;});
 const index={revision:'3'.repeat(64),files:{[hash(1)]:8}},graph=releaseCacheGraph(index,['assets/content/'+hash(2)]);
 registerResourceGraph(index,graph);registerResourceGraph(index,graph);
 assert.equal(sent.length,1);assert.equal(sent[0].origin,'https://example.test');
 assert.deepEqual(sent[0].data,{type:'MOONFOREST_RESOURCE_GRAPH',revision:graph.revision,files:[hash(1),hash(2)]});
});

test('the shell registers only its own frame\'s declaration, once per release and worker',async()=>{
 const s=shellFixture(),graph={type:'MOONFOREST_RESOURCE_GRAPH',revision:'4'.repeat(64),files:[hash(1),hash(2)]};
 assert.equal(typeof s.shell.goLandscape,'function','the existing shell API is intact');
 await s.send(graph,{origin:'https://other.test'});await s.send(graph,{source:{}});
 await s.send({...graph,revision:'not-a-hash'});await s.send({...graph,files:[]});
 assert.equal(s.posted.length,0,'foreign, other-frame and malformed messages are ignored');
 await s.send(graph);await s.send(graph);
 assert.deepEqual(JSON.parse(JSON.stringify(s.posted)),[{type:'RESOURCE_GRAPH_USE',revision:graph.revision,files:graph.files}]);
 s.workers.controller={postMessage:data=>s.posted.push(data)};await s.controllerChange();
 assert.equal(s.posted.length,2,'a replaced worker is told again');
 await s.send({...graph,revision:'5'.repeat(64)});assert.equal(s.posted.length,3,'a new release is registered again');
});

test('fullscreen shell + game: used wolf files stay, an obsolete file is pruned, an old tab keeps its own file',async()=>{
 // The 27 real files of the gray wolf the opening ambush shows.
 const wolf=JSON.parse(readFileSync(new URL('../public/assets/gray-wolf-r2.json',import.meta.url),'utf8')).resources.map(p=>p.split('/').at(-1));
 assert.equal(wolf.length,27);
 const obsolete=hash(9001),oldOnly=hash(9002),revision='6'.repeat(64),files=[...wolf,hash(1)];
 const w=workerFixture(),game={id:'game',url:scope+'moonforest-0.3.html?character=warrior-plains'},shell={id:'shell',url:scope+'moonforest-shell.html'};
 await w.seed([...wolf,obsolete]);w.clients=[shell,game];
 await w.message(game,{type:'RESOURCE_GRAPH_USE',revision,files});
 assert.equal(w.stats().cleanupDeferred,true,'before the shell declares, cleanup waits (the old behaviour)');
 assert.ok(w.names().includes(obsolete));
 // The shell forwards the frame's declaration under its own name.
 const s=shellFixture();await s.send({type:'MOONFOREST_RESOURCE_GRAPH',revision,files});
 await w.message(shell,s.posted[0]);
 assert.equal(w.stats().cleanupDeferred,false);assert.ok(!w.names().includes(obsolete),'the obsolete file is pruned');
 // Reopening: every wolf file is answered from Cache Storage.
 for(const name of wolf)assert.equal(await (await w.read(name)).text(),'bytes');
 assert.equal(w.stats().hits,27);assert.equal(w.stats().downloads,0);
 // An older game tab still open keeps the file only it uses.
 const old={id:'old',url:scope+'moonforest-0.3.html?character=warrior-v3'};await w.seed([oldOnly]);w.clients=[shell,game,old];
 await w.message(old,{type:'RESOURCE_GRAPH_USE',revision:'7'.repeat(64),files:[...wolf,oldOnly]});
 await w.message(shell,s.posted[0]);
 assert.ok(w.names().includes(oldOnly));assert.ok(wolf.every(name=>w.names().includes(name)));
});

test('a denied service worker still opens the game in its normal fullscreen frame',t=>{
 const blocked={get serviceWorker(){throw new DOMException('Blocked','SecurityError');}};
 const s=shellFixture(blocked);
 assert.equal(s.mountedFrame,s.frame);
 assert.equal(s.frame.src,'moonforest-0.3.html?character=warrior-plains');
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'serviceWorker');
 Object.defineProperty(navigator,'serviceWorker',{...Object.getOwnPropertyDescriptor(blocked,'serviceWorker'),configurable:true});
 t.after(()=>{if(descriptor)Object.defineProperty(navigator,'serviceWorker',descriptor);else delete navigator.serviceWorker;});
 assert.doesNotThrow(()=>registerResourceGraph({revision:'3'.repeat(64),files:{}}));
});
