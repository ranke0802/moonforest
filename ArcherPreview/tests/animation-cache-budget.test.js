import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Animation,AnimationEvent,AnimationGroup,NullEngine,Quaternion,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {CharacterAnimator} from '../src/animation.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';

// Shipped warrior TRS tracks and hierarchy, with no texture/GPU or second clock.
const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('warrior-v3.json',base)));
const {gltf,files}=await readRuntimeGltf(new URL(config.model,base));
const property={translation:'position',rotation:'rotationQuaternion',scale:'scaling'};
const vector=(path,value)=>path==='rotation'?Quaternion.FromArray(value):Vector3.FromArray(value);
const tracks=gltf.animations.map(clip=>({name:clip.name,channels:clip.channels.map(channel=>{
 const sampler=clip.samplers[channel.sampler],read=index=>{const accessor=gltf.accessors[index],width={SCALAR:1,VEC3:3,VEC4:4}[accessor.type],values=readAccessor(gltf,files,index);return Array.from({length:accessor.count},(_,i)=>Array.from(values.subarray(i*width,(i+1)*width)));};
 assert.ok(['LINEAR','STEP'].includes(sampler.interpolation??'LINEAR'));
 return {...channel.target,interpolation:sampler.interpolation??'LINEAR',times:read(sampler.input).flat(),values:read(sampler.output)};
})}));
function fixture(limit,configure=()=>{},options={}){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const nodes=gltf.nodes.map(n=>{const node=new TransformNode(n.name,scene);node.position.copyFromFloats(...(n.translation??[0,0,0]));node.rotationQuaternion=Quaternion.FromArray(n.rotation??[0,0,0,1]);node.scaling.copyFromFloats(...(n.scale??[1,1,1]));return node;});
 gltf.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>nodes[child].parent=nodes[i]));
 const groups=tracks.map(clip=>{const group=new AnimationGroup(clip.name,scene);for(const channel of clip.channels){
  const animation=new Animation(clip.name+'-'+channel.node+'-'+channel.path,property[channel.path],60,channel.path==='rotation'?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3);
  animation.setKeys(channel.times.map((time,i)=>({frame:time*60,value:vector(channel.path,channel.values[i]),...(channel.interpolation==='STEP'?{interpolation:1}:{})})));group.addTargetedAnimation(animation,nodes[channel.node]);
 }return group;});
 configure(groups,nodes);
 let nativeStarts=0;const start=scene.beginDirectAnimation.bind(scene);scene.beginDirectAnimation=(...args)=>{nativeStarts++;return start(...args);};
 const animator=new CharacterAnimator(groups,config.animations,{bindingCacheSize:limit,...options}),sampler=new PlayerStrikeSampler(),sword=nodes.find(node=>node.name==='Golden_Oathblade'),shield=nodes.find(node=>node.name==='Bunnyguard_Shield');
 return {engine,scene,nodes,groups,animator,sampler,sword,shield,get nativeStarts(){return nativeStarts;},dispose(){animator.dispose();assert.equal(scene._activeAnimatables.length,0);for(const group of groups)for(const {animation}of group.targetedAnimations)assert.equal(animation.runtimeAnimations.length,0);scene.dispose();engine.dispose();}};
}
function worldPose(f){return f.nodes.flatMap(node=>Array.from(node.computeWorldMatrix(true).m));}
function comparePose(a,b){let error=0;for(let i=0;i<a.length;i++)error=Math.max(error,Math.abs(a[i]-b[i]));assert.ok(error<2e-5,`world pose error ${error}`);return error;}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const loops=[
 'run','idle','slash','attack','idle','run','dodge','run','idle','shieldPush','idle','slash','attack','idle','judgment','idle','run','dodge','run','idle','slash','attack','idle','shieldPush','idle','run','idle',
];

