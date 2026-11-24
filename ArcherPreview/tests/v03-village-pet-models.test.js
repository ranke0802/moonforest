import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {FreeCamera,NullEngine,Scene,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import {PET_MODELS} from '../src/v03/village-pet-assets.js';
import {VILLAGE_PETS,createVillagePets} from '../src/v03/village-pets.js';
import {AmbientView} from '../src/ambient-view.js';

function nodeFixture(url){
  const bytes=readFileSync(url);
  const jsonLength=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const payload=bytes.subarray(28+jsonLength);
  // The original KTX2 is decoded offline in the visual check. NullEngine gets
  // the identical geometry, skin, animated transforms and PBR material.
  const p=doc.meshes[0].primitives[0],j=doc.skins[0].joints;
  assert.equal(doc.materials.length,1);assert.equal(doc.meshes.length,1);assert.ok(doc.accessors[p.indices].count/3<=6500);
  assert.deepEqual(doc.animations.map(a=>a.name),['Idle','Walk']);
  assert.ok(!(doc.extensionsUsed??[]).some(name=>/audio/i.test(name)));
  assert.ok(j.length===12||j.length===24);assert.ok(doc.extensionsRequired.includes('KHR_texture_basisu'));
  const image=doc.bufferViews[doc.images[0].bufferView],base=image.byteOffset;
  assert.equal(payload.readUint32LE(base+20),2048);assert.equal(payload.readUint32LE(base+40),12);
  const a=doc.accessors[p.attributes.WEIGHTS_0],i=doc.accessors[p.attributes.JOINTS_0];
  const weights=doc.bufferViews[a.bufferView].byteOffset,ids=doc.bufferViews[i.bufferView].byteOffset;
  for(let vertex=0;vertex<a.count;vertex++){
    let total=0;
    for(let ch=0;ch<4;ch++){
      total+=payload.readFloatLE(weights+16*vertex+4*ch);
      assert.ok(payload[ids+4*vertex+ch]<j.length);
    }
    assert.ok(Math.abs(total-1)<.00001);
  }
  delete doc.materials[0].pbrMetallicRoughness.baseColorTexture;delete doc.textures;delete doc.images;
  delete doc.extensionsRequired;delete doc.extensionsUsed;
  const json=Buffer.from(JSON.stringify(doc));const padded=Math.ceil(json.length/4)*4;
  const out=Buffer.alloc(28+padded+payload.length,32);bytes.copy(out,0,0,20);
  out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded,12);json.copy(out,20);
  out.writeUInt32LE(payload.length,20+padded);out.write('BIN\0',24+padded);payload.copy(out,28+padded);
  return out;
}

for(const config of VILLAGE_PETS)test(config.id+' uses its toy-sized rig, shared outline, measured gait and one map lifetime',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const url=PET_MODELS[config.id],bytes=nodeFixture(url);
  let reads=0;
  t.mock.method(globalThis,'fetch',async (u,options)=>{
    assert.equal(u.href,url.href);assert.equal(options.signal.aborted,false);reads++;return new Response(bytes);
  });
  const pets=createVillagePets({scene,navigation:{free:()=>true,segmentClear:()=>true},terrain:{heightAt:()=>0}},
    {models:{[config.id]:url},view:{prepare(){},hidden:()=>false}});
  try{
    const player={x:config.origin[0],z:config.origin[1]};pets.update(.016,player);
    for(let i=0;i<200&&!scene.getMeshByName(config.id+'-painted / silhouette');i++)await delay(5);
    assert.equal(reads,1);
    const body=scene.getMeshByName(config.id+'-painted'),shell=scene.getMeshByName(config.id+'-painted / silhouette');
    assert.ok(body&&shell);assert.ok(body.material.unlit&&body.material.metadata.moonforestMonsterToon);
    assert.equal(shell.skeleton,body.skeleton);assert.equal(shell.metadata.outlinePixels,.5);
    for(let i=0;i<170;i++)pets.update(1/60,player);
    assert.equal(scene.animationGroups.find(a=>a.name==='Walk').isPlaying,true);
    assert.equal(scene.skeletons.length,1);
    pets.dispose();assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
    assert.ok(body.isDisposed()&&shell.isDisposed());
  }finally{pets.dispose();scene.dispose();engine.dispose();}
});

test('an actual dog behind the camera stops its skin tracks; camera orbit restores the walking dog on that draw',async t=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.useRightHandedSystem=true;
  const cfg=VILLAGE_PETS[0],url=PET_MODELS[cfg.id],bytes=nodeFixture(url),[x,z]=cfg.origin;
  const player={x,z},nav={free:()=>true,segmentClear:()=>true};
  const camera=new FreeCamera('eye',new Vector3(x,.65,z-7),scene),front=new Vector3(x,.65,z),behind=new Vector3(x,.65,z-16);
  camera.minZ=.1;camera.setTarget(front);
  const world={scene,lighting:{key:{direction:new Vector3(0,-.05,-1)}},navigation:nav,terrain:{heightAt:()=>0}};
  let imports=0;t.mock.method(globalThis,'fetch',async()=>{imports++;return new Response(bytes);});
  const pets=createVillagePets(world,{models:{[cfg.id]:url}});
  try{
    pets.update(0,player);
    for(let i=0;i<200&&!scene.getMeshByName(cfg.id+'-painted / silhouette');i++)await delay(5);
    const body=scene.getMeshByName(cfg.id+'-painted'),shell=scene.getMeshByName(cfg.id+'-painted / silhouette');
    const gait=scene.animationGroups.find(g=>g.name==='Walk');
    const idle=scene.animationGroups.find(g=>g.name==='Idle');
    assert.ok(gait.targetedAnimations.length>0);
    assert.ok(gait.targetedAnimations.every(t=>t.animation.getEvents().length===0));
    assert.ok(idle.targetedAnimations.every(t=>t.animation.getEvents().length===0));
    for(let i=0;i<150;i++)pets.update(1/60,player);
    assert.equal(gait.isPlaying,true);
    const moving=body.parent.parent.position.clone();
    camera.setTarget(behind);
    const shadowView=new AmbientView();shadowView.prepare(world);
    assert.equal(shadowView.hidden(x,.5,z,1.3),false,'a real caster could still project its shadow into view');
    for(let i=0;i<30;i++)pets.update(1/60,player);
    assert.equal(gait.isPlaying,false);assert.equal(idle.isPlaying,false);assert.equal(body.isEnabled(),false);assert.equal(shell.isEnabled(),false);
    camera.setTarget(front);scene.render();
    assert.equal(gait.isPlaying,true);assert.equal(body.isEnabled(),true);assert.equal(shell.isEnabled(),true);
    const root=scene.getTransformNodeByName('v03-pet-'+cfg.id);
    const travelled=Vector3.Distance(root.position,moving);
    assert.ok(travelled>.05&&travelled<=cfg.speed*.5+.001,'reappears at the simulated location: '+travelled);
    assert.ok(gait.getCurrentFrame()>gait.from);
    assert.equal(imports,1);
    pets.dispose();assert.equal(scene.skeletons.length,0);assert.equal(scene.animationGroups.length,0);
  }finally{pets.dispose();scene.dispose();engine.dispose();}
});
