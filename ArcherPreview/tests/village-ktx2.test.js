import test from 'node:test';
import assert from 'node:assert/strict';
import {basisModel} from '../scripts/pack-village-ktx2.mjs';
import {highTextureBytes,selectHighTextures,VILLAGE_TEXTURE_BUDGET} from '../src/village-texture-budget.js';
import {outlineBaseReady,VillageOutlines} from '../src/village-outlines.js';
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

test('outline cannot outlive its base render and follows the exact instance LOD',t=>{
  assert.equal(outlineBaseReady(40,41),false);assert.equal(outlineBaseReady(41,41),true);
  const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
  const camera=new FreeCamera('camera',new Vector3(0,0,-20),scene),base=MeshBuilder.CreateBox('base',{},scene),low=MeshBuilder.CreateBox('low',{},scene);
  base.addLODLevel(10,low);const root=new TransformNode('root',scene),instance=base.createInstance('placed');instance.parent=root;instance.computeWorldMatrix(true);
  const ink=new VillageOutlines({scene,camera,touchDevice:true},[{root,meshes:[instance],placement:{kind:'building'}}],{});
  assert.equal(ink.entries[0].shell.getLOD(camera).geometry,instance.getLOD(camera).geometry);
  camera.position.z=-3;assert.equal(ink.entries[0].shell.getLOD(camera).geometry,base.geometry);
  ink.dispose();
});
