import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, PBRMaterial, Skeleton, Color3, Texture } from '@babylonjs/core';
import { applyMonsterToon } from '../src/monster-toon.js';
import { attachCharacterOutlines } from '../src/character-outlines.js';
import { applyHitFlash } from '../src/hit-feedback.js';

test('monsters share the warrior unlit glTF path while retaining independent rigs, outlines and hit/fade state', t => {
  const engine=new NullEngine(),scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const source=new PBRMaterial('painted',scene);source.albedoColor=new Color3(.8,.7,.6);
  const assets=Array.from({length:5},(_,i)=>{
    const mesh=MeshBuilder.CreateBox(`bear-${i}`,{},scene);mesh.material=source;
    mesh.skeleton=new Skeleton(`rig-${i}`,`rig-${i}`,scene);mesh.numBoneInfluencers=8;
    const asset={meshes:[mesh]},geometry=mesh.geometry,rig=mesh.skeleton;
    applyMonsterToon(asset);attachCharacterOutlines(asset,'bear');applyMonsterToon(asset);
    assert.equal(mesh.material.getClassName(),'PBRMaterial');
    assert.equal(mesh.material.unlit,true);
    assert.equal(mesh.material.disableLighting,true);
    assert.deepEqual(mesh.material.albedoColor,source.albedoColor);
    assert.deepEqual(mesh.material.emissiveColor,Color3.Black());
    assert.equal(mesh.material.bumpTexture,null);assert.equal(mesh.material.reflectionTexture,null);
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.skeleton,rig);
    assert.equal(asset.meshes[1].skeleton,rig);assert.equal(asset.meshes[1].material.getClassName(),'ShaderMaterial');
    return asset;
  });
  assert.equal(assets[0].meshes[0].material,assets[4].meshes[0].material);
  assert.equal(source.unlit,false,'keep the imported source available for rollback');
  assert.notEqual(assets[0].meshes[0].skeleton,assets[1].meshes[0].skeleton);
  applyHitFlash(assets[0].meshes,.25);
  assert.equal(assets[0].meshes[0].renderOverlay,true);
  assert.equal(Boolean(assets[1].meshes[0].renderOverlay),false);
  assets[0].meshes[0].visibility=.5;
  assert.equal(assets[1].meshes[0].visibility,1);
});

test('glTF base-color texture keeps its color space, UV transform and alpha without an extra lighting layer', t => {
  const engine=new NullEngine(),scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const source=new PBRMaterial('gltf',scene),texture=new Texture(null,scene);
  source.albedoTexture=texture;texture.gammaSpace=false;texture.uScale=.75;texture.vOffset=.2;
  source.albedoColor=new Color3(.4,.7,.2);source.alpha=.8;
  source.backFaceCulling=false;source.useAlphaFromAlbedoTexture=true;
  source.bumpTexture=new Texture(null,scene);source.metallicTexture=new Texture(null,scene);
  const mesh=MeshBuilder.CreateBox('monster',{},scene);mesh.material=source;
  applyMonsterToon({meshes:[mesh]});
  assert.equal(mesh.material.albedoTexture,texture,'reuse the decoded texture without cloning or reloading it');
  assert.equal(texture.gammaSpace,false);assert.equal(texture.uScale,.75);assert.equal(texture.vOffset,.2);
  assert.deepEqual(mesh.material.albedoColor,source.albedoColor);
  assert.equal(mesh.material.alpha,.8);assert.equal(mesh.material.backFaceCulling,false);
  assert.equal(mesh.material.useAlphaFromAlbedoTexture,true);
  assert.equal(mesh.material.bumpTexture,null);assert.equal(mesh.material.metallicTexture,null);
  assert.equal(mesh.material.unlit,true);assert.equal(mesh.material.disableLighting,true);
});
