import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,RawTexture,Texture,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {VillageGeometryStreaming} from '../src/village-demand.js';
import {MAP_MODEL_TIMEOUT_MS} from '../src/map-load-lifetime.js';
import {isAbandonedMapTexture} from '../src/map-texture-lifetime.js';

function fixture(t){
  const clock={value:0,next:0,pending:new Map(),now(){return this.value;},setTimeout(fn,delay){const id=++this.next;this.pending.set(id,{fn,at:this.value+delay});return id;},clearTimeout(id){this.pending.delete(id);},advance(ms,dispatch=true){this.value+=ms;if(dispatch)for(const [id,timer]of [...this.pending])if(timer.at<=this.value){this.pending.delete(id);timer.fn();}}};
  const engine=new NullEngine({textureSize:4096}),scene=new Scene(engine),camera=new ArcRotateCamera('camera',0,1,6,Vector3.Zero(),scene);
  Object.assign(engine.getCaps(),{maxTextureSize:8192,astc:{}});
  const callbacks=[],create=engine.createTexture.bind(engine);
  engine.createTexture=(...args)=>{
    if(!String(args[0]).startsWith('https://timeout.test/'))return create(...args);
    const onLoad=args[5],onError=args[6];args[5]=args[6]=null;
    const internal=create(...args);internal.isReady=false;scene.addPendingData(internal);
    callbacks.push({internal,load(){scene.removePendingData(internal);internal.isReady=true;onLoad?.();internal.onLoadedObservable.notifyObservers(internal);},error(){onError?.('late decode error');}});
    return internal;
  };
  const world={scene,camera,touchDevice:true,villageStreaming:{active:true}},material=new PBRMaterial('paint',scene),placeholder=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);
  material.albedoTexture=placeholder;camera.getViewMatrix();camera.getProjectionMatrix();
  const managers=[];
  const manager=id=>{
    const profile={shading:'toon-color',textures:{albedo:{url:id+'.ktx2',width:4096,height:4096,codec:'etc1s'}},resources:[]};
    const assets=new Map([[id,{config:{highTextures:profile},source:{materials:[material]},baseLevel:0}]]),stats={};
    const records=[{placement:{asset:id},root:{isEnabled:()=>true},meshes:[{isInFrustum:()=>true,getBoundingInfo:()=>({boundingSphere:{centerWorld:camera.target,radiusWorld:2}})}]}];
    const stream=new VillageTextureStreaming(world,assets,records,new URL('https://timeout.test/'),stats,{textureTimers:clock});
    stream.clock=()=>clock.value;stream.wanted.set(id,1);managers.push(stream);return {stream,stats};
  };
  t.mock.method(console,'warn',()=>{});
  t.after(()=>{for(const stream of managers)stream.dispose();engine.dispose();});
  return {clock,engine,scene,world,material,placeholder,callbacks,manager};
}

async function bounded(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('texture deadline did not settle')),500))]);}
  finally{clearTimeout(timer);}
}

test('a missing high-texture callback expires its reservation and lets the existing geometry stream proceed',async t=>{
  const f=fixture(t),{stream,stats}=f.manager('stuck'),pending=stream.start('stuck');
  const internal=f.callbacks[0].internal;
  assert.equal(stats.highTexturePending,1);assert.ok(stats.highTextureReserved>0);
  const requests=[],geometry=new VillageGeometryStreaming(f.world,[],async request=>requests.push(request),()=>false,stats);
  geometry.active=true;geometry.demand.get=()=>[{id:'deferred-model',level:2}];t.after(()=>geometry.dispose());
  geometry.update(0);assert.equal(requests.length,0,'serial geometry waits for the admitted texture');
  f.clock.advance(MAP_MODEL_TIMEOUT_MS-1);assert.equal(stats.highTexturePending,1);
  f.clock.advance(1);await bounded(pending);
  assert.equal(stats.highTexturePending,0);assert.equal(stats.highTextureReserved,0);assert.equal(stream.textureWaiters.size,0);assert.equal(f.clock.pending.size,0);
  assert.equal(stream.resident.size,0);assert.equal(f.material.albedoTexture,f.placeholder);
  assert.match(stats.highTextureError,/시간이 초과/);assert.equal(stream.failed.has('stuck'),true);
  assert.equal(isAbandonedMapTexture(internal),true);assert.equal(internal._references,0);assert.equal(f.scene.getWaitingItemsCount(),0);
  geometry.update(f.clock.value);await geometry.pending;
  assert.deepEqual(requests,[{id:'deferred-model',level:2}],'the selected tier is unchanged');
  for(let i=0;i<8;i++){f.clock.advance(1000);stream.update(f.clock.value);}
  assert.equal(f.callbacks.length,1,'existing failed-asset policy does not automatically retry');
});

