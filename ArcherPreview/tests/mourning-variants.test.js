import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/index.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {MourningElenaAnimator} from '../src/mourning-elena-animation.js';
import {MOURNING_SIZE_SCALE,MOURNING_SPELLS} from '../src/elena-spec.js';
import {accessorBytes,compareBodyCorners} from '../scripts/pack-mourning-elena-v2-1.mjs';

const base=new URL('../public/assets/',import.meta.url),config=JSON.parse(readFileSync(new URL('mourning-elena.json',base)));
const baselineUrl=new URL('content/fe2359ec90de38679823bf5d99cffa3399ef620bcf1effd2ec9b1f228acd7c7c.gltf',base);
const clips={cast:'Chimera_Arcane_Cast_3s',cast_slam:'Chimera_Advance_Slam_3s',cast_alternate:'Chimera_Alternating_Cast_3s'};
const report={scope:'Actual packed r10 source and CPU NullEngine skin/pose validation. No browser automation, GPU timing or physical-device claims.',sourceSha256:config.sourceSha256,checks:{}};
const properties=new Set(['position','rotationQuaternion','scaling']);
const near=(a,b,tolerance=4e-6,label='value')=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
const difference=(a,b)=>Math.min(Math.hypot(...a.asArray().map((v,i)=>v-b.asArray()[i])),a instanceof Quaternion?Math.hypot(...a.asArray().map((v,i)=>v+b.asArray()[i])):Infinity);
let packedPromise;
const packed=()=>packedPromise??=readRuntimeGltf(new URL(config.model,base));
async function fixture(t){
 const source=await packed(),gltf=structuredClone(source.gltf),engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(x=>x!=='EXT_meshopt_compression');
 for(const b of gltf.buffers)if(b.uri)b.uri='data:application/octet-stream;base64,'+source.files.get(b.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},'');for(const g of asset.animationGroups)g.stop();asset.addAllToScene();
 const actor=new TransformNode('variants-actor',scene),carrier=new TransformNode('variants-center',scene);actor.scaling.setAll(config.scale*MOURNING_SIZE_SCALE);carrier.parent=actor;carrier.position.set(...config.centerOffset);
 for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=carrier;
 const animator=new MourningElenaAnimator(asset,config,actor),nodes=Object.fromEntries(asset.transformNodes.map(n=>[n.name,n]));
 t.after(()=>{animator.dispose();asset.dispose();loader.dispose();scene.dispose();engine.dispose();});return {source,asset,scene,actor,animator,nodes};
}
const counts=f=>[f.scene.meshes.length,f.scene.transformNodes.length,f.scene.animationGroups.length,f.scene.skeletons.length,f.scene.morphTargetManagers.length,f.scene.textures.length,f.scene.animatables.length];
const setPose=(f,variant,time)=>{f.animator.reset();f.animator.transition('cast',{castVariant:variant,clipTime:time,actionId:variant});f.animator.sample(0);};
function clipStreams(input,name){
 const g=input.gltf,a=g.animations.find(a=>a.name===name);assert.ok(a,name);
 return new Map(a.channels.map(c=>{const s=a.samplers[c.sampler];return [g.nodes[c.target.node].name+':'+c.target.path,{interpolation:s.interpolation??'LINEAR',times:accessorBytes(input,s.input),values:accessorBytes(input,s.output)}];}));
}
function curveAt(curve,time){
 let value=curve.at(-1)[1];for(let i=1;i<curve.length;i++)if(time<=curve[i][0]){const a=curve[i-1],b=curve[i],v=Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0])));value=a[1]+(b[1]-a[1])*v*v*(3-2*v);break;}return value;
}
function kneeAngle(f){
 const a=f.nodes['DEF_FrontFoot.R_Thigh'].getAbsolutePosition(),b=f.nodes['DEF_FrontFoot.R_Shin'].getAbsolutePosition(),c=f.nodes['DEF_FrontFoot.R_Foot'].getAbsolutePosition(),u=a.subtract(b).normalize(),v=c.subtract(b).normalize();
 return Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(u,v))))*180/Math.PI;
}