test('real warrior 2/4/6 cache comparison preserves recurring movement/roll/bash/light/heavy poses and strike sweeps',t=>{
 const candidates=[0,2,4,6].map(limit=>fixture(limit)),rows=candidates.map(f=>({limit:f.animator.bindingCacheSize,peakCached:0,peakBindings:0,peakActiveClips:0,maxWorldMatrixError:0,transitionSampleMs:[]}));
 let frames=0,transitions=0,actionId=0,strikeSweepSamples=0;const contactStates=new Set();
 try{
  for(const f of candidates.slice(1))assert.equal(f.animator.inspectBindingCache().eligible,true);
  // A fixed transition workload: locomotion/idle recur between real actions.
  // Sweep authoritative source time across contact windows while fade dt stays
  // 60Hz; this is not a claim about action duration or player frequencies.
  for(let cycle=0;cycle<6;cycle++)for(const state of loops){
   transitions++;actionId++;
   for(let frame=0;frame<12;frame++){
    const result={state,clipTime:(frame+1)/12*Math.min(1.8,candidates[0].animator.durations[state]),actionId,loop:['idle','run'].includes(state),blendDuration:.1};
    let referencePose,referenceStrike;
    for(const [index,f]of candidates.entries()){
     const started=performance.now();f.animator.transition(state,result);f.animator.update(1/60);f.scene._animate(0);if(frame===0)rows[index].transitionSampleMs.push(performance.now()-started);
     const pose=worldPose(f),strike=f.sampler.sample(result,f.sword,f.shield);
     if(index===0){referencePose=pose;referenceStrike=strike;strikeSweepSamples+=strike?.contacts.length??0;if(strike?.contacts.length)contactStates.add(state);}else{rows[index].maxWorldMatrixError=Math.max(rows[index].maxWorldMatrixError,comparePose(referencePose,pose));assert.deepEqual(strike,referenceStrike);}
     const snapshot=f.animator.inspectBindingCache(),row=rows[index];row.peakCached=Math.max(row.peakCached,snapshot.cached);row.peakBindings=Math.max(row.peakBindings,snapshot.currentBindings);row.peakActiveClips=Math.max(row.peakActiveClips,f.animator.active.size);
     assert.ok(snapshot.cached<=row.limit);assert.equal(f.scene._activeAnimatables.length,snapshot.currentBindings);
     for(const entry of f.animator.bindingCache.values())assert.ok(entry.group.animatables.every(native=>native.paused&&native.weight===0));
    }
    frames++;
   }
  }
  for(const [i,f]of candidates.entries()){
   const snapshot=f.animator.inspectBindingCache(),row=rows[i];assert.equal(snapshot.created,f.nativeStarts);Object.assign(row,snapshot,{retainedBindings:snapshot.currentBindings,medianTransitionSampleMs:median(row.transitionSampleMs.slice(27))});delete row.transitionSampleMs;
  }
  assert.ok(rows[1].created<rows[0].created);assert.ok(rows[2].created<rows[1].created);assert.ok(rows[3].created<=rows[2].created);assert.ok(strikeSweepSamples>0);assert.deepEqual([...contactStates].sort(),['attack','judgment','shieldPush','slash']);
  t.diagnostic(JSON.stringify({scope:'CPU-only Babylon NullEngine with shipped warrior TRS/hierarchy; counts and phase-sampled pose/strike equivalence, not GPU/FPS/thermal evidence',frames,transitions,strikeSweepSamples,contactStates:[...contactStates],states:[...new Set(loops)],rows}));
 }finally{for(const f of candidates)f.dispose();}
});

test('real warrior rapid superseded fades remain normalized and bounded at cache sizes 2/4/6',t=>{
 const fixtures=[0,2,4,6].map(limit=>fixture(limit)),rows=fixtures.map(f=>({limit:f.animator.bindingCacheSize,maxActive:0,maxCached:0,maxBindings:0,maxWorldMatrixError:0}));
 try{
  const states=['idle','run','slash','attack','dodge','shieldPush','judgment'];
  for(let frame=0;frame<140;frame++){
   const state=states[frame%states.length],result={clipTime:.1+frame/1000,actionId:frame,blendDuration:.14};let reference;
   for(const [i,f]of fixtures.entries()){
    f.animator.transition(state,result);f.animator.update(.02);f.scene._animate(0);const pose=worldPose(f);if(i===0)reference=pose;else rows[i].maxWorldMatrixError=Math.max(rows[i].maxWorldMatrixError,comparePose(reference,pose));
    assert.ok(Math.abs([...f.animator.active.values()].reduce((sum,entry)=>sum+entry.weight,0)-1)<1e-7);
    const snapshot=f.animator.inspectBindingCache(),row=rows[i];assert.ok(snapshot.cached<=row.limit);row.maxActive=Math.max(row.maxActive,f.animator.active.size);row.maxCached=Math.max(row.maxCached,snapshot.cached);row.maxBindings=Math.max(row.maxBindings,snapshot.currentBindings);
   }
  }
  t.diagnostic(JSON.stringify({scope:'140 rapid fades; active blends are preserved independently of inactive cache budget',rows}));
 }finally{for(const f of fixtures)f.dispose();}
});

test('cache budget is bounded by the clip count and event/sparse/additive/blending safeguards still reject reuse',()=>{
 for(const [requested,expected]of [[2,2],[4,4],[6,6],[100,Object.keys(config.animations).length],[-1,0],[NaN,0]]){const f=fixture(requested);try{assert.equal(f.animator.bindingCacheSize,expected);}finally{f.dispose();}}
 for(const kind of ['event','sparse','additive','blending','group-observer','native-observer']){
  const f=fixture(6,groups=>{if(kind==='sparse'){const group=groups.find(group=>group.name===config.animations.idle);group.removeTargetedAnimation(group.targetedAnimations[0].animation);}});let callbacks=0;
  try{
   const group=f.animator.clips.idle;
   if(kind==='event')group.targetedAnimations[0].animation.addEvent(new AnimationEvent(1,()=>callbacks++));
   if(kind==='sparse')assert.equal(f.animator.bindingCacheCompatible,false,'constructor rejects incomplete channels without forcing its proof');
   if(kind==='additive')group.isAdditive=true;
   if(kind==='blending')group.enableBlending=true;
   if(kind==='group-observer')group.onAnimationGroupEndObservable.add(()=>callbacks++);
   f.animator.transition('idle',{clipTime:.1});f.animator.update(.2);f.scene._animate(0);
   if(kind==='native-observer')group.animatables[0].onAnimationEndObservable.add(()=>callbacks++);
   f.animator.transition('run',{clipTime:.1,blendDuration:.1});f.animator.update(.2);f.scene._animate(0);
   assert.equal(f.animator.bindingCache.has('idle'),false,kind);assert.equal(group.animatables.length,0,kind);if(kind.endsWith('observer'))assert.equal(callbacks,1,kind);
  }finally{f.dispose();}
 }
});

