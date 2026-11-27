
import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionalLight,FreeCamera,HemisphericLight,MeshBuilder,NullEngine,PBRMaterial,RawTexture,Scene,ShadowGenerator,StandardMaterial,Vector3} from '@babylonjs/core';
import {createAdaptiveShadowWarmup} from '../src/adaptive-shadow-warmup.js';
import {inspectPreparedEffects} from '../src/prepared-effect-lifetime.js';
import {cameraRenderPass} from '../src/render-variant-state.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const effectKeys=engine=>Object.keys(engine._compiledEffects);
const newKeys=(before,after)=>after.filter(key=>!before.includes(key));

async function fixture(t){
  const engine=new NullEngine({renderWidth:640,renderHeight:480}),scene=new Scene(engine);
  t.after(()=>engine.dispose());
  engine.getCaps().instancedArrays=true;
  const camera=new FreeCamera('warmup-camera',new Vector3(0,3,-15),scene);
  camera.setTarget(Vector3.Zero());
  const shadow=new ShadowGenerator(64,new DirectionalLight('sun',new Vector3(.3,-1,.6),scene));
  shadow.usePercentageCloserFiltering=true;
  new HemisphericLight('fill',Vector3.Up(),scene);
  const meshes=[];
  for(let i=0;i<8;i++){
    const mesh=MeshBuilder.CreateBox('fixture-'+i,{},scene);
    mesh.position.set((i%4-1.5)*2,(i>>2)-.5,0);
    const pbr=i%2!==0,material=pbr?new PBRMaterial('pbr',scene):new StandardMaterial('standard',scene);
    if(i%4>1){
      const texture=RawTexture.CreateRGBATexture(new Uint8Array([240,230,200,255]),1,1,scene);
      texture.getInternalTexture().isReady=true;
      if(pbr){material.albedoTexture=texture;material.metallic=.1;material.roughness=.9;}
      else material.diffuseTexture=texture;
    }
    mesh.material=material;
    mesh.receiveShadows=true;
    shadow.addShadowCaster(mesh);
    meshes.push(mesh);
  }
  const instance=meshes[3].createInstance('instanced-fixture');
  instance.position.set(4,0,0);
  for(let i=0;i<8;i++){scene.render();await tick();}
  const pass=cameraRenderPass(scene);
  return {engine,scene,meshes,pass,world:{scene,toolGeneration:0}};
}

test('warming the first emergency level builds the exact no-shadow variants outside the normal draw',async t=>{
  const compare=[];
  for(const warm of [false,true]){
    const {engine,scene,meshes,pass,world}=await fixture(t);
    const before=effectKeys(engine);
    const visibleEffects=()=>meshes.map(mesh=>mesh.subMeshes[0]._getDrawWrapper(pass,false)?.effect?._key);
    const live=visibleEffects();
    assert.ok(live.every(key=>key?.includes('#define SHADOWS')));
    assert.ok(live[3].includes('#define INSTANCES'));
    if(warm){
      const update=createAdaptiveShadowWarmup({frame:tick});
      await update(world,true);
      assert.equal(scene.shadowsEnabled,true);
      assert.deepEqual(visibleEffects(),live);
      assert.equal(inspectPreparedEffects(engine).liveEffects,5);
      assert.equal(update(world,true),undefined,'a second frame must not start a second job');
    }
    const prepared=effectKeys(engine);
    scene.shadowsEnabled=false;
    scene.render();
    const after=effectKeys(engine);
    assert.ok(visibleEffects().every(key=>key&&!key.includes('#define SHADOWS')));
    compare.push({warmCreated:newKeys(before,prepared).length,switchCreated:newKeys(prepared,after).length});
  }
  assert.deepEqual(compare,[{warmCreated:0,switchCreated:5},{warmCreated:5,switchCreated:0}]);
});

test('map generation change cancels attached temporary preparation and allows the next map to warm',async t=>{
  const {engine,scene,world}=await fixture(t);
  const restore=engine.releaseRenderPassId.bind(engine);
  const released=[];
  t.mock.method(engine,'releaseRenderPassId',id=>{released.push(id);restore(id);});
  let frame=0,holding,block=true;
  const update=createAdaptiveShadowWarmup({frame:()=>!block||++frame===1?Promise.resolve():new Promise(resolve=>{holding=resolve;})});
  const pending=update(world,true);
  for(let i=0;i<20&&!holding;i++)await tick();
  assert.equal(typeof holding,'function');
  world.toolGeneration++;
  update(world,false);
  await pending;
  const effects=inspectPreparedEffects(engine);
  assert.equal(effects.liveEffects,0);
  assert.equal(released.length,1);
  assert.equal(scene.shadowsEnabled,true);
  block=false;holding();
  await update(world,true);
  assert.equal(inspectPreparedEffects(engine).liveEffects,5);
  scene.dispose();
  assert.equal(inspectPreparedEffects(engine).liveEffects,0);
});
