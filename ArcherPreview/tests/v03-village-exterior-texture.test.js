import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ArcRotateCamera, NullEngine, Scene, Vector3} from '@babylonjs/core';
import {PLAINS_PLACEMENTS} from '../src/great-plains-layout.js';
import {greatPlainsHeight} from '../src/great-plains-terrain.js';
import {prepareMapResources} from '../src/startup-resources.js';
import {villageLodSources} from '../src/village-lod.js';
import {trimTopLevel} from '../scripts/trim-ktx2-top-level.mjs';

const base=new URL('../public/assets/',import.meta.url);
const bytes=path=>readFileSync(new URL(path,base));
const json=path=>JSON.parse(bytes(path));
const exterior=json('great-plains.json').assets['village-approach'];
const mobile=json('v03-mobile-village-exterior.json');
const image=level=>'./content/'+json(level.model).images[0].uri;
const original=exterior.lods[0], full=image(original), small=image(mobile.level);

test('the 2K exterior uses the original encoded mips and identical geometry and material',()=>{
  const a=json(original.model),b=json(mobile.level.model);
  assert.equal(a.images.length,1);
  b.images[0].uri=a.images[0].uri;
  assert.deepEqual(b,a);
  const result=bytes(small);
  assert.deepEqual([result.readUInt32LE(20),result.readUInt32LE(24),result.readUInt32LE(40)],[2048,2048,12]);
  assert.ok(result.equals(trimTopLevel(bytes(full)).bytes));
  for(const [name,length] of Object.entries(mobile.extraFileSizes)){
    const data=bytes('./content/'+name);
    assert.equal(data.length,length);
    assert.equal(createHash('sha256').update(data).digest('hex'),name.split('.')[0]);
  }
  assert.equal(mobile.level.bytes,mobile.level.resources.reduce((n,path)=>n+bytes(path).length,0));
  for(const config of Object.values(json('village-plains-outskirts.json').assets)){
    assert.deepEqual(villageLodSources(config,true,true),villageLodSources(config,true,false));
  }
  assert.deepEqual(villageLodSources(exterior,true,false),[exterior.mobileNear,...exterior.lods.slice(1)]);
});

for(const touchDevice of [true,false]){
  test('0.3 '+(touchDevice?'mobile':'desktop')+' prepares only its exterior atlas at startup, all LODs, and on revisit',async t=>{
    const root='https://exterior.test/assets/', index=json('resource-index.json');
    const old={location:globalThis.location,caches:globalThis.caches,fetch:globalThis.fetch};
    const cached=new Set(Object.keys(index.files).map(name=>root+'content/'+name));
    const urls=[full,small,original.model,mobile.level.model].map(path=>new URL(path,root).href);
    for(const url of urls)cached.delete(url);
    const requests=[];
    globalThis.location={href:'https://exterior.test/moonforest-0.3.html'};
    globalThis.caches={open:async()=>({
      keys:async()=>Array.from(cached,url=>({url})),
      match:async url=>cached.has(url)?new Response():undefined,
      put:async(url,response)=>{await response.arrayBuffer();cached.add(url);}
    })};
    globalThis.fetch=async(url)=>{
      const path=new URL(url).pathname.slice('/assets/'.length);
      if(path.startsWith('content/'))requests.push('./'+path);
      return new Response(bytes(path));
    };
    const engine=new NullEngine();
    t.after(()=>{engine.dispose();Object.assign(globalThis,old);});
    const scene=new Scene(engine), p=PLAINS_PLACEMENTS.find(p=>p.asset==='village-approach');
    const camera=new ArcRotateCamera('exterior',1,1.1,20,new Vector3(p.x,greatPlainsHeight(p.x,p.z)+3,p.z),scene);
    const world={scene,camera,placements:[p],terrain:{heightAt:greatPlainsHeight},mapId:'great-plains',
      environmentManifest:'great-plains',groundManifest:'great-plains-ground',plains:true,gameplayV03:true,touchDevice};
    const chosen=touchDevice?small:full, unused=touchDevice?full:small;
    for(let visit=0;visit<2;visit++){
      await prepareMapResources(world,new URL(root));
      const {assets,resources,records}=world.villagePrepared;
      assert.ok(resources.includes(chosen));assert.ok(!resources.includes(unused));
      for(const level of assets.get('village-approach').levels){
        assert.equal(image(level),chosen);assert.ok(!level.resources.includes(unused));
        await world.prefetchResources(level.resources);
      }
      world.releaseResourceDownloads();
      for(const record of records)record.root.dispose();
      world.villagePrepared=null;
    }
    assert.equal(requests.filter(p=>p===chosen).length,1);
    assert.ok(!requests.includes(unused));
  });
}
