import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Animation,AnimationEvent,AnimationGroup,NullEngine,Quaternion,Scene,TransformNode,Vector3} from '@babylonjs/core';
import {CharacterAnimator} from '../src/animation.js';
import {WarriorV2Controller} from '../src/warrior-v2.js';
import {BossBrain} from '../src/boss-spec.js';
import {PlayerStrikeSampler} from '../src/player-strikes.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {readAccessor} from '../scripts/web-geometry.js';

const base=new URL('../public/assets/',import.meta.url),records=[];
const data={};
for(const id of ['warrior-v3','guardian-bear']){
  const config=JSON.parse(readFileSync(new URL(id+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
  const accessor=index=>{const a=gltf.accessors[index],width={SCALAR:1,VEC3:3,VEC4:4}[a.type],values=readAccessor(gltf,files,index);return Array.from({length:a.count},(_,i)=>Array.from(values.subarray(i*width,(i+1)*width)));};
  const channels=gltf.animations.map(clip=>({name:clip.name,tracks:clip.channels.map(channel=>{const sampler=clip.samplers[channel.sampler];return {...channel.target,interpolation:sampler.interpolation??'LINEAR',times:accessor(sampler.input).flat(),values:accessor(sampler.output)};})}));
  data[id]={config,gltf,channels};
}
const property={translation:'position',rotation:'rotationQuaternion',scale:'scaling'};
const vector=(path,values)=>path==='rotation'?Quaternion.FromArray(values):Vector3.FromArray(values);
function fixture(id,cache=0){
  const {config,gltf,channels}=data[id],engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const nodes=gltf.nodes.map(n=>{const node=new TransformNode(n.name,scene);node.position.copyFromFloats(...(n.translation??[0,0,0]));node.rotationQuaternion=Quaternion.FromArray(n.rotation??[0,0,0,1]);node.scaling.copyFromFloats(...(n.scale??[1,1,1]));return node;});
  gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>nodes[child].parent=nodes[i]));
  const groups=channels.map(clip=>{const group=new AnimationGroup(clip.name,scene);for(const track of clip.tracks){
    const animation=new Animation(clip.name+'-'+track.node+'-'+track.path,property[track.path],60,track.path==='rotation'?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3);
    animation.setKeys(track.times.map((time,i)=>({frame:time*60,value:vector(track.path,track.values[i]),...(track.interpolation==='STEP'?{interpolation:1}:{})})));group.addTargetedAnimation(animation,nodes[track.node]);
  }return group;});
  let created=0;const begin=scene.beginDirectAnimation.bind(scene);scene.beginDirectAnimation=(...args)=>{created++;return begin(...args);};
  const animator=new CharacterAnimator(groups,config.animations,{bindingCacheSize:cache});
  return {id,config,engine,scene,nodes,groups,animator,get created(){return created;},step(state,result,dt){animator.transition(state,result);animator.update(dt);scene._animate(0);},dispose(){animator.dispose();assert.equal(scene._activeAnimatables.length,0);for(const group of groups){assert.equal(group.animatables.length,0);for(const track of group.targetedAnimations)assert.equal(track.animation.runtimeAnimations.length,0);}scene.dispose();engine.dispose();}};
}
function compare(a,b){
  let error=0;
  for(let i=0;i<a.nodes.length;i++){const x=a.nodes[i].computeWorldMatrix(true).m,y=b.nodes[i].computeWorldMatrix(true).m;for(let j=0;j<16;j++)error=Math.max(error,Math.abs(x[j]-y[j]));}
  assert.ok(error<2e-5,`authored world matrix mismatch ${error}`);return error;
}
function bounds(f){
  assert.ok(f.animator.bindingCache.size<=2);
  let count=0;for(const entry of [...f.animator.active.values(),...f.animator.bindingCache.values()])count+=entry.group.animatables.length;
  assert.equal(f.scene._activeAnimatables.length,count);
  for(const entry of f.animator.bindingCache.values())assert.ok(entry.group.animatables.every(native=>native.paused&&native.weight===0));
}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];

