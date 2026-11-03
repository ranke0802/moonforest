import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,RawTexture,Texture,ArcRotateCamera,Vector3,AssetContainer,MeshBuilder} from '@babylonjs/core';
import {VillageTextureStreaming} from '../src/village-texture-streaming.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {waitForSceneReady} from '../src/scene-ready.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

// Hold the actual Babylon Texture callback, not the streaming load method.
// No image decode/GPU/real phone behavior is simulated by this NullEngine test.
function fixture(t){
 const engine=new NullEngine({textureSize:4096}),scene=new Scene(engine),camera=new ArcRotateCamera('camera',0,1,10,Vector3.Zero(),scene),callbacks=[];engine.getCaps().maxTextureSize=8192;engine.getCaps().astc={};
 const create=engine.createTexture.bind(engine);engine.createTexture=(...args)=>{if(!String(args[0]).startsWith('https://cancel.test/'))return create(...args);const onLoad=args[5],onError=args[6];args[5]=args[6]=null;const internal=create(...args);internal.isReady=false;scene.addPendingData(internal);callbacks.push({onLoad:()=>{scene.removePendingData(internal);internal.isReady=true;onLoad?.();internal.onLoadedObservable.notifyObservers(internal);},onError:message=>{scene.removePendingData(internal);onError?.(message);},internal});return internal;};
 const world={scene,camera,touchDevice:true,villageStreaming:{active:true}},material=new PBRMaterial('paint',scene),placeholder=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);material.albedoTexture=placeholder;
 const manager=tag=>{const profile={shading:'toon-color',textures:{albedo:{url:tag+'.ktx2',width:4096,height:4096,codec:'etc1s'}},resources:[]},assets=new Map([[tag,{config:{highTextures:profile},source:{materials:[material]},baseLevel:0}]]),stats={},stream=new VillageTextureStreaming(world,assets,[],new URL('https://cancel.test/assets/'),stats);stream.wanted.set(tag,1);return {stream,stats,tag};};
 t.after(()=>engine.dispose());return {engine,scene,world,material,placeholder,callbacks,manager};
}
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('released texture waiter did not settle')),500);})]);}finally{clearTimeout(timer);}}

test('disposing a map aborts a never-completing Texture callback waiter immediately and clears reserved memory',async t=>{
 const f=fixture(t),{stream,stats}=f.manager('old'),pending=stream.start('old');assert.equal(f.callbacks.length,1);assert.equal(stream.textureWaiters.size,1);const texture=f.scene.textures.find(t=>t.url?.endsWith('old.ktx2'));
 assert.ok(texture);assert.equal(stats.highTexturePending,1);stream.dispose();await bounded(pending);
 assert.equal(stream.textureWaiters.size,0);assert.equal(stream.resident.size,0);assert.equal(stats.highTexturePending,0);assert.equal(stats.highTextureReserved,0);assert.equal(f.material.albedoTexture,f.placeholder);assert.equal(texture.getInternalTexture(),null);assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.scene.isReady(),true,'abandoned internal texture cannot keep destination scene readiness blocked');
 // The old backend may still finish after cancellation; it cannot install or
 // resurrect its resource, or turn a quiet cancellation into an error/retry.
 f.callbacks[0].onLoad?.();f.callbacks[0].onError?.('late');await Promise.resolve();await Promise.resolve();assert.equal(stats.highTextureLoads,0);assert.equal(stats.highTextureError,null);assert.equal(f.scene.textures.includes(texture),false);
});

test('cancel keeps an InternalTexture pending when another live Texture still owns its load',async t=>{
 const f=fixture(t),{stream}=f.manager('shared'),pending=stream.start('shared'),other=new Texture('https://cancel.test/assets/shared.ktx2',f.scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:true,gammaSpace:true});
 assert.equal(f.callbacks.length,1);assert.equal(f.callbacks[0].internal._references,2);assert.equal(f.scene.getWaitingItemsCount(),1);stream.dispose();await bounded(pending);assert.equal(f.scene.getWaitingItemsCount(),1,'another owner still needs the real completion token');assert.equal(other.getInternalTexture(),f.callbacks[0].internal);
 f.callbacks[0].onLoad();await Promise.resolve();await Promise.resolve();assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(other.isReady(),true);other.dispose();
});

test('a synchronous Texture request exception rejects once and releases its owned wrapper and waiter',async t=>{
 const f=fixture(t),{stream,stats}=f.manager('throws'),before=f.scene.textures.length,create=f.engine.createTexture;f.engine.createTexture=(...args)=>{if(String(args[0]).endsWith('throws.ktx2'))throw Error('injected synchronous loader error');return create(...args);};
 const warn=t.mock.method(console,'warn',()=>{});await bounded(stream.start('throws'));assert.match(stats.highTextureError,/injected synchronous loader error/);assert.equal(stream.textureWaiters.size,0);assert.equal(stats.highTextureReserved,0);assert.equal(f.scene.textures.length,before);assert.equal(f.scene.getWaitingItemsCount(),0);assert.equal(f.material.albedoTexture,f.placeholder);assert.equal(warn.mock.calls.length,1);stream.dispose();
});

