import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
import {createBossPreparation} from '../src/boss-preparation.js';
test('hidden boss body and silhouette check the actual variants serially with a frame opportunity between each',async()=>{
  const calls=[];
  const mesh=(name,outline=false)=>({name,metadata:outline?{moonforestOutline:true}:{},getTotalVertices:()=>300,material:{metadata:{moonforestMonsterToon:!outline},isReady(m){calls.push(m.name);return true;},forceCompilationAsync(){throw new Error('private unbounded poll must never be used');}}});
  const body=mesh('body'),outline=mesh('outline',true),empty={getTotalVertices:()=>0};
  await prepareBossShaders({meshes:[body,empty,outline]},{frame:async()=>{calls.push('frame');}});
  assert.deepEqual(calls,['frame','body','frame','outline']);
});
test('a failed shader prepare does not proceed to expose subsequent unready variants',async()=>{
  let next=false;const first={metadata:{moonforestOutline:true},getTotalVertices:()=>1,material:{isReady(){throw new Error('compile failed');}}},second={...first,material:{isReady(){next=true;return true;}}};
  await assert.rejects(prepareBossShaders({meshes:[first,second]},{frame:async()=>{}}),/compile failed/);assert.equal(next,false);
});

test('a never-ready shader cancels immediately, leaves no polling waiter and restores hot-swapping',async()=>{
  let calls=0,entered;const started=new Promise(r=>entered=r),material={allowShaderHotSwapping:true,isReady(){calls++;entered();return false;},forceCompilationAsync(){assert.fail('Babylon private poller is forbidden');}},mesh={metadata:{moonforestOutline:true},getTotalVertices:()=>3,material};
  const preparation=createBossPreparation({frame:async()=>{}}),pending=prepareBossShaders({meshes:[mesh]},{preparation});await started;preparation.cancel();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(preparation.pendingWaits,0);assert.equal(material.allowShaderHotSwapping,true);const stopped=calls;await new Promise(r=>setTimeout(r,35));assert.equal(calls,stopped,'no late readiness retry survives cancellation');
});

test('the whole shader job has one45second deadline across variants and restores every material on timeout',async()=>{
  let now=0;const first={allowShaderHotSwapping:true,isReady(){now+=30000;return true;}},second={allowShaderHotSwapping:false,isReady(){now+=16000;return false;}},mesh=material=>({metadata:{moonforestOutline:true},getTotalVertices:()=>3,material}),preparation=createBossPreparation({frame:async()=>{},now:()=>now});
  await assert.rejects(prepareBossShaders({meshes:[mesh(first),mesh(second)]},{preparation}),{name:'TimeoutError'});assert.equal(now,46000);assert.equal(preparation.pendingWaits,0);assert.equal(first.allowShaderHotSwapping,true);assert.equal(second.allowShaderHotSwapping,false);
});

test('the exact PBR submesh is polled, compilation errors reject and borrowed shader state is restored',async()=>{
  const subMesh={effect:{getCompilationError:()=> 'bad variant',allFallbacksProcessed:()=>true}},mesh={metadata:{moonforestOutline:true},getTotalVertices:()=>3,subMeshes:[subMesh]},material={_storeEffectOnSubMeshes:true,allowShaderHotSwapping:true,isReadyForSubMesh(m,sub,instances){assert.strictEqual(m,mesh);assert.strictEqual(sub,subMesh);assert.equal(instances,false);return false;}};mesh.material=material;
  await assert.rejects(prepareBossShaders({meshes:[mesh]},{frame:async()=>{}}),/셰이더/);assert.equal(material.allowShaderHotSwapping,true);
});

test('cancelling an owned frame releases both its rAF and fallback/check timers without waiting for a displayed frame',async()=>{
  const before={request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame,set:globalThis.setTimeout,clear:globalThis.clearTimeout},frames=new Map(),timers=new Map();let id=0,pending,preparation;
  try{
    globalThis.requestAnimationFrame=callback=>{const value=++id;frames.set(value,callback);return value;};globalThis.cancelAnimationFrame=value=>frames.delete(value);
    globalThis.setTimeout=callback=>{const value=++id;timers.set(value,callback);return value;};globalThis.clearTimeout=value=>timers.delete(value);
    preparation=createBossPreparation();pending=preparation.nextFrame();assert.equal(frames.size,1);assert.equal(timers.size,2);preparation.cancel();assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(preparation.pendingWaits,0);
  }finally{globalThis.requestAnimationFrame=before.request;globalThis.cancelAnimationFrame=before.cancel;globalThis.setTimeout=before.set;globalThis.clearTimeout=before.clear;}
  await assert.rejects(pending,{name:'AbortError'});
});
