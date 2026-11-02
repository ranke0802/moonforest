import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,StandardMaterial,MeshBuilder,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {ThinEngine} from '@babylonjs/core/Engines/thinEngine.js';
import {applyVillageGround} from '../src/village-ground.js';
import {releaseMapTexture} from '../src/map-texture-lifetime.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function clock(){let time=0,id=0;const pending=new Map();return {now:()=>time,setTimeout:(fn,ms)=>{pending.set(++id,{at:time+ms,fn});return id;},clearTimeout:key=>pending.delete(key),advance(ms){time+=ms;for(const [key,timer]of [...pending])if(timer.at<=time){pending.delete(key);timer.fn();}},get size(){return pending.size;}};}

function fixture(t,name){
  const previous={location:globalThis.location,caches:globalThis.caches};
  globalThis.location={href:`https://${name}.test/game/`};globalThis.caches=undefined;
  const color=Buffer.from('valid color compressed texture bytes'),detail=Buffer.from('valid detail compressed texture bytes');
  const resource=(bytes,width)=>({url:`./content/${sha(bytes)}.ktx2`,width,height:width,bytes:bytes.length,codec:'etc1s'});
  const manifest={span:160,color:resource(color,2048),detail:resource(detail,256),soilMaskAlphaRange:[64,255],gpuBytesWithMips:1024};
  const manifestUrl=new URL('/assets/village-ground.json',location.href),colorUrl=new URL(manifest.color.url,manifestUrl).href,detailUrl=new URL(manifest.detail.url,manifestUrl).href;
  const engine=new NullEngine(),scene=new Scene(engine),ground=MeshBuilder.CreateGround('ground',{},scene),floorMaterial=new StandardMaterial('floor',scene);
  ground.material=floorMaterial;const world={scene,ground,floorMaterial,terrain:{size:160},placements:[],groundManifest:'village-ground',mapId:'village',lighting:{}};
  const network=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{url=new URL(url).href;if(url===manifestUrl.href)return new Response(JSON.stringify(manifest));network.push({url,options});return new Response(url===colorUrl?color:detail);});
  t.after(()=>{world.releaseGround?.();scene.dispose();engine.dispose();globalThis.location=previous.location;globalThis.caches=previous.caches;});
  return {world,engine,scene,manifest,color,detail,colorUrl,detailUrl,network};
}

function internalFor(f,url){
  const internal=new InternalTexture(f.engine,1);
  Object.assign(internal,{url,generateMipMaps:true,invertY:true,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,_useSRGBBuffer:f.engine._getUseSRGBBuffer(false,false)});
  f.engine.getLoadedTexturesCache().push(internal);f.scene.addPendingData(internal);return internal;
}

// Keep the installed SDK's constructor, updateURL, delayed callbacks and cache
// lookup. Only the engine's I/O boundary is controlled; no Texture method is
// replaced, unlike the older ground timeout tests.
function engineCallbacks(f,mode){
  const calls=[];
  f.engine.createTexture=(url,noMipmap,invertY,scene,samplingMode,onLoad,onError)=>{
    assert.equal(noMipmap,false);assert.equal(invertY,true);assert.equal(samplingMode,Texture.TRILINEAR_SAMPLINGMODE);
    const internal=internalFor(f,url),entry={url,internal,onLoad,onError};calls.push(entry);mode(entry,calls.length);return internal;
  };
  return calls;
}
function success(f,entry){entry.internal.isReady=true;f.scene.removePendingData(entry.internal);entry.onLoad();}
function failure(f,entry,message,exception){entry.internal._setError(message,exception);f.scene.removePendingData(entry.internal);entry.onError(message,exception);}
function cacheStorage(f,entries){
  const data=new Map(entries),events=[];
  const key=value=>typeof value==='string'?value:value.url;
  const cache={async match(url){events.push({op:'match',url:key(url)});const bytes=data.get(key(url));return bytes===undefined?undefined:new Response(bytes);},async delete(url){events.push({op:'delete',url:key(url)});return data.delete(key(url));},async put(url,response){events.push({op:'put',url:key(url)});data.set(key(url),Buffer.from(await response.arrayBuffer()));}};
  globalThis.caches={async open(name){events.push({op:'open',name});return cache;},async keys(){return ['moonforest-content-v1'];},async delete(name){events.push({op:'delete-cache',name});return false;}};
  return {data,events,cache};
}
const alive=f=>({textures:f.scene.textures.length,pending:f.scene.getWaitingItemsCount(),observers:f.scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length});
const freed=(f,calls)=>{for(const entry of calls){assert.equal(entry.internal._references,0);assert.equal(f.engine.getLoadedTexturesCache().includes(entry.internal),false);}};

