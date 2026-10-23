import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine,Scene,AssetContainer,MeshBuilder,FreeCamera,Vector3,StandardMaterial } from '@babylonjs/core';
import { attachTreeLod } from '../src/tree-lod.js';
test('instances select distant geometry independently and share the existing material',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',Vector3.Zero(),scene);
 const source=new AssetContainer(scene),variant=new AssetContainer(scene);
 const full=MeshBuilder.CreateSphere('tree',{segments:16},scene),low=MeshBuilder.CreateSphere('tree',{segments:4},scene);
 full.material=new StandardMaterial('painted',scene);full.receiveShadows=true;source.meshes=[full];variant.meshes=[low];
 source.removeAllFromScene();variant.removeAllFromScene();attachTreeLod(scene,source,variant,9);
 const near=full.createInstance('near'),far=full.createInstance('far');near.position.z=4;far.position.z=20;
 near.computeWorldMatrix(true);far.computeWorldMatrix(true);camera.computeWorldMatrix();
 assert.equal(near.getLOD(camera),full);assert.equal(far.getLOD(camera),low);
 assert.equal(low.material,full.material);assert.equal(low.receiveShadows,true);assert.equal(low.isBlocked,true);
 assert.ok(low.getTotalIndices()<full.getTotalIndices());scene.dispose();engine.dispose();
});
