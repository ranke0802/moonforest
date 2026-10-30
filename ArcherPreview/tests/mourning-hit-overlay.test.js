import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {ElenaBrain,MOURNING_SIZE_SCALE} from '../src/elena-spec.js';
import {BossEncounter} from '../src/boss-encounter.js';
import {MourningHurtVolumes} from '../src/mourning-elena-hurt.js';
import {MeleeContactGate} from '../src/melee-collision.js';

const config=JSON.parse(readFileSync(new URL('../public/assets/mourning-elena.json',import.meta.url)));
const close=(a,b,label,tolerance=2e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} vs ${b}`);
const error=(a,b)=>!a||!b?a===b?0:Infinity:Math.min(Math.hypot(...a.asArray().map((n,i)=>n-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((n,i)=>n+b.asArray()[i])):Infinity);
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(a,b))))*180/Math.PI;

async function fixture(t){
  const source=await readRuntimeGltf(new URL(config.model,new URL('../public/assets/',import.meta.url))),gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  for(const group of container.animationGroups)group.stop();
  const instances=Array.from({length:2},(_,i)=>{
    const asset=instantiateBossModel(container),actor=new TransformNode('hit-test-'+i,scene),carrier=new TransformNode('hit-center-'+i,scene);
    carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);
    for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
    const animator=new MourningElenaAnimator(asset,config,actor),nodes=new Map(asset.transformNodes.map(n=>[n.name,n]));
    return {asset,actor,animator,nodes};
  });
  t.after(()=>{for(const f of instances)f.animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  return {scene,a:instances[0],b:instances[1]};
}
function step(pair,state,frames=1,{start=0,actionId=1,staggerRemaining=0,rate=1.6}={}){
  for(let frame=0;frame<frames;frame++)for(const f of [pair.a,pair.b]){
    f.animator.transition(state,{clipTime:start+frame/60*rate,actionId,staggerRemaining});f.animator.update(1/60);
  }
}
function sameClocks(a,b){for(const name of ['current','castTime','walkTime','idleTime','hairTime','breathClock','haloTime','gaitBlend','gaitRate','actionId','hitTime','staggerRemaining'])assert.equal(a.animator[name],b.animator[name],name);}
function sameUnaffected(a,b,allowed){
  for(const [name,node] of a.nodes){
    const other=b.nodes.get(name);
    for(const property of ['position','scaling','rotationQuaternion']){
      if(property==='rotationQuaternion'&&(allowed.has(name)||name.startsWith('DEF_HaloCloth_')))continue;
      assert.ok(error(node[property],other[property])<2e-6,`${name}/${property}`);
    }
  }
}
function sameMorphs(a,b){assert.deepEqual(a.animator.morphs.map(m=>[m.name,m.influence]),b.animator.morphs.map(m=>[m.name,m.influence]));}
function counts(scene){return {meshes:scene.meshes.length,nodes:scene.transformNodes.length,groups:scene.animationGroups.length,skeletons:scene.skeletons.length,managers:scene.morphTargetManagers.length,animatables:scene.animatables.length};}

test('real r8 ordinary-hit overlay preserves action clocks, feet, cast hands and resource counts',async t=>{
  const pair=await fixture(t),{a,b,scene}=pair;
  await t.test('idle and walking show the authored upper-body recoil while the lower body continues unchanged',()=>{
    for(const state of ['idle','walk']){
      a.animator.reset();b.animator.reset();step(pair,state,60);const walkBefore=a.animator.walkTime;
      assert.equal(a.animator.reactToHit(),true);step(pair,state,8);
      assert.ok(angle(a.nodes.get('DEF_Chest').rotationQuaternion,b.nodes.get('DEF_Chest').rotationQuaternion)>4,'visible chest recoil');
      assert.ok(angle(a.nodes.get('DEF_Head').rotationQuaternion,b.nodes.get('DEF_Head').rotationQuaternion)>3,'visible head recoil');
      sameClocks(a,b);sameMorphs(a,b);sameUnaffected(a,b,new Set(['DEF_Chest','DEF_Neck','DEF_Head']));
      assert.equal(a.animator.hitActive,false);assert.ok(a.animator.hitPulseWeight>0);
      if(state==='walk')assert.notEqual(a.animator.walkTime,walkBefore,'the gait is not frozen by a hit');
      step(pair,state,24);sameUnaffected(a,b,new Set());sameClocks(a,b);close(a.animator.hitPulseWeight,0,'pulse ends');
    }
  });
  await t.test('a normal hit during all cast phases leaves prayer hands, casting palm and every morph exactly on the unhit pose',()=>{
    const hands=['DEF_Prayer_UpperArm.L','DEF_Prayer_UpperArm.R','DEF_FrontHand.L_Palm'];
    for(const start of [0,.35,1.18,1.82,2.45]){
      a.animator.reset();b.animator.reset();step(pair,'cast',1,{start});a.animator.reactToHit();step(pair,'cast',8,{start});
      sameClocks(a,b);sameMorphs(a,b);sameUnaffected(a,b,new Set(['DEF_Neck','DEF_Head']));
      assert.ok(angle(a.nodes.get('DEF_Head').rotationQuaternion,b.nodes.get('DEF_Head').rotationQuaternion)>3,'head recoil during casting');
      for(const name of hands){const x=a.nodes.get(name),y=b.nodes.get(name);assert.ok(x&&y,name);assert.ok(error(x.absolutePosition,y.absolutePosition)<2e-5,name+' world position');assert.ok(error(x.absoluteRotationQuaternion,y.absoluteRotationQuaternion)<2e-6,name+' world rotation');}
      assert.equal(a.animator.current,'cast');assert.equal(a.animator.hitActive,false);
    }
  });
  await t.test('full shield/heavy stagger takes priority; death and a pooled reset clear the overlay',()=>{
    a.animator.reset();b.animator.reset();step(pair,'cast',1,{start:1.2});a.animator.reactToHit();step(pair,'cast',5,{start:1.2,staggerRemaining:.5});
    assert.equal(a.animator.hitActive,true);assert.equal(a.animator.reactToHit(),false);close(a.animator.hitPulseWeight,0,'full hit owns the pose');sameUnaffected(a,b,new Set());sameClocks(a,b);
    a.animator.transition('idle');b.animator.transition('idle');a.animator.reactToHit();a.animator.transition('dead');assert.equal(a.animator.reactToHit(),false);close(a.animator.hitPulseWeight,0,'dead clears overlay');
    a.animator.reset();b.animator.reset();sameUnaffected(a,b,new Set());assert.equal(a.animator.hitPulseCount,0);
  });
  await t.test('real gameplay contact triggers one visual pulse without resetting the active cast; misses and duplicate contacts do not',()=>{
    a.animator.reset();a.animator.transition('cast',{clipTime:1.2,actionId:10});a.animator.sample(0);
    const nodes=Object.fromEntries(a.nodes),brain=new ElenaBrain(a.animator.durations,{mourning:true}),volumes=new MourningHurtVolumes(nodes,MOURNING_SIZE_SCALE);
    nodes['mixamorig:Head']=nodes.DEF_Head;brain.cast();brain.time=1.2;
    const player=new TransformNode('overlay-contact-player',scene);player.position.set(0,0,4);
    const encounter={active:true,corpseGone:false,actor:a.actor,animator:a.animator,asset:a.asset,brain,nodes,poseNodes:a.animator.poseNodes,playerAlive:true,radius:1.9,dt:1/60,hitCount:0,
      world:{},pendingEvents:[],combat:{},grab:{active:false,update(){}},gate:new MeleeContactGate(),knockVelocity:new Vector3(),
      alignPose:()=>a.animator.refreshPose(),contactSeparation:()=>2.15,hurtCapsules:()=>volumes.sample(),onDamage(){},onChange(){}};
    const contact={actionId:101,window:{id:'one',damage:10},blade:volumes.sample()[0].points.map(p=>[...p])};
    const before={hp:brain.hp,serial:brain.serial,time:brain.time};
    BossEncounter.prototype.poseAndContacts.call(encounter,player,{state:'idle'},contact,null);
    assert.equal(brain.hp,before.hp-10);assert.equal(brain.serial,before.serial);assert.equal(brain.time,before.time);assert.equal(brain.mode,'attack');assert.equal(brain.stagger,0);assert.ok(brain.flash>0);assert.equal(a.animator.hitPulseCount,1);
    BossEncounter.prototype.poseAndContacts.call(encounter,player,{state:'idle'},contact,null);assert.equal(a.animator.hitPulseCount,1,'same strike is deduplicated by the real gate');
    encounter.gate.reset();const miss={...contact,actionId:102,blade:[[50,1,50],[51,1,50]]};
    BossEncounter.prototype.poseAndContacts.call(encounter,player,{state:'idle'},miss,null);assert.equal(a.animator.hitPulseCount,1,'a miss cannot trigger visual hit feedback');
    a.animator.update(.1);assert.ok(a.animator.hitPulseWeight>0);assert.equal(a.animator.current,'cast');
    encounter.gate.reset();BossEncounter.prototype.poseAndContacts.call(encounter,player,{state:'idle'},{...contact,actionId:103,window:{id:'lethal',damage:9999}},null);
    assert.equal(brain.hp,0);assert.equal(a.animator.hitPulseCount,1,'lethal contact belongs to death, not another recoil');player.dispose();
  });
  await t.test('rapid repeated hits do not accumulate rotations, allocate rig objects or bypass distant sampling cleanup',()=>{
    a.animator.reset();b.animator.reset();const before=counts(scene),entries=a.animator.hitOverlay.map(c=>[c,c.inverse,c.delta,c.weighted]);
    for(let frame=0;frame<600;frame++){
      const state=frame%180<90?'walk':'cast';if(frame%5===0)a.animator.reactToHit();step(pair,state,1,{start:frame%90/90*3});
      sameClocks(a,b);sameMorphs(a,b);
      for(const c of a.animator.hitOverlay){assert.ok(c.target.rotationQuaternion.asArray().every(Number.isFinite));close(c.target.rotationQuaternion.length(),1,'normalized rotation');}
    }
    assert.deepEqual(counts(scene),before);assert.equal(a.animator.hitPulseCount,120);
    for(let i=0;i<entries.length;i++)assert.deepEqual([a.animator.hitOverlay[i],a.animator.hitOverlay[i].inverse,a.animator.hitOverlay[i].delta,a.animator.hitOverlay[i].weighted],entries[i]);
    a.animator.reset();b.animator.reset();a.animator.sampleInterval=1;b.animator.sampleInterval=1;
    a.animator.reactToHit();const sampled=a.animator.samples;step(pair,'idle',24);assert.ok(a.animator.samples>=sampled+23,'active recoil and its last cleanup pose sample even at a lower resident rate');assert.equal(a.animator.hitPulseWeight,0);
    a.animator.sample(0);b.animator.sample(0);sameUnaffected(a,b,new Set());
  });
});
