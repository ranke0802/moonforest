import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,StandardMaterial,RawTexture,Texture,Constants} from '@babylonjs/core';
import {snapshotMapResourceInventory} from '../src/map-resource-inventory.js';

function fixture(){const engine=new NullEngine(),scene=new Scene(engine);return {engine,scene,dispose(){scene.dispose();engine.dispose();}};}

test('resident inventory separates shared geometry, logical instances, LOD alternatives and outline shells',()=>{
 const f=fixture();try{
  const source=MeshBuilder.CreateBox('tree-source',{},f.scene);source.metadata={villageLodLevel:0};
  const a=source.createInstance('tree-a'),b=source.createInstance('tree-b'),clone=source.clone('tree-clone');
  const shell=source.clone('tree-outline');shell.metadata={moonforestOutline:true};
  const low=MeshBuilder.CreatePlane('tree-lod',{size:1},f.scene);source.addLODLevel(30,low);low.setEnabled(false);
  const ground=MeshBuilder.CreatePlane('terrain',{},f.scene);
  // NullEngine has no real buffer capacity. Supply one published capacity to
  // exercise known accounting while the remaining index/storage stays unknown.
  source.geometry.getVertexBuffer('position').getBuffer().capacity=288;
  const world={villageRenderRecords:[{placement:{asset:'oak-tree'},meshes:[a,b,clone]}],villagePrepared:{assets:new Map([['oak-tree',{baseMeshes:[source],levels:[{level:1,model:'content/oak-low.gltf'}],tiers:new Map([[1,{meshes:[low]}]])}]])}};
  const before={meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,observers:f.scene.onBeforeRenderObservable.observers.length};
  f.scene.render=()=>{throw Error('Inventory must not render');};for(const mesh of f.scene.meshes)mesh.computeWorldMatrix=()=>{throw Error('Inventory must not update poses');};
  const data=snapshotMapResourceInventory(f.scene,{world,mapId:'great-plains',renderMetrics:{submittedTriangles:900001}}),t=data.totals;
  assert.equal(t.surfaceMeshEntries,6);assert.equal(t.outlineMeshEntries,1);
  assert.equal(t.surfaceMeshTriangles,52);assert.equal(t.outlineMeshTriangles,12);
  assert.equal(t.placementCount,4);assert.equal(t.instancePlacements,2);assert.equal(t.templateMeshes,1);assert.equal(t.lodAlternativeMeshes,1);assert.equal(t.placementBaseTriangles,38);
  assert.equal(t.uniqueGeometries,3);assert.equal(t.uniqueGeometryTriangles,16);assert.equal(t.submittedTriangles,900001);
  const oak=data.assets.find(row=>row.assetId==='oak-tree');assert.equal(oak.placementBaseTriangles,36);assert.equal(oak.placements,3);assert.equal(oak.uniqueGeometryTriangles,14);
  assert.deepEqual(oak.loadedLods,[1]);assert.deepEqual(oak.modelFiles,['content/oak-low.gltf']);
  assert.ok(t.geometryBufferBytesKnown>0);assert.ok(t.geometryBuffersUnknown>0,'NullEngine index buffers have unknown capacity');
  assert.deepEqual(before,{meshes:f.scene.meshes.length,geometries:f.scene.geometries.length,observers:f.scene.onBeforeRenderObservable.observers.length});
  assert.doesNotThrow(()=>JSON.stringify(data));
 }finally{f.dispose();}
});

test('interleaved/shared data buffers count once globally, not once per mesh or vertex attribute',()=>{
 const f=fixture();try{
  const source=MeshBuilder.CreateBox('box',{},f.scene);source.clone('clone');source.createInstance('instance');
  const expected=new Set(Object.values(source.geometry.getVertexBuffers()).map(v=>v.getBuffer()));expected.add(source.geometry.getIndexBuffer());
  const data=snapshotMapResourceInventory(f.scene);
  assert.equal(data.totals.uniqueGeometries,1);assert.equal(data.totals.geometryBuffers,expected.size);
  assert.equal(data.totals.geometryBufferBytesKnown,[...expected].reduce((sum,b)=>sum+(b.capacity>0?b.capacity:0),0));
 }finally{f.dispose();}
});

