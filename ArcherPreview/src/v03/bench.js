import {SceneInstrumentation} from '@babylonjs/core';
import {t} from './i18n.js';

// ?bench — one fixed, input-free measurement on the phone (structure plan,
// phase 0). The camera turns once around the player, then the render
// resolution is swept: if the frame time does not move with resolution the
// CPU is the limit, if it does the GPU (pixels) is. The result is JSON the
// user can copy or save; nothing is sent anywhere.
const ORBIT_SECONDS=20,SWEEP_SECONDS=6,SETTLE_SECONDS=5,SWEEP=[1,1.4,2];
const median=list=>{if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);return +s[s.length>>1].toFixed(2);};
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
export function createBench({doc,getWorld,info=()=>({}),wait=ms=>new Promise(r=>setTimeout(r,ms))}){
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
 async function run(){
  const world=getWorld(),scene=world?.scene,engine=scene?.getEngine(),camera=world?.camera;
  if(!scene||!camera)throw new Error('bench: no scene');
  show(t('bench.running'));await wait(SETTLE_SECONDS*1000);if(disposed)return null;
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