test('timeout releases only its Texture wrapper when another caller owns the same InternalTexture',async t=>{
  const f=fixture(t),{stream,stats}=f.manager('shared'),pending=stream.start('shared');
  const other=new Texture('https://timeout.test/shared.ktx2',f.scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:true,gammaSpace:true});
  t.after(()=>other.dispose());
  const internal=f.callbacks[0].internal;
  assert.equal(f.callbacks.length,1);assert.equal(internal._references,2);
  f.clock.advance(MAP_MODEL_TIMEOUT_MS);await bounded(pending);
  assert.equal(internal._references,1);assert.equal(isAbandonedMapTexture(internal),false);
  assert.equal(other.getInternalTexture(),internal);assert.equal(f.scene.getWaitingItemsCount(),1);
  assert.equal(f.engine.getLoadedTexturesCache().includes(internal),true);
  assert.equal(stats.highTextureReserved,0);assert.equal(f.material.albedoTexture,f.placeholder);
  f.callbacks[0].load();await Promise.resolve();await Promise.resolve();
  assert.equal(other.isReady(),true);assert.equal(f.scene.getWaitingItemsCount(),0);
  assert.equal(stream.resident.size,0);assert.equal(stats.highTextureLoads,0);
});

test('a late timed-out callback cannot promote over a newly completed map texture',async t=>{
  const f=fixture(t),old=f.manager('old'),pending=old.stream.start('old');
  f.clock.advance(MAP_MODEL_TIMEOUT_MS);await bounded(pending);
  const fresh=f.manager('fresh'),next=fresh.stream.start('fresh');
  f.callbacks[1].load();await bounded(next);const current=f.material.albedoTexture;
  assert.notEqual(current,f.placeholder);assert.equal(fresh.stats.highTextureMax,4096);assert.equal(f.clock.pending.size,0);
  f.callbacks[0].load();f.callbacks[0].error();await Promise.resolve();await Promise.resolve();
  assert.equal(f.material.albedoTexture,current);assert.equal(fresh.stream.resident.size,1);assert.equal(fresh.stats.highTextureError,null);
  assert.equal(old.stats.highTextureLoads,0);assert.equal(old.stream.resident.size,0);
});

test('completion queued beyond the deadline expires once even before the timer callback is dispatched',async t=>{
  const f=fixture(t),{stream,stats}=f.manager('late'),pending=stream.start('late'),wrapper=f.scene.textures.find(texture=>texture.url?.endsWith('late.ktx2'));
  const dispose=t.mock.method(wrapper,'dispose',wrapper.dispose.bind(wrapper));
  f.clock.advance(MAP_MODEL_TIMEOUT_MS,false);f.callbacks[0].load();await bounded(pending);
  assert.equal(dispose.mock.calls.length,1);assert.equal(stats.highTextureLoads,0);assert.equal(stats.highTextureReserved,0);
  assert.equal(f.clock.pending.size,0);assert.equal(f.material.albedoTexture,f.placeholder);
});

test('ordinary completion, loader errors and map cancellation remove their callback deadlines',async t=>{
  const f=fixture(t),good=f.manager('good'),loaded=good.stream.start('good');
  f.clock.advance(1000);f.callbacks[0].load();await bounded(loaded);
  assert.equal(good.stats.highTextureLoads,1);assert.equal(f.clock.pending.size,0);
  good.stream.release('good');
  const bad=f.manager('bad'),failed=bad.stream.start('bad');f.callbacks[1].error();await bounded(failed);
  assert.equal(f.clock.pending.size,0);assert.equal(bad.stream.textureWaiters.size,0);
  const cancelled=f.manager('cancelled'),pending=cancelled.stream.start('cancelled');cancelled.stream.dispose();await bounded(pending);
  assert.equal(f.clock.pending.size,0);assert.equal(cancelled.stats.highTextureError,null);assert.equal(cancelled.stats.highTextureReserved,0);
  f.clock.advance(MAP_MODEL_TIMEOUT_MS*2);assert.equal(good.stats.highTextureLoads,1);assert.equal(cancelled.stream.failed.size,0);
});
