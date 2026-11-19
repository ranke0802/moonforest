import {SceneInstrumentation} from '@babylonjs/core';
import {t} from './i18n.js';

// ?bench — one fixed, input-free measurement on the phone (structure plan,
// phase 0). The camera turns once around the player, then the render
// resolution is swept: if the frame time does not move with resolution the
// CPU is the limit, if it does the GPU (pixels) is. The result is JSON the
// user can copy or save; nothing is sent anywhere.
const ORBIT_SECONDS=20,SWEEP_SECONDS=6,SETTLE_SECONDS=5,SWEEP=[1,1.4,2];
const median=list=>{if(!list?.length)return null;const s=[...list].sort((a,b)=>a-b);return +s[s.length>>1].toFixed(2);};
const pct=(list,p)=>{if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);return +s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2);};
export function summarize(intervals){
 if(!intervals.length)return {frames:0};
 const fps=intervals.map(ms=>1000/ms),sorted=[...fps].sort((a,b)=>a-b),low=sorted.slice(0,Math.max(1,Math.floor(sorted.length*.01)));
 return {frames:intervals.length,fpsAvg:+(intervals.length*1000/intervals.reduce((a,b)=>a+b,0)).toFixed(1),fps1Low:+(low.reduce((a,b)=>a+b,0)/low.length).toFixed(1),
  frameMsMedian:median(intervals),frameMsP95:pct(intervals,.95),stallsOver100ms:intervals.filter(ms=>ms>100).length};
}
// Reading the sweep: frame time that drops as pixels drop means the GPU is
// the limit; flat means the CPU (scene work, draw submission) is.
export function verdict(sweep){
 const base=sweep.find(s=>s.scale===1)?.frameMsMedian,low=sweep[sweep.length-1]?.frameMsMedian;
 if(!base||!low)return 'unknown';
 // Already at the display rate: nothing to tell apart.
 if(base<=17.5)return 'none';
 return low<base*.85?'gpu':'cpu';
}
export function createBench({doc,getWorld,info=()=>({}),travel=null,isReady=()=>true,mode='orbit',wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 let panel=null,disposed=false;
 function show(text,result){
  panel??=doc.body.appendChild(Object.assign(doc.createElement('div'),{className:'v03-bench'}));
  panel.style.cssText='position:fixed;left:8px;top:8px;z-index:99999;max-width:min(92vw,560px);max-height:80vh;overflow:auto;background:rgba(10,14,12,.92);color:#e8e2c8;font:12px/1.4 monospace;padding:10px;border:1px solid #c9a75a;border-radius:6px;user-select:text;-webkit-user-select:text;';
  panel.textContent='';const head=doc.createElement('div');head.textContent=text;panel.append(head);
  if(!result)return;
  const json=JSON.stringify(result,null,1),pre=doc.createElement('pre');pre.textContent=json;pre.style.whiteSpace='pre-wrap';
  const row=doc.createElement('div');
  const copy=doc.createElement('button');copy.type='button';copy.textContent=t('bench.copy');copy.onclick=()=>doc.defaultView?.navigator?.clipboard?.writeText(json);
  const save=doc.createElement('button');save.type='button';save.textContent=t('bench.save');save.onclick=()=>{const a=doc.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`moonforest-bench-${result.map}-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const close=doc.createElement('button');close.type='button';close.textContent=t('bench.close');close.onclick=()=>{panel?.remove();panel=null;};
  for(const b of [copy,save,close]){b.style.cssText='margin:6px 6px 0 0;padding:6px 10px;font:inherit;';row.append(b);}
  panel.append(row,pre);
 }
 async function phase(scene,seconds,each){
  const intervals=[],cpu={sceneMs:[],activeMeshesMs:[],drawSubmissionMs:[],renderTargetsMs:[],drawCalls:[],triangles:[]};
  const inst=new SceneInstrumentation(scene);inst.captureFrameTime=inst.captureActiveMeshesEvaluationTime=inst.captureRenderTime=inst.captureRenderTargetsRenderTime=true;
  let last=performance.now(),elapsed=0;
  const observer=scene.onAfterRenderObservable.add(()=>{
   const now=performance.now(),dt=now-last;last=now;elapsed+=dt;intervals.push(dt);each?.(dt,elapsed);
   cpu.sceneMs.push(inst.frameTimeCounter.current);cpu.activeMeshesMs.push(inst.activeMeshesEvaluationTimeCounter.current);cpu.drawSubmissionMs.push(inst.renderTimeCounter.current);
   cpu.renderTargetsMs.push(inst.renderTargetsRenderTimeCounter.current);cpu.drawCalls.push(inst.drawCallsCounter.current);cpu.triangles.push(Math.floor((scene.getActiveIndices?.()??0)/3));
  });
  try{await wait(seconds*1000);}finally{scene.onAfterRenderObservable.remove(observer);inst.dispose();}
  intervals.shift();
  return {...summarize(intervals),cpuMedian:Object.fromEntries(Object.entries(cpu).map(([k,v])=>[k,median(v)])),cpuP95:{sceneMs:pct(cpu.sceneMs,.95)}};
 }
 function sceneCounts(scene){
  let enabled=0;for(const mesh of scene.meshes)if(mesh.isEnabled()&&mesh.isVisible&&mesh.getTotalVertices())enabled++;
  return {meshes:scene.meshes.length,enabledMeshes:enabled,activeMeshes:scene.getActiveMeshes().length,materials:scene.materials.length,textures:scene.textures.length,animationGroups:scene.animationGroups.length,skeletons:scene.skeletons.length,transformNodes:scene.transformNodes.length};
 }
 const heap=()=>{const m=doc.defaultView?.performance?.memory;return m?Math.round(m.usedJSHeapSize/1048576):null;};
 async function waitReady(limitMs=90000){const until=performance.now()+limitMs;await wait(500);while(!isReady()&&performance.now()<until)await wait(250);return isReady();}
 // ?bench=roundtrip: plains → village → plains three times, measuring the
 // same arrival spot each visit. Growth across visits means something from a
 // previous visit is still alive (2026-11-19 phone record: 55 → 50 → 40 fps).
 async function roundtrip(){
  const visits=[];const measure=async(label,seconds,orbitSeconds,loadMs)=>{
   const world=getWorld(),scene=world.scene,camera=world.camera;await wait(8000);
   const alpha=camera.alpha;const r=await phase(scene,seconds,orbitSeconds?(dt,elapsed)=>{camera.alpha=alpha+Math.PI*2*Math.min(1,elapsed/(orbitSeconds*1000));}:null);camera.alpha=alpha;
   visits.push({label,map:world.mapId,loadMs,fpsAvg:r.fpsAvg,fps1Low:r.fps1Low,frameMsMedian:r.frameMsMedian,stalls:r.stallsOver100ms,cpu:r.cpuMedian,jsHeapMB:heap(),...sceneCounts(scene)});
   show(t('bench.trip',{step:visits.length}));
  };
  const go=async id=>{const start=performance.now();await travel(id);const ok=await waitReady();if(!ok)throw new Error('bench: map did not finish loading: '+id);return Math.round(performance.now()-start);};
  let load=getWorld().mapId==='great-plains'?null:await go('warrior-plains');
  await measure('plains-1',ORBIT_SECONDS,ORBIT_SECONDS,load);
  for(let i=2;i<=3;i++){
   if(disposed)return null;await measure('village-'+(i-1),8,0,await go('warrior-v3'));
   if(disposed)return null;await measure('plains-'+i,ORBIT_SECONDS,ORBIT_SECONDS,await go('warrior-plains'));
  }
  const first=visits[0],last=visits[visits.length-1];
  return {growth:{fps:+(last.fpsAvg-first.fpsAvg).toFixed(1),enabledMeshes:last.enabledMeshes-first.enabledMeshes,meshes:last.meshes-first.meshes,triangles:(last.cpu.triangles??0)-(first.cpu.triangles??0),jsHeapMB:(last.jsHeapMB??0)-(first.jsHeapMB??0)},visits};
 }
 async function run(){
  const world=getWorld(),scene=world?.scene,engine=scene?.getEngine(),camera=world?.camera;
  if(!scene||!camera)throw new Error('bench: no scene');
  show(t(mode==='roundtrip'&&travel?'bench.trip':'bench.running',{step:0}));await wait(SETTLE_SECONDS*1000);if(disposed)return null;
  if(mode==='roundtrip'&&travel){
   const engine0=scene.getEngine(),trip=await roundtrip();if(!trip)return null;
   const result={version:1,mode,at:new Date().toISOString(),...info(),device:{ua:doc.defaultView?.navigator?.userAgent,dpr:doc.defaultView?.devicePixelRatio,hardwareScaling:engine0.getHardwareScalingLevel(),render:[engine0.getRenderWidth(),engine0.getRenderHeight()]},...trip};
   show(t('bench.done'),result);return result;
  }
  const alpha=camera.alpha,mem=()=>doc.defaultView?.performance?.memory?Math.round(doc.defaultView.performance.memory.usedJSHeapSize/1048576):null;
  const orbit=await phase(scene,ORBIT_SECONDS,(dt,elapsed)=>{camera.alpha=alpha+Math.PI*2*Math.min(1,elapsed/(ORBIT_SECONDS*1000));});
  camera.alpha=alpha;
  const baseLevel=engine.getHardwareScalingLevel(),sweep=[];
  try{for(const scale of SWEEP){engine.setHardwareScalingLevel(baseLevel*scale);await wait(1000);const r=await phase(scene,SWEEP_SECONDS);sweep.push({scale,width:engine.getRenderWidth(),height:engine.getRenderHeight(),fpsAvg:r.fpsAvg,frameMsMedian:r.frameMsMedian,sceneMs:r.cpuMedian.sceneMs});if(disposed)return null;}}
  finally{engine.setHardwareScalingLevel(baseLevel);}
  const result={version:1,at:new Date().toISOString(),map:world.mapId,...info(),
   device:{ua:doc.defaultView?.navigator?.userAgent,dpr:doc.defaultView?.devicePixelRatio,hardwareScaling:baseLevel,render:[engine.getRenderWidth(),engine.getRenderHeight()]},
   scene:{meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,animationGroups:scene.animationGroups.length,skeletons:scene.skeletons.length},
   jsHeapMB:mem(),orbit,sweep,limit:verdict(sweep)};
  show(t('bench.done'),result);return result;
 }
 return {run,dispose(){disposed=true;panel?.remove();panel=null;}};
}
