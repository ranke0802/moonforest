import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {ResourceDownloads,resourceUrl} from '../src/resource-downloads.js';
import {prepareStartupResources,prepareMapResources} from '../src/startup-resources.js';
import {loadingArtResources,loadingArtFor} from '../src/loading-art.js';
import {createVillageTerrain} from '../src/village-terrain.js';

const assets=new URL('../public/assets/',import.meta.url),base='https://loading-art-cache.test/game/assets/';
const artManifest=JSON.parse(readFileSync(new URL('map-loading-art.json',assets))),index=JSON.parse(readFileSync(new URL('resource-index.json',assets)));
const paths=[...artManifest.resources],artUrls=paths.map(path=>resourceUrl(path,base)),results=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const originals=new Map(paths.map(path=>[resourceUrl(path,base),readFileSync(new URL(path,assets))]));
const sizes=Object.fromEntries([...originals].map(([url,bytes])=>[new URL(url).pathname.split('/').at(-1),bytes.length]));
const sum=[...originals.values()].reduce((n,bytes)=>n+bytes.length,0);
function storage(initial=[]){
 const entries=new Map(initial),puts=[],matches=[];
 const key=value=>typeof value==='string'?value:value.url;
 const cache={async keys(){return [...entries.keys()].map(url=>({url}));},async match(request){const url=key(request);matches.push(url);const bytes=entries.get(url);return bytes?new Response(bytes):undefined;},async put(request,response){const bytes=Buffer.from(await response.arrayBuffer()),url=key(request);entries.set(url,bytes);puts.push(url);},async delete(request){return entries.delete(key(request));}};
 return {entries,puts,matches,cache,async open(name){assert.equal(name,'moonforest-resources-v1');return cache;}};
}
function downloadFixture(){
 const cache=storage(),server=new Map(originals),requests=[];
 const fetcher=async(url,options)=>{requests.push({url:String(url),cache:options?.cache,writer:options?.headers?.['X-Moonforest-Cache-Writer']});assert.ok(server.has(String(url)),'unexpected resource: '+url);return new Response(server.get(String(url)),{headers:{'Content-Type':'image/webp'}});};
 const manager=files=>new ResourceDownloads(files??sizes,new URL(base),{cacheStorage:cache,fetcher});
 return {cache,server,requests,manager};
}
function updatedWebp(original){
 // A legal unknown RIFF chunk changes the content hash while preserving the
 // image stream. This is an in-memory revision fixture, never a shipped asset.
 const bytes=Buffer.concat([original,Buffer.from('JUNK'),Buffer.alloc(4)]);bytes.writeUInt32LE(bytes.length-8,4);return bytes;
}

test('actual ResourceDownloads stores all four real artwork bodies once and a fresh manager reuses the same cache without fetching',async()=>{
 assert.ok(Object.isFrozen(loadingArtResources));assert.deepEqual([...loadingArtResources],paths);
 const f=downloadFixture(),progress=[];await f.manager().prepare(paths,state=>progress.push(state));
 assert.equal(f.requests.length,4);assert.equal(f.cache.puts.length,4);assert.deepEqual(new Set(f.cache.entries.keys()),new Set(artUrls));
 assert.equal(progress.at(-1).loaded,sum);assert.equal(progress.at(-1).total,sum);assert.equal(progress.at(-1).complete,true);
 for(const [url,bytes]of f.cache.entries)assert.equal(hash(bytes),new URL(url).pathname.split('/').at(-1).split('.')[0]);
 const before=f.requests.length,warm=[];await f.manager().prepare(paths,state=>warm.push(state));
 assert.equal(f.requests.length,before);assert.equal(warm.at(-1).total,0);assert.equal(warm.at(-1).loaded,0);assert.equal(warm.at(-1).cached,sum);assert.equal(warm.at(-1).complete,true);
 assert.ok(f.requests.every(request=>request.writer==='page'));
 results.push({case:'real-managed-cold-and-warm',artworkFiles:4,coldIndividualFetches:4,coldBytes:sum,warmIndividualFetches:0,persistedBodyHashesMatch:true});
});

