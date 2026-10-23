import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, TransformNode, Vector3, FreeCamera, Matrix } from '@babylonjs/core';
import { FrameLoop } from '../src/frame-loop.js';
import { orderPoseNodes, refreshPoseMatrices } from '../src/pose-matrices.js';
import { renderPixelRatio, RenderActivity } from '../src/render-policy.js';
import { ScreenProjection } from '../src/screen-projection.js';

test('touch rendering bounds supersampling while keeping desktop quality and low-DPR screens intact',()=>{
  assert.equal(renderPixelRatio(3,'high',true),2);
  assert.equal(renderPixelRatio(3,'balanced',true),1.5);
  assert.equal(renderPixelRatio(3,'high',false),3);
  assert.equal(renderPixelRatio(1,'high',true),1);
  assert.equal(renderPixelRatio(3,'battery',true),1);
  assert.equal(renderPixelRatio(NaN,'unknown',true),1);
});

test('mobile stays capped at 30 during idle, gestures and sustained combat',()=>{
  let time=0;const activity=new RenderActivity(true,()=>time);
  assert.equal(activity.limit(),30);
  time=2999;assert.equal(activity.limit(),30);
  time=3000;assert.equal(activity.limit(),30);
  activity.wake();assert.equal(activity.limit(),30);
  time=10000;assert.equal(activity.limit({busy:true}),30);
  time=12000;assert.equal(activity.limit(),30);
  time=13000;assert.equal(activity.limit(),30);
  assert.equal(activity.limit({busy:true,quality:'battery'}),30);
  const desktop=new RenderActivity(false,()=>time);time+=10000;assert.equal(desktop.limit(),60);
});

test('desktop drops to 30 only after sustained inability to reach 60 and never oscillates',()=>{
 const stable=new RenderActivity(false),slow=new RenderActivity(false);
 for(let i=0;i<600;i++)stable.recordFrame(1/60);assert.equal(stable.limit(),60);
 slow.recordFrame(.1);for(let i=0;i<120;i++)slow.recordFrame(1/60);assert.equal(slow.limit(),60);
 for(let i=0;i<200;i++)slow.recordFrame(1/45);assert.equal(slow.limit(),30);
 slow.wake();for(let i=0;i<600;i++)slow.recordFrame(1/60);assert.equal(slow.limit(),30);
});

test('shared HUD projection matches camera transforms across render scale and orientation changes',()=>{
  const engine=new NullEngine({renderWidth:1280,renderHeight:720}),scene=new Scene(engine);
  const camera=new FreeCamera('camera',new Vector3(0,2,-6),scene);camera.setTarget(new Vector3(0,1,0));scene.render();
  const projection=new ScreenProjection(scene),position=new Vector3(1,1.4,0);
  for(const [width,height] of [[640,360],[844,390],[390,844]]){
    projection.resize(width,height);projection.beginFrame();
    const expected=Vector3.Project(position,Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
    const result=projection.project(position);
    assert.ok(result.visible);
    assert.ok(Math.abs(result.x-expected.x*width/engine.getRenderWidth())<1e-6);
    assert.ok(Math.abs(result.y-expected.y*height/engine.getRenderHeight())<1e-6);
  }
  const before={...projection.project(position)};
  camera.position.set(6,2,0);camera.setTarget(new Vector3(0,1,0));scene.render();projection.beginFrame();
  assert.ok(Math.abs(projection.project(position).x-before.x)>5);
  assert.equal(projection.project(new Vector3(100,0,0)).visible,false);
  scene.dispose();engine.dispose();
});

test('suspended rendering stops all frames, resumes without advancing hidden time, and repaints resize once',()=>{
  const callbacks=new Set(),steps=[];let time=0;
  const loop=new FrameLoop({runRenderLoop:f=>callbacks.add(f),stopRenderLoop:f=>callbacks.delete(f)},dt=>steps.push(dt),()=>time);
  const tick=()=>{time+=16;for(const f of [...callbacks])f();};
  loop.setPaused(false);tick();tick();assert.deepEqual(steps,[0,.016]);
  loop.setPaused(true);time+=10000;tick();assert.equal(steps.length,2);assert.equal(callbacks.size,0);
  loop.invalidate();tick();assert.equal(steps.at(-1),0);assert.equal(callbacks.size,0);
  loop.setPaused(false);tick();tick();assert.deepEqual(steps.slice(-2),[0,.016]);
});

test('ordered pose refresh preserves same-frame root corrections with no recursive forced computation',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),root=new TransformNode('root',scene),hip=new TransformNode('hip',scene),arm=new TransformNode('arm',scene),hand=new TransformNode('hand',scene);
 hip.parent=root;arm.parent=hip;hand.parent=arm;hip.position.set(0,1,0);arm.position.set(1,0,0);hand.position.set(1,0,0);
 hand.computeWorldMatrix(true);const ordered=orderPoseNodes([hand,hip,arm]);assert.deepEqual(ordered,[hip,arm,hand]);
 root.position.set(3,0,2);root.rotation.y=Math.PI/2;root.computeWorldMatrix(true);
 refreshPoseMatrices(ordered);const optimized=hand.getAbsolutePosition().clone();hand.computeWorldMatrix(true);
 assert.ok(Vector3.Distance(optimized,hand.getAbsolutePosition())<1e-7);assert.ok(Vector3.Distance(optimized,new Vector3(3,1,0))<1e-7);
 scene.dispose();engine.dispose();
});
