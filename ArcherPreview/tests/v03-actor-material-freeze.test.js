import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,Skeleton,Bone,Matrix,FreeCamera,Vector3,HemisphericLight,Material,PointLight} from '@babylonjs/core';
import {createActorMaterialFreeze} from '../src/v03/actor-material-freeze.js';

const drawn=async scene=>{await scene.whenReadyAsync();scene.render();};
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('c',new Vector3(0,1,-5),scene).setTarget(Vector3.Zero());new HemisphericLight('h',new Vector3(0,1,0),scene);
 const skinned=MeshBuilder.CreateBox('actor',{},scene),prop=MeshBuilder.CreateBox('prop',{},scene);prop.position.x=2;
 const skeleton=new Skeleton('rig','rig',scene);new Bone('root',skeleton,null,Matrix.Identity());skinned.skeleton=skeleton;
 skinned.material=new PBRMaterial('actor-skin',scene);prop.material=new PBRMaterial('prop',scene);
 return {engine,scene,skinned,prop};
}

test('a drawn skinned material is frozen; scenery is left alone',async()=>{
 const {engine,scene,skinned,prop}=fixture(),freeze=createActorMaterialFreeze(scene);
 assert.equal(skinned.material.isFrozen,false);
 await drawn(scene);freeze.scan();
 assert.equal(skinned.material.isFrozen,true);assert.equal(prop.material.isFrozen,false);
 assert.equal(freeze.frozenNow,1);
 engine.dispose();
});

test('any dirty mark thaws it first; it freezes again only after the change has drawn clean',async()=>{
 const {engine,scene,skinned}=fixture(),freeze=createActorMaterialFreeze(scene),material=skinned.material;
 await drawn(scene);freeze.scan();assert.equal(material.isFrozen,true);
 const wrapper=skinned.subMeshes[0]._drawWrapper,effect=wrapper.effect;
 new PointLight('p',new Vector3(0,2,0),scene);// a new light marks every material light-dirty
 assert.equal(material.isFrozen,false,'thawed before the mark');assert.equal(freeze.thaws,1);
 assert.equal(wrapper.defines.isDirty,true);
 freeze.scan();assert.equal(material.isFrozen,false,'not refrozen while its defines are dirty');
 await drawn(scene);assert.equal(wrapper.defines.isDirty,false);assert.notEqual(wrapper.effect,effect,'the define change rebuilt the effect');
 freeze.scan();assert.equal(material.isFrozen,true);
 material.markAsDirty(Material.TextureDirtyFlag);assert.equal(material.isFrozen,false);
 engine.dispose();
});

test('a material shared with a submesh whose defines are still dirty stays unfrozen',async()=>{
 const {engine,scene,skinned,prop}=fixture(),freeze=createActorMaterialFreeze(scene);
 prop.material=skinned.material;await drawn(scene);
 prop.visibility=.5;// marks only the prop's defines (misc)
 freeze.scan();assert.equal(skinned.material.isFrozen,false,'the prop has not rebuilt its defines yet');
 await drawn(scene);freeze.scan();assert.equal(skinned.material.isFrozen,true);
 prop.visibility=1;assert.equal(skinned.material.isFrozen,false,'a mesh-level mark on a hooked mesh thaws it too');
 engine.dispose();
});

test('turning it off thaws what it froze; disposing the scene removes its observer',async()=>{
 const {engine,scene,skinned}=fixture(),freeze=createActorMaterialFreeze(scene);
 await drawn(scene);freeze.scan();assert.equal(skinned.material.isFrozen,true);
 freeze.setEnabled(false);assert.equal(skinned.material.isFrozen,false);
 const before=scene.onAfterRenderObservable.observers.length;scene.dispose();
 assert.ok(before>=1);engine.dispose();
});
