import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {GLTFFileLoader} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {readRuntimeGltf} from './helpers/read-runtime-gltf.js';
import {WolfAnimator} from '../src/wolf-animation.js';
import {WolfEncounter} from '../src/wolf-encounter.js';
import {WolfV02LocomotionPose} from '../src/wolf-v02-locomotion.js';
import {regularWolfManifest} from '../src/regular-wolf-spec.js';

const base=new URL('../public/assets/',import.meta.url),up=Vector3.Up(),angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(Quaternion.Dot(a,b)/Math.sqrt(a.lengthSquared()*b.lengthSquared()))));
async function fixture(t,id){
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const config=JSON.parse(readFileSync(new URL((id==='alpha-wolf'?id:regularWolfManifest(id))+'.json',base))),{gltf,files}=await readRuntimeGltf(new URL(config.model,base));
 for(const key of ['extensionsUsed','extensionsRequired'])gltf[key]=(gltf[key]??[]).filter(value=>value!=='EXT_meshopt_compression'&&value!=='KHR_texture_basisu');for(const buffer of gltf.buffers)if(buffer.uri)buffer.uri='data:application/octet-stream;base64,'+files.get(buffer.uri).data.toString('base64');
 const loader=new GLTFFileLoader();loader.skipMaterials=true;const asset=await loader.loadAssetContainerAsync(scene,{json:gltf},''),actor=new TransformNode('watch-actor',scene),carrier=new TransformNode('watch-carrier',scene);carrier.parent=actor;actor.scaling.setAll(config.scale);
 for(const node of [...asset.meshes,...asset.transformNodes])if(!node.parent)node.parent=carrier;
 const animator=new WolfAnimator(asset,config),nodes=Object.fromEntries(asset.transformNodes.map(node=>[node.name,node]));
 const e={asset,config,actor,carrier,animator,nodes,inverseRoot:Quaternion.Identity(),offset:new Vector3(),dt:1/60,brain:{hp:900,mode:'idle',behavior:'territory-watch',stagger:0},player:{position:new Vector3()}};
 e.contactShape=()=>({offset:Vector3.FromArray(config.canineProfile?.contactShapes?.jaw?.offset??[0,.11,.01])});const pose=new WolfV02LocomotionPose(e);
 t.after(()=>{animator.dispose();asset.dispose();actor.dispose();loader.dispose();scene.dispose();engine.dispose();});
 return {e,pose,sample(clip,time){pose.restore();animator.transition(clip,{clipTime:time,actionId:-1,blendDuration:0});animator.update(0);WolfEncounter.prototype.alignPose.call(e);},align(){pose.restore();WolfEncounter.prototype.alignPose.call(e);pose.aim();}};
}
function metrics(f){
 const {e}=f,head=e.nodes.head,chest=e.nodes.chest,jaw=e.nodes.jaw,origin=head.getAbsolutePosition(),body=chest.getAbsolutePosition(),muzzle=Vector3.TransformCoordinates(f.pose.watchMuzzleOffset,jaw.getWorldMatrix()),forward=Vector3.TransformNormal(up,head.getWorldMatrix()).normalize();
 return {headDistance:Vector3.Distance(origin,body),muzzleDistance:Vector3.Distance(muzzle,body),muzzleHeight:muzzle.y,dot:Vector3.Dot(forward,body.subtract(origin).normalize()),rotation:head.absoluteRotationQuaternion.clone()};
}

