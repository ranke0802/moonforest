import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionalLight,FreeCamera,HemisphericLight,MeshBuilder,NullEngine,PBRMaterial,Scene,ShadowGenerator,Vector3} from '@babylonjs/core';
import {cameraRenderPass,withRenderPass} from '../src/render-variant-state.js';
import {SceneLighting} from '../src/scene-lighting.js';

async function fixture(t){
  const engine=new NullEngine({renderWidth:640,renderHeight:480}),scene=new Scene(engine);
  t.after(()=>engine.dispose());
  engine.getCaps().instancedArrays=true;
  const camera=new FreeCamera('camera',new Vector3(0,2,-9),scene);camera.setTarget(Vector3.Zero());
  const key=new DirectionalLight('key',new Vector3(.3,-1,.5),scene);
  const ambient=new HemisphericLight('sky',Vector3.Up(),scene),rim=new HemisphericLight('rim',Vector3.Up(),scene);
  const shadows=new ShadowGenerator(64,key);
  const lighting=new SceneLighting(scene,{key,ambient,rim,shadows,village:true,touchDevice:true,gameplayV03:true});
  const source=MeshBuilder.CreateBox('gltf-source',{},scene),paint=new PBRMaterial('gltf-paint',scene);
  source.material=paint;
  const visible=source.createInstance('visible-instance');
  lighting.registerMeshes([visible]);
  shadows.addShadowCaster(visible);
  scene.removeMesh(source);scene.removeMaterial(paint);
  const frame=async()=>{scene.render();await new Promise(resolve=>setImmediate(resolve));};
  for(let i=0;i<8;i++)await frame();
  const sub=source.subMeshes[0],pass=cameraRenderPass(scene);
  const draw=()=>sub._getDrawWrapper(pass,false);
  assert.equal(scene.meshes.includes(source),false);
  assert.equal(scene.materials.includes(paint),false);
  assert.equal(draw()?.defines.SHADOWS,true);
  assert.match(draw().effect._key,/#define SHADOWS/);
  return {engine,scene,lighting,source,visible,paint,sub,draw,frame,pass};
}

test('shadow guard dirties detached scenery in both directions without re-registering the asset',async t=>{
  const f=await fixture(t);
  f.lighting.setSceneShadows(false);
  await f.frame();
  assert.equal(f.draw().defines.SHADOWS,false);
  assert.doesNotMatch(f.draw().effect._key,/#define SHADOWS/);
  assert.equal(f.scene.meshes.includes(f.source),false);
  assert.equal(f.scene.materials.includes(f.paint),false);

  f.lighting.setSceneShadows(true);
  await f.frame();
  assert.equal(f.draw().defines.SHADOWS,true);
  assert.match(f.draw().effect._key,/#define SHADOWS/);
});

test('a slow no-shadow compilation cannot draw the old PCF shader after its texture is disabled',async t=>{
  const f=await fixture(t),previous=f.draw().effect;
  f.paint.allowShaderHotSwapping=true;
  f.paint.freeze();
  let requested;
  const prepare=f.paint._prepareEffect.bind(f.paint);
  t.mock.method(f.paint,'_prepareEffect',(...args)=>{
    const next=prepare(...args);
    if(next&&next!==previous){
      requested=next;
      t.mock.method(next,'isReady',()=>false,{times:1});
    }
    return next;
  });

  f.lighting.setSceneShadows(false);
  const ready=withRenderPass(f.scene,f.pass,()=>f.paint.isReadyForSubMesh(f.source,f.sub,true));
  assert.ok(requested,'the frozen receiver must prepare the new variant');
  assert.equal(ready,false,'never hot-swap to a shader with an unbound shadow sampler');
  assert.equal(f.draw().effect,previous,'keep the previous program available for a later shadowed frame');
});