test('three Mourning attacks preserve the original skin/cast, match authored variant poses and keep independent morphs',{timeout:90000},async t=>{
 const f=await fixture(t);assert.equal(config.rigRevision,'r10-attack-variants-knee');
 await t.test('same geometry, skin weights and exact original one-arm clip bytes',async()=>{
  const before=await readRuntimeGltf(baselineUrl),comparison=compareBodyCorners(before,f.source);
  for(const [name,result]of Object.entries(comparison.attributes))assert.equal(result.byteExact,true,name);
  const a=clipStreams(before,clips.cast),b=clipStreams(f.source,clips.cast);assert.equal(a.size,b.size);
  for(const [name,old]of a){const current=b.get(name);assert.ok(current,name);assert.equal(current.interpolation,old.interpolation);assert.ok(current.times.equals(old.times),name+' times');assert.ok(current.values.equals(old.values),name+' values');}
  assert.equal(f.source.gltf.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+f.source.gltf.accessors[p.indices].count/3,0),0),143228);
  assert.equal(f.source.gltf.skins.reduce((sum,s)=>sum+s.joints.length,0),255);
  assert.deepEqual(MOURNING_SPELLS.map(s=>s.motion),['cast','cast_alternate','cast_slam','cast_alternate','cast_slam']);
  report.checks.preserved={bodyVertices:comparison.newVertices,bodyTriangles:comparison.triangles,originalCastChannels:a.size,exactGeometryAndCast:true};
 });
 await t.test('both new variants sample the actual source at full weight and have distinct limb poses',()=>{
  const procedural=new Set(f.animator.halo.map(c=>c.target.uniqueId+':'+c.property)),samples={},signatures={};let comparisons=0,maxError=0,vertices=0;
  for(const [variant,name]of Object.entries(clips)){
   const group=f.asset.animationGroups.find(g=>g.name===name);assert.ok(group,name);samples[variant]=[];
   for(const time of [.5,.85,1.15,1.65,2.2,2.5]){
    setPose(f,variant,time);assert.equal(f.animator.current,'cast');assert.equal(f.animator.inspect().castVariant,variant);near(f.animator.weights.cast,1);
    let count=0;
    for(const {target,animation}of group.targetedAnimations){
     const property=animation.targetProperty;if(!properties.has(property)||target.name.startsWith('DEF_HaloCloth_')||procedural.has(target.uniqueId+':'+property))continue;
     const expected=animation.evaluate(time*animation.framePerSecond),error=difference(target[property],expected);maxError=Math.max(maxError,error);assert.ok(error<5e-5,`${variant}/${target.name}/${property}/${time}: ${error}`);comparisons++;count++;
    }
    assert.ok(count>600,'full source transform channels are sampled');
    const left=f.nodes['DEF_Prayer_Hand.L'].getAbsolutePosition(),right=f.nodes['DEF_Prayer_Hand.R'].getAbsolutePosition();samples[variant].push({time,prayerHandDistance:Vector3.Distance(left,right)});
    for(const mesh of f.asset.meshes.filter(m=>m.getTotalVertices())){mesh.skeleton?.prepare(true);const p=mesh.getPositionData(true,true);for(let i=0;i<p.length;i++)assert.ok(Number.isFinite(p[i]),`${variant}/${mesh.name} nonfinite deformed component`);vertices+=p.length/3;}
    if(time===1.15)signatures[variant]=Object.fromEntries(['DEF_FrontHand.L_UpperArm','DEF_FrontHand.L_Forearm','DEF_MidHand.R_UpperArm','DEF_FrontFoot.R_Thigh','DEF_FrontFoot.R_Shin'].map(name=>[name,f.nodes[name].rotationQuaternion.clone()]));
   }
  }
  const poseDifferences={};for(const variant of ['cast_slam','cast_alternate']){poseDifferences[variant]=Math.max(...Object.keys(signatures.cast).map(name=>difference(signatures.cast[name],signatures[variant][name])));assert.ok(poseDifferences[variant]>.025,'new motion must differ from original one-arm cast');}
  for(const variant of Object.keys(clips)){const d=samples[variant].map(p=>p.prayerHandDistance);assert.ok(Math.max(...d)-Math.min(...d)<.08,`${variant}: prayer hands separate: ${JSON.stringify(d)}`);}
  report.checks.poses={samples,sourceChannelComparisons:comparisons,maxLocalPoseError:maxError,cpuSkinnedVertices:vertices,poseDifferences};
 });
 await t.test('new attacks do not deepen authored floor penetration beyond the existing cast scan tolerance',()=>{
  const scans={};
  for(const variant of Object.keys(clips)){
   let minimum={worldY:Infinity,time:0,mesh:null,vertex:0};
   for(let frame=0;frame<=90;frame++){
    const time=frame/30;setPose(f,variant,time);
    for(const mesh of f.asset.meshes.filter(m=>m.getTotalVertices())){
     mesh.skeleton?.prepare(true);const p=mesh.getPositionData(true,true),m=mesh.computeWorldMatrix(true).m;
     for(let i=0;i<p.length;i+=3){const worldY=p[i]*m[1]+p[i+1]*m[5]+p[i+2]*m[9]+m[13];if(worldY<minimum.worldY)minimum={worldY,time,mesh:mesh.name,vertex:i/3};}
    }
   }
   scans[variant]=minimum;
  }
  // Existing scan geometry has a small original floor error. Permit only 2 cm
  // beyond that measured baseline, with an absolute 8 cm stop at game 5.7 m.
  // The baseline itself must also remain within that stop; a large preexisting
  // error cannot silently loosen the two new attacks' acceptance threshold.
  const original=scans.cast.worldY,limit=Math.max(-.08,original-.02);
  report.checks.floor={space:'game-world metres at 5.7 m actor scale',framesPerVariant:91,originalScanExtraAllowanceMetres:.02,absoluteStopMetres:-.08,measuredLimitMetres:limit,passed:original>=-.08&&['cast_slam','cast_alternate'].every(variant=>scans[variant].worldY>=limit),scans};
  assert.ok(original>=-.08,'original cast floor reference unexpectedly moved: '+JSON.stringify(scans.cast));
  for(const variant of ['cast_slam','cast_alternate'])assert.ok(scans[variant].worldY>=limit,`${variant} floor below measured original-cast limit ${limit}: ${JSON.stringify(scans[variant])}`);
 });
 await t.test('slam correction keys stay off and alternating reach differs independently of breathing',()=>{
  const curve=config.motion.alternateReach;assert.ok(Array.isArray(curve)&&curve.length>=3,'explicit alternating large-arm corrective clock is required');
  const results=[];
  for(const time of [.5,.85,1.15,1.65,2.2,2.5]){
   setPose(f,'cast_slam',time);near(f.animator.morphValues.Cast_Palm_Cleanup,0);near(f.animator.morphValues.Cast_Elbow_Form,0);
   setPose(f,'cast_alternate',time);const reach=curveAt(curve,time),palm=f.animator.morphValues.Cast_Palm_Cleanup,elbow=f.animator.morphValues.Cast_Elbow_Form;
   near(palm,reach);near(elbow,Math.max(0,Math.min(1,(reach-.48)/.52)));
   f.animator.breathClock=1.375;f.animator.sample(0);near(f.animator.morphValues.Cast_Palm_Cleanup,palm);near(f.animator.morphValues.Breath_Rise,1);
   results.push({time,reach,palm,elbow});
  }
  report.checks.correctives=results;
 });
 await t.test('death captures all three live attacks and naturally extends the front knee',()=>{
  const angles=[];
  for(const variant of Object.keys(clips)){
   setPose(f,variant,1.65);const live=f.animator.deathChannels.map(c=>c.target[c.property].clone());f.animator.transition('dead');f.animator.sample(0);
   f.animator.deathChannels.forEach((c,i)=>assert.ok(difference(c.target[c.property],live[i])<5e-6,variant+' death entry discontinuity'));
   f.animator.update(.18);near(f.animator.deathWeight,1);f.animator.update(5.02);near(f.animator.deathTime,5.2);assert.equal(f.animator.deathFinished,true);
   angles.push({from:variant,finalKneeDegrees:kneeAngle(f)});assert.ok(angles.at(-1).finalKneeDegrees>=165&&angles.at(-1).finalKneeDegrees<=179.9,JSON.stringify(angles.at(-1)));
  }
  report.checks.death={angles,deathSeconds:5.2,blendSeconds:.18};
 });
 await t.test('repeated walk/variant/idle/death cycles retain bounded resources and no source animation groups',()=>{
  const before=counts(f);
  for(let cycle=0;cycle<12;cycle++)for(const variant of Object.keys(clips)){
   f.animator.reset();f.animator.transition('walk');f.animator.update(.2);f.animator.transition('cast',{castVariant:variant,clipTime:1.65,actionId:cycle});f.animator.update(.01);f.animator.transition('walk');f.animator.update(.1);assert.equal(f.animator.current,'walk');assert.ok(f.animator.walkTime>0);f.animator.transition('idle');f.animator.update(.1);
   f.animator.transition('dead');f.animator.update(5.2);assert.equal(f.animator.deathFinished,true);assert.deepEqual(counts(f),before);assert.equal(f.scene.animatables.length,0);
  }
  report.checks.lifetime={cycles:36,resourceCounts:before,stable:true};
 });
 mkdirSync(new URL('../reports/elena-motion-expansion/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../reports/elena-motion-expansion/variants-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 t.diagnostic(JSON.stringify({poseComparisons:report.checks.poses.sourceChannelComparisons,skinnedVertices:report.checks.poses.cpuSkinnedVertices,kneeDegrees:report.checks.death.angles[0].finalKneeDegrees,resourceCycles:36}));
});
