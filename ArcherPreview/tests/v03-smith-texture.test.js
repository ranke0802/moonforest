import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {NullEngine,RawTexture,Scene} from '@babylonjs/core';
import {GLTFLoader} from '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readMapContainer} from '../src/map-container.js';
import {sceneryPrefetchPaths,setTextureReplacementsReady,setTextureTier} from '../src/texture-replacements.js';
import {SMITH_COLOR_JPG,SMITH_COLOR_KTX2,smithTextureTier} from '../src/v03/smith-texture.js';

const assets=new URL('../public/assets/',import.meta.url);
const read=path=>readFileSync(new URL(path,assets));
const json=path=>JSON.parse(read(path));
const smith=json('npc-moonforest-resident2-blacksmith.json').assets['moonforest-resident2-blacksmith'];

test('the village smith requests one colour atlas and prefetch never pulls the unused JPEG',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine),requests=[];
  t.after(()=>{setTextureTier(null);setTextureReplacementsReady(false);scene.dispose();engine.dispose();});
  t.mock.method(GLTFLoader.prototype,'_createTextureAsync',function(_context,sampler,image,assign,_options,srgb){
    requests.push(image.uri);
    assert.equal(srgb,true);assert.equal(sampler.magFilter,9729);assert.equal(sampler.minFilter,9987);
    const texture=RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,scene);
    assign(texture);return Promise.resolve(texture);
  });
  const model=json(smith.model);
  assert.deepEqual(model.images.map(im=>im.uri),[SMITH_COLOR_JPG]);
  for(const buffer of model.buffers)buffer.uri='data:application/octet-stream;base64,'+read('content/'+buffer.uri).toString('base64');
  for(const [caps,ready,expected] of [
    [{maxTextureSize:4096,astc:true},true,SMITH_COLOR_KTX2],
    [{maxTextureSize:8192,bptc:true},true,SMITH_COLOR_KTX2],
    [{maxTextureSize:2048,astc:true},true,SMITH_COLOR_JPG],
    [{maxTextureSize:4096,etc2:true},true,SMITH_COLOR_JPG],
    [{maxTextureSize:4096,astc:true},false,SMITH_COLOR_JPG],
  ]){
    setTextureTier(smithTextureTier(caps));setTextureReplacementsReady(ready);
    assert.equal(sceneryPrefetchPaths(smith.resources).includes('./content/'+SMITH_COLOR_JPG),expected===SMITH_COLOR_JPG);
    requests.length=0;
    const container=await readMapContainer(scene,structuredClone(model),'file:///');
    assert.deepEqual(requests,[expected]);assert.equal(container.animationGroups.length,20);
    container.dispose();
  }
});

test('published 4K smith colour transcodes with the shipped ASTC-only and BC7-only WASM paths',async()=>{
  const urls=json('ktx2-decoder.json').urls;
  const context={console,WebAssembly,Uint8Array,ArrayBuffer,TextDecoder,URL,Promise,Response,
    fetch:async path=>new Response(read(path),{headers:{'Content-Type':'application/wasm'}})};
  context.self=context;
  runInNewContext(read(urls.jsDecoderModule).toString(),context);
  const sdk=context.KTX2DECODER;
  sdk.ZSTDDecoder.WasmModuleURL=urls.wasmZSTDDecoder;
  sdk.LiteTranscoder_UASTC_ASTC.WasmModuleURL=urls.wasmUASTCToASTC;
  sdk.LiteTranscoder_UASTC_BC7.WasmModuleURL=urls.wasmUASTCToBC7;
  const encoded=read('content/'+SMITH_COLOR_KTX2);
  assert.equal(createHash('sha256').update(encoded).digest('hex')+'.ktx2',SMITH_COLOR_KTX2);
  for(const [caps,format] of [[{astc:true},37808],[{bptc:true},36492]]){
    const result=await new sdk.KTX2Decoder().decode(encoded,caps,{});
    assert.equal(result.errors,undefined);assert.equal(result.transcodedFormat,format);
    assert.equal(result.isInGammaSpace,true);assert.equal(result.hasAlpha,false);
    assert.equal(result.width,4096);assert.equal(result.height,4096);assert.equal(result.mipmaps.length,13);
    assert.equal(result.mipmaps.reduce((total,mip)=>total+mip.data.byteLength,0),22369648);
  }
});