test('real Texture constructor and updateURL keep synchronous color/detail callbacks and install one ready material',async t=>{
  const f=fixture(t,'ground-sdk-sync-load'),calls=engineCallbacks(f,entry=>success(f,entry));
  await applyVillageGround(f.world);assert.deepEqual(calls.map(c=>c.url),[f.colorUrl,f.detailUrl]);
  const material=f.world.floorMaterial,detail=material.pluginManager.getPlugin('MoonforestGroundDetail');
  assert.equal(material.diffuseTexture.getInternalTexture(),calls[0].internal);assert.equal(detail.texture.getInternalTexture(),calls[1].internal);assert.equal(detail.isReadyForSubMesh(),true);
  assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.network.length,0);
  f.world.releaseGround();freed(f,calls);
});

for(const role of ['color','detail'])test(`real ${role} callback failure preserves SDK context and releases every owned allocation`,async t=>{
  const f=fixture(t,`ground-sdk-${role}-error`),before=alive(f),cause=new Error(`${role} bitmap decoding failed`),message=`Error while trying to load image: ${role}`;
  const calls=engineCallbacks(f,(entry,index)=>{if(role==='detail'&&index===1)success(f,entry);else failure(f,entry,message,cause);});
  const error=await applyVillageGround(f.world).catch(error=>error);
  assert.equal(error.code,'GROUND_TEXTURE_LOAD');assert.equal(error.stage,'ground');assert.equal(error.textureRole,role);assert.equal(error.resourceUrl,role==='color'?f.colorUrl:f.detailUrl);assert.equal(error.loaderMessage,message);assert.match(error.loaderCause,new RegExp(cause.message));assert.equal(error.cause,cause);
  assert.equal(f.world.floorMaterial.diffuseTexture,null);assert.equal(f.world.releaseGround,null);assert.deepEqual(alive(f),before);freed(f,calls);assert.equal(f.network.length,0);
});

test('module import failures keep their URL and cause and never inspect or evict healthy content cache',async t=>{
  const f=fixture(t,'ground-sdk-module-error'),stored=cacheStorage(f,[[f.colorUrl,f.color],[f.detailUrl,f.detail]]),cause=new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/ktxTextureLoader-old.js');
  const calls=engineCallbacks(f,entry=>failure(f,entry,'Failed to parse texture data',cause));
  const error=await applyVillageGround(f.world).catch(error=>error);
  assert.equal(error.code,'APP_MODULE_LOAD_FAILED');assert.equal(error.textureRole,'color');assert.equal(error.resourceUrl,f.colorUrl);assert.equal(error.cause,cause);assert.match(error.loaderCause,/ktxTextureLoader-old/);
  assert.equal(calls.length,1);assert.equal(stored.events.filter(e=>e.op==='match'||e.op==='delete'||e.op==='put'||e.op==='delete-cache').length,0);assert.equal(f.network.length,0);freed(f,calls);
});

test('a genuine loader failure with valid cached bytes leaves content intact and makes no automatic texture retry',async t=>{
  const f=fixture(t,'ground-sdk-valid-cache-error'),stored=cacheStorage(f,[[f.colorUrl,f.color],[f.detailUrl,f.detail]]),cause=new Error('GPU upload failed');
  const calls=engineCallbacks(f,entry=>queueMicrotask(()=>failure(f,entry,'TextureLoader failed to load data',cause)));
  const error=await applyVillageGround(f.world).catch(error=>error);
  assert.equal(error.code,'GROUND_TEXTURE_LOAD');assert.equal(calls.length,1);assert.equal(f.network.length,0);assert.deepEqual(stored.data.get(f.colorUrl),f.color);assert.deepEqual(stored.data.get(f.detailUrl),f.detail);
  assert.equal(stored.events.filter(e=>e.op==='delete'||e.op==='put'||e.op==='delete-cache').length,0);freed(f,calls);
});