for(const fps of [15,30,60])test(`shipped player combat at${fps}FPS: cached native bindings preserve every pose and strike sweep`,()=>{
  const a=fixture('warrior-v3'),b=fixture('warrior-v3',2),controller=new WarriorV2Controller({durations:a.animator.durations,staminaEnabled:false}),samplers=[new PlayerStrikeSampler(),new PlayerStrikeSampler()];
  const sword=[a,b].map(f=>f.nodes.find(n=>n.name==='Golden_Oathblade')),shield=[a,b].map(f=>f.nodes.find(n=>n.name==='Bunnyguard_Shield'));
  const actions=[[.2,()=>controller.setAttackHeld(true)],[.3,()=>controller.setAttackHeld(false)],[1.5,()=>controller.attack()],[2.8,()=>controller.setShieldHeld(true)],[4,()=>controller.setShieldHeld(false)],[4.1,()=>controller.setAttackHeld(true)],[4.8,()=>controller.setAttackHeld(false)],[6.2,()=>controller.dodge()],[7,()=>controller.setShieldHeld(true)],[7.1,()=>controller.setShieldHeld(false)],[8.5,()=>controller.attack()],[10,()=>controller.setAttackHeld(true)],[10.6,()=>controller.setAttackHeld(false)],[12,()=>controller.hit(.2,{force:true})],[12.5,()=>controller.setShieldHeld(true)],[13.5,()=>controller.setShieldHeld(false)],[14,()=>controller.attack()],[16,()=>controller.attack()]];
  let cursor=0,maxError=0,contacts=0,rollTravel=0;
  try{
    for(let frame=0;frame<18*fps;frame++){
      const time=frame/fps;while(cursor<actions.length&&actions[cursor][0]<=time+1e-9)actions[cursor++][1]();
      const result=controller.update(1/fps,{y:frame<fps?.5:0});
      for(const f of [a,b])f.step(result.state,result,result.captured||result.staggered||result.hitStopped?0:1/fps);
      maxError=Math.max(maxError,compare(a,b));bounds(b);
      const samples=[a,b].map((f,i)=>samplers[i].sample(result,sword[i],shield[i]));assert.deepEqual(samples[1],samples[0]);contacts+=samples[0]?.contacts.length??0;
      if(result.rollFrom!=null)rollTravel+=result.rollTo-result.rollFrom;
      assert.equal(b.animator.active.get(result.state)?.clipTime,a.animator.active.get(result.state)?.clipTime);
    }
    assert.ok(contacts>0);assert.ok(rollTravel>0);assert.ok(b.animator.inspectBindingCache().reused>0);
    records.push({case:'player-pose-strike-equivalence',fps,frames:18*fps,maxWorldMatrixError:maxError,strikeSweepSamples:contacts,rollClipTravel:rollTravel,baselineCreated:a.created,cachedCreated:b.created,cache:b.animator.inspectBindingCache()});
  }finally{a.dispose();b.dispose();}
});

for(const fps of [15,30,60])test(`shipped bear recovery/attacks at${fps}FPS: cache preserves authored poses and brain events`,()=>{
  const a=fixture('guardian-bear'),b=fixture('guardian-bear',2),brain=new BossBrain(a.animator.durations,()=>.2);brain.hp=brain.maxHp=1e6;
  const actions=[[.2,'Right_Jab_from_Guard','attack'],[1.3,'Left_Hook_from_Guard','attack'],[2.8,'Stand_Up3','recover'],[7,'Shield_Push_Left','attack'],[9,'Skill_03','attack'],[11,'Knock_Down_1','down'],[14,'Stand_Up3','recover']];
  let cursor=0,maxError=0,events=0;const visited=new Set();
  try{
    for(let frame=0;frame<20*fps;frame++){
      while(cursor<actions.length&&actions[cursor][0]<=frame/fps+1e-9){const [,state,mode]=actions[cursor++];brain.start(state,mode);}
      const result=brain.update(1/fps,2.2,true),spec={clipTime:brain.time,actionId:brain.serial,loop:['move','approach'].includes(brain.mode),blendDuration:['down','recover'].includes(brain.mode)?.10:.16};
      for(const f of [a,b])f.step(brain.state,spec,1/fps);
      visited.add(brain.state);events+=result.events.length;maxError=Math.max(maxError,compare(a,b));bounds(b);
      assert.equal(a.animator.active.get(brain.state).clipTime,b.animator.active.get(brain.state).clipTime);
    }
    assert.ok(visited.has('Stand_Up3'));assert.ok(visited.has('Knock_Down_1'));assert.ok(events>0);assert.ok(b.animator.inspectBindingCache().reused>0);
    records.push({case:'bear-pose-event-equivalence',fps,frames:20*fps,maxWorldMatrixError:maxError,brainEvents:events,visited:[...visited],baselineCreated:a.created,cachedCreated:b.created,cache:b.animator.inspectBindingCache()});
  }finally{a.dispose();b.dispose();}
});

