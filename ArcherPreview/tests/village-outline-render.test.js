import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera,MeshBuilder,NullEngine,PBRMaterial,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {VillageOutlines} from '../src/village-outlines.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

test('real Babylon render couples ink to a successful base/LOD batch through turns and cold shaders',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  caveFogFallback(scene).getInternalTexture().isReady=true;
  t.after(()=>{scene.dispose();engine.dispose();});
  engine.getCaps().instancedArrays=true;
  const camera=new FreeCamera('camera',new Vector3(0,2,-6),scene);
  const near=MeshBuilder.CreateBox('near',{size:4},scene),far=MeshBuilder.CreateBox('far',{size:3.9},scene);
  const lighting={direction:Vector3.Up(),shadowsActive:false};
  for(const source of [near,far]){source.material=new PBRMaterial(source.name,scene);applyVillageToon([source],lighting);prepareTreeOcclusion([source]);source.isVisible=false;}
  near.addLODLevel(12,far);
  const root=new TransformNode('root',scene),instances=[near.createInstance('one'),near.createInstance('two')];
  instances.forEach((m,i)=>{m.parent=root;m.position.x=i*3;m.instancedBuffers.treeCoverage=1;m.computeWorldMatrix(true);});
  const count=scene.meshes.length,stats={},ink=new VillageOutlines({scene,camera,touchDevice:true},instances.map(mesh=>({root,meshes:[mesh],placement:{kind:'tree'}})),stats);
  t.after(()=>ink.dispose());
  assert.equal(scene.meshes.length,count,'no independently culled hull objects');
  for(const source of [near,far])await source.material.forceCompilationAsync(source,{useInstances:true});
  await ink.prepare();
  const calls=[],inkSources=new Set();let coldFrames=0;
  for(const source of [near,far]){
    const process=source._processRendering;
    source._processRendering=function(mesh,subMesh,effect,fill,batch,...rest){
      calls.push({pass:ink.drawing?'ink':'base',source:this,instances:[...(batch.visibleInstances[subMesh._id]??[])]});
      return process.call(this,mesh,subMesh,effect,fill,batch,...rest);
    };
  }
  const ready=far.material.isReadyForSubMesh.bind(far.material);
  let cold=false;far.material.isReadyForSubMesh=(...args)=>!cold&&ready(...args);
  for(let frame=0;frame<24;frame++){
    const angle=frame*.19,distance=frame%2?18:6;
    camera.position.set(Math.sin(angle)*distance,2,Math.cos(angle)*distance);camera.setTarget(Vector3.Zero());
    cold=frame%4===1;calls.length=0;ink.next=0;
    scene.render();
    if(cold){coldFrames++;assert.ok(!calls.some(c=>c.source===far));}
    for(let i=0;i<calls.length;i++)if(calls[i].pass==='ink'){
      inkSources.add(calls[i].source);
      const base=calls[i-1];assert.equal(base?.pass,'base');assert.equal(base.source,calls[i].source);
      assert.ok(calls[i].instances.every(m=>base.instances.includes(m)),'ink is a subset of the actual base batch');
      assert.ok(calls[i].instances.length<=32);
      if(cold)assert.notEqual(calls[i].source,far,'cold base cannot leave a hull');
    }
    assert.equal(engine.getDepthWrite(),true,'ink restores depth writes');
  }
  assert.equal(coldFrames,6);assert.deepEqual(inkSources,new Set([near,far]),'exercise both original and reduced LOD draws');
  assert.ok(stats.outlineDraws>0,'exercise real ink draw submission');
  const steps=scene._afterRenderingMeshStage.length;ink.dispose();
  assert.equal(scene._afterRenderingMeshStage.length,steps-1);
  assert.equal(near.material.metadata.villageToon,true,'base material remains attached');
});
