import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {MourningElenaAnimator,mourningMorphs} from '../src/mourning-elena-animation.js';
import {deathHaloAdvance,deathHaloSpeedAt,windAt,shotWeight} from '../src/mourning-motion-v2.js';
import {MOURNING_SIZE_SCALE} from '../src/elena-spec.js';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);},close=(a,b,label='value',epsilon=3e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${label}: ${a} != ${b}`);
const error=(a,b)=>Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i])):Infinity);
let packed;
async function fixture(t){
 packed??=readRuntimeGltf(new URL(config.model,base));const source=await packed,gltf=structuredClone(source.gltf);
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const g of asset.animationGroups)g.stop();asset.addAllToScene();
 const actor=new TransformNode('r9-actor',scene),carrier=new TransformNode('r9-center',scene);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
 const animator=new MourningElenaAnimator(asset,config,actor);t.after(()=>{animator.dispose();asset.dispose();loader.dispose();scene.dispose();engine.dispose();});return {scene,asset,actor,animator};
}
const counts=f=>[f.scene.meshes.length,f.scene.transformNodes.length,f.scene.animationGroups.length,f.scene.skeletons.length,f.scene.morphTargetManagers.length,f.scene.animatables.length];
function sourceDeathValues(t){
 const cry=smooth((t-.30)/.65)*(1-smooth((t-2.10)/1)),settle=smooth((t-2)/1.9);
 return {Death_Scream:cry,Death_Hair_Cry:cry*(1-settle),Death_Hair_Settle:settle,Death_Ground_Contact:(.055*smooth(t/.65)+.13*smooth((t-.60)/2.5))/.185,Death_Ground_Early:smooth(t/.65)*(1-smooth((t-1.5)/1.4))};
}
function living(animator,state){
 animator.reset();animator.transition('walk');animator.update(.41);
 if(state==='pulse'){animator.transition('walk');animator.reactToHit();animator.update(.08);}
 else if(state==='hit'){animator.transition('hit',{staggerRemaining:1});animator.update(.31);}
 else {animator.transition(state,{clipTime:state==='cast'?1.22:0});animator.update(.19);}
}
function assertDeathPose(animator,time){
 const procedural=new Set(animator.halo.map(c=>c.target.uniqueId+':'+c.property)),weight=smooth(time/.18);
 for(const c of animator.deathChannels){
  if(c.target.name.startsWith('DEF_HaloCloth_')||procedural.has(c.target.uniqueId+':'+c.property))continue;
  const expected=c.from.clone(),source=c.track.sample(time);
  if(c.property==='rotationQuaternion')Quaternion.SlerpToRef(c.from,source,weight,expected);else Vector3.LerpToRef(c.from,source,weight,expected);
  assert.ok(error(c.target[c.property],expected)<5e-6,`${c.target.name}/${c.property} at ${time}`);
 }
}

test('r9 wind and death morphs match the supplied formulas at boundaries and in-betweens',()=>{
 const out={};
 for(let t=0;t<=5.201;t+=.013){
  const values=mourningMorphs({dying:true,deathTime:t,castWeight:0},out);assert.equal(values,out);
  for(const [name,value]of Object.entries(sourceDeathValues(t)))close(values[name],value,name);
  assert.ok(Object.values(values).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 }
 for(const t of [0,.12,.25,.78,1.18,1.75,2.3,2.78,3]){
  const expected=smooth((t-.12)/.66)*(1-smooth((t-1.75)/1.03));close(windAt(t),expected);close(mourningMorphs({casting:true,castTime:t}).Hair_Cast_Wind,expected*shotWeight(t,3,.18,.25));
 }
 close(deathHaloSpeedAt(0),1);close(deathHaloSpeedAt(2.8),0);close(deathHaloSpeedAt(9),0);close(deathHaloAdvance(0,5.2),1.4);
 for(const [name,value]of Object.entries(mourningMorphs()))if(name.startsWith('Death_'))assert.equal(value,0);
});

test('real r9 death captures each live pose, advances independently of cast speed, and holds its final pose',async t=>{
 const f=await fixture(t),{animator,asset}=f;
 assert.equal(asset.animationGroups.length,8);assert.equal(animator.deathDuration,5.2);assert.equal(animator.mouthMeshes.length,1);
 assert.equal(animator.mouthMeshes[0].getTotalIndices()/3,96);assert.equal(animator.mouthMeshes[0].isEnabled(),false);
 const dead=asset.animationGroups.find(g=>g.name==='Chimera_Death_Lament_5p2s');assert.ok(dead);close(dead.to/dead.targetedAnimations[0].animation.framePerSecond,5.2);
 const sourceTracks=new Map(dead.targetedAnimations.map(c=>[c.target.uniqueId+':'+c.animation.targetProperty,c.animation]));
 let formerlyFixedChanged=0,maxError=0;
 for(const c of animator.deathChannels)for(const time of [.09,.18,.65,1.3,2.8,5.2]){const original=sourceTracks.get(c.target.uniqueId+':'+c.property).evaluate(time*c.track.fps),difference=error(c.track.sample(time),original);maxError=Math.max(maxError,difference);assert.ok(difference<3e-6);}
 for(const fps of [30,60])for(const state of ['idle','walk','cast','hit','pulse']){
  living(animator,state);const frozen={walk:animator.walkTime,hair:animator.hairTime,idle:animator.idleTime,breath:animator.breathClock,hit:animator.hitTime},halo=animator.haloTime;
  animator.transition('dead',{clipTime:999,actionId:90});assert.equal(animator.deathTime,0);assert.equal(animator.reactToHit(),false);close(animator.hitPulseWeight,0);animator.sample(0);assertDeathPose(animator,0);
  animator.update(.09);assertDeathPose(animator,.09);close(animator.deathWeight,.5);
  animator.update(.09);assertDeathPose(animator,.18);close(animator.deathWeight,1);
  const from=animator.deathTime;
  for(let frame=0;frame<Math.ceil((5.2-from)*fps);frame++){
   animator.transition('dead',{clipTime:100+frame/fps*3.2,actionId:90});animator.update(1/fps);
   if(frame%37===0){assertDeathPose(animator,animator.deathTime);for(const n of animator.poseNodes)assert.ok(n.getAbsolutePosition().asArray().every(Number.isFinite));}
  }
  animator.update(.001);close(animator.deathTime,5.2);assert.equal(animator.deathFinished,true);assert.equal(animator.finished,true);assertDeathPose(animator,5.2);
  close((animator.haloTime-halo+48)%48,1.4,'continuous death halo advance');close(animator.haloSpeed,0);
  assert.deepEqual({walk:animator.walkTime,hair:animator.hairTime,idle:animator.idleTime,breath:animator.breathClock,hit:animator.hitTime},frozen);
  for(const target of animator.morphs){const expected=sourceDeathValues(5.2)[target.name];if(expected!==undefined)close(target.influence,expected,target.name);else close(target.influence,0,target.name);}
  assert.equal(animator.mouthMeshes[0].isEnabled(),false);const pose=animator.deathChannels.map(c=>c.target[c.property].asArray()),samples=animator.samples;
  animator.transition('walk');animator.update(20);assert.equal(animator.current,'dead');assert.equal(animator.samples,samples);assert.deepEqual(animator.deathChannels.map(c=>c.target[c.property].asArray()),pose);
  for(const c of animator.fixed)if(error(c.target[c.property],c.walk.keys[0].value)>1e-6)formerlyFixedChanged++;
  animator.reset();assert.equal(animator.deathFinished,false);assert.equal(animator.deathTime,0);for(const c of animator.fixed)assert.ok(error(c.target[c.property],c.walk.keys[0].value)<1e-6,'reset restores a formerly fixed live channel');
 }
 for(const fps of [30,60]){animator.reset();animator.transition('dead');for(let i=0;i<5.2*fps;i++)animator.update(1/fps);assert.equal(animator.deathFinished,true,'exact 5.2 second frame boundary must not require an extra frame');assert.equal(animator.deathTime,5.2);}
 assert.ok(formerlyFixedChanged>0,'death really moves channels skipped by the live fixed cache');t.diagnostic(JSON.stringify({poses:10,fps:[30,60],deathSeconds:5.2,maxSourceTrackError:maxError,formerlyFixedChanged,deathChannels:animator.deathChannels.length}));
});

test('r9 mouth shares the exact scream weight and world cloth compensates rotating parents immediately',async t=>{
 const {animator,actor}=await fixture(t),mouth=animator.mouthMeshes[0],bodyScream=animator.morphs.find(m=>m.name==='Death_Scream'),mouthScream=mouth.morphTargetManager.getTarget(0);
 living(animator,'cast');animator.transition('dead');animator.update(.95);
 close(bodyScream.influence,1);close(mouthScream.influence,bodyScream.influence);assert.equal(mouth.isEnabled(),true);
 mouth.isVisible=false;animator.sample(0);assert.equal(mouth.isVisible,false,'logical mouth gate preserves FoW/range visibility');mouth.isVisible=true;
 for(const yaw of [0,.8,2.7]){
  const before=animator.cloth.map(c=>c.worldQ.clone());actor.rotation.y=yaw;animator.haloTime+=7;animator.sample(0);
  animator.cloth.forEach((c,i)=>{assert.ok(error(c.bone.absoluteRotationQuaternion,before[i])<5e-6,'same-frame parent change cannot tilt world cloth');assert.ok(Vector3.Up().applyRotationQuaternion(c.bone.absoluteRotationQuaternion).y<-.99);});
 }
 const time=animator.deathTime;animator.dispose();animator.update(2);close(animator.deathTime,time);animator.transition('dead',{clipTime:0});animator.update(.1);close(animator.deathTime,time+.1,'resume retains time');
 animator.reset();assert.equal(mouth.isEnabled(),false);for(const target of animator.morphs)if(target.name.startsWith('Death_'))assert.equal(target.influence,0);
});

test('r9 repeated cast/death/reset reuses tracks, morph state and world-cloth buffers with bounded retained resources',async t=>{
 const f=await fixture(t),{animator}=f,baseline=counts(f),references=[animator.deathChannels,animator.morphState,animator.morphValues,...animator.deathChannels.flatMap(c=>[c.from,c.track.value]),...animator.cloth.map(c=>c.worldQ)];
 const cycle=()=>{living(animator,'cast');for(let i=0;i<114;i++){animator.transition('cast',{clipTime:Math.min(3,i/60*1.6)});animator.update(1/60);}animator.transition('dead');for(let i=0;i<157;i++)animator.update(1/30);assert.equal(animator.finished,true);animator.reset();};
 for(let i=0;i<3;i++)cycle();global.gc?.();const heapBefore=process.memoryUsage().heapUsed,start=performance.now();for(let i=0;i<20;i++)cycle();const elapsed=performance.now()-start;global.gc?.();const heapDelta=process.memoryUsage().heapUsed-heapBefore;
 assert.deepEqual(counts(f),baseline);const after=[animator.deathChannels,animator.morphState,animator.morphValues,...animator.deathChannels.flatMap(c=>[c.from,c.track.value]),...animator.cloth.map(c=>c.worldQ)];after.forEach((value,i)=>assert.equal(value,references[i]));if(global.gc)assert.ok(heapDelta<8*1024*1024,`retained heap growth ${heapDelta}`);
 t.diagnostic(JSON.stringify({scope:'CPU animation only; no device/GPU claim',cycles:20,frames:20*271,meanFrameMs:elapsed/(20*271),explicitGC:!!global.gc,retainedHeapDelta:heapDelta,reusedObjects:references.length,resources:baseline}));
});
