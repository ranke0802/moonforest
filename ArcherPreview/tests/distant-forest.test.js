import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NullEngine, Scene, PBRMaterial, RawTexture, MeshBuilder, AssetContainer, FreeCamera, Vector3, DirectionalLight, HemisphericLight } from '@babylonjs/core';
import { createFarTreeMaterial } from '../src/tree-material.js';
import { attachTreeLod, addDistanceCull } from '../src/tree-lod.js';
import { prepareTreeOcclusion } from '../src/tree-occlusion.js';
import { VIEW_DISTANCE, SCENERY_VIEW_DISTANCE, FOG_START, FOG_END, withinRenderRange } from '../src/world-limits.js';

test('far trees share existing textures, retain occlusion, skip pixel lighting/shadows and return to near detail',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const key=new DirectionalLight('key',new Vector3(-.4,-1,-.6),scene),rim=new DirectionalLight('rim',new Vector3(.5,-.3,.7),scene),ambient=new HemisphericLight('ambient',Vector3.Up(),scene);
    const material=new PBRMaterial('painted',scene);material.albedoTexture=RawTexture.CreateRGBTexture(new Uint8Array([90,140,60]),1,1,scene);
    const textureCount=scene.textures.length;
    const farMaterial=createFarTreeMaterial(material,{key,rim,ambient});
    assert.equal(farMaterial.albedoTexture,material.albedoTexture);
    assert.equal(scene.textures.length,textureCount);assert.equal(farMaterial.unlit,true);assert.equal(farMaterial.maxSimultaneousLights,0);
    const full=MeshBuilder.CreateSphere('tree',{segments:16},scene),low=MeshBuilder.CreateSphere('tree',{segments:4},scene);
    full.material=material;full.receiveShadows=true;
    const source=new AssetContainer(scene),variant=new AssetContainer(scene);source.meshes=[full];variant.meshes=[low];
    source.removeAllFromScene();variant.removeAllFromScene();prepareTreeOcclusion([full]);
    prepareTreeOcclusion(attachTreeLod(scene,source,variant,17,()=>farMaterial));addDistanceCull(source,SCENERY_VIEW_DISTANCE);
    assert.equal(low.receiveShadows,false);assert.equal(full.receiveShadows,true);assert.equal(full.material,material);
    assert.ok(farMaterial.pluginManager.getPlugin('MoonforestTreeCoverage'));
    assert.ok(farMaterial.pluginManager.getPlugin('MoonforestFarTreeLight'));
    const camera=new FreeCamera('camera',Vector3.Zero(),scene),instance=full.createInstance('tree-instance');camera.computeWorldMatrix();
    for(const [distance,expected] of [[5,full],[35,low],[65,null],[10,full]]){
      instance.position.z=distance;instance.computeWorldMatrix(true);assert.equal(instance.getLOD(camera),expected);
    }
    assert.equal(scene.textures.length,textureCount);
  } finally {scene.dispose();engine.dispose();}
});

test('clear scenery extends only the static background, leaving gameplay rendering bounded',()=>{
  assert.equal(VIEW_DISTANCE,32);assert.equal(SCENERY_VIEW_DISTANCE,60);
  assert.ok(FOG_START>VIEW_DISTANCE);assert.equal(FOG_END,SCENERY_VIEW_DISTANCE);
  assert.equal(withinRenderRange({x:0,y:0,z:0},{x:0,y:0,z:35}),false);
});

test('authored near models are preserved and background geometry is much smaller',async()=>{
  const base=new URL('../public/assets/',import.meta.url),manifest=JSON.parse(await readFile(new URL('environment.json',base),'utf8'));
  for(const key of ['verdant-tree','oak-tree']){
    const asset=manifest.assets[key];
    assert.deepEqual(asset.lods.map(l=>l.distance),[5,11,17,28]);
    const [mid,far]=await Promise.all([asset.lods[1],asset.lods[3]].map(async lod=>JSON.parse(await readFile(new URL(lod.model,base),'utf8'))));
    const count=gltf=>gltf.meshes.flatMap(mesh=>mesh.primitives).reduce((sum,p)=>sum+gltf.accessors[p.indices].count/3,0);
    assert.ok(count(far)<2500);assert.ok(count(far)<count(mid)*.1);
    assert.deepEqual(far.images,mid.images,'no replacement texture download or color change');
    assert.equal(asset.lods[3].material,'vertex-lit');
  }
});