test('a late observer at cache size six gets a fresh binding without a stale completion',()=>{
 const f=fixture(6);let ended=0;
 const step=state=>{f.animator.transition(state,{clipTime:.2,blendDuration:.1});f.animator.update(.2);f.scene._animate(0);};
 try{
  step('idle');step('run');assert.equal(f.animator.bindingCache.has('idle'),true);const before=f.animator.inspectBindingCache(),group=f.animator.clips.idle;
  group.onAnimationGroupEndObservable.add(()=>ended++);step('idle');assert.equal(ended,0);assert.equal(f.animator.inspectBindingCache().created,before.created+group.targetedAnimations.length);
  step('run');assert.equal(ended,1);assert.equal(f.animator.bindingCache.has('idle'),false);
 }finally{f.dispose();}
});

test('prewarmed player bindings: every clip switch after loading reuses native animatables with identical poses/strikes',t=>{
 const clipCount=Object.keys(config.animations).length,reference=fixture(0),warm=fixture(clipCount,()=>{},{prewarmBindings:true});
 try{
  const states=Object.keys(config.animations);assert.ok(states.length>=9);
  const snapshot=warm.animator.inspectBindingCache(),tracksPerClip=warm.animator.clips.idle.targetedAnimations.length;
  assert.equal(snapshot.eligible,true);assert.equal(snapshot.cached,clipCount);assert.equal(warm.nativeStarts,clipCount*tracksPerClip);assert.equal(snapshot.created,clipCount*tracksPerClip);assert.equal(snapshot.prewarmed,clipCount*tracksPerClip);
  assert.equal(warm.scene._activeAnimatables.length,clipCount*tracksPerClip);
  assert.ok(warm.scene._activeAnimatables.every(native=>native.paused&&native.weight===0));
  const warmed=new Set(warm.scene._activeAnimatables),runtimeBefore=warm.groups.reduce((sum,group)=>sum+group.targetedAnimations.reduce((n,{animation})=>n+animation.runtimeAnimations.length,0),0);
  // Every ordered pair of clips, plus the combat loop, with interrupted fades.
  const sequence=[];for(const a of states)for(const b of states)if(a!==b)sequence.push(a,b);sequence.push(...loops);
  let actionId=0,maxError=0,strikes=0;
  for(const [i,state]of sequence.entries()){
   actionId++;const frames=i%5===0?2:6;
   for(let frame=0;frame<frames;frame++){
    const result={state,clipTime:(frame+1)/6*Math.min(1.5,reference.animator.durations[state]),actionId,loop:['idle','run'].includes(state),blendDuration:.1};
    let pose;
    for(const f of [reference,warm]){f.animator.transition(state,result);f.animator.update(1/60);f.scene._animate(0);}
    pose=worldPose(reference);const other=worldPose(warm);for(let k=0;k<pose.length;k++)maxError=Math.max(maxError,Math.abs(pose[k]-other[k]));
    const a=reference.sampler.sample(result,reference.sword,reference.shield),b=warm.sampler.sample(result,warm.sword,warm.shield);assert.deepEqual(b,a);strikes+=a?.contacts.length??0;
    assert.ok(Math.abs([...warm.animator.active.values()].reduce((sum,entry)=>sum+entry.weight,0)-1)<1e-7);
    for(const state of warm.animator.active.keys())assert.ok(Math.abs(warm.animator.active.get(state).weight-reference.animator.active.get(state).weight)<1e-12);
    assert.deepEqual([...warm.animator.active.keys()],[...reference.animator.active.keys()]);
   }
  }
  assert.ok(maxError<2e-5,`world pose error ${maxError}`);assert.ok(strikes>0);
  const after=warm.animator.inspectBindingCache();
  assert.equal(warm.nativeStarts,clipCount*tracksPerClip,'no Babylon start after warm-up');assert.equal(after.created,snapshot.created);assert.equal(after.evicted,0);assert.ok(after.reused>0);
  assert.equal(warm.scene._activeAnimatables.length,warmed.size);assert.ok(warm.scene._activeAnimatables.every(native=>warmed.has(native)),'no new Animatable objects');
  assert.equal(warm.groups.reduce((sum,group)=>sum+group.targetedAnimations.reduce((n,{animation})=>n+animation.runtimeAnimations.length,0),0),runtimeBefore,'no new RuntimeAnimations');
  t.diagnostic(JSON.stringify({clips:clipCount,tracksPerClip,retainedAnimatables:warmed.size,transitions:sequence.length,referenceCreated:reference.animator.inspectBindingCache().created,warmCreated:after.created,reused:after.reused,maxWorldMatrixError:maxError}));
 }finally{reference.dispose();warm.dispose();}
});
