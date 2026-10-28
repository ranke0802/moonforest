import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { splitGlb } from '../scripts/resource-pack.js';

test('resource packaging: changing only animation data retains all geometry and image resources',()=>{
 const original=readFileSync(new URL('../public/assets/violet-warrior-v2.glb',import.meta.url));
 const modified=Buffer.from(original),n=modified.readUInt32LE(12),g=JSON.parse(modified.toString('utf8',20,20+n));
 const clip=g.animations.find(a=>a.name==='Idle_02');const sampler=clip.samplers.find(sm=>g.accessors[sm.output].type==='VEC4');
 const a=g.accessors[sampler.output],v=g.bufferViews[a.bufferView],offset=28+n+(v.byteOffset||0)+(a.byteOffset||0);
 modified.writeFloatLE(modified.readFloatLE(offset)+.0001,offset);
 const before=splitGlb(original),after=splitGlb(modified);
 const added=[...after.files.keys()].filter(k=>!before.files.has(k));
 assert.equal(added.length,2);assert.equal(added.filter(k=>k.endsWith('.bin')).length,1);assert.equal(added.filter(k=>k.endsWith('.gltf')).length,1);
 for(const image of before.gltf.images)assert.ok(after.files.has(image.uri));
 for(const [name,f]of after.files)for(const [start,length]of f.parts||[])if(start!==null)assert.ok(start+length<=modified.length);
});

function serviceWorker({failWrite=false}={}){
 const listeners={},stored=new Map();let downloads=0,status=200;
 const cache={async match(request){return stored.get(typeof request==='string'?request:request.url)?.clone();},async put(request,response){if(failWrite)throw new Error('quota');stored.set(typeof request==='string'?request:request.url,response);}};
 const context={URL,Map,Response,console,setTimeout,self:{registration:{scope:'https://example.test/ArcherPreviewSite/'},clients:{claim(){}},skipWaiting(){},addEventListener(type,fn){listeners[type]=fn;}},caches:{async open(){return cache;}},async fetch(){downloads++;await new Promise(r=>setTimeout(r,2));return new Response('resource',{status});}};
 vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),context);
 return {get downloads(){return downloads;},set status(v){status=v;},stored,load(name){let result;listeners.fetch({request:new Request(`https://example.test/ArcherPreviewSite/assets/content/${name}`),respondWith(p){result=p;}});return result;}};
}
const a='a'.repeat(64)+'.bin',b='b'.repeat(64)+'.bin';
test('persistent resource cache: first download only, concurrent reuse, changed hash downloads independently',async()=>{
 const sw=serviceWorker();const first=await Promise.all([sw.load(a),sw.load(a)]);assert.equal(sw.downloads,1);assert.equal(await first[0].text(),'resource');assert.equal(await first[1].text(),'resource');
 await sw.load(a);assert.equal(sw.downloads,1);await sw.load(b);assert.equal(sw.downloads,2);await sw.load(a);assert.equal(sw.downloads,2);
});
test('persistent resource cache: failures are not stored; denied storage still loads',async()=>{
 const sw=serviceWorker();sw.status=404;assert.equal((await sw.load(a)).status,404);assert.equal(sw.stored.size,0);
 sw.status=200;await sw.load(a);assert.equal(sw.downloads,2);assert.equal(sw.stored.size,1);
 const denied=serviceWorker({failWrite:true});assert.equal(await (await denied.load(a)).text(),'resource');
});
test('content hash cache ignores revision strings across deployments',async()=>{
 const sw=serviceWorker();await sw.load(a+'?rev=old');await sw.load(a+'?rev=new');await sw.load(a);assert.equal(sw.downloads,1);assert.equal(sw.stored.size,1);
});
test('worker returns the body stream before cache writing finishes, so download progress is live',async()=>{
 const listeners={};let release,writes=0,lifetime;
 const writing=new Promise(resolve=>{release=resolve;});
 const context={URL,Map,Response,console,self:{registration:{scope:'https://example.test/ArcherPreviewSite/'},addEventListener(t,fn){listeners[t]=fn;}},caches:{async open(){return {async match(){},async put(){writes++;await writing;}};}},async fetch(){return new Response('stream');}};
 vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),context);
 let response;listeners.fetch({request:new Request('https://example.test/ArcherPreviewSite/assets/content/'+a),respondWith(p){response=p;},waitUntil(p){lifetime=p;}});
 const result=await Promise.race([response,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Body blocked on cache write')),500))]);
 assert.equal(await result.text(),'stream');assert.equal(writes,1);release();await lifetime;
 let forwarded;listeners.fetch({request:new Request('https://example.test/ArcherPreviewSite/assets/content/'+b,{headers:{'X-Moonforest-Cache-Writer':'page'}}),respondWith(p){forwarded=p;}});
 assert.equal(await (await forwarded).text(),'stream');assert.equal(writes,1,'page prefetch has only one cache writer');
});

test('audio cache: concurrent cues fetch once, reload reuses bytes, changed content fetches once',async()=>{
 const sw=serviceWorker(),a='c'.repeat(64)+'.wav',b='d'.repeat(64)+'.wav';
 await Promise.all([sw.load(a),sw.load(a)]);await sw.load(a);assert.equal(sw.downloads,1);
 await sw.load(b);assert.equal(sw.downloads,2);assert.equal(sw.stored.size,2);
});

test('compressed boss music is persistent, coalesced and refreshed only for a changed hash',async()=>{
 const sw=serviceWorker(),a='e'.repeat(64)+'.mp3',b='f'.repeat(64)+'.mp3';
 await Promise.all([sw.load(a),sw.load(a)]);await sw.load(a);assert.equal(sw.downloads,1);
 await sw.load(b);await sw.load(b);assert.equal(sw.downloads,2);
});