test('evicting one artwork requests only that file and preserves the other three cached bodies',async()=>{
 const f=downloadFixture();await f.manager().prepare(paths);const target=artUrls[2],before=new Map(f.cache.entries);await f.cache.cache.delete(target);f.requests.length=0;
 await f.manager().prepare(paths);assert.deepEqual(f.requests.map(request=>request.url),[target]);
 for(const [url,bytes]of before)assert.deepEqual(f.cache.entries.get(url),bytes);
 results.push({case:'single-artwork-eviction',refetchedFiles:1,otherArtworkBodiesPreserved:3});
});

test('a changed artwork hash requests only the new URL while the unchanged three reuse their existing entries',async()=>{
 const f=downloadFixture();await f.manager().prepare(paths);const bytes=updatedWebp(originals.get(artUrls[0])),name=hash(bytes)+'.webp',path='./content/'+name,url=resourceUrl(path,base);
 const files={...sizes,[name]:bytes.length};f.server.set(url,bytes);f.requests.length=0;
 await f.manager(files).prepare([path,...paths.slice(1)]);assert.deepEqual(f.requests.map(request=>request.url),[url]);assert.deepEqual(f.cache.entries.get(url),bytes);
 assert.deepEqual(f.cache.entries.get(artUrls[0]),originals.get(artUrls[0]),'a new revision must not evict an old live page entry');
 for(const old of artUrls.slice(1))assert.deepEqual(f.cache.entries.get(old),originals.get(old));
 results.push({case:'single-artwork-hash-update',newHashFetchedFiles:1,unchangedArtworkBodiesReused:3,oldEntryNotGloballyDeleted:true});
});

test('actual startup includes every artwork in the first persistent plan, while later map plans exclude them and warm startup transfers none',async t=>{
 const cache=storage(Object.keys(index.files).filter(name=>!artUrls.some(url=>url.endsWith('/'+name))).map(name=>[new URL('content/'+name,base).href,Buffer.from([0])])),requests=[],plans=[];
 const previous={fetch:globalThis.fetch,location:globalThis.location,caches:globalThis.caches};globalThis.location={href:'https://loading-art-cache.test/game/?character=warrior-v3'};globalThis.caches=cache;
 globalThis.fetch=async url=>{
  const parsed=new URL(url),relative=parsed.pathname.split('/assets/')[1];assert.ok(relative);
  if(!relative.endsWith('.json'))requests.push(relative);
  return new Response(readFileSync(new URL(relative,assets)));
 };
 const originalPrepare=ResourceDownloads.prototype.prepare;t.mock.method(ResourceDownloads.prototype,'prepare',function(paths,callback){plans.push(paths.map(path=>resourceUrl(path,base)));return originalPrepare.call(this,paths,callback);});
 const engine=new NullEngine({renderWidth:900,renderHeight:450}),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const terrain=createVillageTerrain(),camera=new ArcRotateCamera('startup-camera',Math.PI*.38,.88,17,new Vector3(0,1.2,6),scene);camera.fov=.65;camera.minZ=.05;
 const world={scene,camera,terrain,touchDevice:true,mapId:'village',groundManifest:'village-ground'};
 t.after(()=>{engine.dispose();Object.assign(globalThis,previous);});
 let cold,warm;await prepareStartupResources(world,new URL('warrior-v3.json',base),state=>cold=state);
 assert.ok(artUrls.every(url=>plans[0].includes(url)));for(const url of artUrls)assert.equal(hash(cache.entries.get(url)),new URL(url).pathname.split('/').at(-1).split('.')[0]);
 const coldRequests=[...requests];assert.ok(coldRequests.length>0);assert.equal(cold.complete,true);
 requests.length=0;await prepareStartupResources(world,new URL('warrior-v3.json',base),state=>warm=state);assert.deepEqual(requests,[]);assert.equal(warm.total,0);
 const next=plans.length;await prepareMapResources(world,new URL(base));assert.ok(plans.length>next);assert.ok(plans.slice(next).every(plan=>plan.every(url=>!artUrls.includes(url))),'normal map travel must not re-add the global artwork plan');assert.deepEqual(requests,[]);
 results.push({case:'actual-startup-and-map-plans',startupArtworkFiles:4,coldContentRequests:coldRequests,coldNetworkBytes:cold.total,warmContentRequests:0,mapPlanArtworkFiles:0,actualBundleExtractionUsed:coldRequests.some(path=>path.endsWith('.mfp.gz'))});
});

