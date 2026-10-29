import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {VillageTextureStreaming,VILLAGE_TEXTURE_PACING} from '../src/village-texture-streaming.js';
import {VillageGeometryStreaming} from '../src/village-demand.js';
import {highTextureBytes} from '../src/village-texture-budget.js';

// Real camera and streaming manager, deterministic GPU completion surrogate.
// This checks admission, materials and lifetimes, not phone GPU time or heat.
function fixture(t){
  const engine=new NullEngine({renderWidth:1560,renderHeight:720}),scene=new Scene(engine);
  engine.getCaps().astc={};engine.getCaps().maxTextureSize=8192;
  const camera=new ArcRotateCamera('S23',0,1.2,6,new Vector3(0,1,0),scene);camera.fov=.65;camera.minZ=.05;
  const world={scene,camera,touchDevice:true,villageStreaming:{active:true,pending:null}};
  const f={now:0,group:0,starts:[],created:[],roots:[]},profile={shading:'toon-color',textures:{albedo:{width:4096,height:4096,codec:'etc1s'}},resources:[]};
  const assets=new Map(Array.from({length:8},(_,i)=>['asset'+i,{baseLevel:0,config:{highTextures:profile},source:{materials:[{albedoTexture:{base:true},unfreeze(){},freeze(){},metadata:{villageToon:true}}]}}]));
  const records=[...assets.keys()].map((id,i)=>({placement:{asset:id},root:{isEnabled:()=>true},meshes:[{isInFrustum:()=>Math.floor(i/4)===f.group,getBoundingInfo:()=>({boundingSphere:{centerWorld:camera.target,radiusWorld:2}})}]}));
  const stats={},stream=new VillageTextureStreaming(world,assets,records,new URL('https://example.test/'),stats);stream.clock=()=>f.now;
  stream.loadTexture=async config=>{
    f.starts.push({at:f.now,id:stream.pending,moving:stats.highTextureMoving});
    const texture={disposed:false,getSize:()=>({width:config.width,height:config.height}),dispose(){assert.equal(this.disposed,false,'dispose once');this.disposed=true;}};
    f.created.push(texture);return texture;
  };
  Object.assign(f,{world,camera,assets,stats,stream,profile});
  f.step=async({move=false,turn=false,drain=true}={})=>{
    if(move)camera.target.x+=.4;if(turn)camera.alpha+=.22;
    camera.getViewMatrix();camera.getProjectionMatrix();stream.update(f.now);
    if(drain&&stream.pendingTask)await stream.pendingTask;
    assert.ok(stats.highTextureBytes+stats.highTextureReserved<=stream.budget,'existing byte budget, including in-flight allocations');
    f.now+=250;
  };
  f.steps=async(n,options)=>{for(let i=0;i<n;i++)await f.step(options);};
  f.warm=async()=>{await f.steps(28);assert.equal(stream.resident.size,4);};
  t.after(()=>{stream.dispose();engine.dispose();});return f;
}

test('mobile translation alone spaces uploads and still reaches the same 4K tier while continuously moving',async t=>{
  const f=fixture(t);await f.step();await f.steps(32,{move:true});
  assert.equal(f.starts.length,4);assert.ok(f.starts.every(s=>s.moving));
  for(let i=1;i<f.starts.length;i++)assert.ok(f.starts[i].at-f.starts[i-1].at>=VILLAGE_TEXTURE_PACING.mobileMovingMs);
  assert.equal(f.stats.highTextureMax,4096);assert.equal(f.stats.highTextureMovingLoads,4);
  assert.equal(f.stats.highTextureBytes,4*highTextureBytes(f.profile));assert.equal(f.stats.highTextureReleases,0);
});

test('idle uploads are serial and paced from completion, including slow fetch/decode work',async t=>{
  const f=fixture(t),load=f.stream.loadTexture;let finish;
  f.stream.loadTexture=async(...args)=>{await new Promise(resolve=>finish=resolve);return load(...args);};
  await f.step();await f.step({drain:false});const first=f.stream.pendingTask;
  await f.steps(12,{drain:false});assert.equal(f.stream.pending,'asset0');assert.equal(f.starts.length,0);
  finish();await first;const completed=f.now;f.stream.loadTexture=load;
  await f.steps(3);assert.equal(f.starts.length,1,'no immediate burst after delayed completion');
  await f.step();assert.equal(f.starts.length,2);assert.ok(f.starts[1].at-completed>=VILLAGE_TEXTURE_PACING.mobileIdleMs);
});

test('six pan-and-return cycles keep existing maps rather than repeatedly freeing and decoding 4K textures',async t=>{
  const f=fixture(t);await f.warm();const old=[...f.stream.resident.values()].map(e=>e.textures.albedoTexture),count=f.starts.length;
  for(let cycle=0;cycle<6;cycle++){
    f.group=1-f.group;await f.steps(4,{turn:true});await f.steps(8);
    assert.equal(f.stats.highTextureReleases,0);assert.equal(f.starts.length,count);
    for(let i=0;i<4;i++)assert.equal(f.assets.get('asset'+i).source.materials[0].albedoTexture,old[i],'no base/high flash during a brief turn');
  }
  assert.equal(f.stats.highTexturePeak,4*highTextureBytes(f.profile));
});