test('texture wrappers share one internal allocation and ready mip dimensions are estimates, unknown formats remain unknown',()=>{
 const f=fixture();try{
  const tex=RawTexture.CreateRGBATexture(new Uint8Array(4*4*4),4,4,f.scene,true,false,Texture.NEAREST_SAMPLINGMODE);tex.name='shared-rgba';
  tex.getInternalTexture().isReady=true;
  const alias=new Texture(null,f.scene);alias.name='shared-alias';alias._texture=tex.getInternalTexture();alias._texture.incrementReferences();
  const material=new StandardMaterial('shared',f.scene);material.diffuseTexture=tex;material.emissiveTexture=alias;
  const mesh=MeshBuilder.CreateBox('actor',{},f.scene);mesh.material=material;
  const unknown=RawTexture.CreateRGBATexture(new Uint8Array(16),2,2,f.scene,false,false,Texture.NEAREST_SAMPLINGMODE);unknown.name='unknown-format';unknown.getInternalTexture().format=999999;
  const data=snapshotMapResourceInventory(f.scene),row=data.textures.find(row=>row.name==='shared-rgba');
  assert.equal(data.totals.textureWrappers,3);assert.equal(data.totals.internalTextures,2);assert.equal(row.estimatedBytes,(16+4+1)*4);assert.equal(row.names.length,2);
  assert.equal(data.totals.textureBytesEstimate,84);assert.equal(data.totals.textureBytesUnknown,1);assert.equal(data.textures.find(row=>row.name==='unknown-format').estimatedBytes,null);
  assert.match(data.measurement,/not total GPU/);
 }finally{f.dispose();}
});

test('GPU block compressed mip tails are included and engine-only cached resources stay separately marked',()=>{
 const f=fixture();try{
  const tex=RawTexture.CreateRGBATexture(new Uint8Array(8*8*4),8,8,f.scene,true,false,Texture.NEAREST_SAMPLINGMODE);tex.name='bc7';tex.getInternalTexture().format=Constants.TEXTUREFORMAT_COMPRESSED_RGBA_BPTC_UNORM;tex.getInternalTexture().isReady=true;
  const engineOnly=RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,f.engine,false,false,Texture.NEAREST_SAMPLINGMODE);engineOnly.name='engine-only';
  engineOnly.getInternalTexture().isReady=true;f.scene.removeTexture(engineOnly);
  // NullEngine does not publish raw textures to its cache like WebGL does.
  f.engine.getLoadedTexturesCache().push(engineOnly.getInternalTexture());
  const data=snapshotMapResourceInventory(f.scene),row=data.textures.find(row=>row.name==='bc7');
  assert.equal(row.estimatedBytes,64+16+16+16);assert.match(row.estimateBasis,/block-format/);
  const cached=data.textures.find(row=>!row.sceneReferenced);assert.ok(cached);assert.equal(cached.estimatedBytes,4);
  engineOnly.dispose();
 }finally{f.dispose();}
});

test('full totals survive bounded row truncation and uncategorized resources are explicit',()=>{
 const f=fixture();try{
  for(let i=0;i<4;i++){const mesh=MeshBuilder.CreateBox('unregistered-'+i,{},f.scene);mesh.geometry.id='unique-'+i;}
  const data=snapshotMapResourceInventory(f.scene,{limit:1});assert.equal(data.assets.length,1);assert.equal(data.truncated.assets,3);assert.equal(data.geometries.length,1);assert.equal(data.truncated.geometries,3);
  assert.equal(data.totals.uniqueGeometries,4);assert.equal(data.categories.find(row=>row.name==='other').meshEntries,4);
  assert.equal(data.assets[0].basis,'source-geometry-or-mesh-name');assert.ok(Number.isFinite(data.cpuMs));
 }finally{f.dispose();}
});

test('actual world ground ownership identifies forest-floor while registered clones and unknown packed textures stay explicit',()=>{
 const f=fixture();try{
  const ground=MeshBuilder.CreatePlane('forest-floor',{},f.scene),terrainClone=ground.clone('floor-copy'),prop=ground.clone('registered-prop');
  const world={ground,villageRenderRecords:[{placement:{asset:'floor-platform'},meshes:[prop]}]};
  const packed=RawTexture.CreateRGBATexture(new Uint8Array(16),2,2,f.scene,false);packed.name='packed-4444';packed.getInternalTexture().isReady=true;packed.getInternalTexture().type=Constants.TEXTURETYPE_UNSIGNED_SHORT_4_4_4_4;
  const data=snapshotMapResourceInventory(f.scene,{world});
  assert.equal(data.categories.find(row=>row.name==='terrain').meshEntries,2);
  assert.equal(data.categories.find(row=>row.name==='scenery').meshEntries,1);
  assert.equal(data.totals.uniqueGeometries,1);assert.equal(data.totals.uniqueGeometryTriangles,2);
  assert.equal(data.textures.find(row=>row.name==='packed-4444').estimatedBytes,null);
  assert.equal(data.textures.find(row=>row.name==='packed-4444').estimateBasis,'unknown-format-or-type');
 }finally{f.dispose();}
});
