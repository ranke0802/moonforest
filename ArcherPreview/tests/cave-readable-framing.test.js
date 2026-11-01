import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {caveReadableCamera,caveSafeCameraRadius,caveCameraBlocked,CaveCameraGuard,cavePlayerMarkerClear} from '../src/witch-cave-camera.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';

test('obstructed default orbit gains readable distance without changing yaw or crossing rock',()=>{
 const terrain=createWitchCaveTerrain(),base={x:-19,z:-26,y:terrain.heightAt(-19,-26)+1.05},alpha=16*Math.PI/12;
 const v=caveReadableCamera(terrain,base,alpha,1.18,13);
 assert.ok(v.radius>v.baselineRadius+.75);assert.ok(v.beta<1.18&&v.beta>=.7);
 const lift=Math.max(0,-.35-v.radius*Math.cos(v.beta));
 assert.equal(caveCameraBlocked(terrain,base.x+Math.cos(alpha)*Math.sin(v.beta)*v.radius,base.y+lift+Math.cos(v.beta)*v.radius,base.z+Math.sin(alpha)*Math.sin(v.beta)*v.radius),false);
 for(const beta of [.25,1.78,Math.PI-.035]){
  const manual=caveReadableCamera(terrain,base,alpha,beta,13);
  assert.equal(manual.beta,beta,'explicit look-up and high angle remain authoritative');
 }
 for(const requested of [.8,2,5.9]){
  const close=caveReadableCamera(terrain,base,alpha,1.18,requested);
  assert.equal(close.beta,1.18);assert.equal(close.radius,caveSafeCameraRadius(terrain,base,alpha,1.18,requested));
 }
});

test('every eased camera eye is safe and requested controls survive repeat frames, inspection and map exit',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine),terrain=createWitchCaveTerrain();
 const base=new Vector3(-19,terrain.heightAt(-19,-26)+1.05,-26),alpha=16*Math.PI/12;
 const camera=new ArcRotateCamera('readable',alpha,1.18,13,base.clone(),scene),world={scene,camera,terrain,cave:true};
 const originalObservers=scene.onDisposeObservable.observers.length,guard=new CaveCameraGuard(world);
 try{
  const baseline=caveSafeCameraRadius(terrain,base,alpha,1.18,13);
  for(let i=0;i<180;i++){
   guard.follow(base,1/30,{stable:true});guard.beginFrame();
   const eye=camera.globalPosition;
   assert.equal(caveCameraBlocked(terrain,eye.x,eye.y,eye.z),false);
   assert.equal(camera.alpha,alpha);guard.endFrame();
   assert.equal(camera.beta,1.18);assert.equal(camera.radius,13);assert.ok(camera.target.equals(base));
  }
  assert.ok(guard.inspect().effectiveRadius>baseline+.7);
  camera.beta=1.499;
  for(let i=0;i<90;i++){guard.follow(base,1/30,{stable:true});guard.beginFrame();guard.endFrame();}
  const prior=guard.inspect().effectiveBeta;camera.beta=1.501;guard.follow(base,1/30,{stable:true});guard.beginFrame();
  assert.ok(Math.abs(camera.beta-prior)<.12,'crossing eligibility must ease instead of snapping the view');guard.endFrame();
  camera.radius=2;
  for(let i=0;i<90;i++){guard.follow(base,1/30,{stable:true});guard.beginFrame();guard.endFrame();}
  assert.equal(camera.beta,1.501);assert.equal(guard.inspect().pitchCorrection,0);
  assert.equal(camera.radius,2);
  world.cave=false;guard.beginFrame();assert.equal(guard.inspect().pitchCorrection,0);
  assert.equal(guard.inspect().reason,'inactive');
  guard.dispose();guard.dispose();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scene.onDisposeObservable.observers.length,originalObservers);
 }finally{scene.dispose();engine.dispose();}
});

test('boss proximity marker never passes through a structural wall, floor or roof',()=>{
 const terrain=createWitchCaveTerrain(),player={x:-42,y:terrain.heightAt(-42,43),z:43};
 assert.equal(cavePlayerMarkerClear(terrain,{x:-42,y:player.y+2,z:43},player),true);
 assert.equal(cavePlayerMarkerClear(terrain,{x:-42,y:100,z:43},player),false);
 assert.equal(cavePlayerMarkerClear(terrain,{x:-42,y:player.y-1,z:43},player),false);
});