for(const [id,states]of [['warrior-v3',['idle','slash','attack']],['guardian-bear',['Block6','Stand_Up3','Right_Jab_from_Guard']]])test(`${id}: recurring native bindings are reused rather than rebuilt; cached clips never sample`,()=>{
  const a=fixture(id),b=fixture(id,2),times=[[],[]];let maxError=0;
  try{
    for(let cycle=0;cycle<20;cycle++)for(const state of states){
      for(const [index,f]of [a,b].entries()){
        const started=performance.now();f.step(state,{clipTime:.3,actionId:cycle*states.length+states.indexOf(state),blendDuration:.1},.2);times[index].push(performance.now()-started);
      }
      maxError=Math.max(maxError,compare(a,b));bounds(b);
    }
    let inactiveManualSamples=0,inactiveRuntimeSamples=0;const restore=[];
    for(const entry of b.animator.bindingCache.values()){
      const sample=entry.group.goToFrame;entry.group.goToFrame=function(...args){inactiveManualSamples++;return sample.apply(this,args);};restore.push(()=>entry.group.goToFrame=sample);
      for(const native of entry.group.animatables)for(const runtime of native.getAnimations()){
        const animate=runtime.animate;runtime.animate=function(...args){inactiveRuntimeSamples++;return animate.apply(this,args);};restore.push(()=>runtime.animate=animate);
      }
    }
    for(let i=0;i<3;i++){b.animator.update(0);b.scene._animate(0);}for(const reset of restore)reset();
    assert.equal(inactiveManualSamples,0);assert.equal(inactiveRuntimeSamples,0);
    const tracks=a.animator.clips[states[0]].targetedAnimations.length;
    assert.equal(a.created,60*tracks);assert.equal(b.created,3*tracks);assert.equal(b.animator.inspectBindingCache().reused,57*tracks);
    assert.equal(b.animator.bindingCache.size,2);records.push({case:'recurring-binding-work',asset:id,tracksPerClip:tracks,transitions:60,baselineCreated:a.created,cachedCreated:b.created,bindingsAvoided:a.created-b.created,baselineMedianTransitionAndSampleMs:median(times[0].slice(3)),cachedMedianTransitionAndSampleMs:median(times[1].slice(3)),inactiveManualSamples,inactiveRuntimeSamples,maxWorldMatrixError:maxError,cache:b.animator.inspectBindingCache()});
  }finally{a.dispose();b.dispose();}
});

test('LRU eviction stays bounded across all20 shipped bear clips and disposal clears every native runtime',()=>{
  const f=fixture('guardian-bear',2);
  try{
    for(let pass=0;pass<3;pass++)for(const state of Object.keys(f.animator.clips)){f.step(state,{clipTime:.2,actionId:pass,blendDuration:.1},.2);bounds(f);assert.ok(f.animator.inspectBindingCache().currentBindings<=3*174);}
    assert.ok(f.animator.inspectBindingCache().evicted>=57);assert.equal(f.animator.bindingCache.size,2);
    f.animator.dispose();f.animator.dispose();assert.equal(f.animator.inspectBindingCache().currentBindings,0);assert.equal(f.animator.bindingCache.size,0);
    records.push({case:'bear20-clip-lifecycle',passes:3,maximumCachedClips:2,maximumLiveNativeBindings:3*174,afterDispose:f.animator.inspectBindingCache()});
  }finally{f.dispose();}
});

