import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {NullEngine,Scene,FreeCamera,DirectionalLight,Vector3} from '@babylonjs/core';
import {createGoldLootView} from '../src/gold-loot-view.js';

function fixture(t){
  const previousDocument=globalThis.document,{document}=parseHTML('<div id="loot"></div>');globalThis.document=document;
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera('loot-test-camera',new Vector3(0,2,-4),scene);camera.setTarget(new Vector3(0,0,1));
  new DirectionalLight('loot-test-sun',new Vector3(.5,-1,.5),scene);
  const host=document.getElementById('loot'),view=createGoldLootView(scene,host),template=scene.getMeshByName('gold-coin-template'),material=template.material;
  const effects=new Set(),createEffect=engine.createEffect.bind(engine),checks=[],ready=material.isReadyForSubMesh.bind(material),bindings=[],bind=template.geometry._bind.bind(template.geometry);
  engine.createEffect=(...args)=>{const effect=createEffect(...args);effects.add(effect);return effect;};
  material.isReadyForSubMesh=(mesh,sub,instances)=>{
    const result=ready(mesh,sub,instances);checks.push({mesh,visible:mesh.isVisible,enabled:mesh.isEnabled(),instances,ready:result,defines:sub.effect?.defines,effect:sub.effect});return result;
  };
  template.geometry._bind=(effect,index,...args)=>{bindings.push({effect,index});return bind(effect,index,...args);};
  let draws=0,renders=0;const render=scene.render.bind(scene);
  scene.render=(...args)=>{renders++;return render(...args);};
  scene.onBeforeDrawPhaseObservable.add(()=>draws++);
  t.after(()=>{view.dispose();scene.dispose();engine.dispose();if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  return {engine,scene,host,view,template,material,effects,checks,bindings,get draws(){return draws;},get renders(){return renders;}};
}
const counts=f=>[f.scene.meshes.length,f.scene.transformNodes.length,f.scene.geometries.length,f.scene.materials.length,f.scene.textures.length];
const drop={id:1,amount:100,position:{x:0,y:.04,z:1},age:.3};

test('first actual visible coin clones reuse the prepared StandardMaterial effect and shared geometry without any preparation draw',async t=>{
  const f=fixture(t),before=counts(f),positions=Array.from(f.template.getVerticesData('position')),indices=Array.from(f.template.getIndices());
  const first=f.view.prepare({frame:async()=>{}}),second=f.view.prepare();assert.equal(first,second,'concurrent screen-ready calls share one job');
  assert.equal(f.view.inspect().status,'preparing');assert.equal(f.view.inspect().runs,1);
  await first;
  assert.equal(f.view.inspect().status,'ready');assert.ok(f.view.inspect().lastDurationMs>=0);assert.equal(f.view.inspect().geometryBindings,1);
  assert.equal(f.renders,0);assert.equal(f.draws,0);assert.deepEqual(counts(f),before);assert.equal(f.template.isVisible,false);
  const prepared=f.checks.find(c=>c.ready);assert.ok(prepared);assert.equal(prepared.visible,true);assert.equal(prepared.enabled,false);assert.equal(prepared.instances,false);
  assert.ok(f.bindings.some(b=>b.effect===prepared.effect&&b.index===f.template.geometry.getIndexBuffer()));
  assert.ok(f.template.geometry.getVertexBuffer('position').getBuffer());assert.ok(f.template.geometry.getVertexBuffer('normal').getBuffer());
  assert.doesNotMatch(prepared.defines,/#define INSTANCES\b/);assert.match(prepared.defines,/#define LIGHT0\b/);
  const effects=f.effects.size;f.view.sync([drop]);
  const root=f.scene.getTransformNodeByName('gold-pile-1'),coins=root.getChildMeshes();assert.equal(coins.length,3);assert.equal(f.host.children.length,1);assert.equal(f.host.textContent,'100 G');
  assert.deepEqual(root.position.asArray(),[0,.42,1]);
  for(let i=0;i<3;i++){
    const coin=coins.find(c=>c.name===`gold-1-${i}`);assert.equal(coin.material,f.material);assert.equal(coin.geometry,f.template.geometry);assert.equal(coin.isPickable,false);assert.equal(coin.isVisible,true);
    assert.deepEqual(coin.position.asArray(),[(i-1)*.07,i*.025,Math.sin(i*2)*.06]);assert.deepEqual(coin.rotation.asArray(),[i===2?.3:0,i*1.1,0]);
  }
  assert.deepEqual(f.material.diffuseColor.asArray(),[.85,.55,.12]);assert.deepEqual(f.material.emissiveColor.asArray(),[.32,.18,.025]);assert.deepEqual(f.material.specularColor.asArray(),[.6,.42,.16]);
  f.scene.render();assert.ok(f.draws>0);assert.equal(f.effects.size,effects,'first loot display creates no new SDK effect');
  for(const coin of coins){assert.equal(coin.subMeshes[0].effect,prepared.effect);assert.equal(coin.subMeshes[0].effect.defines,prepared.defines);}
  assert.deepEqual(Array.from(f.template.getVerticesData('position')),positions);assert.deepEqual(Array.from(f.template.getIndices()),indices);
});

test('repeated map preparation keeps one template and rechecks changed fog defines before another first drop',async t=>{
  const f=fixture(t),before=counts(f);await f.view.prepare({frame:async()=>{}});const effects=f.effects.size;
  for(let map=0;map<12;map++){
    await f.view.prepare({frame:async()=>{}});assert.deepEqual(counts(f),before);
    f.view.sync([{...drop,id:map+1}]);f.view.sync([]);assert.deepEqual(counts(f),before);assert.equal(f.host.children.length,0);
  }
  assert.equal(f.effects.size,effects,'unchanged map state reuses its compiled variant');
  f.scene.fogMode=Scene.FOGMODE_EXP2;f.scene.fogDensity=.03;
  await f.view.prepare({frame:async()=>{}});const fog=f.checks.findLast(c=>c.ready);assert.match(fog.defines,/#define FOG\b/);const fogEffects=f.effects.size;
  f.view.sync([drop]);f.scene.render();assert.equal(f.effects.size,fogEffects,'map transfer warms the current fog variant before gameplay');assert.deepEqual(counts(f).slice(2),before.slice(2));
  f.view.clear();assert.deepEqual(counts(f),before);
});

test('preparation timeout restores material state, releases the probe and permits a fresh retry',async t=>{
  const f=fixture(t),before=counts(f),ready=f.material.isReadyForSubMesh,initial=[f.material.checkReadyOnEveryCall,f.material.allowShaderHotSwapping];let clock=0,calls=0;
  f.material.isReadyForSubMesh=()=>{calls++;clock=51;return false;};
  await assert.rejects(f.view.prepare({frame:async()=>{},now:()=>clock,timeoutMs:50}),{name:'TimeoutError'});
  assert.equal(f.view.inspect().status,'failed');assert.equal(f.view.inspect().error.name,'TimeoutError');
  assert.deepEqual(counts(f),before);assert.deepEqual([f.material.checkReadyOnEveryCall,f.material.allowShaderHotSwapping],initial);
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls,1,'no timeout retry survives the failed job');
  f.material.isReadyForSubMesh=ready;await f.view.prepare({frame:async()=>{}});assert.deepEqual(counts(f),before);
});

test('shader readiness errors clean up without changing material or live loot',async t=>{
  const f=fixture(t),before=counts(f),ready=f.material.isReadyForSubMesh,initial=[f.material.checkReadyOnEveryCall,f.material.allowShaderHotSwapping];
  f.material.isReadyForSubMesh=()=>{throw new Error('shader-readiness-error');};
  await assert.rejects(f.view.prepare({frame:async()=>{}}),/shader-readiness-error/);
  assert.deepEqual(counts(f),before);assert.deepEqual([f.material.checkReadyOnEveryCall,f.material.allowShaderHotSwapping],initial);assert.equal(f.renders,0);
  f.material.isReadyForSubMesh=ready;await f.view.prepare({frame:async()=>{}});f.view.sync([drop]);assert.equal(f.host.textContent,'100 G');
});

for(const lifecycle of ['view','scene'])test(`${lifecycle} disposal cancels pending readiness and leaves no probe, timer retries or loot labels`,async t=>{
  const f=fixture(t);let entered,calls=0;const waiting=new Promise(resolve=>entered=resolve);
  f.material.isReadyForSubMesh=()=>{calls++;entered();return false;};
  const pending=f.view.prepare({frame:async()=>{}});await waiting;
  if(lifecycle==='scene')f.scene.dispose();else f.view.dispose();
  await assert.rejects(pending,{name:'AbortError'});const stopped=calls;
  assert.equal(f.view.inspect().status,'disposed');
  await new Promise(resolve=>setTimeout(resolve,35));assert.equal(calls,stopped);assert.equal(f.host.children.length,0);
  assert.equal(f.scene.meshes.some(m=>m.name.startsWith('gold-coin-')),false);assert.equal(f.scene.materials.includes(f.material),false);
  await assert.rejects(f.view.prepare(),{name:'AbortError'});f.view.sync([drop]);assert.equal(f.host.children.length,0);
});
