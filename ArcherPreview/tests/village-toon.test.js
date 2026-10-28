import test from 'node:test';
import assert from 'node:assert/strict';
import {Constants,FreeCamera,MeshBuilder,NullEngine,Scene,PBRMaterial,StandardMaterial,Texture,TransformNode,Vector3} from '@babylonjs/core';
import {applyVillageToon,VillageGroundShade} from '../src/village-toon.js';
import {VillageOutlines} from '../src/village-outlines.js';
import {selectVillageShadowCasters} from '../src/village-shadow-policy.js';
import {highTextureOptions} from '../src/village-texture-streaming.js';
import {colorOnlyVillageModel} from '../scripts/pack-village-toon.mjs';

test('painted toon keeps glTF color decoding and shadow support while disabling PBR maps and highlights',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
 const mesh=MeshBuilder.CreateBox('house',{},scene),mat=new PBRMaterial('painted',scene);mesh.material=mat;
 const color=new Texture(null,scene);color.gammaSpace=false;mat.albedoTexture=color;mat.bumpTexture=new Texture(null,scene);mat.metallicTexture=new Texture(null,scene);
 const lighting={direction:Vector3.Up(),shadowsActive:true};applyVillageToon([mesh],lighting);applyVillageToon([mesh],lighting);
 assert.equal(mat.albedoTexture,color);assert.equal(color.gammaSpace,false);assert.equal(mat.unlit,false);assert.equal(mat.disableLighting,false);
 assert.equal(mat.bumpTexture,null);assert.equal(mat.metallicTexture,null);assert.equal(mat.specularIntensity,0);assert.equal(mat.environmentIntensity,0);
 assert.equal(mat.stencil.enabled,true);assert.equal(mat.stencil.func,Constants.ALWAYS);assert.equal(mat.stencil.mask,4);assert.equal(mat.stencil.opStencilDepthPass,Constants.REPLACE);
 const plugin=mat.pluginManager.getPlugin('MoonforestVillageToon');assert.ok(plugin);assert.match(plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,/aggShadow/);
});

test('near replacement declares sRGB input instead of copying the hardware-decoded getter',()=>{
 const old={gammaSpace:false,invertY:false};
 assert.equal(highTextureOptions('albedo',old).gammaSpace,true);
 assert.equal(highTextureOptions('albedo',old).useSRGBBuffer,true);
 assert.equal(highTextureOptions('normal',old).gammaSpace,false);
});

test('ground shadows survive saturated standard lighting and follow the quality switch',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
 const lighting={direction:Vector3.Up(),shadowsActive:true},plugin=new VillageGroundShade(new StandardMaterial('ground',scene),lighting);
 const code=plugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_FOG;
 assert.match(code,/aggShadow/);assert.match(code,/color.rgb \*=/);
 let values;const buffer={updateFloat4:(...v)=>{values=v;}};
 plugin.bindForSubMesh(buffer);assert.equal(values.at(-1),1);
 lighting.shadowsActive=false;plugin.bindForSubMesh(buffer);assert.equal(values.at(-1),0);
});

test('background shadow budget prioritizes buildings and trees over nearby clutter and uses object edges',()=>{
 const record=(id,kind,x,size=1)=>({id,root:{isEnabled:()=>true},placement:{kind,x,z:0},min:{x:x-size,z:-size},max:{x:x+size,z:size}});
 const list=Array.from({length:40},(_,i)=>record('prop'+i,'prop',2+i/100));
 const house=record('house','building',29,5),tree=record('tree','tree',22,3);list.push(house,tree);
 const selected=selectVillageShadowCasters(list,{x:0,z:0},true);
 assert.equal(selected.length,28);assert.ok(selected.includes(house));assert.ok(selected.includes(tree));
 house.root.isEnabled=()=>false;assert.ok(!selectVillageShadowCasters(list,{x:0,z:0},true).includes(house));
});

test('outline instances share the original geometry and LOD and follow obstruction fading',t=>{
 const engine=new NullEngine(),scene=new Scene(engine);t.after(()=>{scene.dispose();engine.dispose();});
 const camera=new FreeCamera('camera',new Vector3(0,2,-8),scene),source=MeshBuilder.CreateBox('tree',{},scene),low=MeshBuilder.CreateBox('low',{},scene);
 source.useLODScreenCoverage=true;source.addLODLevel(.04,low);source.registerInstancedBuffer('treeCoverage',1);
 const root=new TransformNode('placed',scene),mesh=source.createInstance('placed-tree');mesh.parent=root;mesh.instancedBuffers.treeCoverage=.25;
 const before=scene.geometries.length,meshCount=scene.meshes.length,stats={},outlines=new VillageOutlines({scene,camera,touchDevice:true},[{root,meshes:[mesh],placement:{kind:'tree'}}],stats);
 assert.equal(scene.geometries.length,before);assert.equal(scene.meshes.length,meshCount);assert.ok(outlines.sources.has(source));
 assert.equal(outlines.material.stencil.func,Constants.NOTEQUAL);assert.equal(outlines.material.stencil.mask,0);assert.equal(outlines.material.stencil.funcRef,4);
 assert.equal(outlines.material.stencil.backFunc,Constants.NOTEQUAL);assert.equal(outlines.material.stencil.backOpStencilDepthPass,Constants.KEEP);
 assert.ok(outlines.sources.has(low));
 const entry=outlines.entries[0];entry.coverage=1;outlines.selected.add(entry);outlines.next=Infinity;outlines.update(0);
 assert.equal(mesh.instancedBuffers.villageInk.x,.25);assert.ok(outlines.selectedMeshes.has(mesh));
 root.setEnabled(false);outlines.update(1);assert.equal(mesh.instancedBuffers.villageInk.x,0);assert.equal(outlines.selectedMeshes.has(mesh),false);
 outlines.dispose();assert.ok(source.geometry);assert.ok(low.geometry);
});

test('color-only glTF package removes auxiliary downloads without changing geometry, UVs or transforms',()=>{
 const g={buffers:[{uri:'geometry.bin'}],bufferViews:[{buffer:0}],accessors:[{bufferView:0}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:0},material:0}]}],images:[{uri:'normal.png'},{uri:'color.jpg'},{uri:'orm.png'}],textures:[{source:0},{source:1},{source:2}],materials:[{normalTexture:{index:0},pbrMetallicRoughness:{baseColorTexture:{index:1},metallicRoughnessTexture:{index:2}}}]};
 const packed=colorOnlyVillageModel(g);
 assert.deepEqual(packed.images,[{uri:'color.jpg'}]);assert.equal(packed.textures.length,1);assert.equal(packed.materials[0].pbrMetallicRoughness.baseColorTexture.index,0);
 assert.equal(packed.materials[0].normalTexture,undefined);assert.equal(packed.materials[0].pbrMetallicRoughness.metallicRoughnessTexture,undefined);
 for(const key of ['buffers','bufferViews','accessors','nodes','meshes'])assert.deepEqual(packed[key],g[key]);
 assert.equal(g.images.length,3,'original package remains untouched');
});
