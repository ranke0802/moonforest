import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import {NullEngine,Scene,SceneLoader,FreeCamera,Vector3,PBRMaterial} from '@babylonjs/core';
import {Tools} from '@babylonjs/core/Misc/tools.pure.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import '@babylonjs/loaders/glTF/index.js';
import {loadTrainingGround} from '../src/environment.js';
import {readMapContainer} from '../src/map-container.js';
import {meshoptWorkerMain,inspectMeshoptWorkerPool} from '../src/meshopt-worker-supervisor.js';

const assets=new URL('../public/assets/',import.meta.url),read=name=>readFileSync(new URL(name,assets)),json=name=>JSON.parse(read(name));

test('fresh legacy archer, warrior and warrior v2 routes use the local decoder before loading their shared compressed grass',async t=>{
 const decoder=json('meshopt-decoder.json'),decoderSource=read(decoder.url).toString('utf8'),decoderUrl=new URL(decoder.url,'https://legacy.test/assets/meshopt-decoder.json').href;
 const previous={location:globalThis.location,Worker:globalThis.Worker,default:MeshoptCompression._Default,configuration:MeshoptCompression.Configuration},nodes=[],calls=[],manifests=[];
 const bootstrap=`const {parentPort,workerData}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);globalThis.importScripts=url=>{if(url!==workerData.url)throw Error('External decoder forbidden');(0,eval)(workerData.source);};globalThis.Worker=function(){throw Error('Nested worker forbidden');};(${meshoptWorkerMain})();parentPort.on('message',data=>self.onmessage({data}));`;
 globalThis.location={href:'https://legacy.test/?character=warrior'};
 globalThis.Worker=class {
  constructor(){this.listeners=new Map();this.node=new NodeWorker(bootstrap,{eval:true,workerData:{source:decoderSource,url:decoderUrl}});nodes.push(this.node);this.node.on('message',data=>{for(const fn of this.listeners.get('message')??[])fn({data});});this.node.on('error',error=>{for(const fn of this.listeners.get('error')??[])fn(error);});}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  postMessage(...args){this.node.postMessage(...args);}
  terminate(){return this.node.terminate();}
 };
 MeshoptCompression._Default=null;
 t.mock.method(Tools,'LoadBabylonScriptAsync',async()=>{throw Error('Legacy route attempted an external decoder');});
 t.mock.method(globalThis,'fetch',async value=>{
  const url=new URL(value);assert.equal(url.origin,'https://legacy.test');manifests.push(url.pathname);
  if(url.pathname.endsWith('/meshopt-decoder.json'))return new Response(JSON.stringify(decoder));
  assert.ok(url.pathname.endsWith('/environment.json'));const environment=json('environment.json');delete environment.ground;return new Response(JSON.stringify(environment));
 });
 t.after(async()=>{if(MeshoptCompression._Default!==previous.default)MeshoptCompression._Default?.dispose();for(const node of nodes)await node.terminate();MeshoptCompression._Default=previous.default;MeshoptCompression.Configuration=previous.configuration;if(previous.location===undefined)delete globalThis.location;else globalThis.location=previous.location;if(previous.Worker===undefined)delete globalThis.Worker;else globalThis.Worker=previous.Worker;});
 const actualLoad=async(file,scene)=>{
  const gltf=json('content/'+file);for(const buffer of gltf.buffers??[])if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+read('content/'+buffer.uri).toString('base64');
  const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:file});
  const material=new PBRMaterial('CPU-only legacy fixture',scene);container.materials.push(material);for(const mesh of container.meshes)if(mesh.getTotalVertices()>0)mesh.material=material;
  return container;
 };
 const brokenEngine=new NullEngine(),brokenScene=new Scene(brokenEngine);
 try{await assert.rejects(actualLoad('1011a8ce7e8b27557fdceec555bfa61bbfa0f9794dc13b1ca60068c167b175d6.gltf',brokenScene),/Legacy route attempted an external decoder/);}finally{brokenEngine.dispose();MeshoptCompression._Default?.dispose();MeshoptCompression._Default=null;}
 t.mock.method(SceneLoader,'LoadAssetContainerAsync',async(root,file,scene)=>{
  assert.equal(MeshoptCompression.Configuration.decoder.url,decoderUrl,'decoder setup must finish before even the first parallel import');assert.equal(typeof MeshoptCompression._Default?.decodeGltfBufferAsync,'function');calls.push(file);return actualLoad(file,scene);
 });
 for(const character of ['archer','warrior','warrior-v2']){
  globalThis.location.href='https://legacy.test/?character='+character;
  const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('legacy-camera',new Vector3(0,2,-3),scene);
  const world={scene,terrain:{heightAt:()=>0},lighting:{registerMeshes(){}},shadows:{addShadowCaster(){}}},training={targets:[{},{}],applyModel(asset){assert.ok(asset.meshes.some(mesh=>mesh.getTotalVertices()>0));this.applied=true;}};
  try{
   const start=calls.length,first=loadTrainingGround(world,training),again=loadTrainingGround(world,training),[result,reused]=await Promise.all([first,again]);assert.strictEqual(result,reused);assert.equal(result.ready,true);assert.equal(training.applied,true);assert.equal(result.assets.length,Object.keys(json('environment.json').assets).length);
   const expected=Object.values(json('environment.json').assets).flatMap(asset=>[asset.model,...(asset.lods??[]).map(lod=>lod.model)]);assert.equal(calls.length-start,expected.length,'concurrent entry shares one environment preparation');assert.ok(calls.slice(start).includes('1011a8ce7e8b27557fdceec555bfa61bbfa0f9794dc13b1ca60068c167b175d6.gltf'));
   // Exercise the original player meshes/rig/clips after their shared arena,
   // as main.js does. Only GPU image decoding is excluded in NullEngine.
   const player=json((character==='archer'?'character':character)+'.json'),container=await actualLoad(player.model.split('/').at(-1),scene);assert.ok(container.skeletons.length>0);assert.ok(container.animationGroups.length>0);assert.ok(container.meshes.some(mesh=>mesh.getTotalVertices()>0));container.dispose();
  }finally{engine.dispose();}
 }
 assert.equal(manifests.filter(url=>url.endsWith('/meshopt-decoder.json')).length,1,'all legacy routes share the existing decoder setup');assert.ok(['ready','idle'].includes(inspectMeshoptWorkerPool().status));assert.ok(inspectMeshoptWorkerPool().counts.completed>=4);assert.equal(inspectMeshoptWorkerPool().counts.failed,0);assert.ok(nodes.length<=2,'a single bounded worker is reused, with idle release allowed');
});
