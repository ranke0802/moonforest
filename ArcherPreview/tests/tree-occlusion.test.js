import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { blocksView, prepareTreeOcclusion, TreeOcclusion } from '../src/tree-occlusion.js';
import { attachTreeLod } from '../src/tree-lod.js';

test('only trees between the camera and player obstruct the view', () => {
  const camera={x:0,y:2,z:-10},target={x:0,y:1,z:0};
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:-6},{x:1,y:5,z:-4}),true);
  assert.equal(blocksView(camera,target,{x:3,y:0,z:-6},{x:5,y:5,z:-4}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:2},{x:1,y:5,z:4}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:-14},{x:1,y:5,z:-12}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:4,z:-6},{x:1,y:6,z:-4}),false);
  assert.equal(blocksView(camera,camera,{x:2,y:0,z:2},{x:3,y:4,z:3}),false);
});

test('only an obstructing tree fades, restores, and retains the same LOD instance attribute', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const full=MeshBuilder.CreateBox('tree',{size:3},scene),low=MeshBuilder.CreateBox('tree',{size:3},scene);
    full.material=new PBRMaterial('bark',scene);
    prepareTreeOcclusion([full]);
    prepareTreeOcclusion(attachTreeLod(scene,{meshes:[full]},{meshes:[low]},9));
    const makeRoot=(x)=>{
      const root=new TransformNode(`tree-${x}`,scene);root.position.set(x,1.5,-5);
      const instance=full.createInstance(`instance-${x}`);instance.parent=root;
      instance.computeWorldMatrix(true);return root;
    };
    const blocked=makeRoot(0),clear=makeRoot(6),occlusion=new TreeOcclusion([blocked,clear]);
    const camera=new Vector3(0,2,-10),player=Vector3.Zero();
    for(let i=0;i<6;i++)occlusion.update(camera,player,.05);
    assert.equal(blocked.getChildMeshes()[0].instancedBuffers.treeCoverage,.125);
    assert.equal(clear.getChildMeshes()[0].instancedBuffers.treeCoverage,1);
    assert.equal(full.material,low.material);
    assert.equal(low.instancedBuffers.treeCoverage,1);
    assert.equal(full.getLODLevels()[0].mesh,low);
    assert.equal(full.material.pluginManager._plugins.filter(p=>p.name==='MoonforestTreeCoverage').length,1);
    for(let i=0;i<10;i++)occlusion.update(new Vector3(8,2,-10),player,.05);
    assert.equal(blocked.getChildMeshes()[0].instancedBuffers.treeCoverage,1);
  } finally {scene.dispose();engine.dispose();}
});
