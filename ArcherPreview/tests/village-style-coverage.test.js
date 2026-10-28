import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera,MeshBuilder,NullEngine,PBRMaterial,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {VillageOutlines} from '../src/village-outlines.js';
import {selectVillageShadowCasters} from '../src/village-shadow-policy.js';
import {selectVillageOutlines,outlineTriangleCount} from '../src/village-outline-policy.js';
import {applyVillageToon} from '../src/village-toon.js';

test('dense trees cannot starve nearby garden, shrub, gate and fence shadows; mobile count stays bounded',()=>{
 const record=(id,kind,x)=>({root:{isEnabled:()=>true},placement:{id,kind},min:{x:x-.4,z:-.4},max:{x:x+.4,z:.4}});
 const trees=Array.from({length:38},(_,i)=>record('tree'+i,'tree',17+i*.22));
 const props=['garden','shrub','wall','fence','prop','rock'].map((kind,i)=>record(kind,kind,1+i));
 const records=[...trees,...props];let previous=new Set();
 for(const x of [0,.08,-.08,.15,-.15]){
  const selected=selectVillageShadowCasters(records,{x,z:0},true,previous);previous=new Set(selected);
  assert.equal(selected.length,28);for(const p of props)assert.ok(previous.has(p),p.placement.kind+' must cast');
  assert.ok(selected.filter(r=>r.placement.kind==='tree').length>=16);
 }
});

test('small gardens and shrubs are outlined during actual instanced draws above the old 32-object cutoff',async t=>{
 const engine=new NullEngine(),scene=new Scene(engine);engine.getCaps().instancedArrays=true;t.after(()=>engine.dispose());
 const camera=new FreeCamera('camera',new Vector3(0,2,-12),scene);camera.setTarget(new Vector3(0,1,0));
 const source=MeshBuilder.CreateBox('prop',{size:.9},scene);source.material=new PBRMaterial('paint',scene);source.isVisible=false;applyVillageToon([source],{direction:Vector3.Up(),shadowsActive:true});
 const records=Array.from({length:48},(_,i)=>{
  const root=new TransformNode('root'+i,scene),mesh=source.createInstance('prop'+i);mesh.parent=root;root.position.set((i%8-3.5)*.9,.5,Math.floor(i/8)*.9);mesh.computeWorldMatrix(true);
  return {root,meshes:[mesh],placement:{kind:i%2?'garden':'shrub'}};
 });
 const stats={},ink=new VillageOutlines({scene,camera,touchDevice:true},records,stats);t.after(()=>ink.dispose());
 await source.material.forceCompilationAsync(source,{useInstances:true});await ink.prepare();
 const actual=new Set(),process=source._processRendering;
 source._processRendering=function(mesh,sub,effect,fill,batch,...rest){if(ink.drawing)for(const m of batch.visibleInstances[sub._id]??[])actual.add(m);return process.call(this,mesh,sub,effect,fill,batch,...rest);};
 for(const x of [-.25,0,.25]){actual.clear();camera.position.x=x;camera.setTarget(new Vector3(0,1,0));ink.next=0;scene.render();assert.equal(actual.size,48);}
 assert.equal(ink.entries.length,48);assert.ok(stats.outlineTriangles<=160000);
});

test('outline cost follows LOD and total triangles stay within the mobile limit',()=>{
 const source={useLODScreenCoverage:true,getTotalIndices:()=>15000,getLODLevels:()=>[{distance:.035,mesh:{getTotalIndices:()=>3000}},{distance:.22,mesh:{getTotalIndices:()=>7500}}]};
 assert.equal(outlineTriangleCount(source,.5),5000);assert.equal(outlineTriangleCount(source,.1),2500);assert.equal(outlineTriangleCount(source,.01),1000);
 const entries=Array.from({length:100},(_,i)=>({mesh:source,coverage:i<40?.3:.04}));
 const selected=selectVillageOutlines(entries,true);assert.ok(selected.triangles<=160000);assert.ok(selected.chosen.size<=96);
 const distant=selectVillageOutlines(entries.map(e=>({...e,coverage:.01})),true);assert.equal(distant.chosen.size,96);
});
