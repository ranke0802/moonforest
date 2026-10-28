import test from 'node:test';
import assert from 'node:assert/strict';
import {basisModel} from '../scripts/pack-village-ktx2.mjs';
import {highTextureBytes,selectHighTextures,VILLAGE_TEXTURE_BUDGET} from '../src/village-texture-budget.js';
import {outlineBatch,VillageOutlines} from '../src/village-outlines.js';
import {FreeCamera,MeshBuilder,NullEngine,Scene,TransformNode,Vector3} from '@babylonjs/core';

test('Basis glTF uses the required extension and preserves geometry, UVs and texture slots',()=>{
  const g={buffers:[{uri:'mesh.bin'}],accessors:[{count:5000}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],textures:[{source:0,sampler:0}],images:[{uri:'color.jpg'}]};
  const packed=basisModel(g,[{uri:'color.ktx2',mimeType:'image/ktx2'}]);
  assert.deepEqual(packed.textures,[{sampler:0,extensions:{KHR_texture_basisu:{source:0}}}]);
  assert.ok(packed.extensionsRequired.includes('KHR_texture_basisu'));
  for(const key of ['buffers','accessors','meshes'])assert.deepEqual(packed[key],g[key]);
  assert.equal(g.textures[0].source,0);
});

test('compressed reservation includes mip tail blocks and fails safely on unsupported GPUs',()=>{
  const config={shading:'toon-color',textures:{albedo:{width:4096,height:4096,codec:'etc1s'}}};
  const compressed=highTextureBytes(config),rgba=highTextureBytes(config,false);
  assert.ok(compressed>21*1048576&&compressed<22*1048576);
  assert.ok(rgba>85*1048576&&rgba<86*1048576);
  const assets=new Map(Array.from({length:8},(_,i)=>[i,{config:{highTextures:config}}])),candidates=new Map([...assets.keys()].map(id=>[id,1]));
  assert.equal(selectHighTextures(candidates,assets,new Map(),VILLAGE_TEXTURE_BUDGET.mobile,4096).size,5);
  assert.equal(selectHighTextures(candidates,assets,new Map(),VILLAGE_TEXTURE_BUDGET.mobile,4096,false).size,1);
});

test('outline is limited to instances in the actual base draw, with no independent LOD objects',t=>{
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
  const camera=new FreeCamera('camera',new Vector3(0,0,-20),scene),base=MeshBuilder.CreateBox('base',{},scene),low=MeshBuilder.CreateBox('low',{},scene);
  base.addLODLevel(10,low);const root=new TransformNode('root',scene),instance=base.createInstance('placed');instance.parent=root;instance.computeWorldMatrix(true);
  const ink=new VillageOutlines({scene,camera,touchDevice:true},[{root,meshes:[instance],placement:{kind:'building'}}],{});
  assert.ok(ink.sources.has(instance.getLOD(camera)));
  camera.position.z=-3;assert.ok(ink.sources.has(instance.getLOD(camera)));
  instance.instancedBuffers.villageInk.x=1;
  const other=base.createInstance('not-drawn'),batch={parent:{},renderSelf:{0:false},visibleInstances:{0:[instance]},hardwareInstancedRendering:{0:true}};
  other.instancedBuffers.villageInk={x:1};
  assert.deepEqual(outlineBatch(batch,0,new Set([instance,other])).visibleInstances[0],[instance]);
  assert.equal(outlineBatch(batch,0,new Set([other])),null);
  assert.equal(outlineBatch({...batch,visibleInstances:{0:[]}},0,new Set([instance])),null);
  assert.deepEqual(batch.visibleInstances[0],[instance]);
  ink.dispose();
});
