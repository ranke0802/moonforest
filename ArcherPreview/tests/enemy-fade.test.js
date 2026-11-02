import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {EnemyDeath,enableEnemyFade} from '../src/enemy-death.js';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
import {attachCharacterOutlines,isRuntimeOutline} from '../src/character-outlines.js';
import {caveFogFallback} from '../src/cave-fog-binding.js';

test('opaque glTF enemies and ink fade per mesh without changing a living shared material or adding resources',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  caveFogFallback(scene).getInternalTexture().isReady=true;
  const material=new PBRMaterial('shared-monster-paint',scene);material.unlit=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;material.metadata={moonforestMonsterToon:true};
  const body=MeshBuilder.CreateBox('dead-monster',{},scene),living=MeshBuilder.CreateBox('living-monster',{},scene);body.material=living.material=material;
  const asset={meshes:[body]},alive={meshes:[living]};attachCharacterOutlines(asset,'goblin');attachCharacterOutlines(alive,'goblin');enableEnemyFade(asset);enableEnemyFade(alive);
  const original=material.needAlphaBlendingForMesh;enableEnemyFade(asset);assert.equal(material.needAlphaBlendingForMesh,original);
  await prepareBossShaders({meshes:[...asset.meshes,...alive.meshes]},{frame:async()=>{}});
  body.visibility=.5;await prepareBossShaders(asset,{frame:async()=>{}});
  assert.match(body.subMeshes[0].effect.defines,/#define ALPHABLEND/,'real PBR fade variant must enable alpha composition');body.visibility=1;
  const inventory=()=>[scene.meshes.length,scene.materials.length,scene.textures.length,scene.geometries.length],before=inventory();
  for(let cycle=0;cycle<8;cycle++){
   const death=new EnemyDeath();let opacity=1;
   for(let frame=0;frame<150;frame++){
    death.advance(1/30);assert.ok(death.opacity<=opacity);opacity=death.opacity;
    for(const mesh of asset.meshes)mesh.visibility=opacity;
    assert.equal(material.needAlphaBlendingForMesh(body),true);assert.equal(material.needAlphaBlendingForMesh(living),false);assert.equal(living.visibility,1);assert.equal(material.alpha,1);assert.equal(material.transparencyMode,0);
    assert.equal(asset.meshes.find(isRuntimeOutline).material.needAlphaBlendingForMesh(asset.meshes.find(isRuntimeOutline)),true);
   }
   for(const mesh of asset.meshes)mesh.visibility=1;
   assert.equal(material.needAlphaBlendingForMesh(body),false);assert.deepEqual(inventory(),before);
  }
 }finally{scene.dispose();engine.dispose();}
});
