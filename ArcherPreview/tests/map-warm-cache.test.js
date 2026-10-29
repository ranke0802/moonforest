import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,ArcRotateCamera,Vector3,Observable} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {DefaultKTX2DecoderOptions} from '@babylonjs/core/Misc/khronosTextureContainer2.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_meshopt_compression.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import {DecodeCache,mapDecodePools,decodeCachedKtx,cacheableKtx,installKtxDecodeCache} from '../src/map-decode-cache.js';
import {readMapContainer} from '../src/map-container.js';
import {prepareMapMaterials,retainMapEffect,mapShaderCacheSize} from '../src/map-shader-cache.js';

test('LRU byte and entry caps survive repeated map revisits and oversized results are not retained',()=>{
 const cache=new DecodeCache(100,3);for(let i=0;i<200;i++){cache.put('map'+i,new Uint8Array(30),30);assert.ok(cache.bytes<=100);assert.ok(cache.entries.size<=3);}
 assert.equal(cache.bytes,90);assert.ok(cache.get('map197'));cache.put('last',1,30);assert.equal(cache.get('map198'),null);assert.ok(cache.get('map197'));
 cache.put('too-large',1,101);assert.equal(cache.get('too-large'),null);cache.clear();assert.equal(cache.bytes,0);assert.equal(cache.entries.size,0);
});

const ktx=(size=1024)=>{const data=new Uint8Array(64),v=new DataView(data.buffer);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint32(36,1,true);return data;};
const engine=()=>({getCaps:()=>({etc2:true}),onDisposeObservable:new Observable()});
test('cached KTX reuses exact compressed mipmaps and metadata, isolates format/options/content and skips 4K/8K',async()=>{
 const e=engine(),container={_engine:e};let calls=0;
 const decoded={transcodedFormat:0x9278,isInGammaSpace:true,hasAlpha:true,transcoderName:'ETC2',mipmaps:[{width:1024,height:1024,data:new Uint8Array([1,2,3,4])},{width:512,height:512,data:new Uint8Array([5,6])}]};
 const decode=async()=>{calls++;return structuredClone(decoded);};
 const data=ktx(),first=await decodeCachedKtx(container,data,{forceRGBA:false},decode,{});first.mipmaps[0].data[0]=99;
 const second=await decodeCachedKtx(container,data,{forceRGBA:false},decode,{});assert.deepEqual(second,decoded);assert.equal(calls,1);
 second.mipmaps[1].data[0]=77;assert.deepEqual(await decodeCachedKtx(container,data,{forceRGBA:false},decode,{}),decoded);
 await decodeCachedKtx(container,data,{forceRGBA:true},decode,{});assert.equal(calls,2);
 data[63]=1;await decodeCachedKtx(container,data,{forceRGBA:false},decode,{});assert.equal(calls,3);
 e.getCaps=()=>({astc:true});await decodeCachedKtx(container,data,{forceRGBA:false},decode,{});assert.equal(calls,4);
 for(const size of [4096,8192]){assert.equal(cacheableKtx(ktx(size)),false);await decodeCachedKtx(container,ktx(size),{},decode,{});await decodeCachedKtx(container,ktx(size),{},decode,{});}assert.equal(calls,8);
 const pool=mapDecodePools(e);assert.equal(pool.textures.hits,2);assert.ok(pool.textures.bytes>0);e.onDisposeObservable.notifyObservers(e);assert.equal(pool.textures.bytes,0);assert.equal(pool.disposed,true);
});
test('failed or RGBA texture decodes do not poison the warm cache, and decoder wrapping is idempotent',async()=>{
 const e=engine();let calls=0;class Ktx{static DefaultDecoderOptions={_getKTX2DecoderOptions:()=>({})};constructor(){this._engine=e;}async _decodeAsync(){calls++;if(calls===1)throw new Error('bad input');return {transcodedFormat:0x8058,mipmaps:[{width:1,height:1,data:new Uint8Array(4)}]};}}
 installKtxDecodeCache(Ktx);const method=Ktx.prototype._decodeAsync;installKtxDecodeCache(Ktx);assert.equal(method,Ktx.prototype._decodeAsync);
 const c=new Ktx();await assert.rejects(c._decodeAsync(ktx()),/bad input/);await c._decodeAsync(ktx());await c._decodeAsync(ktx());assert.equal(calls,3);assert.equal(mapDecodePools(e).textures.bytes,0);
});
test('cache keys observe defaults without consuming the decoder dirty flag in workerless fallback',async()=>{
 const e=engine(),seen=[];
 class Ktx{static DefaultDecoderOptions=new DefaultKTX2DecoderOptions();constructor(){this._engine=e;}async _decodeAsync(){seen.push(Ktx.DefaultDecoderOptions.isDirty);Ktx.DefaultDecoderOptions._getKTX2DecoderOptions();return {transcodedFormat:0x9278,mipmaps:[{width:1,height:1,data:new Uint8Array(8)}]};}}
 installKtxDecodeCache(Ktx);const c=new Ktx();await c._decodeAsync(ktx());assert.deepEqual(seen,[true]);
 Ktx.DefaultDecoderOptions.forceRGBA=true;await c._decodeAsync(ktx());assert.deepEqual(seen,[true,true]);
});

