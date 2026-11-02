import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createWorld,replaceWorldMap} from '../src/world.js';

const results=[];
const motes=scene=>scene.meshes.filter(mesh=>/^mote-\d+$/.test(mesh.name));
function fixture(t){const engine=new NullEngine(),world=createWorld(engine,{cave:true,touchDevice:true});t.after(()=>engine.dispose());return world;}
function track(t,meshes){
 let positions=0,toggles=0;const y=Object.getOwnPropertyDescriptor(Vector3.prototype,'y');
 for(const mesh of meshes){
  Object.defineProperty(mesh.position,'y',{configurable:true,get(){return y.get.call(this);},set(value){positions++;y.set.call(this,value);}});
  const setEnabled=mesh.setEnabled;t.mock.method(mesh,'setEnabled',function(...args){toggles++;return setEnabled.apply(this,args);});
 }
 return ()=>({positions,toggles});
}

test('hidden outdoor motes are disabled before the first cave frame and perform no updates in120seconds',t=>{
 const world=fixture(t),meshes=motes(world.scene);assert.equal(meshes.length,28);assert.ok(meshes.every(mesh=>!mesh.isEnabled()));
 const before=meshes.map(mesh=>mesh.position.asArray()),counts=track(t,meshes);
 for(let frame=0;frame<3600;frame++)world.tick(frame/30);
 assert.deepEqual(counts(),{positions:0,toggles:0});assert.deepEqual(meshes.map(mesh=>mesh.position.asArray()),before);
 results.push({case:'hidden120seconds',frames:3600,motes:28,...counts(),hiddenBeforeFirstFrame:true,previousPositionWrites:100800,previousVisibilityCalls:100800});
});

test('repeated cave/forest trips switch visibility once per map and preserve the original outdoor positions',t=>{
 const world=fixture(t),meshes=motes(world.scene),counts=track(t,meshes);let outdoorFrames=0;
 for(let trip=0;trip<20;trip++){
  replaceWorldMap(world,'warrior-v4');assert.ok(meshes.every(mesh=>mesh.isEnabled()),'outdoor effects return before rendering');
  for(let frame=0;frame<30;frame++){
   const time=trip*3+frame/30;world.tick(time);outdoorFrames++;
   for(const [i,mesh] of meshes.entries())assert.equal(mesh.position.y,.5+(i%7)*.34+Math.sin(time*.3+i*.8)*.12,'same authored phase and amplitude');
  }
  const atExit=meshes.map(mesh=>mesh.position.asArray());replaceWorldMap(world,'warrior-v5');assert.ok(meshes.every(mesh=>!mesh.isEnabled()),'cave entry hides effects before any tick');
  const paused=counts();for(let frame=0;frame<30;frame++)world.tick(trip*3+1+frame/30);
  assert.deepEqual(counts(),paused);assert.deepEqual(meshes.map(mesh=>mesh.position.asArray()),atExit);
  assert.deepEqual(motes(world.scene),meshes,'same28motes reused without creating copies');
 }
 assert.deepEqual(counts(),{positions:outdoorFrames*28,toggles:20*2*28});
 results.push({case:'twentyRoundtrips',roundTrips:20,outdoorFrames,...counts(),motes:28,originalOutdoorTrajectory:true,hiddenUpdates:0});
});

test.after(()=>{const folder=new URL('../reports/cave-repeat-review-2026-11-02/',import.meta.url);mkdirSync(folder,{recursive:true});writeFileSync(new URL('hidden-effects.json',folder),JSON.stringify({scope:'Actual world tick and map replacement in NullEngine; no GPU or physical temperature measurement.',results},null,2)+'\n');});
