import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {NullEngine,Scene,Observable} from '@babylonjs/core';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_meshopt_compression.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import {cacheMapBufferViews,mapDecodePools,meshoptCacheKey} from '../src/map-decode-cache.js';
import {readMapContainer} from '../src/map-container.js';

const hash='a'.repeat(64),file=hash+'.gltf';
function fixture(){
 const engine={onDisposeObservable:new Observable()},loader={onExtensionLoadedObservable:new Observable()},scene={getEngine:()=>engine};
 const view={extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:2,byteLength:12,count:3,byteStride:4,mode:'ATTRIBUTES'}}};
 const extension={name:'EXT_meshopt_compression',_loader:{gltf:{buffers:[{uri:hash+'.bin',byteLength:64}]}}};
 return {engine,loader,scene,view,extension};
}

test('content key shares only exact immutable buffer slice and meshopt inputs, and preserves local fallback',()=>{
 const {view,extension}=fixture(),key=meshoptCacheKey(extension,view,file,'/bufferViews/0');
 assert.equal(meshoptCacheKey(extension,view,'b'.repeat(64)+'.gltf','/bufferViews/7'),key);
 const input=view.extensions.EXT_meshopt_compression;
 for(const [field,value] of Object.entries({byteOffset:3,byteLength:13,count:4,byteStride:8,mode:'INDICES',filter:'OCTAHEDRAL'})){
  const copy=structuredClone(view);copy.extensions.EXT_meshopt_compression[field]=value;
  assert.notEqual(meshoptCacheKey(extension,copy,file,'/bufferViews/0'),key,field);
 }
 input.filter='NONE';assert.equal(meshoptCacheKey(extension,view,file,'/bufferViews/0'),key);
 extension._loader.gltf.buffers[0].uri='b'.repeat(64)+'.bin';assert.notEqual(meshoptCacheKey(extension,view,file,'/bufferViews/0'),key);
 for(const uri of ['mutable.bin','data:application/octet-stream;base64,AAAA',hash+'.bin?version=1','https://mutable.test/'+hash+'.bin']){
  extension._loader.gltf.buffers[0].uri=uri;
  assert.equal(meshoptCacheKey(extension,view,file,'/bufferViews/0'),file+'/bufferViews/0');
  assert.notEqual(meshoptCacheKey(extension,view,file,'/bufferViews/0'),meshoptCacheKey(extension,view,'b'.repeat(64)+'.gltf','/bufferViews/0'));
 }
 extension._loader.gltf.buffers[0].uri=hash+'.bin';input.byteOffset=-1;
 assert.equal(meshoptCacheKey(extension,view,file,'/bufferViews/0'),file+'/bufferViews/0');
});

test('one loader shares one view promise/cache copy, separate loaders own copies and cancellation is not shared',async()=>{
 const f=fixture();let calls=0,resolve;
 f.extension.loadBufferViewAsync=()=>{calls++;return new Promise(r=>resolve=r);};
 cacheMapBufferViews(f.loader,f.scene,file);f.loader.onExtensionLoadedObservable.notifyObservers(f.extension);
 const first=f.extension.loadBufferViewAsync('/bufferViews/0',f.view),same=f.extension.loadBufferViewAsync('/bufferViews/0',f.view);
 assert.equal(first,same);assert.equal(calls,1);resolve(new Uint8Array(12).fill(4));
 const out=await first;out[0]=99;assert.equal(mapDecodePools(f.engine).geometry.bytes,12);
 const second=fixture();second.extension.loadBufferViewAsync=()=>{throw Error('cache should hit');};
 cacheMapBufferViews(second.loader,f.scene,'b'.repeat(64)+'.gltf');second.loader.onExtensionLoadedObservable.notifyObservers(second.extension);
 const copy=await second.extension.loadBufferViewAsync('/bufferViews/22',second.view);assert.equal(copy[0],4);assert.notEqual(copy,out);
 copy[0]=77;assert.equal([...mapDecodePools(f.engine).geometry.entries.values()][0].value[0],4);
 // A new loader must never await an old loader's still-pending network read.
 const a=fixture(),b=fixture();let rejectOld,newCalls=0;
 a.extension.loadBufferViewAsync=()=>new Promise((resolve,reject)=>rejectOld=reject);
 b.extension.loadBufferViewAsync=async()=>{newCalls++;return new Uint8Array(12).fill(8);};
 for(const v of [a,b]){cacheMapBufferViews(v.loader,a.scene,file);v.loader.onExtensionLoadedObservable.notifyObservers(v.extension);}
 const stale=a.extension.loadBufferViewAsync('/bufferViews/0',a.view);const fresh=await b.extension.loadBufferViewAsync('/bufferViews/0',b.view);
 rejectOld(new Error('old map aborted'));await assert.rejects(stale,/old map aborted/);assert.equal(newCalls,1);assert.equal(fresh[0],8);
 const firstPool=mapDecodePools(f.engine);f.engine.onDisposeObservable.notifyObservers(f.engine);assert.equal(firstPool.geometry.bytes,0);assert.equal(firstPool.disposed,true);assert.equal(mapDecodePools(a.engine).geometry.bytes,12);
 a.engine.onDisposeObservable.notifyObservers(a.engine);
});

