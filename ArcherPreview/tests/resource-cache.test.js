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
 const cache={async match(request){return stored.get(request.url)?.clone();},async put(request,response){if(failWrite)throw new Error('quota');stored.set(request.url,response);}};
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
