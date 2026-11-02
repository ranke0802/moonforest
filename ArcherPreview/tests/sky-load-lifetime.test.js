import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,Texture} from '@babylonjs/core';
import {InternalTexture} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import {MovingSky,SKY_LOAD_TIMEOUT_MS} from '../src/sky.js';

const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
function clock(){let time=0,id=0;const pending=new Map();return {now:()=>time,setTimeout:(fn,ms)=>{pending.set(++id,{at:time+ms,fn});return id;},clearTimeout:id=>pending.delete(id),advance(ms){time+=ms;for(const [id,item]of [...pending])if(item.at<=time){pending.delete(id);item.fn();}},get size(){return pending.size;}};}
function fixture(t){const engine=new NullEngine(),scene=new Scene(engine),sky=new MovingSky(scene),timers=clock();t.mock.method(console,'warn',()=>{});t.after(()=>engine.dispose());return {engine,scene,sky,timers};}
function textures(auto=false){const created=[],entered=deferred();return {created,entered,createTexture(scene,callbacks){const texture=new Texture(null,scene),item={texture,callbacks};created.push(item);texture.updateURL=url=>{texture.url=url;const internal=item.internal=new InternalTexture(scene.getEngine(),1);texture._texture=internal;scene.addPendingData(internal);scene.getEngine().getLoadedTexturesCache().push(internal);entered.resolve(item);if(auto)queueMicrotask(()=>{internal.isReady=true;scene.removePendingData(internal);callbacks.onLoad();});};return texture;}};}
const url=new URL('https://sky-lifetime.test/sky.json'),fetcher=async()=>({ok:true,json:async()=>({texture:'authored-sky.webp'})});

test('sky fetch and manifest parsing have one8second fallback deadline and failed pending is evicted',async t=>{
 for(const stage of ['fetch','parse'])await t.test(stage,async t=>{
  const {sky,timers}=fixture(t),entered=deferred(),fallback=sky.texture;let calls=0;
  const load=sky.load(url,{timers,fetcher:stage==='fetch'?()=>{calls++;entered.resolve();return new Promise(()=>{});}:async()=>({ok:true,json(){calls++;entered.resolve();return new Promise(()=>{});}})});await entered.promise;assert.equal(sky.load(url),load);assert.equal(SKY_LOAD_TIMEOUT_MS,8000);timers.advance(8000);assert.equal(await load,false);assert.equal(sky.texture,fallback);assert.equal(sky.loadPromise,null);assert.equal(timers.size,0);assert.equal(calls,1);
 });
});

test('late sky texture completion cannot bind or retain a disposed candidate, and explicit retry reuses authored quality',async t=>{
 const {sky,scene,timers}=fixture(t),held=textures(),fallback=sky.texture,unrelated={owner:'player'};scene.addPendingData(unrelated);
 const load=sky.load(url,{timers,fetcher,createTexture:held.createTexture});const old=await held.entered.promise;timers.advance(8000);assert.equal(await load,false);assert.equal(old.internal._references,0);assert.equal(scene._pendingData.includes(old.internal),false);assert.equal(scene._pendingData.includes(unrelated),true);assert.equal(sky.texture,fallback);assert.equal(timers.size,0);
 const ready=textures(true);assert.equal(await sky.load(url,{timers,fetcher,createTexture:ready.createTexture}),true);const current=sky.texture;assert.equal(current,ready.created[0].texture);assert.equal(current.url,new URL('authored-sky.webp',url).href);assert.equal(current.wrapU,Texture.MIRROR_ADDRESSMODE);assert.equal(current.wrapV,Texture.MIRROR_ADDRESSMODE);assert.equal(current.anisotropicFilteringLevel,1);
 old.callbacks.onLoad();old.callbacks.onError('late old image',new Error('late'));await Promise.resolve();await Promise.resolve();assert.equal(sky.texture,current);assert.equal(sky.material._textures.cloudMap,current);assert.equal(sky.lastLoad.status,'ready');
 const cached=sky.loadPromise;assert.strictEqual(sky.load(url,{fetcher:()=>assert.fail('successful sky must not refetch')}),cached);assert.equal(await cached,true);assert.equal(timers.size,0);scene.removePendingData(unrelated);
});

test('sky abort and scene disposal settle without a response and preserve unrelated live texture ownership',async t=>{
 const {sky,scene,timers}=fixture(t),held=textures(),controller=new AbortController(),load=sky.load(url,{timers,fetcher,createTexture:held.createTexture,signal:controller.signal});const item=await held.entered.promise;controller.abort();assert.equal(await load,false);assert.equal(item.internal._references,0);assert.equal(scene.getWaitingItemsCount(),0);assert.equal(timers.size,0);
 const again=textures(),pending=sky.load(url,{timers,fetcher,createTexture:again.createTexture});await again.entered.promise;scene.dispose();assert.equal(await pending,false);assert.equal(timers.size,0);assert.equal(sky.loadPromise,null);
});

test('a completed sky keeps its texture and readiness through repeated travel without new waits or listeners',async t=>{
 const {sky,scene,timers}=fixture(t),ready=textures(true);await sky.load(url,{timers,fetcher,createTexture:ready.createTexture});const texture=sky.texture,observers=scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length;
 for(let i=0;i<20;i++)assert.equal(await sky.load(url,{timers,fetcher:()=>assert.fail('unexpected sky request')}),true);
 assert.equal(sky.texture,texture);assert.equal(ready.created.length,1);assert.equal(timers.size,0);assert.equal(scene.onDisposeObservable.observers.filter(o=>!o._willBeUnregistered).length,observers);
});