test('late old-map load/error callbacks cannot change the new map material or resource ownership',async t=>{
 const f=fixture(t),old=f.manager('old'),pending=old.stream.start('old');old.stream.dispose();await bounded(pending);
 const fresh=f.manager('new'),current=fresh.stream.start('new');assert.equal(f.callbacks.length,2);f.callbacks[1].onLoad?.();await bounded(current);const texture=f.material.albedoTexture;assert.notEqual(texture,f.placeholder);assert.equal(fresh.stats.highTextureLoads,1);
 f.callbacks[0].onLoad?.();f.callbacks[0].onError?.('late old decoder error');await Promise.resolve();await Promise.resolve();assert.equal(f.material.albedoTexture,texture);assert.equal(fresh.stream.resident.size,1);assert.equal(fresh.stats.highTextureError,null);assert.equal(old.stats.highTextureLoads,0);fresh.stream.dispose();assert.equal(f.material.albedoTexture,f.placeholder);
});

test('actual environment release drains a stuck high-texture waiter and the destination scene is ready without its callback',async t=>{
 const oldLocation=globalThis.location;globalThis.location={href:'https://cancel.test/game/?character=warrior-v4'};t.after(()=>globalThis.location=oldLocation);
 const engine=new NullEngine({textureSize:4096}),world=createWorld(engine,{forest:true,touchDevice:true}),scene=world.scene;engine.getCaps().astc={};engine.getCaps().maxTextureSize=8192;caveFogFallback(scene).getInternalTexture().isReady=true;t.after(()=>engine.dispose());
 const lod=level=>({level,model:'https://cancel.test/assets/tree-'+level+'.gltf',resources:[],triangles:12,textureSize:0}),profile={shading:'toon-color',textures:{albedo:{url:'https://cancel.test/assets/stuck.ktx2',width:4096,height:4096,codec:'etc1s'}},resources:[]},config={category:'tree',bounds:[2,3,2],height:3,geometryLod:true,lods:[lod(0),lod(1),lod(2)],mobileNear:lod(0),highTextures:profile};
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({complete:true,assets:{tree:config}})}));world.placements=[{id:'test',asset:'tree',x:0,z:0,yaw:0,scale:1,kind:'tree'}];world.camera.setTarget(new Vector3(0,world.terrain.heightAt(0,0)+1.5,0));world.camera.radius=3;
 const create=engine.createTexture.bind(engine);let pending;
 engine.createTexture=(...args)=>{if(!String(args[0]).endsWith('stuck.ktx2'))return create(...args);args[5]=args[6]=null;const internal=create(...args);internal.isReady=false;scene.addPendingData(internal);pending=internal;return internal;};
 await loadStreamedVillage(world,{initialize:async()=>{},ground:async()=>{},loadContainer:async()=>{const container=new AssetContainer(scene),mesh=MeshBuilder.CreateBox('tree',{height:3},scene),material=new PBRMaterial('tree-paint',scene),placeholder=RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);placeholder.getInternalTexture().isReady=true;material.transparencyMode=0;material.albedoTexture=placeholder;mesh.material=material;container.meshes.push(mesh);container.materials.push(material);container.textures.push(placeholder);container.removeAllFromScene();return container;}});
 // Admission/dwell is covered by the pacing suite. Enter this test at its
 // positive boundary: a4K upload is already admitted when travel begins.
 world.villageStreaming.active=true;world.villageStreaming.demand.get=()=>[];t.mock.method(VillageTextureStreaming.prototype,'update',function(){this.wanted.set('tree',1);return this.start('tree');});scene.onAfterRenderObservable.notifyObservers(scene);await Promise.resolve();
 assert.ok(pending,'real stream admitted the4K promotion before travel');assert.equal(scene.getWaitingItemsCount(),1);assert.equal(world.environment.highTexturePending,1);
 await bounded(world.releaseEnvironment());assert.equal(world.villagePrepared,null);assert.equal(world.environment.highTexturePending,0);assert.equal(scene.getWaitingItemsCount(),0);assert.equal(pending._references,0,'last texture owner was disposed (NullEngine hardware-release is deliberately a no-op)');assert.equal(scene.textures.some(t=>t.getInternalTexture()===pending),false);
 replaceWorldMap(world,'warrior-v4');for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;let now=0;await waitForSceneReady(scene,{timeoutMs:100,now:()=>++now,wait:async()=>{}});assert.equal(scene.getWaitingItemsCount(),0);assert.equal(scene.isReady(),true);
});