test('real shipped meshopt model revisits bypass decoding with identical indices, positions, normals and UVs',async t=>{
 const root=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('village.json',root)));
 const file=Object.values(manifest.assets)[0].model??Object.values(manifest.assets)[0].lods?.[0]?.model;
 assert.ok(file);const model=new URL(file,root),json=JSON.parse(readFileSync(model)),name=model.pathname.split('/').at(-1);
 assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));for(const buffer of json.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+readFileSync(new URL(buffer.uri,model)).toString('base64');
 await MeshoptDecoder.ready;const old=MeshoptCompression._Default;let decodes=0;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{decodes++;const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
 const e=new NullEngine(),scene=new Scene(e);t.after(()=>{e.dispose();MeshoptCompression._Default=old;});
 const snapshot=c=>c.meshes.filter(m=>m.getTotalVertices()).map(m=>({indices:Array.from(m.getIndices()),...Object.fromEntries(['position','normal','uv'].map(k=>[k,Array.from(m.getVerticesData(k)??[])]))}));
 const first=await readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName:name}),expected=snapshot(first),cold=decodes;assert.ok(cold>0);first.dispose();
 for(let i=0;i<5;i++){const c=await readMapContainer(scene,structuredClone(json),'',{skipMaterials:true,fileName:name});assert.deepEqual(snapshot(c),expected);c.dispose();}
 assert.equal(decodes,cold);assert.ok(mapDecodePools(e).geometry.hits>=cold*5);assert.ok(mapDecodePools(e).geometry.bytes<=8*1048576);
 t.diagnostic(JSON.stringify({coldDecodes:cold,revisitDecodes:decodes-cold,cache:mapDecodePools(e).geometry.inspect()}));
});

test('actual instanced shader stays reusable after map disposal and cached program count is bounded',async t=>{
 const e=new NullEngine(),scene=new Scene(e);t.after(()=>e.dispose());new ArcRotateCamera('view',0,1,10,Vector3.Zero(),scene);e.getCaps().instancedArrays=true;
 const make=()=>{const mesh=MeshBuilder.CreateBox('map',{},scene);mesh.material=new PBRMaterial('paint',scene);return mesh;};
 const first=make();await prepareMapMaterials([first]);const effect=first.subMeshes[0].effect;assert.ok(effect.isReady());assert.match(effect.defines,/#define INSTANCES/);assert.equal(mapShaderCacheSize(e),1);
 first.dispose(false,true);await new Promise(r=>setImmediate(r));e.onEndFrameObservable.notifyObservers(e);
 const next=make();await prepareMapMaterials([next]);assert.equal(next.subMeshes[0].effect,effect);assert.equal(mapShaderCacheSize(e),1);assert.equal(next.getTotalVertices(),24);next.dispose(false,true);
 const fakeEngine={onDisposeObservable:new Observable()};let disposed=0;
 for(let i=0;i<100;i++)retainMapEffect({_refCount:1,isReady:()=>true,getEngine:()=>fakeEngine,dispose(){this._refCount--;disposed++;}});
 assert.equal(mapShaderCacheSize(fakeEngine),12);assert.equal(disposed,88);fakeEngine.onDisposeObservable.notifyObservers(fakeEngine);assert.equal(disposed,100);
});