for(const role of ['color','detail'])test(`only the corrupt failed ${role} URL is repaired once and stale callbacks cannot change the successful floor`,async t=>{
  const f=fixture(t,`ground-sdk-${role}-corrupt-cache-retry`),failedUrl=role==='color'?f.colorUrl:f.detailUrl,failedIndex=role==='color'?0:1,unrelated=`https://ground-sdk-${role}-corrupt-cache-retry.test/assets/content/unrelated.bin`,stored=cacheStorage(f,[[f.colorUrl,role==='color'?Buffer.from('bad cached bytes'):f.color],[f.detailUrl,role==='detail'?Buffer.from('bad cached bytes'):f.detail],[unrelated,Buffer.from('keep')]]),before=alive(f);
  const calls=engineCallbacks(f,(entry,index)=>queueMicrotask(()=>index===failedIndex+1?failure(f,entry,'TextureLoader failed to load data',new Error('invalid KTX identifier')):success(f,entry)));
  await applyVillageGround(f.world);
  assert.deepEqual(calls.map(c=>c.url),role==='color'?[f.colorUrl,f.colorUrl,f.detailUrl]:[f.colorUrl,f.detailUrl,f.detailUrl]);assert.equal(calls[failedIndex].internal._references,0);assert.equal(f.network.length,1);assert.equal(f.network[0].url,failedUrl);assert.equal(f.network[0].options.cache,'no-store');
  assert.equal(new Headers(f.network[0].options.headers).get('X-Moonforest-Cache-Repair'),'1');assert.deepEqual(stored.events.filter(e=>e.op==='put').map(e=>e.url),[failedUrl]);assert.deepEqual(stored.data.get(f.colorUrl),f.color);assert.deepEqual(stored.data.get(f.detailUrl),f.detail);assert.deepEqual(stored.data.get(unrelated),Buffer.from('keep'));assert.equal(stored.events.some(e=>e.op==='delete'||e.op==='delete-cache'),false);
  const material=f.world.floorMaterial,binding=material.diffuseTexture,plugin=material.pluginManager.getPlugin('MoonforestGroundDetail'),release=f.world.releaseGround;
  calls[failedIndex].onLoad();calls[failedIndex].onError('late old failure',new Error('late'));await tick();assert.equal(material.diffuseTexture,binding);assert.equal(f.world.releaseGround,release);assert.equal(plugin.isReadyForSubMesh(),true);assert.equal(calls.length,3);assert.equal(f.network.length,1);
  release();freed(f,calls);assert.deepEqual(alive(f),before);
});

test('cancelling while a repair is pending releases the old attempt and prevents a late repair from retrying',async t=>{
  const f=fixture(t,'ground-sdk-abort-repair'),controller=new AbortController(),entered=deferred(),gate=deferred(),old=engineCallbacks(f,entry=>failure(f,entry,'TextureLoader failed to load data',new Error('bad data')));
  const pending=applyVillageGround(f.world,{signal:controller.signal,repairResource:async(url,options)=>{assert.equal(url,f.colorUrl);assert.equal(options.expectedSize,f.manifest.color.bytes);entered.resolve(options);return gate.promise;}}).catch(error=>error);
  const options=await entered.promise;controller.abort();assert.equal((await pending).name,'AbortError');assert.equal(options.signal.aborted,true);assert.equal(f.world.releaseGround,null);freed(f,old);
  const retry=engineCallbacks(f,entry=>queueMicrotask(()=>success(f,entry)));await applyVillageGround(f.world);const binding=f.world.floorMaterial.diffuseTexture,release=f.world.releaseGround;
  gate.resolve({status:'repaired',repaired:true});await tick();await tick();assert.equal(old.length,1);assert.equal(retry.length,2);assert.equal(f.world.floorMaterial.diffuseTexture,binding);assert.equal(f.world.releaseGround,release);assert.equal(f.network.length,0);
});

test('a second loader error after one content repair stops and preserves the final SDK failure',async t=>{
  const f=fixture(t,'ground-sdk-repaired-still-fails'),stored=cacheStorage(f,[[f.colorUrl,Buffer.from('bad')]]),cause=new Error('device cannot upload this texture');
  const calls=engineCallbacks(f,(entry,index)=>queueMicrotask(()=>failure(f,entry,`attempt ${index} failed`,index===1?new Error('corrupt'):cause)));
  const error=await applyVillageGround(f.world).catch(error=>error);
  assert.equal(calls.length,2);assert.equal(f.network.length,1);assert.equal(error.code,'GROUND_TEXTURE_LOAD');assert.equal(error.loaderMessage,'attempt 2 failed');assert.equal(error.cause,cause);assert.equal(stored.events.filter(e=>e.op==='put').length,1);assert.equal(stored.events.filter(e=>e.op==='delete').length,0);assert.equal(f.world.releaseGround,null);freed(f,calls);
});

test('an explicit failure then successful retry uses the real SDK callbacks and a single pair of plugins',async t=>{
  const f=fixture(t,'ground-sdk-manual-retry');let fail=true;
  const calls=engineCallbacks(f,entry=>queueMicrotask(()=>fail?failure(f,entry,'temporary loader failure',new Error('temporary')):success(f,entry)));
  await assert.rejects(applyVillageGround(f.world),{code:'GROUND_TEXTURE_LOAD'});fail=false;await applyVillageGround(f.world);
  const floor=f.world.floorMaterial,detail=floor.pluginManager.getPlugin('MoonforestGroundDetail'),shade=floor.pluginManager.getPlugin('MoonforestVillageToon');
  assert.equal(calls.length,3);assert.equal(detail.texture.getInternalTexture(),calls[2].internal);assert.equal(detail.isReadyForSubMesh(),true);
  await applyVillageGround(f.world);assert.equal(calls.length,5);assert.equal(floor.pluginManager.getPlugin('MoonforestGroundDetail'),detail);assert.equal(floor.pluginManager.getPlugin('MoonforestVillageToon'),shade);assert.equal(floor.pluginManager._activePlugins.filter(p=>p.name==='MoonforestGroundDetail').length,1);
  for(const call of calls.slice(0,3))assert.equal(call.internal._references,0);
  f.world.releaseGround();freed(f,calls);
});