function simple(cache=2,{sparse=false,events=false,additive=false}={}){
  const engine=new NullEngine(),scene=new Scene(engine),target=new TransformNode('target',scene),other=new TransformNode('other',scene),groups=['a','b','c','d'].map((name,i)=>{
    const animation=new Animation(name,'position',60,Animation.ANIMATIONTYPE_VECTOR3);animation.setKeys([{frame:0,value:new Vector3(i,0,0)},{frame:60,value:new Vector3(i+1,0,0)}]);if(events)animation.addEvent(new AnimationEvent(30,()=>{}));
    const group=new AnimationGroup(name,scene);group.addTargetedAnimation(animation,sparse&&i===1?other:target);if(additive)group.isAdditive=true;return group;
  });
  const animator=new CharacterAnimator(groups,{a:'a',b:'b',c:'c',d:'d'},{bindingCacheSize:cache});
  return {engine,scene,target,groups,animator,step(state,dt=.2,spec={}){animator.transition(state,{clipTime:.4,blendDuration:.1,...spec});animator.update(dt);scene._animate(0);},dispose(){animator.dispose();scene.dispose();engine.dispose();}};
}
test('superseded blends stay normalized and never retain more than two finished clips',()=>{
  const a=simple(0),b=simple(2);
  try{for(let i=0;i<80;i++){const state=['a','b','c','d'][i%4];a.step(state,.02,{actionId:i});b.step(state,.02,{actionId:i});assert.ok(Math.abs(a.target.position.x-b.target.position.x)<1e-7);assert.ok(Math.abs([...b.animator.active.values()].reduce((sum,entry)=>sum+entry.weight,0)-1)<1e-7);bounds(b);}b.step('a',1);bounds(b);records.push({case:'superseded-fades',transitions:80,normalized:true,poseEquivalent:true});}finally{a.dispose();b.dispose();}
});

test('groups with callbacks/events/additive or sparse channels keep original stop/end behavior',()=>{
  for(const kind of ['group-callback','native-observer','native-callback','events','additive','sparse']){
    const f=simple(2,{events:kind==='events',additive:kind==='additive',sparse:kind==='sparse'});let ended=0;
    try{
      if(kind==='group-callback')f.groups[0].onAnimationGroupEndObservable.add(()=>ended++);
      f.step('a');const native=f.groups[0].animatables[0];
      if(kind==='native-observer')native.onAnimationEndObservable.add(()=>ended++);
      if(kind==='native-callback'){const original=native.onAnimationEnd;native.onAnimationEnd=()=>{ended++;original();};}
      f.step('b');assert.equal(f.groups[0].animatables.length,0,kind);assert.equal(f.animator.bindingCache.size,0,kind);
      if(kind.endsWith('callback')||kind==='native-observer')assert.equal(ended,1,kind);
    }finally{f.dispose();}
  }
  records.push({case:'native-callback-fallback',groups:['group-callback','native-observer','native-callback','events','additive','sparse'],logicalCallbacksPreserved:true});
});

test('callbacks added to an inactive cache cause a fresh native start without stale completion',()=>{
  const f=simple();let ended=0,played=0,paused=0;
  try{
    f.step('a');f.step('b');assert.equal(f.animator.bindingCache.has('a'),true);
    f.groups[0].onAnimationGroupEndObservable.add(()=>ended++);f.groups[0].onAnimationGroupPlayObservable.add(()=>played++);f.groups[0].onAnimationGroupPauseObservable.add(()=>paused++);
    f.step('a');assert.equal(ended,0);assert.equal(played,1);assert.equal(paused,1);f.step('b');assert.equal(ended,1);assert.equal(f.animator.bindingCache.has('a'),false);records.push({case:'late-callback-fallback',staleEndCallbacks:0,played,paused,ended});
  }finally{f.dispose();}
});

test('replaced keys invalidate cached runtime bindings and use the new authored pose',()=>{
  const f=simple();
  try{
    f.step('a');f.step('b');assert.equal(f.animator.bindingCache.has('a'),true);const before=f.animator.inspectBindingCache();
    f.groups[0].targetedAnimations[0].animation.setKeys([{frame:0,value:new Vector3(20,0,0)},{frame:60,value:new Vector3(30,0,0)}]);
    f.step('a');assert.equal(f.target.position.x,24);assert.equal(f.animator.inspectBindingCache().created,before.created+1);assert.equal(f.animator.inspectBindingCache().evicted,before.evicted+1);
    records.push({case:'superseded-keys',cacheInvalidated:true,newAuthoredPose:24});
  }finally{f.dispose();}
});