test('a sustained new view eventually replaces all four maps within the budget and never changes mesh visibility',async t=>{
  const f=fixture(t);await f.warm();f.group=1;await f.steps(4,{turn:true});
  assert.equal(f.stats.highTextureReleases,0,'no early eviction before replacement is ready');
  await f.steps(40);
  assert.deepEqual([...f.stream.resident.keys()],['asset4','asset5','asset6','asset7']);
  assert.equal(f.stats.highTextureReleases,4);assert.equal(f.stats.highTextureMax,4096);assert.equal(f.stats.highTextureReserved,0);
  for(const record of f.stream.records){assert.equal(record.root.isEnabled(),true);assert.equal(record.meshes.length,1);assert.equal('isVisible' in record.meshes[0],false);}
});

test('a turn during an admitted upload keeps its reservation and finished texture instead of discarding and repeating work',async t=>{
  const f=fixture(t),load=f.stream.loadTexture;let finish;
  f.stream.loadTexture=async(...args)=>{await new Promise(resolve=>finish=resolve);return load(...args);};
  await f.step();await f.step({drain:false});const pending=f.stream.pendingTask,reserved=f.stats.highTextureReserved;
  f.group=1;await f.steps(4,{turn:true,drain:false});assert.equal(f.stats.highTextureReserved,reserved);
  finish();await pending;f.stream.loadTexture=load;assert.equal(f.stream.resident.has('asset0'),true);
  f.group=0;await f.steps(12);assert.equal(f.starts.filter(s=>s.id==='asset0').length,1);
});

test('texture dwell/cooldown leaves geometry streaming available and observes motion while a model is pending',async t=>{
  const f=fixture(t);await f.warm();f.group=1;
  let loaded=0;const geometry=new VillageGeometryStreaming(f.world,[],async()=>{loaded++;},()=>false,f.stats);
  geometry.active=true;geometry.demand.get=()=>[{id:'missing-tree',level:0}];t.after(()=>geometry.dispose());
  await f.step();assert.equal(f.stats.highTexturePending,0);geometry.update(f.now);await geometry.pending;assert.equal(loaded,1);
  f.world.villageStreaming.pending=Promise.resolve();await f.steps(20,{move:true});assert.equal(f.starts.length,4);
  assert.equal(f.stats.highTextureMoving,true);f.world.villageStreaming.pending=null;await f.steps(44,{move:true});
  const replacements=f.starts.slice(4);assert.equal(replacements.length,4);
  for(let i=1;i<replacements.length;i++)assert.ok(replacements[i].at-replacements[i-1].at>=2000);
});

test('map teardown during a pending texture disposes its allocation and releases every reservation',async t=>{
  const f=fixture(t),load=f.stream.loadTexture;let finish;
  f.stream.loadTexture=async(...args)=>{await new Promise(resolve=>finish=resolve);return load(...args);};
  await f.step();await f.step({drain:false});const pending=f.stream.pendingTask;
  f.stream.dispose();finish();await pending;
  assert.equal(f.stream.resident.size,0);assert.equal(f.stats.highTextureReserved,0);assert.equal(f.stats.highTexturePending,0);assert.ok(f.created.every(item=>item.disposed));
});

test('genuinely unused resident textures are reclaimed after the existing distance grace period',async t=>{
  const f=fixture(t);await f.warm();f.group=-1;await f.steps(52);
  assert.equal(f.stream.resident.size,0);assert.equal(f.stats.highTextureBytes,0);assert.equal(f.stats.highTextureReleases,4);
});

test('small screen-coverage fluctuations do not swap visible maps; a substantially closer asset still wins',async t=>{
  const f=fixture(t);await f.warm();let advantage=1.3;
  f.stream.records.forEach((r,i)=>{r.meshes[0].isInFrustum=()=>true;r.meshes[0].getBoundingInfo=()=>({boundingSphere:{centerWorld:f.camera.target,radiusWorld:i<4?2:2*Math.sqrt(advantage)}});});
  await f.steps(64);assert.equal(f.stats.highTextureReleases,0,'similar visible sizes retain existing maps even after dwell');
  advantage=2;await f.steps(32);assert.deepEqual([...f.stream.resident.keys()],['asset4','asset5','asset6','asset7']);
});

test('a recently promoted texture is not immediately evicted even by a sustained opposite view',async t=>{
  const f=fixture(t);await f.steps(12);assert.equal(f.stream.resident.size,4);f.group=1;
  await f.steps(12);assert.equal(f.stats.highTextureReleases,0,'minimum residency prevents early turnover');
  await f.steps(24);assert.equal(f.stats.highTextureReleases,4);
});

test('an upload failure preserves the base map, frees the reservation and is not retried on later turns',async t=>{
  const f=fixture(t),load=f.stream.loadTexture;let failures=0;t.mock.method(console,'warn',()=>{});
  f.stream.loadTexture=async(...args)=>{if(f.stream.pending==='asset0'){failures++;throw new Error('fixture decode failure');}return load(...args);};
  await f.steps(32);f.group=1;await f.steps(4,{turn:true});f.group=0;await f.steps(32);
  assert.equal(failures,1);assert.equal(f.assets.get('asset0').source.materials[0].albedoTexture.base,true);
  assert.equal(f.stats.highTextureReserved,0);assert.equal(f.stream.failed.has('asset0'),true);
});