test('real watch poses converge for stationary opponents without guard feedback jitter or changing jaw/bone shape',async t=>{
 const proof=[];
 for(const id of ['alpha-wolf','gray-wolf','stylized-wolf','wolf-3','fox','boar']){
  const f=await fixture(t,id),{e,pose}=f;
  for(const [clip,time]of [['Rest_Lie_R5',0],['Alert_Lie_R5',1.8],['Circle_Watch_R5',0],['Rise_From_Lie_R5',1.1]])for(const target of [[0,0,-1],[-1,0,0],[0,8,-1],[0,-2,1]]){
   pose.restore();pose.watchActive=false;pose.watchYaw=pose.watchPitch=0;e.player.position.set(...target);f.sample(clip,time);const source=metrics(f),jaw=e.nodes.jaw,jawQuaternion=jaw.rotationQuaternion.clone(),jawAxis=jaw.position.clone().normalize(),body=e.asset.transformNodes.map(node=>[node,node.position.clone(),node.scaling.clone(),node.rotationQuaternion?.clone()]);assert.equal(jaw.parent,e.nodes.head,id+': actual jaw stays attached to head');
   let previous=null,maxVelocity=0,tailJitter=0,minHeadRatio=Infinity,minMuzzleRatio=Infinity,maxDot=-Infinity;
   for(let frame=0;frame<300;frame++){
    f.sample(clip,time);pose.aim();const current=metrics(f);
    if(previous){const step=angle(previous,current.rotation);maxVelocity=Math.max(maxVelocity,step*60);if(frame>=180)tailJitter=Math.max(tailJitter,step);}
    previous=current.rotation;minHeadRatio=Math.min(minHeadRatio,current.headDistance/source.headDistance);minMuzzleRatio=Math.min(minMuzzleRatio,current.muzzleDistance/source.muzzleDistance);maxDot=Math.max(maxDot,current.dot);
    assert.ok(current.dot<=Math.min(-.08,source.dot+.3)+1e-5,`${id}/${clip}: head turns into chest`);assert.ok(current.headDistance>=source.headDistance*.94-1e-5);assert.ok(current.muzzleDistance>=source.muzzleDistance*.94-1e-5);assert.ok(current.muzzleHeight>=source.muzzleHeight-.04*e.config.scale-1e-5);
    assert.ok(angle(jawQuaternion,jaw.rotationQuaternion)<1e-7,id+': no jaw-local twist');assert.ok(jaw.position.clone().normalize().equalsWithEpsilon(jawAxis,1e-6),id+': head-relative jaw axis preserved');
   }
   assert.ok(tailJitter<1e-5,JSON.stringify({id,clip,target,tailJitter,reason:'fixed opponent and source must settle'}));assert.ok(maxVelocity<1.7,JSON.stringify({id,clip,target,maxVelocity,reason:'safety rejection cannot create a reverse snap'}));
   for(const [node,position,scale,rotation]of body){assert.ok(node.position.equalsWithEpsilon(position,1e-6));assert.ok(node.scaling.equalsWithEpsilon(scale,1e-6));if(node!==e.nodes.head&&node!==e.nodes.neck&&rotation)assert.ok(angle(rotation,node.rotationQuaternion)<1e-6,node.name+': source pose changed');}
   const once=e.nodes.head.absoluteRotationQuaternion.clone(),yaw=pose.watchYaw,pitch=pose.watchPitch;for(let query=0;query<12;query++)f.align();assert.ok(angle(once,e.nodes.head.absoluteRotationQuaternion)<1e-6);assert.equal(pose.watchYaw,yaw);assert.equal(pose.watchPitch,pitch);
   proof.push({id,clip,target,tailJitter,maxVelocity,minHeadRatio,minMuzzleRatio,maxDot});
  }
 }
 t.diagnostic(JSON.stringify({scope:'Actual shipped nodes/keys; 300 frames per stationary source/target and repeated same-sample alignment; no GPU/visual claim',conditions:proof.length,maxTailJitter:Math.max(...proof.map(row=>row.tailJitter)),maxVelocity:Math.max(...proof.map(row=>row.maxVelocity)),minHeadRatio:Math.min(...proof.map(row=>row.minHeadRatio)),minMuzzleRatio:Math.min(...proof.map(row=>row.minMuzzleRatio))}));
});

test('authored attack attention remains on its existing path',async t=>{
 const f=await fixture(t,'gray-wolf'),{e,pose}=f;f.sample('Circle_Watch_R5',0);const head=e.nodes.head.rotationQuaternion.clone(),neck=e.nodes.neck.rotationQuaternion.clone();e.brain.mode='attack';e.brain.action={authoredAttention:true};e.player.position.set(0,0,-1);pose.aim();assert.ok(angle(head,e.nodes.head.rotationQuaternion)<1e-7);assert.ok(angle(neck,e.nodes.neck.rotationQuaternion)<1e-7);
});

test('actual lying Alert plays through to its held endpoint without losing chest clearance or final stability',async t=>{
 let maxCorrectionVelocity=0,maxTailJitter=0;
 for(const id of ['gray-wolf','fox']){
  const f=await fixture(t,id),{e,pose}=f;e.player.position.set(0,0,-1);let previous=null;
  for(let frame=0;frame<360;frame++){
   f.sample('Alert_Lie_R5',Math.min(1.8,frame/60));const source=metrics(f),jaw=e.nodes.jaw.rotationQuaternion.clone();pose.aim();const current=metrics(f),correction=current.rotation.multiply(source.rotation.conjugate()).normalize();
   if(previous){const step=angle(previous,correction);maxCorrectionVelocity=Math.max(maxCorrectionVelocity,step*60);if(frame>=240)maxTailJitter=Math.max(maxTailJitter,step);}previous=correction;
   assert.ok(current.dot<=Math.min(-.08,source.dot+.3)+1e-5);assert.ok(current.headDistance>=source.headDistance*.94-1e-5);assert.ok(current.muzzleDistance>=source.muzzleDistance*.94-1e-5);assert.ok(current.muzzleHeight>=source.muzzleHeight-.04*e.config.scale-1e-5);assert.ok(angle(jaw,e.nodes.jaw.rotationQuaternion)<1e-7);
  }
 }
 assert.ok(maxTailJitter<1e-5);t.diagnostic(JSON.stringify({scope:'Native 1.8-second Alert interpolation then held endpoint; correction measured against each frame original authored orientation',maxCorrectionVelocity,maxTailJitter}));
});
