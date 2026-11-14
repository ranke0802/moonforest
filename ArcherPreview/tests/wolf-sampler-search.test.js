import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {WolfAnimator} from '../src/wolf-animation.js';
import {WOLF_CLIPS} from '../src/wolf-spec.js';
import {WOLF_V02_ACTIVE_CLIPS} from '../src/wolf-v02-authored-clips.js';

function fixture(count=212){
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('root',scene);root.rotationQuaternion=Quaternion.Identity();
 const morph={influence:0};let reads=0;
 const values=type=>Array.from({length:count},(_,i)=>({get frame(){reads++;return i;},value:type==='scalar'?Math.sin(i*.03):type==='quaternion'?Quaternion.RotationYawPitchRoll(i*.01,i*.003,-i*.002):new Vector3(i*.01,Math.sin(i*.02),-i*.003)}));
 const tables=[values('vector'),values('quaternion'),values('scalar')];
 const rows=tables.map((keys,index)=>({target:index===2?morph:root,animation:{targetProperty:['position','rotationQuaternion','influence'][index],framePerSecond:60,getKeys:()=>keys}}));
 const group={name:WOLF_CLIPS.rest,from:0,to:count-1,targetedAnimations:rows,stop(){}};
 const animator=new WolfAnimator({transformNodes:[root],meshes:[],animationGroups:[group]},{animations:{rest:WOLF_CLIPS.rest}});
 return {animator,tables,tracks:animator.clips.get(WOLF_CLIPS.rest).map(row=>row.track),resetReads(){reads=0;},get reads(){return reads;},dispose(){animator.dispose();scene.dispose();engine.dispose();}};
}
function reference(keys,quaternion=false){
 let index=0;const scalar=typeof keys[0].value==='number',out=scalar?null:keys[0].value.clone();
 return frame=>{if(frame<keys[index].frame)index=0;while(index<keys.length-2&&frame>keys[index+1].frame)index++;
  const a=keys[index],b=keys[Math.min(keys.length-1,index+1)],t=Math.max(0,Math.min(1,(frame-a.frame)/Math.max(1e-9,b.frame-a.frame)));
  if(scalar)return a.value+(b.value-a.value)*t;
  if(quaternion)Quaternion.SlerpToRef(a.value,b.value,t,out);else Vector3.LerpToRef(a.value,b.value,t,out);return out;
 };
}

test('wolf cursor preserves exact TRS/scalar interpolation on forward, backward, repeat and out-of-range samples',()=>{
 const f=fixture();try{
  const original=f.tables.map((keys,i)=>reference(keys,i===1));
  const frames=[0,1,.25,210.75,101.3,140.1,141.4,141,140,0,211,300,-10,...Array.from({length:512},(_,i)=>(i*73.37)%211)];
  for(const frame of frames)for(let i=0;i<f.tracks.length;i++){
   const a=f.tracks[i].sample(frame/60),b=original[i](frame);
   const av=typeof a==='number'?[a]:a.asArray(),bv=typeof b==='number'?[b]:b.asArray();
   for(let k=0;k<av.length;k++)assert.ok(Math.abs(av[k]-bv[k])<1e-12,`frame ${frame} channel ${i} component ${k}`);
  }
 }finally{f.dispose();}
});

test('late maul rewinds use bounded binary search instead of scanning from the first key',()=>{
 const f=fixture(),frames=[210.8,103.4,198.6,100.2,205.6,106.2];try{
  const old=reference(f.tables[0]);f.resetReads();for(const frame of frames)old(frame);const before=f.reads;
  f.resetReads();for(const frame of frames)f.tracks[0].sample(frame/60);const after=f.reads;
  assert.ok(after<before/5,`key frame reads: ${before} -> ${after}`);
  assert.ok(after<=frames.length*25,`bounded reads ${after}`);
  console.log(JSON.stringify({case:'212-key-late-rewind',samples:frames.length,beforeFrameReads:before,afterFrameReads:after}));
 }finally{f.dispose();}
});

test('normal neighbouring playback remains constant work and actor cursors are independent',()=>{
 const a=fixture(),b=fixture();try{
  a.tracks[0].sample(180/60);b.tracks[0].sample(10/60);a.resetReads();b.resetReads();
  const x=a.tracks[0].sample(181/60).clone(),y=b.tracks[0].sample(11/60).clone();
  assert.ok(a.reads<14);assert.ok(b.reads<14);assert.notDeepEqual(x.asArray(),y.asArray());
  assert.deepEqual(a.tracks[0].sample(181/60).asArray(),x.asArray());
 }finally{a.dispose();b.dispose();}
});

test('actual 0.2 ram and repeated low bites preserve every authored channel while reducing rewind search',()=>{
 const clip=WOLF_V02_ACTIVE_CLIPS.find(c=>c.name==='Wolf_Close_Ram_Ground_Maul_V02');
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('root',scene);root.rotationQuaternion=Quaternion.Identity();
 let reads=0;
 const rows=clip.channels.map((channel,i)=>{
  const property={translation:'position',rotation:'rotationQuaternion',scale:'scaling'}[channel.path];
  const target=new TransformNode('channel-'+i,scene);target.rotationQuaternion=Quaternion.Identity();
  const keys=channel.times.map((time,j)=>({get frame(){reads++;return time*clip.fps;},value:channel.path==='rotation'?Quaternion.FromArray(channel.values[j]):Vector3.FromArray(channel.values[j])}));
  return {target,animation:{targetProperty:property,framePerSecond:clip.fps,getKeys:()=>keys}};
 });
 const animator=new WolfAnimator({transformNodes:[root,...rows.map(r=>r.target)],meshes:[],animationGroups:[{name:WOLF_CLIPS.rest,from:0,to:clip.duration*clip.fps,targetedAnimations:rows,stop(){}}]},{animations:{rest:WOLF_CLIPS.rest}});
 try{
  const original=rows.map(row=>reference(row.animation.getKeys(),row.animation.targetProperty==='rotationQuaternion'));
  const times=[0,.9,1.7,2.4,1.78,2.34,1.78,2.34,1.78,2.34,3.3,0];
  reads=0;const expected=times.map(time=>original.map(sample=>sample(time*clip.fps).asArray()));const before=reads;
  reads=0;let checked=0;
  for(let i=0;i<times.length;i++)for(let j=0;j<rows.length;j++){
   const got=animator.clips.get(WOLF_CLIPS.rest)[j].track.sample(times[i]).asArray();
   for(let k=0;k<got.length;k++)assert.ok(Math.abs(got[k]-expected[i][j][k])<1e-12);
   checked++;
  }
  const after=reads;assert.ok(after<before*.45,`${before} -> ${after}`);
  console.log(JSON.stringify({case:clip.name,channels:rows.length,poseChannelChecks:checked,beforeFrameReads:before,afterFrameReads:after}));
 }finally{animator.dispose();scene.dispose();engine.dispose();}
});