test('a real SDK pending allocation times out, preserves foreign pending work, and ignores callbacks after a successful retry',async t=>{
  const f=fixture(t,'ground-sdk-timeout-retry'),timers=clock(),entered=deferred(),foreign={name:'foreign pending task'};f.scene.addPendingData(foreign);const before=alive(f);
  const old=engineCallbacks(f,entry=>entered.resolve(entry)),pending=applyVillageGround(f.world,{timers}).catch(error=>error);await entered.promise;timers.advance(45000);const error=await pending;
  assert.equal(error.name,'TimeoutError');assert.equal(error.stage,'ground');assert.equal(f.world.releaseGround,null);assert.equal(timers.size,0);assert.deepEqual(alive(f),before);freed(f,old);
  const retry=engineCallbacks(f,entry=>queueMicrotask(()=>success(f,entry)));await applyVillageGround(f.world,{timers});const binding=f.world.floorMaterial.diffuseTexture,release=f.world.releaseGround;
  old[0].onLoad();old[0].onError('late error',new Error('late'));await tick();assert.equal(f.world.floorMaterial.diffuseTexture,binding);assert.equal(f.world.releaseGround,release);assert.equal(f.scene.getWaitingItemsCount(),1);assert.equal(f.network.length,0);assert.equal(timers.size,0);
  release();freed(f,retry);f.scene.removePendingData(foreign);
});

test('scene disposal during a real pending texture cancels once without leaving a deadline or allocation',async t=>{
  const f=fixture(t,'ground-sdk-scene-dispose'),timers=clock(),entered=deferred(),calls=engineCallbacks(f,entry=>entered.resolve(entry)),pending=applyVillageGround(f.world,{timers}).catch(error=>error);
  await entered.promise;f.scene.dispose();assert.equal((await pending).name,'AbortError');assert.equal(f.world.releaseGround,null);assert.equal(timers.size,0);freed(f,calls);assert.equal(f.scene.getWaitingItemsCount(),0);
  calls[0].onLoad();calls[0].onError('late after scene disposal',new Error('late'));await tick();assert.equal(calls.length,1);assert.equal(calls[0].internal._references,0);assert.equal(f.network.length,0);
});

test('the SDK shared pending cache branch still has a bounded deadline without releasing the foreign owner',async t=>{
  const f=fixture(t,'ground-sdk-shared-error'),timers=clock(),shared=internalFor(f,f.colorUrl),entered=deferred();let calls=0;f.engine.createTexture=()=>{calls++;throw new Error('must use the shared allocation');};f.engine.onBeforeTextureInitObservable.add(()=>entered.resolve());
  let settled=false;const pending=applyVillageGround(f.world,{timers}).catch(error=>error).then(error=>{settled=true;return error;});await entered.promise;await tick();assert.equal(shared._references,2);
  shared._setError('foreign allocation failed',new Error('foreign'));f.scene.removePendingData(shared);await tick();assert.equal(settled,false);
  timers.advance(45000);assert.equal((await pending).name,'TimeoutError');assert.equal(calls,0);assert.equal(shared._references,1);assert.equal(f.engine.getLoadedTexturesCache().includes(shared),true);assert.equal(timers.size,0);shared.dispose();
});

test('late disposed PNG callback reaches the actual SDK pre-upload guard with zero upload calls',t=>{
  const f=fixture(t,'ground-sdk-disposed-image'),texture=new Texture(null,f.scene),internal=internalFor(f,'https://ground-sdk-disposed-image.test/detail.png');texture._texture=internal;releaseMapTexture(texture,f.scene);
  let uploads=0;const previousGL=f.engine._gl;f.engine._gl={TEXTURE_2D:3553};f.engine._bindTextureDirectly=()=>uploads++;
  try{ThinEngine.prototype._prepareWebGLTexture.call(f.engine,internal,'.png',f.scene,{width:256,height:256},true,false,false,()=>{uploads++;return false;},Texture.TRILINEAR_SAMPLINGMODE);}finally{f.engine._gl=previousGL;}
  assert.equal(uploads,0);assert.equal(internal._references,0);assert.equal(internal.isReady,false);assert.equal(f.scene.getWaitingItemsCount(),0);
});
