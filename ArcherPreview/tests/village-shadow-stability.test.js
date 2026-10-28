import test from 'node:test';
import assert from 'node:assert/strict';
import {ArcRotateCamera,DirectionalLight,HemisphericLight,MeshBuilder,NullEngine,Scene,ShadowGenerator,PBRMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {SceneLighting} from '../src/scene-lighting.js';
import {VillageVisibility} from '../src/village-visibility.js';
import {selectVillageShadowCasters} from '../src/village-shadow-policy.js';
import {prepareVillageInstancing} from '../src/village-instancing.js';
import {applyVillageToon} from '../src/village-toon.js';
import {prepareTreeOcclusion} from '../src/tree-occlusion.js';

function setup(t,touch=true){
 const engine=new NullEngine({renderWidth:1560,renderHeight:720}),scene=new Scene(engine);scene.useRightHandedSystem=true;engine.getCaps().instancedArrays=true;
 const camera=new ArcRotateCamera('view',0,1.1,10,new Vector3(0,1,0),scene);camera.fov=.65;
 const ambient=new HemisphericLight('sky',Vector3.Up(),scene),key=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',Vector3.Down(),scene),shadows=new ShadowGenerator(touch?1024:2048,key);
 const lighting=new SceneLighting(scene,{ambient,key,rim,shadows,touchDevice:touch,village:true});lighting.setQuality('high');
 t.after(()=>engine.dispose());return {scene,camera,lighting,shadows,touchDevice:touch};
}
test('orbiting retains off-camera casters and all their actual shadow draws without expanding the budget',async t=>{
 const world=setup(t),{scene,camera,shadows,lighting}=world,source=MeshBuilder.CreateBox('source',{width:4,height:9,depth:4},scene);
 source.material=new PBRMaterial('material',scene);source.isVisible=false;prepareVillageInstancing([source]);applyVillageToon([source],lighting);prepareTreeOcclusion([source]);lighting.registerMeshes([source]);
 const records=[[20,0],[-20,0],[0,20],[0,-20]].map(([x,z],i)=>{
  const root=new TransformNode('root'+i,scene),mesh=source.createInstance('tree'+i);mesh.parent=root;root.position.set(x,4.5,z);mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();root.freezeWorldMatrix();
  const box=mesh.getBoundingInfo().boundingBox;return {root,meshes:[mesh],placement:{id:'tree'+i,kind:'tree',x,z},min:box.minimumWorld.clone(),max:box.maximumWorld.clone()};
 });
 const visibility=new VillageVisibility(world,records,{touch:true});t.after(()=>visibility.dispose());
 const drawn=new Set(),process=source._processRendering;
 source._processRendering=function(mesh,subMesh,effect,fill,batch,...args){
  if(scene._isInIntermediateRendering())for(const instance of batch.visibleInstances[subMesh._id]??[])drawn.add(instance);
  return process.call(this,mesh,subMesh,effect,fill,batch,...args);
 };
 await source.material.forceCompilationAsync(source,{useInstances:true});
 const expected=records.map(r=>r.meshes[0]);let offCamera=0;
 for(let frame=0;frame<80;frame++){
  camera.alpha=frame*.13;camera.getViewMatrix();camera.getProjectionMatrix();visibility.update(camera.globalPosition,Vector3.Zero(),.36);
  assert.deepEqual(shadows.getShadowMap().renderList.map(m=>m.name).sort(),expected.map(m=>m.name).sort(),'camera rotation must not remove a nearby caster at '+frame);
  offCamera+=records.filter(r=>r.cellActive===false).length;drawn.clear();scene.render();
  for(const m of expected)assert.ok(drawn.has(m),'shadow depth pass lost '+m.name+' at '+frame);
  assert.equal(visibility.stats.shadowCasters,4);
 }
 assert.ok(offCamera>50);lighting.setQuality('battery');visibility.update(camera.globalPosition,Vector3.Zero(),.36);
 assert.equal(visibility.stats.shadowCasters,0);assert.ok(records.some(r=>!r.root.isEnabled()),'shadow-only roots return to culling when disabled');
});
test('small movements around the caster budget boundary retain existing casters; moving away still releases them',()=>{
 const record=(id,x)=>({root:{isEnabled:()=>true},placement:{id,kind:'tree'},min:{x:x-.5,z:-.5},max:{x:x+.5,z:.5}});
 const fixed=Array.from({length:27},(_,i)=>record('fixed'+i,2+i*.15)),a=record('a',-20),b=record('b',20.02),records=[...fixed,a,b];
 let chosen=selectVillageShadowCasters(records,{x:0,z:0},true);assert.ok(chosen.includes(a));
 for(const x of [.05,-.05,.1,-.1]){chosen=selectVillageShadowCasters(records,{x,z:0},true,new Set(chosen));assert.ok(chosen.includes(a));assert.equal(chosen.length,28);}
 chosen=selectVillageShadowCasters(records,{x:25,z:0},true,new Set(chosen));assert.ok(!chosen.includes(a));assert.ok(chosen.includes(b));
});
for(const touch of [true,false])test('moving village shadow projection stays aligned to texels '+(touch?'mobile':'desktop'),t=>{
 const {scene,lighting,shadows}=setup(t,touch),map=shadows.getShadowMap(),size=map.getSize().width,point=new Vector3(7,0,-3);let previous,steps=0;
 for(let frame=0;frame<120;frame++){
  lighting.follow(new Vector3(frame*.11,0,frame*.07));scene.incrementRenderId();
  const projected=Vector3.TransformCoordinates(point,shadows.getTransformMatrix()),pixel=[projected.x*size/2,projected.y*size/2];
  if(previous)for(let axis=0;axis<2;axis++){
   const shift=pixel[axis]-previous[axis];assert.ok(Math.abs(shift-Math.round(shift))<.003,'shadow texel phase changed by '+shift);
   if(Math.abs(shift)>.5)steps++;
  }
  previous=pixel;
 }
 assert.ok(steps>20);assert.equal(map,shadows.getShadowMap());assert.equal(size,touch?1024:2048);assert.equal(map.refreshRate,1);
});
