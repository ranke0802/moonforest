import test from 'node:test';
import assert from 'node:assert/strict';
import {FreeCamera,MeshBuilder,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {projectedCoverage,VILLAGE_LOD_COVERAGE,villageLodSources,villageLodTier} from '../src/village-lod.js';
import {shouldReleaseHighTexture} from '../src/village-texture-streaming.js';

test('geometry LOD selects original near mesh and scaled distant instances through Babylon',t=>{
  const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
  t.after(()=>{scene.dispose();engine.dispose();});
  const camera=new FreeCamera('view',new Vector3(0,0,-5),scene);camera.setTarget(Vector3.Zero());camera.minZ=.1;
  const high=MeshBuilder.CreateBox('high',{size:4},scene),mid=MeshBuilder.CreateBox('mid',{size:4},scene),far=MeshBuilder.CreateBox('far',{size:4},scene);
  high.useLODScreenCoverage=true;high.addLODLevel(VILLAGE_LOD_COVERAGE.mid,mid);high.addLODLevel(VILLAGE_LOD_COVERAGE.far,far);
  const instance=high.createInstance('placed');instance.computeWorldMatrix(true);
  for(const distance of [5,18,45]){
    camera.position.z=-distance;camera.getViewMatrix(true);camera.getProjectionMatrix(true);
    const tier=villageLodTier(projectedCoverage(camera,instance.getBoundingInfo().boundingSphere));
    assert.equal(instance.getLOD(camera),[high,mid,far][tier]);
  }
  camera.position.z=-5;camera.getViewMatrix(true);assert.equal(instance.getLOD(camera),high,'near camera keeps original');
  instance.scaling.setAll(.03);instance.computeWorldMatrix(true);
  assert.equal(instance.getLOD(camera),far,'ankle stones do not retain a full 5K mesh');
});

test('mobile keeps original geometry as its near tier and streams higher resolution separately',()=>{
  const config={geometryLod:true,lods:[{level:0,triangles:5000,textureSize:2048},{level:1,triangles:2500,textureSize:1024},{level:2,triangles:1100,textureSize:512}],mobileNear:{level:0,triangles:5000,textureSize:1024}};
  const mobile=villageLodSources(config,true);assert.deepEqual(mobile.map(l=>l.triangles),[5000,2500,1100]);
  assert.equal(mobile[0],config.mobileNear);assert.equal(villageLodSources(config,false)[0],config.lods[0]);
});

test('unused high-resolution textures survive short camera turns and eventually expire',()=>{
  assert.equal(shouldReleaseHighTexture(1000,2000,true),false);
  assert.equal(shouldReleaseHighTexture(1000,2600,true),false);
  assert.equal(shouldReleaseHighTexture(1000,2600,false),false);
  assert.equal(shouldReleaseHighTexture(1000,13001,true),true);
  assert.equal(shouldReleaseHighTexture(1000,21001,false),true);
});
