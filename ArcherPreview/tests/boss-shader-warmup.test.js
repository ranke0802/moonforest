import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBossShaders} from '../src/boss-shader-warmup.js';
test('hidden boss body and silhouette compile serially with a frame opportunity between each',async()=>{
  const calls=[];let active=0,max=0;
  const mesh=(name,outline=false)=>({name,metadata:outline?{moonforestOutline:true}:{},getTotalVertices:()=>300,material:{metadata:{moonforestMonsterToon:!outline},async forceCompilationAsync(m){calls.push(m.name);max=Math.max(max,++active);await Promise.resolve();active--;}}});
  const body=mesh('body'),outline=mesh('outline',true),empty={getTotalVertices:()=>0};
  await prepareBossShaders({meshes:[body,empty,outline]},{frame:async()=>{calls.push('frame');}});
  assert.deepEqual(calls,['frame','body','frame','outline']);assert.equal(max,1);
});
test('a failed shader prepare does not proceed to expose subsequent unready variants',async()=>{
  let next=false;const first={metadata:{moonforestOutline:true},getTotalVertices:()=>1,material:{forceCompilationAsync:async()=>{throw new Error('compile failed');}}},second={...first,material:{forceCompilationAsync:async()=>{next=true;}}};
  await assert.rejects(prepareBossShaders({meshes:[first,second]},{frame:async()=>{}}),/compile failed/);assert.equal(next,false);
});
