import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, FreeCamera, MeshBuilder, PBRMaterial, TransformNode, Vector3, Ray } from '@babylonjs/core';
import { blocksView, prepareTreeOcclusion, TreeOcclusion } from '../src/tree-occlusion.js';
import { attachTreeLod } from '../src/tree-lod.js';
import { TreeViewSurface } from '../src/tree-view-surface.js';

test('only trees between the camera and player obstruct the view', () => {
  const camera={x:0,y:2,z:-10},target={x:0,y:1,z:0};
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:-6},{x:1,y:5,z:-4}),true);
  assert.equal(blocksView(camera,target,{x:3,y:0,z:-6},{x:5,y:5,z:-4}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:2},{x:1,y:5,z:4}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:0,z:-14},{x:1,y:5,z:-12}),false);
  assert.equal(blocksView(camera,target,{x:-1,y:4,z:-6},{x:1,y:6,z:-4}),false);
  assert.equal(blocksView(camera,camera,{x:2,y:0,z:2},{x:3,y:4,z:3}),false);
});

test('empty canopy bounds, standing nearby and a camera inside empty bounds never fade a tree',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try {
  const root=new TransformNode('wide-crown',scene);root.position.z=-5;
  const trunk=MeshBuilder.CreateBox('offset-trunk',{width:.4,height:3,depth:.4},scene);trunk.parent=root;trunk.position.set(1.5,1.5,0);
  const crown=MeshBuilder.CreateBox('high-crown',{width:5,height:1,depth:3},scene);crown.parent=root;crown.position.y=4;
  for(const m of [trunk,crown]){prepareTreeOcclusion([m]);m.computeWorldMatrix(true);}
  const occlusion=new TreeOcclusion([root]),tree=occlusion.trees[0],camera=new Vector3(0,2,-10),player=Vector3.Zero();
  assert.equal(blocksView(camera,new Vector3(0,1.5,0),tree.min,tree.max),true,'old broad box falsely reports blocked');
  for(let i=0;i<6;i++)occlusion.update(camera,player,.1);
  assert.equal(tree.coverage,1,'visible player below canopy and beside trunk');
  for(let i=0;i<6;i++)occlusion.update(new Vector3(0,2,-5),player,.1);
  assert.equal(tree.coverage,1,'being inside an empty bounding box is insufficient');
  for(let i=0;i<6;i++)occlusion.update(new Vector3(3,2,-10),player,.1);
  assert.equal(tree.coverage,.45,'actual trunk crosses camera-to-player segment');
  for(let i=0;i<6;i++)occlusion.update(camera,player,.1);
  assert.equal(tree.coverage,1,'moving clear restores opacity');
 }finally{scene.dispose();engine.dispose();}
});

test('surface queries respect rotated/scaled tree instances and visible LOD/cull distances',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try {
  const full=MeshBuilder.CreateBox('tree',{width:1,height:3,depth:1},scene),low=MeshBuilder.CreateBox('tree',{size:.2},scene);
  // Move the low-detail geometry off the view ray without changing its transform.
  const positions=low.getVerticesData('position');for(let i=0;i<positions.length;i+=3)positions[i]+=4;low.setVerticesData('position',positions);
  full.addLODLevel(10,low);full.addLODLevel(30,null);
  prepareTreeOcclusion([full,low]);
  const root=new TransformNode('instance-root',scene);root.rotation.y=.5;root.scaling.set(1.3,1,1.3);root.position.y=1.5;
  const instance=full.createInstance('instance');instance.parent=root;instance.computeWorldMatrix(true);
  const occlusion=new TreeOcclusion([root]),tree=occlusion.trees[0],target=new Vector3(0,1.5,4);
  assert.equal(occlusion.obstructs(tree,new Vector3(0,1.5,-5),target),true);
  assert.equal(occlusion.obstructs(tree,new Vector3(0,1.5,-15),target),false,'LOD actually rendered has an empty line of sight');
  assert.equal(occlusion.obstructs(tree,new Vector3(0,1.5,-35),target),false,'culled geometry cannot obscure the player');
  assert.equal(occlusion.obstructs(tree,new Vector3(0,1.5,-5),new Vector3(0,1.5,-3)),false,'tree behind target is ignored');
 }finally{scene.dispose();engine.dispose();}
});

test('screen-coverage LOD occlusion follows the rendered surface',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const camera=new FreeCamera('camera',new Vector3(0,1.5,-5),scene);scene.activeCamera=camera;camera.minZ=.1;camera.getProjectionMatrix(true);
  const full=MeshBuilder.CreateBox('full',{width:1,height:3,depth:1},scene),low=MeshBuilder.CreateBox('low',{size:.2},scene);
  const positions=low.getVerticesData('position');for(let i=0;i<positions.length;i+=3)positions[i]+=4;low.setVerticesData('position',positions);
  full.useLODScreenCoverage=true;full.addLODLevel(.22,low);prepareTreeOcclusion([full,low]);
  const root=new TransformNode('root',scene);root.position.y=1.5;const instance=full.createInstance('instance');instance.parent=root;instance.computeWorldMatrix(true);
  const occlusion=new TreeOcclusion([root]),target=new Vector3(0,1.5,4);
  for(const distance of [2,20]){
   camera.position.z=-distance;camera.getViewMatrix(true);
   const selected=instance.getLOD(camera);
   assert.equal(occlusion.obstructs(occlusion.trees[0],camera.position,target),selected===full);
  }
 }finally{scene.dispose();engine.dispose();}
});

test('accelerated double-sided segment queries agree with mesh picking without scanning all triangles',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try {
  const mesh=MeshBuilder.CreateSphere('dense-canopy',{segments:64,diameter:4},scene);mesh.computeWorldMatrix(true);
  const surface=new TreeViewSurface(mesh),target=new Vector3(0,0,5);
  for(const origin of [new Vector3(0,0,-5),new Vector3(4,0,-5),new Vector3(0,4,-5),new Vector3(0,0,0),new Vector3(1,-1,-5)]){
   const delta=target.subtract(origin),ray=new Ray(origin,delta.normalizeToNew(),delta.length());
   assert.equal(surface.intersects(origin,target),mesh.intersects(ray,true).hit);
   assert.ok(surface.lastTriangleTests<mesh.getTotalIndices()/3/8);
  }
  assert.equal(surface.intersects(new Vector3(0,0,-5),new Vector3(0,0,-3)),false);
 }finally{scene.dispose();engine.dispose();}
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
    assert.equal(blocked.getChildMeshes()[0].instancedBuffers.treeCoverage,.45);
    assert.equal(clear.getChildMeshes()[0].instancedBuffers.treeCoverage,1);
    assert.equal(full.material,low.material);
    assert.equal(low.instancedBuffers.treeCoverage,1);
    assert.equal(full.getLODLevels()[0].mesh,low);
    assert.equal(full.material.pluginManager._plugins.filter(p=>p.name==='MoonforestTreeCoverage').length,1);
    for(let i=0;i<10;i++)occlusion.update(new Vector3(8,2,-10),player,.05);
    assert.equal(blocked.getChildMeshes()[0].instancedBuffers.treeCoverage,1);
  } finally {scene.dispose();engine.dispose();}
});
