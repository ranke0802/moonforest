import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene} from '@babylonjs/core';
import {installMapTextureLifetimeGuard,observeMapTextureUploads,releaseMapTexture} from '../src/map-texture-lifetime.js';
import {SceneDiagnostics} from '../src/scene-diagnostics.js';

test('KTX upload observers are optional, isolated per engine and preserve return, errors and abandonment',()=>{
 class Ktx{constructor(engine){this._engine=engine;}_createTexture(data){if(data.fail)throw Error('native failure');return 42;}}
 installMapTextureLifetimeGuard(Ktx);const engine={},other={},samples=[];
 const stop=observeMapTextureUploads(engine,s=>samples.push(s)),stopOther=observeMapTextureUploads(other,()=>{throw Error('must not matter');});
 const container=new Ktx(engine),data={transcodedFormat:7,mipmaps:[{width:4096,height:2048}]};
 assert.equal(container._createTexture(data,{}),42);assert.equal(samples.length,1);assert.equal(samples[0].width,4096);assert.equal(samples[0].mipCount,1);assert.equal(samples[0].success,true);assert.ok(samples[0].cpuMs>=0);
 assert.throws(()=>container._createTexture({fail:true},{}),/native failure/);assert.equal(samples.at(-1).success,false);
 assert.equal(new Ktx(other)._createTexture(data,{}),42,'observer failures cannot affect loading');
 const internal={_references:1},texture={getInternalTexture:()=>internal,dispose(){}};releaseMapTexture(texture,{removePendingData(){}});assert.throws(()=>container._createTexture(data,internal),{name:'AbortError'});assert.equal(samples.length,2);
 stop();stopOther();assert.equal(container._createTexture(data,{}),42);assert.equal(samples.length,2);
});

test('KTX history is opt-in, bounded, reset and released on scene change and disable',t=>{
 class Ktx{constructor(engine){this._engine=engine;}_createTexture(){return 'ok';}}
 installMapTextureLifetimeGuard(Ktx);const engine=new NullEngine(),one=new Scene(engine),two=new Scene(engine),probe=new SceneDiagnostics({driverFactory:()=>null});t.after(()=>{probe.dispose();one.dispose();two.dispose();engine.dispose();});
 probe.setEnabled(true,one);probe.setActive(true);const ktx=new Ktx(engine),data={mipmaps:[{width:4,height:4}]};ktx._createTexture(data,{});assert.equal(probe.sample().drawCpu.status,'disabled');
 probe.setDrawCpuEnabled(true);for(let i=0;i<10;i++)ktx._createTexture(data,{});assert.equal(probe.sample().drawCpu.ktxUploads.length,8);
 probe.setActive(false);ktx._createTexture(data,{});assert.equal(probe.sample().drawCpu.ktxUploads.length,8);probe.setActive(true);probe.resetGpu();assert.equal(probe.sample().drawCpu.ktxUploads.length,0);
 probe.setEnabled(true,two);assert.equal(probe.sample().drawCpu.ktxUploads.length,0);ktx._createTexture(data,{});assert.equal(probe.sample().drawCpu.ktxUploads.length,1);
 probe.setDrawCpuEnabled(false);ktx._createTexture(data,{});assert.equal(probe.sample().drawCpu.status,'disabled');
});
