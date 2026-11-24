import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ArcRotateCamera,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {KhronosTextureContainer2} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import {prepareStartupResources} from '../src/startup-resources.js';
import {replacementExtension,TEXTURE_REPLACEMENTS} from '../src/texture-replacements.js';

const assets=new URL('../public/assets/',import.meta.url);
const read=path=>readFileSync(new URL(path,assets));
const json=path=>JSON.parse(read(path));
const root=new URL('https://scenery-prefetch.test/assets/');
const grass=json('great-plains.json').assets['grass-tuft'].lods[0],target=json('environment.json').assets.scarecrow;
const originals=[grass,target].map(model=>model.resources.find(path=>TEXTURE_REPLACEMENTS[path.split('/').pop()]));
const replacementFor=path=>'./content/'+TEXTURE_REPLACEMENTS[path.split('/').pop()];

test('0.3 prepares only used inputs, while the real GLTF hook still selects each KTX2 at model load',async t=>{
  const index=json('resource-index.json'),cached=new Set(Object.keys(index.files).map(name=>'./content/'+name));
  const previous={fetch:globalThis.fetch,caches:globalThis.caches,location:globalThis.location};
  const fetched=[],checked=[],engine=new NullEngine(),scene=new Scene(engine);
  const world={scene,camera:new ArcRotateCamera('startup',1,1,15,Vector3.Zero(),scene),terrain:{heightAt:()=>0},
    placements:[],mapId:'great-plains',environmentManifest:'great-plains',groundManifest:'great-plains-ground',gameplayV03:true};
  const href=path=>new URL(path,root).href,relative=url=>'.'+new URL(url).pathname.slice('/assets'.length);
  const bodies=new Map(),cache={match:async url=>{const path=relative(url);checked.push(path);return cached.has(path)?new Response(bodies.get(path)):undefined;},
    put:async(url,response)=>{const path=relative(url);bodies.set(path,await response.arrayBuffer());cached.add(path);}};
  globalThis.location={href:new URL('../moonforest-0.3.html',root).href};
  globalThis.caches={open:async()=>cache};
  globalThis.fetch=async url=>{const path=relative(url);if(path.startsWith('./content/'))fetched.push(path);return new Response(read(path));};
  const boot=()=>prepareStartupResources(world,new URL('warrior-v3.json',root));
  t.after(()=>{world.releaseResourceDownloads?.();engine.dispose();Object.assign(globalThis,previous);});

  // A local decoder setup failure leaves the JPGs in the plan. The ordinary
  // decoder retry on the next boot must still be able to install the replacements.
  const urls=KhronosTextureContainer2.URLConfig;
  try{
    KhronosTextureContainer2.URLConfig=Object.freeze({...urls});
    await boot();await world.prefetchResources(grass.resources);
    assert.ok(originals.every(path=>checked.includes(path)));
  }finally{KhronosTextureContainer2.URLConfig=urls;}
  for(const path of originals)cached.delete(path);
  checked.length=0;
  await boot();
  await world.prefetchResources(target.resources,{initial:true});
  await world.prefetchResources(grass.resources);
  assert.ok(!originals.some(path=>checked.includes(path)||fetched.includes(path)));
  assert.ok(!originals.some(path=>checked.includes(replacementFor(path))||fetched.includes(replacementFor(path))),'do not pull future LODs forward');
  const otherTargetJpg=target.resources.find(path=>path.endsWith('.jpg')&&!originals.includes(path));
  assert.ok(checked.includes(otherTargetJpg),'the separate original colour used by the model stays in the plan');

  // The SDK's texture creation still receives the published KTX2 URL, including
  // when the source glTF is reopened offline with its original JPG absent.
  let handleGet,offline=false;
  runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),{
    URL,Map,Response,caches:globalThis.caches,fetch:url=>{assert.equal(offline,false,'offline model must hit the worker cache');return fetch(url);},
    self:{registration:{scope:new URL('../',root).href},addEventListener(type,listener){if(type==='fetch')handleGet=listener;}},
  });
  async function imageBytes(url){
    let response;const pending=[];
    handleGet({request:new Request(url),respondWith(value){response=value;},waitUntil(value){pending.push(value);}});
    const bytes=Buffer.from(await (await response).arrayBuffer());await Promise.all(pending);return bytes;
  }
  for(const model of [grass,target]){
    const original=originals.find(path=>model.resources.includes(path)),packed=replacementFor(original);
    const gltf=json(model.model),source=gltf.images.findIndex(image=>image.uri===original.split('/').pop());
    assert.notEqual(source,-1);
    const extension=replacementExtension({gltf,_createTextureAsync:async(_context,_sampler,image)=>href('./content/'+image.uri)});
    assert.equal(await extension._loadTextureAsync('/textures/0',{source},()=>{}),href(packed));
    cached.delete(packed);assert.deepEqual(await imageBytes(href(packed)),read(packed));
  }
  assert.deepEqual(fetched,originals.map(replacementFor));
  fetched.length=0;offline=true;
  await boot();await world.prefetchResources(grass.resources);
  for(const original of originals)assert.deepEqual(await imageBytes(href(replacementFor(original))),read(replacementFor(original)));
  assert.deepEqual(fetched,[],'no requests for absent JPGs when revisiting with the cached render inputs');
  world.gameplayV03=false;
  await boot();await world.prefetchResources(grass.resources);
  assert.deepEqual(new Set(fetched),new Set(originals),'legacy preparation still fetches both original JPGs');
});
