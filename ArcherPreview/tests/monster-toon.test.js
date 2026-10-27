import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, PBRMaterial, Skeleton, Color3 } from '@babylonjs/core';
import { applyMonsterToon } from '../src/monster-toon.js';
import { attachCharacterOutlines } from '../src/character-outlines.js';
import { applyHitFlash } from '../src/hit-feedback.js';

test('toon monsters share a non-PBR material while retaining independent rigs, outlines and hit/fade state', t => {
  const engine=new NullEngine(),scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const source=new PBRMaterial('painted',scene);source.albedoColor=new Color3(.8,.7,.6);
  const assets=Array.from({length:5},(_,i)=>{
    const mesh=MeshBuilder.CreateBox(`bear-${i}`,{},scene);mesh.material=source;
    mesh.skeleton=new Skeleton(`rig-${i}`,`rig-${i}`,scene);mesh.numBoneInfluencers=8;
    const asset={meshes:[mesh]},geometry=mesh.geometry,rig=mesh.skeleton;
    applyMonsterToon(asset);attachCharacterOutlines(asset,'bear');applyMonsterToon(asset);
    assert.equal(mesh.material.getClassName(),'StandardMaterial');
    assert.deepEqual(mesh.material.specularColor,Color3.Black());
    assert.equal(mesh.material.bumpTexture,null);assert.equal(mesh.material.reflectionTexture,null);
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.skeleton,rig);
    assert.equal(asset.meshes[1].skeleton,rig);assert.equal(asset.meshes[1].material.getClassName(),'ShaderMaterial');
    return asset;
  });
  assert.equal(assets[0].meshes[0].material,assets[4].meshes[0].material);
  assert.notEqual(assets[0].meshes[0].skeleton,assets[1].meshes[0].skeleton);
  applyHitFlash(assets[0].meshes,.25);
  assert.equal(assets[0].meshes[0].renderOverlay,true);
  assert.equal(Boolean(assets[1].meshes[0].renderOverlay),false);
  assets[0].meshes[0].visibility=.5;
  assert.equal(assets[1].meshes[0].visibility,1);
});