function replacementGroup(f,target=f.target){
  const animation=new Animation('replacement-a','position',60,Animation.ANIMATIONTYPE_VECTOR3);animation.setKeys([{frame:0,value:new Vector3(20,0,0)},{frame:60,value:new Vector3(30,0,0)}]);
  const group=new AnimationGroup('replacement-a',f.scene);group.addTargetedAnimation(animation,target);return group;
}
test('replacing a cached state starts its new owner and releases old native bindings without reusing a stale channel proof',()=>{
  for(const separateTarget of [false,true]){
    const f=simple();
    try{
      f.step('a');f.step('b');const old=f.groups[0],native=old.animatables[0],before=f.animator.inspectBindingCache();assert.equal(f.animator.bindingCache.get('a').group,old);
      const target=separateTarget?new TransformNode('replacement-target',f.scene):f.target,replacement=replacementGroup(f,target);f.animator.clips.a=replacement;
      f.step('a');assert.equal(f.animator.active.get('a').group,replacement);assert.equal(replacement.animatables.length,1);assert.equal(target.position.x,24);
      assert.equal(old.animatables.length,0);assert.equal(native.getAnimations().length,0);assert.equal(f.animator.inspectBindingCache().created,before.created+1);assert.equal(f.animator.inspectBindingCache().reused,before.reused);assert.equal(f.animator.inspectBindingCache().eligible,false);
      f.animator.dispose();assert.equal(f.scene._activeAnimatables.length,0);assert.equal(replacement.animatables.length,0);
    }finally{f.dispose();}
  }
  records.push({case:'superseded-group-owner',sameTargetAndDifferentTarget:true,freshOwnerStarted:true,oldNativeBindingsReleased:true,staleChannelProofRejected:true});
});
test('disposal includes cached owners removed from the public clip map',()=>{
  const f=simple();
  try{
    f.step('a');f.step('b');const old=f.groups[0],native=old.animatables[0];f.animator.clips.a=replacementGroup(f);
    assert.equal(f.animator.inspectBindingCache().currentBindings,2,'ownership snapshot includes the unmapped cached group');
    f.animator.dispose();f.animator.dispose();assert.equal(old.animatables.length,0);assert.equal(native.getAnimations().length,0);assert.equal(f.scene._activeAnimatables.length,0);assert.equal(f.animator.bindingCache.size,0);assert.equal(f.animator.inspectBindingCache().currentBindings,0);
    records.push({case:'unmapped-owner-disposal',cachedNativeBindingsReleased:true,afterDisposeBindings:0});
  }finally{f.dispose();}
});

test('aliasing a cached group to another state drains inactive owners before a fresh native start',()=>{
  const f=simple();
  try{
    f.step('a');f.step('b');const oldNative=f.groups[0].animatables[0],before=f.animator.inspectBindingCache();assert.equal(f.animator.bindingCache.has('a'),true);
    f.animator.clips.c=f.groups[0];f.step('c');
    assert.equal(f.animator.bindingCache.size,0);assert.equal(f.animator.active.get('c').group,f.groups[0]);assert.equal(f.target.position.x,.4);
    assert.equal(oldNative.getAnimations().length,0);assert.notEqual(f.groups[0].animatables[0],oldNative);assert.equal(f.scene._activeAnimatables.length,1);
    assert.equal(f.animator.inspectBindingCache().eligible,false);assert.equal(f.animator.inspectBindingCache().reused,before.reused);assert.equal(f.animator.inspectBindingCache().created,before.created+1);
    f.animator.dispose();assert.equal(f.scene._activeAnimatables.length,0);assert.equal(f.animator.inspectBindingCache().currentBindings,0);
    records.push({case:'aliased-group-owner',cachedOwnersDrained:true,freshOwnerStarted:true,afterDisposeBindings:0});
  }finally{f.dispose();}
});

test.after(()=>{
  const directory=new URL('../reports/bear-combat-2026-11-05/',import.meta.url);mkdirSync(directory,{recursive:true});
  const source=readFileSync(new URL('../src/animation.js',import.meta.url));
  writeFileSync(new URL('animation-validation.json',directory),JSON.stringify({baseline:'99fcd56',passed:records.length===16,sourceSha256:createHash('sha256').update(source).digest('hex'),cases:records,limitations:['CPU-only Babylon9.31 NullEngine with actual shipped TRS tracks/hierarchy. Images/GPU rasterization and actual S23 scheduling/thermals/FPS are not measured.','Cache disabled is the original stop/delete path; opt-in retains at most2 zero-weight paused native groups outside active manual sampling. SDK still performs bounded paused animatable checks.','Desktop transition/sample medians are observational; operation counts and pose/strike equality are the assertions. No claim that the observed mobile framePrelude is entirely animation allocation.','Controller/brain results and timing are unchanged; both animators consume the same authoritative results.']},null,2)+'\n');
});