test('failed and engine-disposed pending loads cannot publish new cache entries',async()=>{
 const failed=fixture();let calls=0;
 failed.extension.loadBufferViewAsync=async()=>{calls++;throw Error('invalid compressed bytes');};
 cacheMapBufferViews(failed.loader,failed.scene,file);failed.loader.onExtensionLoadedObservable.notifyObservers(failed.extension);
 for(let i=0;i<2;i++)await assert.rejects(failed.extension.loadBufferViewAsync('/bufferViews/0',failed.view),/invalid compressed bytes/);
 assert.equal(calls,2);assert.equal(mapDecodePools(failed.engine).geometry.entries.size,0);
 const late=fixture();let resolve;late.extension.loadBufferViewAsync=()=>new Promise(r=>resolve=r);
 cacheMapBufferViews(late.loader,late.scene,file);late.loader.onExtensionLoadedObservable.notifyObservers(late.extension);
 const pending=late.extension.loadBufferViewAsync('/bufferViews/0',late.view),pool=mapDecodePools(late.engine);
 late.engine.onDisposeObservable.notifyObservers(late.engine);resolve(new Uint8Array(12));await pending;
 assert.equal(pool.disposed,true);assert.equal(pool.geometry.bytes,0);assert.equal(pool.geometry.entries.size,0);
 failed.engine.onDisposeObservable.notifyObservers(failed.engine);
});

test('real shipped texture variants reuse shared-bin decodes with identical native geometry and bounded copies',async t=>{
 const base=new URL('../public/assets/',import.meta.url),models=new Set();
 const collect=value=>{if(typeof value==='string'&&/^(?:\.\/)?content\/[a-f0-9]{64}\.gltf$/.test(value))models.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
 for(const name of readdirSync(base).filter(n=>n.endsWith('.json')))collect(JSON.parse(readFileSync(new URL(name,base))));
 const signatures=new Map();let pair;
 for(const path of [...models].sort()){
  const url=new URL(path,base),doc=JSON.parse(readFileSync(url)),views=doc.bufferViews??[];
  if(!views.length||!views.every(v=>v.extensions?.EXT_meshopt_compression))continue;
  const ext={_loader:{gltf:doc}},signature=JSON.stringify(views.map((v,i)=>meshoptCacheKey(ext,v,url.pathname.split('/').at(-1),'/bufferViews/'+i)));
  if(signatures.has(signature)){pair=[signatures.get(signature),{path,doc,url}];break;}
  signatures.set(signature,{path,doc,url});
 }
 assert.ok(pair,'the shipped graph contains texture variants with identical compressed decode inputs');
 await MeshoptDecoder.ready;const old=MeshoptCompression._Default;let decodes=0;
 MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{decodes++;const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{engine.dispose();MeshoptCompression._Default=old;});
 const snapshot=container=>container.meshes.filter(m=>m.getTotalVertices()).map(m=>({indices:Array.from(m.getIndices()),...Object.fromEntries(['position','normal','uv'].map(k=>[k,Array.from(m.getVerticesData(k)??[])]))}));
 let expected,cold;
 for(let visit=0;visit<6;visit++){
  const {doc,url}=pair[visit%2],json=structuredClone(doc);
  // Exercise the real SDK loader with unchanged external SHA links. Only its
  // local byte read is supplied, so this Node test never needs a browser/fetch.
  for(const buffer of json.buffers)if(buffer.uri)buffer._data=Promise.resolve(new Uint8Array(readFileSync(new URL(buffer.uri,url))));
  const c=await readMapContainer(scene,json,'',{skipMaterials:true,fileName:url.pathname.split('/').at(-1)}),actual=snapshot(c);
  if(!visit){expected=actual;cold=decodes;assert.ok(cold>0);}else assert.deepEqual(actual,expected);
  c.dispose();
 }
 assert.equal(decodes,cold,'different glTF texture tier and same model revisits add zero decodes');
 const cache=mapDecodePools(engine).geometry.inspect();assert.ok(cache.bytes<=8*1048576);assert.equal(cache.entries,cold);
 t.diagnostic(JSON.stringify({models:pair.map(p=>p.path),coldDecodes:cold,subsequentDecodes:decodes-cold,cache}));
});
