import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion,AnimationGroup} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {instantiateBossModel} from '../src/boss-models.js';
import {orderPoseNodes,refreshPoseMatrices} from '../src/pose-matrices.js';
import {castReach,mourningMorphs,makeTrack,MourningElenaAnimator} from '../src/mourning-elena-animation.js';

const config=JSON.parse(readFileSync(new URL('../public/assets/mourning-elena.json',import.meta.url)));
const required=['Chimera_Organic_Walk_2p4s','Chimera_Arcane_Cast_3s','Soft_Breath_and_Bust','Halo_Slow_Orbit_48s','Halo_Cloth_Gravity_48s'];
const morphNames=['Cast_Palm_Cleanup','Cast_Elbow_Form','Breath_Rise','Bust_Settle','Bust_ArmFollow'];
const near=(actual,expected,tolerance=1e-6,label='value')=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const smooth=t=>t*t*(3-2*t),clamp=t=>Math.max(0,Math.min(1,t));
const weight=t=>smooth(clamp(Math.min(t/.18,(3-t)/.25)));
const props=new Set(['position','rotationQuaternion','scaling']);
const error=(a,b)=>Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i])):Infinity);
let packed;
const validation={};
const samplerSha256=createHash('sha256').update(readFileSync(new URL('../src/mourning-elena-animation.js',import.meta.url))).digest('hex');
async function fixture(t){
  packed??=readRuntimeGltf(new URL(config.model,new URL('../public/assets/',import.meta.url)));
  const source=await packed,gltf=structuredClone(source.gltf);
  for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
  for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+source.files.get(buffer.uri).data.toString('base64');
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const loader=new GLTFFileLoader();loader.skipMaterials=true;
  const container=await loader.loadAssetContainerAsync(scene,{json:gltf},'');
  // Match BossModelLibrary.load: the loader may automatically start a source
  // group even though the model lives in an AssetContainer outside the scene.
  for(const group of container.animationGroups)group.stop();
  const asset=instantiateBossModel(container),actor=new TransformNode('mourning-test-actor',scene),carrier=new TransformNode('mourning-test-center',scene);
  carrier.parent=actor;carrier.position.copyFromFloats(...config.centerOffset);actor.scaling.setAll(config.scale);actor.rotation.y=0;
  for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
  actor.computeWorldMatrix(true);carrier.computeWorldMatrix(true);refreshPoseMatrices(orderPoseNodes(asset.transformNodes));
  const animator=new MourningElenaAnimator(asset,config,actor);
  t.after(()=>{animator.dispose();container.dispose();loader.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,container,asset,actor,carrier,animator,gltf};
}
function counts(f){return {meshes:f.scene.meshes.length,nodes:f.scene.transformNodes.length,groups:f.scene.animationGroups.length,skeletons:f.scene.skeletons.length,bones:f.asset.skeletons.reduce((s,k)=>s+k.bones.length,0),managers:f.scene.morphTargetManagers.length,morphs:f.animator.morphs.length,animatables:f.scene.animatables.length};}
function runFrame(animator,index){
  const phase=index%360,casting=phase>=90&&phase<270;
  animator.transition(casting?'cast':'walk',{clipTime:casting?(phase-90)/60:0,actionId:Math.floor(index/360)});animator.update(1/60);
}

test('reach and separate morph clocks preserve exact cast timing and independent breathing',()=>{
  for(const [t,v] of [[0,0],[.25,.08],[.72,.48],[1.18,1],[1.82,1],[2.08,.97],[2.60,.42],[3,0]])near(castReach(t),v);
  near(castReach((.72+1.18)/2),.74);near(castReach(-1),0);near(castReach(9),0);
  for(const t of [0,.09,.18,.25,.72,1.18,1.82,2.08,2.6,2.875,3]){
    const values=mourningMorphs({casting:true,castTime:t,walkTime:.4,gaitBlend:.7,breathClock:1.375});
    near(values.Cast_Palm_Cleanup,castReach(t)*weight(t));near(values.Cast_Elbow_Form,clamp((castReach(t)-.48)/.52)*weight(t));
    near(values.Breath_Rise,1);assert.ok(Object.values(values).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  }
  const resting=mourningMorphs({casting:false,castTime:1.5,gaitBlend:0,breathing:false});assert.ok(Object.values(resting).every(v=>v===0));
  const a=mourningMorphs({casting:true,castTime:1.5,walkTime:.5,gaitBlend:1,breathClock:0}),b=mourningMorphs({casting:true,castTime:1.5,walkTime:.5,gaitBlend:1,breathClock:1.375});
  assert.equal(a.Cast_Palm_Cleanup,b.Cast_Palm_Cleanup);assert.notEqual(a.Breath_Rise,b.Breath_Rise);assert.equal(a.Bust_Settle,b.Bust_Settle);
});

test('real packed r7 animation, pose, clock and lifetime validation',async t=>{
  const f=await fixture(t),{asset,animator,actor}=f;
  await t.test('required clips, separate morph targets and LINEAR/constant STEP inventory',()=>{
    assert.deepEqual(asset.animationGroups.map(g=>g.name).sort(),[...required].sort());
    assert.deepEqual([...new Set(animator.morphs.map(m=>m.name))].sort(),[...morphNames].sort());
    assert.ok(asset.skeletons.length>=2);assert.equal(animator.cloth.length,7);assert.ok(animator.hair.length>0);assert.ok(animator.halo.length>0);
    near(animator.durations.cast,3);near(animator.gaitSeconds,2.4);assert.equal(f.scene.animatables.length,0);
    assert.ok(animator.fixed.length>animator.body.length,'most identical translation/scale channels are cached');
  });
  await t.test('every source transform track agrees with Babylon evaluate, including rewind and end clamps',()=>{
    let maxError=0,channels=0,constant=0;
    for(const group of asset.animationGroups)for(const {animation} of group.targetedAnimations){
      if(!props.has(animation.targetProperty))continue;
      const track=makeTrack(animation),end=track.keys.at(-1).frame/track.fps;channels++;constant+=Number(track.constant);
      for(const time of [0,end*.13,end*.53,end*.91,end,end*.2,0,end+.2]){
        const difference=error(track.sample(time),animation.evaluate(time*track.fps));maxError=Math.max(maxError,difference);
        assert.ok(difference<2e-6,`${group.name}/${animation.name} at ${time}: ${difference}`);
      }
    }
    assert.ok(channels>1400);assert.ok(constant>1000);validation.sourceTracks={sourceChannels:channels,constantTracks:constant,maxSourceError:maxError};t.diagnostic(JSON.stringify(validation.sourceTracks));
  });
  await t.test('body pose matches source blend; procedural morphs stay separate from transform sampling',()=>{
    const walks=new Map(asset.animationGroups.find(g=>g.name===required[0]).targetedAnimations.map(c=>[c.target.uniqueId+':'+c.animation.targetProperty,c.animation]));
    const casts=new Map(asset.animationGroups.find(g=>g.name===required[1]).targetedAnimations.map(c=>[c.target.uniqueId+':'+c.animation.targetProperty,c.animation]));
    animator.walkTime=.713;animator.gaitBlend=.8;animator.breathClock=1.375;
    for(const time of [0,.09,.18,.719,1.18,1.82,2.6,2.875,3]){
      animator.transition('cast',{clipTime:time,actionId:9});animator.sample(1/60);
      for(const channel of [...animator.body,...animator.fixed]){
        if(channel.target.name.startsWith('DEF_HaloCloth_'))continue;
        const k=channel.target.uniqueId+':'+channel.property,a=walks.get(k).evaluate(animator.walkTime*walks.get(k).framePerSecond),cast=casts.get(k)??walks.get(k),b=cast.evaluate(time*cast.framePerSecond);
        const expected=channel.property==='rotationQuaternion'?Quaternion.Slerp(a,b,weight(time)):Vector3.Lerp(a,b,weight(time));
        assert.ok(error(channel.target[channel.property],expected)<2e-6,channel.target.name+'/'+channel.property);
      }
      const expected=mourningMorphs({casting:true,castTime:time,walkTime:animator.walkTime,gaitBlend:animator.gaitBlend,breathClock:animator.breathClock});
      for(const morph of animator.morphs)near(morph.influence,expected[morph.name],1e-6,morph.name);
    }
  });
  await t.test('walk freezes during the entire 3 second cast while hair, halo and breath keep their clocks',()=>{
    animator.transition('walk');animator.update(.37);const walk=animator.walkTime,hair=animator.hairTime,halo=animator.haloTime,breath=animator.breathClock;
    for(let i=0;i<=180;i++){animator.transition('cast',{clipTime:i/60,actionId:11});animator.update(1/60);near(animator.walkTime,walk);}
    assert.notEqual(animator.hairTime,hair);near(animator.haloTime-halo,181/60);near(animator.breathClock-breath,181/60);
    animator.transition('walk');assert.equal(animator.walkTime,0);animator.update(1/60);near(animator.walkTime,2/60);
    assert.equal(animator.inspect().morphs.Cast_Palm_Cleanup,0);assert.equal(animator.inspect().morphs.Cast_Elbow_Form,0);
    validation.clocks={castSeconds:3,walkFrozen:true,walkResetsToZeroOnExit:true,hairHaloBreathIndependent:true};
  });
  await t.test('hair, halo and prayer bones stay finite; streamer local +Y points down under actor yaw',()=>{
    const nodes=asset.transformNodes.filter(n=>/^(DEF_Hair_|DEF_Prayer_|CTRL_Halo_)/.test(n.name));assert.ok(nodes.length>40);
    let maximumClothY=-Infinity;
    for(const yaw of [0,.8,2.7]){
      actor.rotation.y=yaw;actor.computeWorldMatrix(true);
      for(let frame=0;frame<180;frame++)runFrame(animator,frame+90);
      for(const node of nodes){const p=node.getAbsolutePosition();assert.ok(p.asArray().every(Number.isFinite),node.name);assert.ok(p.length()<15,node.name);}
      for(const {bone} of animator.cloth){
        const direction=Vector3.Up().applyRotationQuaternion(bone.absoluteRotationQuaternion).normalize();maximumClothY=Math.max(maximumClothY,direction.y);assert.ok(direction.y<-.985,`${bone.name}, yaw ${yaw}: ${direction.y}`);
      }
    }
    validation.independentRig={finiteNodes:nodes.length,actorYawRadians:[0,.8,2.7],clothBones:animator.cloth.length,maximumClothY};
  });
  await t.test('repeated cycles retain model/bone/manager counts, reusable track values, and bounded retained heap',()=>{
    const before=counts(f),values=[...animator.body.map(c=>c.track.value),...animator.hair.map(c=>c.track.value)];
    for(let i=0;i<600;i++)runFrame(animator,i);global.gc?.();const heapBefore=process.memoryUsage().heapUsed;
    for(let i=0;i<7200;i++)runFrame(animator,i);global.gc?.();const heapAfter=process.memoryUsage().heapUsed;
    assert.deepEqual(counts(f),before);[...animator.body.map(c=>c.track.value),...animator.hair.map(c=>c.track.value)].forEach((value,index)=>assert.strictEqual(value,values[index]));
    if(global.gc)assert.ok(heapAfter-heapBefore<8*1024*1024,`retained heap grew ${heapAfter-heapBefore}`);
    validation.lifetime={cycles:20,before,after:counts(f),explicitGC:!!global.gc,heapBefore,heapAfter,heapDelta:heapAfter-heapBefore};t.diagnostic(JSON.stringify(validation.lifetime));
    const samples=animator.samples;animator.dispose();animator.update(1);assert.equal(animator.samples,samples);
  });
});

// Equivalent retained AnimationGroup implementation: body gait + body cast,
// independent weighted hair, and halo. Morph/cloth work and clocks are identical.
function groupReference(f){
  const {asset,animator,scene}=f,find=name=>asset.animationGroups.find(g=>g.name===name);
  const create=(name,source,filter)=>{const g=new AnimationGroup(name,scene);for(const item of source.targetedAnimations)if(props.has(item.animation.targetProperty)&&filter(item))g.addTargetedAnimation(item.animation,item.target);return g;};
  const groups={gait:create('reference-gait',find(required[0]),i=>!i.target.name.startsWith('DEF_Hair_')),cast:create('reference-cast',find(required[1]),i=>!i.target.name.startsWith('DEF_Hair_')),hair:create('reference-hair',find(required[0]),i=>i.target.name.startsWith('DEF_Hair_')),halo:create('reference-halo',find('Halo_Slow_Orbit_48s'),()=>true)};
  for(const c of animator.hair)c.target[c.property].copyFrom(c.rest);
  for(const group of Object.values(groups)){group.start(true,1,group.from,group.to);group.pause();group.setWeightForAllAnimatables(0);}
  const apply=(group,time,w)=>{if(group._testWeight!==w){group.setWeightForAllAnimatables(w);group._testWeight=w;}group.goToFrame(time*group.targetedAnimations[0].animation.framePerSecond,true);};
  animator.sample=function(dt){
    const casting=this.current==='cast',w=casting?weight(this.castTime):0;
    apply(groups.gait,this.walkTime,1-w);apply(groups.cast,this.castTime,w);apply(groups.hair,this.hairTime,.3+.7*this.gaitBlend);apply(groups.halo,this.haloTime,1);scene._animate(0);
    const values=mourningMorphs({castTime:this.castTime,casting,walkTime:this.walkTime,gaitSeconds:this.gaitSeconds,gaitBlend:this.gaitBlend,breathClock:this.breathClock});
    for(const target of this.morphs)if(values[target.name]!==undefined)target.influence=values[target.name];
    this.refreshPose();this.applyCloth(dt);this.samples++;
  };
  return groups;
}
function stats(samples){const sorted=[...samples].sort((a,b)=>a-b);return {frames:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)};}

test('CPU-only sampler comparison against four paused weighted AnimationGroups',async t=>{
  const optimized=await fixture(t),reference=await fixture(t),groups=groupReference(reference);let maxPoseError=0,maxMorphError=0;
  const referenceNodes=new Map(reference.asset.transformNodes.map(n=>[n.name,n]));
  for(let i=0;i<360;i++){
    runFrame(optimized.animator,i);optimized.scene._animate(0);runFrame(reference.animator,i);
    for(const node of optimized.asset.transformNodes){const other=referenceNodes.get(node.name);for(const property of props){if(!node[property]||!other[property])continue;const e=error(node[property],other[property]);maxPoseError=Math.max(maxPoseError,e);assert.ok(e<5e-5,`${node.name}/${property}, frame ${i}, error ${e}`);}}
    for(let j=0;j<optimized.animator.morphs.length;j++)maxMorphError=Math.max(maxMorphError,Math.abs(optimized.animator.morphs[j].influence-reference.animator.morphs[j].influence));
  }
  assert.ok(maxMorphError<1e-6);
  if(process.env.ELENA_ANIMATION_BENCHMARK!=='1'){
    t.diagnostic(JSON.stringify({poseFrames:360,maxPoseError,maxMorphError,benchmark:'skipped; set ELENA_ANIMATION_BENCHMARK=1 for isolated CPU timing and report output'}));return;
  }
  const warmupFrames=600,sampleFrames=1800;
  for(let i=0;i<warmupFrames;i++){runFrame(optimized.animator,i);optimized.scene._animate(0);runFrame(reference.animator,i);}
  const direct=[],legacy=[];global.gc?.();
  // Alternate order to limit systematic effects from temperature and scheduler noise.
  for(let i=0;i<sampleFrames;i++)for(const name of i%2?['reference','optimized']:['optimized','reference']){
    const target=name==='optimized'?optimized:reference,start=performance.now();runFrame(target.animator,i);if(name==='optimized')target.scene._animate(0);(name==='optimized'?direct:legacy).push(performance.now()-start);
  }
  const report={generatedAt:new Date().toISOString(),scope:'CPU animation sampling and hierarchy refresh only; NullEngine, no draw calls, GPU or frame-rate claim',runtime:{node:process.version,babylon:'9.31.0',platform:platform(),arch:arch(),cpu:cpus()[0]?.model,samplerSha256},model:{version:config.version,sourceSha256:config.sourceSha256,scale:config.scale,centerOffset:config.centerOffset,rightHanded:true},method:{baseline:'four paused weighted AnimationGroups: body gait, body cast, independent hair, halo; source weight/morph animation channels excluded; same procedural morphs, cloth, matrices, clocks',warmupFrames,sampleFrames,stepSeconds:1/60,pattern:'90 walk frames, 180 cast frames, 90 walk frames; alternating benchmark order',explicitGC:!!global.gc},validation,poseEquality:{frames:360,maxLocalPoseError:maxPoseError,maxMorphError,tolerance:5e-5},optimized:{...stats(direct),channels:optimized.animator.inspect(),counts:counts(optimized)},animationGroups:{...stats(legacy),groups:Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,g.targetedAnimations.length])),counts:counts(reference)}};
  report.meanSpeedup=report.animationGroups.meanMs/report.optimized.meanMs;report.p95Speedup=report.animationGroups.p95Ms/report.optimized.p95Ms;
  if(process.env.ELENA_ANIMATION_BENCHMARK==='1'){const directory=new URL('../reports/elena-two-phase/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('animation-benchmark.json',directory),JSON.stringify(report,null,2)+'\n');}
  t.diagnostic(JSON.stringify({optimized:stats(direct),animationGroups:stats(legacy),meanSpeedup:report.meanSpeedup,maxPoseError,maxMorphError}));
});
