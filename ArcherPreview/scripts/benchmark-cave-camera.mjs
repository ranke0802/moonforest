import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {NullEngine,Scene,ArcRotateCamera,Vector3} from '@babylonjs/core';
import {CaveCameraGuard} from '../src/witch-cave-camera.js';
import {createWitchCaveTerrain} from '../src/witch-cave-terrain.js';
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const terrain=createWitchCaveTerrain(),base=new Vector3(-42,terrain.heightAt(-42,43)+1.55,43),camera=new ArcRotateCamera('bench',Math.PI/2,1.18,24,base.clone(),scene);
const actor={position:base.clone()},world={scene,camera,terrain,cave:true,caveFog:{playerRoot:actor}},guard=new CaveCameraGuard(world);
const results={};
try{
 for(const mode of ['steady','orbit','move']){
  const samples=[];
  for(let i=0;i<2500;i++){
   if(mode==='orbit')camera.alpha=i*.013;
   if(mode==='move'){const t=(i%400)/400;actor.position.set(-42+7*t,0,43-11*t);actor.position.y=terrain.heightAt(actor.position.x,actor.position.z);base.copyFrom(actor.position);base.y+=1.55;camera.setTarget(base,false,false,true);}
   guard.follow(base,1/60);const start=performance.now();guard.beginFrame();guard.endFrame();if(i>=500)samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);results[mode]={samples:samples.length,p50Ms:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],meanMs:samples.reduce((a,b)=>a+b,0)/samples.length};
 }
 const result={scope:'Isolated NullEngine CPU camera guard including camera.update and matrices; no scene draws, GPU, FPS or thermal measurement',warmupFramesPerMode:500,...guard.inspect(),results,sourceSha256:createHash('sha256').update(await readFile(new URL('../src/witch-cave-camera.js',import.meta.url))).digest('hex')};
 await writeFile(new URL('../reports/cave-gpu-followup/camera-cpu.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{guard.dispose();scene.dispose();engine.dispose();}
