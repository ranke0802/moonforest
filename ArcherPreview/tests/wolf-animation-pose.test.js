import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {WolfAnimator} from '../src/wolf-animation.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';

// The pose the animator wrote before 2026-11-22: sample every channel, then interpolate from the
// pose held at the last transition, also when that cross-fade is over (mix 1).
function oldPose(rows,time,from,mix){
 return rows.map((row,i)=>{
  const keys=row.keys,f=time*60;let index=0;while(index<keys.length-2&&f>keys[index+1].frame)index++;
  const a=keys[index],b=keys[Math.min(keys.length-1,index+1)],t=Math.max(0,Math.min(1,(f-a.frame)/Math.max(1e-9,b.frame-a.frame)));
  if(typeof a.value==='number'){const v=a.value+(b.value-a.value)*t;return from[i]+(v-from[i])*mix;}
  if(row.property==='rotationQuaternion'){const v=Quaternion.Slerp(a.value,b.value,t);return Quaternion.Slerp(from[i],v,mix);}
  const v=Vector3.Lerp(a.value,b.value,t);return Vector3.Lerp(from[i],v,mix);
 });
}
const close=(actual,expected,label)=>{
 if(typeof expected==='number'){assert.ok(Math.abs(actual-expected)<1e-12,label);return;}
 const a=actual.asArray(),e=expected.asArray(),sign=e.length===4&&a.reduce((sum,v,i)=>sum+v*e[i],0)<0?-1:1;   // q and -q are one rotation
 a.forEach((v,i)=>assert.ok(Math.abs(v-sign*e[i])<1e-12,label+' ['+i+'] '+v+' vs '+sign*e[i]));
};
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('root',scene);root.rotationQuaternion=Quaternion.Identity();
 const bones=Array.from({length:6},(_,i)=>{const node=new TransformNode('bone'+i,scene);node.rotationQuaternion=Quaternion.Identity();return node;}),morph={influence:0};
 const clip=(name,seed)=>{
  const frames=90,rows=[];
  const add=(target,property,value)=>rows.push({target,property,keys:Array.from({length:frames},(_,f)=>({frame:f,value:value(f)}))});
  add(root,'position',f=>new Vector3(f*.01*seed,0,Math.sin(f*.05)*seed));add(root,'rotationQuaternion',f=>Quaternion.RotationYawPitchRoll(f*.02*seed,0,0));
  bones.forEach((bone,i)=>{
   add(bone,'position',()=>new Vector3(i*.1,seed*.05,0));                       // constant, as most bone positions are
   add(bone,'scaling',()=>new Vector3(1,1,1));                                   // constant
   add(bone,'rotationQuaternion',i%3===2?()=>Quaternion.RotationYawPitchRoll(.3*seed,.1,0):f=>Quaternion.RotationYawPitchRoll(Math.sin(f*.07+i)*seed,f*.004*i,-.2*i));
  });
  add(morph,'influence',f=>.5+.5*Math.sin(f*.11*seed));
  const group={name,from:0,to:frames-1,stop(){},targetedAnimations:rows.map(row=>({target:row.target,animation:{targetProperty:row.property,framePerSecond:60,getKeys:()=>row.keys}}))};
  return {name,rows,group};
 };
 const rest=clip(WOLF_CLIPS.rest,1),watch=clip(WOLF_CLIPS.watch,-1.3);
 const animator=new WolfAnimator({transformNodes:[root,...bones],meshes:[],animationGroups:[rest.group,watch.group]},{animations:{rest:WOLF_CLIPS.rest,watch:WOLF_CLIPS.watch}});
 return {animator,rest,watch,dispose(){animator.dispose();scene.dispose();engine.dispose();}};
}
const read=rows=>rows.map(row=>{const v=row.target[row.property];return typeof v==='number'?v:v.clone();});

test('constant channels are recognised and the written pose equals the previous sampler during and after a cross-fade',()=>{
 const f=fixture();try{
  const tracks=f.animator.clips.get(WOLF_CLIPS.rest).map(row=>row.track);
  assert.deepEqual(tracks.map(track=>track.constant),f.rest.rows.map(row=>row.keys.every(key=>typeof key.value==='number'?key.value===row.keys[0].value:key.value.equals(row.keys[0].value))));
  assert.equal(tracks.filter(track=>track.constant).length,14,'6 positions + 6 scales + 2 held rotations');
  let from=read(f.rest.rows),current=f.rest,elapsed=1,duration=0;        // the constructor's transition: no fade
  const check=(time,dt,label)=>{
   f.animator.time=time;f.animator.update(dt);elapsed=duration>0?Math.min(1,elapsed+dt/duration):1;
   const mix=elapsed*elapsed*(3-2*elapsed),expected=oldPose(current.rows,time,from,mix);
   current.rows.forEach((row,i)=>close(row.target[row.property],expected[i],label+' '+row.target.name+'.'+row.property+' t='+time.toFixed(3)));
  };
  for(let i=0;i<40;i++)check((i*.037)%1.45,1/60,'rest');
  // Cross-fade to the other clip: the blended frames must match too, then the settled ones.
  from=read(f.watch.rows);f.animator.transition(WOLF_CLIPS.watch,{clipTime:0,blendDuration:.16});current=f.watch;elapsed=0;duration=.16;
  for(let i=0;i<30;i++)check(i/60,1/60,i<10?'fade':'watch');
  assert.equal(f.animator.blend,1);
  for(const time of [1.2,.3,1.4,0,.75])check(time,1/60,'watch seek');
 }finally{f.dispose();}
});
