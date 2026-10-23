import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3, MeshBuilder, PBRMaterial, Color3 } from '@babylonjs/core';
import { SceneLighting } from '../src/scene-lighting.js';

function setup(touchDevice) {
  const engine=new NullEngine(),scene=new Scene(engine);
  const ambient=new HemisphericLight('sky',Vector3.Up(),scene);
  const key=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene);
  const rim=new DirectionalLight('rim',Vector3.Down(),scene);
  const shadows=new ShadowGenerator(touchDevice?1024:2048,key);
  const lighting=new SceneLighting(scene,{ambient,key,rim,shadows,touchDevice});
  return {scene,engine,ambient,key,rim,shadows,lighting};
}

test('quality switching reuses one shadow map and preserves authored painted material colors',()=>{
  const {scene,engine,shadows,lighting,rim}=setup(true);
  const mesh=MeshBuilder.CreateBox('painted',{},scene),material=new PBRMaterial('painted',scene);
  material.albedoColor=Color3.Black();material.emissiveColor=new Color3(.8,.6,.2);mesh.material=material;
  const originalColor=material.emissiveColor.clone(),shadowMap=shadows.getShadowMap();
  lighting.registerMeshes([mesh]);lighting.registerMeshes([mesh]);
  const materialCount=scene.materials.length;
  for(let i=0;i<3;i++){
    lighting.setQuality('high');assert.equal(mesh.receiveShadows,true);assert.equal(scene.shadowsEnabled,true);assert.equal(rim.isEnabled(),false);
    lighting.setQuality('balanced');assert.equal(mesh.receiveShadows,false);assert.equal(scene.shadowsEnabled,false);assert.equal(rim.isEnabled(),true);
    lighting.setQuality('battery');assert.equal(scene.shadowsEnabled,false);
    assert.equal(shadows.getShadowMap(),shadowMap);assert.equal(scene.materials.length,materialCount);
    assert.ok(material.emissiveColor.equals(originalColor));assert.ok(material.albedoColor.equals(Color3.Black()));
  }
  scene.dispose();engine.dispose();
});

test('mobile shadows keep a bounded static frustum and render every second frame',()=>{
  const {scene,engine,shadows,key}=setup(true);
  assert.equal(shadows.getShadowMap().getSize().width,1024);
  assert.equal(shadows.getShadowMap().refreshRate,2);
  assert.equal(shadows.filteringQuality,ShadowGenerator.QUALITY_LOW);
  assert.equal(key.shadowFrustumSize,32);assert.equal(key.autoUpdateExtends,false);
  assert.ok(key.shadowMaxZ>key.shadowMinZ);
  scene.dispose();engine.dispose();
});

test('instances inherit source shadow receiving and disposed meshes leave the registry',()=>{
  const {scene,engine,lighting,shadows}=setup(false);
  const source=MeshBuilder.CreateBox('source',{},scene),instance=source.createInstance('instance');
  lighting.registerMeshes([source,instance]);assert.equal(lighting.receivers.size,1);
  lighting.setQuality('high');assert.equal(instance.receiveShadows,true);
  lighting.setQuality('balanced');assert.equal(instance.receiveShadows,false);
  assert.equal(shadows.getShadowMap().refreshRate,1);
  source.dispose();assert.equal(lighting.receivers.size,0);
  scene.dispose();engine.dispose();
});
