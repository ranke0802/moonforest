import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {WolfV02LocomotionPose} from '../src/wolf-v02-locomotion.js';

function run({cached,scale}){
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('actor',scene),pelvis=new TransformNode('pelvis',scene);pelvis.parent=root;
 root.scaling.copyFromFloats(...scale);root.rotationQuaternion=Quaternion.RotationYawPitchRoll(.43,.06,-.04);pelvis.rotationQuaternion=Quaternion.RotationYawPitchRoll(-.3,.08,.05);pelvis.position.set(.1,.8,.2);
 const nodes=[root,pelvis],joints=[];
 for(let leg=0;leg<4;leg++){
  let parent=pelvis;
  for(let level=0;level<3;level++){const node=new TransformNode(`leg${leg}.${level}`,scene);node.parent=parent;node.rotationQuaternion=Quaternion.RotationYawPitchRoll(.01*leg,.04*level,-.02);node.position.set(leg%2?.2:-.2,-.2,leg<2?.25:-.25);nodes.push(node);joints.push(node);parent=node;}
 }
 const pose=Object.assign(Object.create(WolfV02LocomotionPose.prototype),{e:{animator:{samples:1}},slots:new Map(),parent:Quaternion.Identity(),world:Quaternion.Identity(),desired:Quaternion.Identity(),local:Quaternion.Identity()});
 for(const node of joints){const branch=nodes.filter(n=>{for(let p=n;p;p=p.parent)if(p===node)return true;return false;});pose.slots.set(node,{node,original:Quaternion.Identity(),changed:false,branch});}
 if(!cached){pose.setWorldRotation=function(node,rotation){this.remember(node);node.parent.getWorldMatrix().decompose(undefined,this.parent);this.parent.conjugateInPlace();this.parent.multiplyToRef(rotation,this.local);node.rotationQuaternion.copyFrom(this.local).normalize();this.refresh(node);};pose.rotateWorld=function(node,rotation){node.getWorldMatrix().decompose(undefined,this.world);rotation.multiplyToRef(this.world,this.desired);this.setWorldRotation(node,this.desired);};}
 for(const node of nodes)node.computeWorldMatrix(true);
 const original=Matrix.prototype.decompose,trace=[];let decomposes=0;
 Matrix.prototype.decompose=function(...args){decomposes++;return Reflect.apply(original,this,args);};
 try{
  for(let frame=0;frame<40;frame++){
   // Dirty parent changes within the same render ID must remain visible.
   if(frame%3===0)root.rotationQuaternion.copyFrom(Quaternion.RotationYawPitchRoll(.43+frame*.003,.06,-.04));
   for(let i=0;i<joints.length;i++)pose.rotateWorld(joints[i],Quaternion.RotationAxis(Vector3.Up(),.002*(i%2?1:-1)));
   for(const node of nodes)trace.push(...node.getWorldMatrix().m,...(node.rotationQuaternion?.asArray()??[]));
  }
  return {trace,decomposes};
 }finally{Matrix.prototype.decompose=original;scene.dispose();engine.dispose();}
}

test('cached SDK absolute rotations preserve full joint poses and skip repeated parent decompositions',t=>{
 for(const scale of [[2.5,2.5,2.5],[1.2,.8,1.6],[-1.2,.8,1.6]]){
  const baseline=run({cached:false,scale}),candidate=run({cached:true,scale});
  assert.equal(candidate.trace.length,baseline.trace.length);let error=0;for(let i=0;i<baseline.trace.length;i++)error=Math.max(error,Math.abs(candidate.trace[i]-baseline.trace[i]));
  assert.ok(error<1e-6,`same matrix decomposition must preserve reflected/scaled pose: ${error}`);
  assert.ok(candidate.decomposes<baseline.decomposes*.9,`${candidate.decomposes} must be below baseline ${baseline.decomposes}`);
  t.diagnostic(`scale=${scale.join(',')} decompositions ${baseline.decomposes} -> ${candidate.decomposes}, maximum matrix/quaternion difference ${error}`);
 }
});
