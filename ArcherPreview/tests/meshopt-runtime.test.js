import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Worker as NodeWorker} from 'node:worker_threads';
import {NullEngine,Scene,VertexBuffer} from '@babylonjs/core';
import {Tools} from '@babylonjs/core/Misc/tools.pure.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';
import {hash} from '../scripts/resource-pack.js';

const base=new URL('../public/assets/',import.meta.url);
const read=p=>readFileSync(new URL(p,base));
const json=p=>JSON.parse(read(p));

// Execute the exact shipped decoder and its worker source with Node workers.
// This exercises Babylon's real glTF loader without opening/driving a browser.
test('shipped Meshopt worker and Babylon load actual village LODs and the 8K V6 warrior',async t=>{
  const config=json('meshopt-decoder.json'),source=read(config.url);
  assert.equal(hash(source),config.url.split('/').at(-1).split('.')[0]);
  const workers=[],workerSources=new Map();let workerCount=0,loads=0;
  const prefix="const {parentPort}=require('node:worker_threads');var self=globalThis;self.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);self.close=()=>parentPort.close();parentPort.on('message',data=>self.onmessage({data}));";
  class Worker {
    constructor(url){
      this.worker=new NodeWorker(prefix+workerSources.get(url),{eval:true});workers.push(this.worker);workerCount++;
      this.worker.on('message',data=>this.onmessage?.({data}));
    }
    postMessage(data,transfer){this.worker.postMessage(data,transfer);}
  }
  const context=vm.createContext({module:{exports:{}},exports:{},Worker,
    Blob:class {constructor(parts){this.text=parts.join('');}},
    URL:{createObjectURL(blob){const key='blob:test-'+workerSources.size;workerSources.set(key,blob.text);return key;},revokeObjectURL(key){workerSources.delete(key);}}});
  vm.runInContext(source.toString('utf8'),context);
  const decoder=context.module.exports;await decoder.ready;
  const oldLoad=Tools.LoadBabylonScriptAsync,oldDecoder=globalThis.MeshoptDecoder,oldConfig=MeshoptCompression.Configuration;
  const decoderUrl=new URL(config.url,base).href;
  globalThis.MeshoptDecoder=decoder;
  MeshoptCompression.Configuration={decoder:{url:decoderUrl}};
  Tools.LoadBabylonScriptAsync=async url=>{assert.equal(url,decoderUrl);loads++;};
  t.after(async()=>{
    // Babylon releases its worker after one idle second; wait before restoring globals.
    await new Promise(r=>setTimeout(r,1100));
    for(const worker of workers)await worker.terminate();
    MeshoptCompression._Default?.dispose();MeshoptCompression._Default=null;
    Tools.LoadBabylonScriptAsync=oldLoad;globalThis.MeshoptDecoder=oldDecoder;MeshoptCompression.Configuration=oldConfig;
  });
  const village=json('village.json'),warrior=json('warrior-v3.json');
  const paths=[...village.assets['house-01-cottage'].lods.map(l=>l.model),village.assets['tree-01-round-oak'].mobileNear.model,warrior.model];
  for(const path of paths){
    const packed=json(path),decoded=await readRuntimeGltf(new URL(path,base));
    for(const buffer of packed.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+read('./content/'+buffer.uri).toString('base64');
    const engine=new NullEngine(),scene=new Scene(engine),loader=new GLTFFileLoader();loader.skipMaterials=true;
    try {
      const container=await loader.loadAssetContainerAsync(scene,{json:packed},'');
      const actual=container.meshes.filter(m=>m.getTotalVertices()>0);
      assert.equal(actual.length,packed.meshes.reduce((n,m)=>n+m.primitives.length,0));
      for(const mesh of actual){
        const match=mesh.name.match(/^(.*)_primitive(\d+)$/),nodeName=match?match[1]:mesh.name;
        const sourceNode=packed.nodes.find(n=>n.name===nodeName&&n.mesh!==undefined);
        const sourceMesh=sourceNode?packed.meshes[sourceNode.mesh]:packed.meshes.find(m=>m.name===mesh.name);
        assert.ok(sourceMesh,'mesh '+mesh.name);
        const primitive=sourceMesh.primitives[match?Number(match[2]):0];assert.ok(primitive);
        for(const [semantic,kind]of [['POSITION',VertexBuffer.PositionKind],['NORMAL',VertexBuffer.NormalKind],['TEXCOORD_0',VertexBuffer.UVKind],['JOINTS_0',VertexBuffer.MatricesIndicesKind],['WEIGHTS_0',VertexBuffer.MatricesWeightsKind],['JOINTS_1',VertexBuffer.MatricesIndicesExtraKind],['WEIGHTS_1',VertexBuffer.MatricesWeightsExtraKind]]){
          if(primitive.attributes[semantic]===undefined)continue;
          assert.deepEqual(Array.from(mesh.getVerticesData(kind)),Array.from(readAccessor(decoded.gltf,decoded.files,primitive.attributes[semantic])),path+' '+semantic);
        }
        assert.deepEqual(Array.from(mesh.getIndices()),Array.from(readAccessor(decoded.gltf,decoded.files,primitive.indices)));
      }
      if(path===warrior.model)assert.equal(container.animationGroups.length,9);
      container.dispose();
    }finally{loader.dispose();scene.dispose();engine.dispose();}
  }
  assert.equal(loads,1,'decoder is loaded once');assert.equal(workerCount,1,'one shared decode worker');
});
