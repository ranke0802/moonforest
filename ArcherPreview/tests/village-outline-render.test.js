import test from 'node:test';
import assert from 'node:assert/strict';
import {Color3,FreeCamera,MeshBuilder,NullEngine,PBRMaterial,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {VillageOutlines} from '../src/village-outlines.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';
import {LOOT_RARITIES} from '../src/loot-rarity.js';

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
  for(const source of [near,far])assert.equal(Object.hasOwn(source.instancedBuffers,'villageInkTint'),false,'ordinary scenery and LOD do not register tint');
  assert.equal(ink.tintedMaterial,null);
  assert.doesNotMatch(ink.material.shaderPath.vertexSource,/villageInkTint|varying vec3 inkTint/);
  assert.match(ink.material.shaderPath.fragmentSource,/uniform vec3 inkColor/);
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

test('all treasure grades share geometry and a single ink material with stable instance tint',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
 const camera=new FreeCamera('camera',new Vector3(0,2,-5),scene);camera.setTarget(new Vector3(0,0,0));
 caveFogFallback(scene).getInternalTexture().isReady=true;
 const source=MeshBuilder.CreateBox('chest',{size:1},scene);source.material=new PBRMaterial('wood',scene);source.isVisible=false;
 applyVillageToon([source],{direction:Vector3.Up(),shadowsActive:false});
 const root=new TransformNode('treasure-root',scene),records=LOOT_RARITIES.map((grade,i)=>{
  const mesh=source.createInstance('chest-'+grade.tier);mesh.parent=root;mesh.position.x=(i-2)*1.2;mesh.computeWorldMatrix(true);
  return {root,meshes:[mesh],placement:{kind:'ground-detail',tier:grade.tier}};
 });
 const geometries=scene.geometries.length,count=scene.meshes.length;
 const ink=new VillageOutlines({scene,camera,touchDevice:true},records,{});t.after(()=>{ink.dispose();scene.dispose();engine.dispose();});
 await ink.prepare();await source.material.forceCompilationAsync(source,{useInstances:true});
 assert.ok(ink.tintedMaterial);assert.match(ink.tintedMaterial.shaderPath.vertexSource,/attribute vec3 villageInkTint/);
 let draws=0;const process=source._processRendering;source._processRendering=function(...args){if(ink.drawing)draws++;return process.apply(this,args);};
 scene.render();assert.equal(draws,1,'five colours must not add five ink passes');
 assert.equal(scene.meshes.length,count);assert.equal(scene.geometries.length,geometries);
 for(let i=0;i<records.length;i++){
  const mesh=records[i].meshes[0];assert.equal(mesh.instancedBuffers.villageInkTint.toHexString().toLowerCase(),LOOT_RARITIES[i].color);
  assert.equal(ink.entries[i].inkWidth,.028);assert.equal(mesh.geometry,source.geometry);
 }
});

test('late tier promotion preserves dark ungraded instances, LOD sources and one shared ink batch',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;
 const camera=new FreeCamera('camera',new Vector3(0,2,-5),scene);camera.setTarget(Vector3.Zero());caveFogFallback(scene).getInternalTexture().isReady=true;
 const source=MeshBuilder.CreateBox('source',{},scene),lod=MeshBuilder.CreateBox('lod',{},scene),root=new TransformNode('root',scene);
 for(const mesh of [source,lod]){mesh.material=new PBRMaterial(mesh.name+'-paint',scene);mesh.isVisible=false;}source.addLODLevel(12,lod);
 const ordinary=source.createInstance('ungraded');ordinary.parent=root;ordinary.position.x=-.5;ordinary.computeWorldMatrix(true);
 const ink=new VillageOutlines({scene,camera,touchDevice:true},[{root,meshes:[ordinary],placement:{kind:'ground-detail'}}],{});t.after(()=>{ink.dispose();scene.dispose();engine.dispose();});
 await ink.prepare();assert.equal(source.instancedBuffers.villageInkTint,undefined);assert.equal(lod.instancedBuffers.villageInkTint,undefined);
 const colored=source.createInstance('graded');colored.parent=root;colored.position.x=.5;colored.computeWorldMatrix(true);
 ink.addRecords([{root,meshes:[colored],placement:{kind:'ground-detail',tier:5}}]);
 assert.ok(source.instancedBuffers.villageInkTint);assert.ok(lod.instancedBuffers.villageInkTint);
 assert.equal(ordinary.instancedBuffers.villageInkTint.toHexString().toLowerCase(),new Color3(.065,.052,.044).toHexString().toLowerCase());
 assert.equal(colored.instancedBuffers.villageInkTint.toHexString().toLowerCase(),LOOT_RARITIES[4].color);
 await ink.prepare();await source.material.forceCompilationAsync(source,{useInstances:true});
 let draws=0,effect;const process=source._processRendering;source._processRendering=function(mesh,sub,shader,...args){if(ink.drawing){draws++;effect=shader;}return process.call(this,mesh,sub,shader,...args);};
 scene.render();assert.equal(draws,1);assert.equal(effect,ink.tintedMaterial.getEffect());
});

test('real SDK buffer processing omits the tint upload for ordinary scenery',t=>{
 const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera('camera',new Vector3(0,2,-5),scene),root=new TransformNode('root',scene);
 const source=MeshBuilder.CreateBox('scenery',{},scene),instances=Array.from({length:100},(_,i)=>source.createInstance('tree-'+i));
 const ink=new VillageOutlines({scene,camera,touchDevice:true},instances.map(mesh=>({root,meshes:[mesh],placement:{kind:'tree'}})),{});
 t.after(()=>{ink.dispose();scene.dispose();engine.dispose();});
 source._processInstancedBuffers(instances,false);
 const updates=[],original=engine.updateDynamicVertexBuffer.bind(engine);engine.updateDynamicVertexBuffer=(buffer,data,...args)=>{updates.push(data.byteLength);return original(buffer,data,...args);};
 source._processInstancedBuffers(instances,false);
 assert.deepEqual(Object.keys(source.instancedBuffers),['villageInk']);
 assert.deepEqual(updates,[1024],'only the existing two-float ink buffer is uploaded');
});