test('actual service worker serves native image GET URLs from the startup cache across all maps, with only evicted or new hashes fetched',async()=>{
 const f=downloadFixture();await f.manager().prepare(paths);const listeners={},requests=[];
 const scope=new URL('../',base).href;
 vm.runInNewContext(readFileSync(new URL('../public/resource-cache.js',import.meta.url),'utf8'),{
  URL,Map,Response,console,self:{registration:{scope},clients:{claim(){}},skipWaiting(){},addEventListener(type,listener){listeners[type]=listener;}},caches:f.cache,
  fetch:async url=>{requests.push(String(url));assert.ok(f.server.has(String(url)));return new Response(f.server.get(String(url)),{headers:{'Content-Type':'image/webp'}});},
 });
 const load=async url=>{
  const request=new Request(url);Object.defineProperty(request,'destination',{value:'image'});let response;const lifetime=[];
  listeners.fetch({request,respondWith(pending){response=pending;},waitUntil(pending){lifetime.push(pending);}});assert.ok(response,'native image GET must be intercepted');
  const bytes=Buffer.from(await (await response).arrayBuffer());await Promise.all(lifetime);return bytes;
 };
 const previous=globalThis.location;globalThis.location={href:new URL('../?character=warrior-v3',base).href};
 try{
  for(let visit=0;visit<4;visit++)for(const character of ['warrior-v3','warrior-plains','warrior-v4','warrior-v5']){
   const url=loadingArtFor(character).url;assert.ok(artUrls.includes(url));const bytes=await load(url+'?rev='+visit);assert.equal(hash(bytes),new URL(url).pathname.split('/').at(-1).split('.')[0]);
  }
  assert.equal(requests.length,0,'the img URL uses the same persistent-cache key; no blob indirection is required for a controlled worker');
  const evicted=artUrls[1];await f.cache.cache.delete(evicted);await Promise.all([load(evicted),load(evicted)]);assert.deepEqual(requests,[evicted]);
  const bytes=updatedWebp(originals.get(artUrls[0])),changed=new URL('content/'+hash(bytes)+'.webp',base).href;f.server.set(changed,bytes);await load(changed);await load(changed);
  assert.deepEqual(requests,[evicted,changed]);
 }finally{globalThis.location=previous;}
 results.push({case:'actual-worker-native-image-cache-read',warmImageGets:16,warmNetworkFetches:0,evictionFetches:1,newHashFetches:1,concurrentEvictionGetsCoalesced:true});
});

test.after(()=>{
 const folder=new URL('../reports/map-loading-art-2026-11-03/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('cache-validation.json',folder),JSON.stringify({passed:results.length===5,completedCases:results.length,cases:results,limitations:['Production ResourceDownloads/startup/map plans and the actual public service-worker script run with real artwork/bundle bytes against an in-memory CacheStorage API surrogate.','This checks persistent-cache key/body/request logic across fresh managers and controlled-worker image requests; it is not a browser disk persistence, actual native image decoder/network trace, mobile GPU or performance measurement.','Without usable CacheStorage or a controlling service worker, network/HTTP-cache fallback remains possible. No claim of unconditional offline reuse on unsupported or denied-storage devices.']},null,2)+'\n');
});
