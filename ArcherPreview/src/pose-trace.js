// ?posetrace=1 — per-frame pose recorder for the "two poses on alternate frames"
// report. Records, after every rendered frame, what each live foe and the
// player's shield actually present: animation sample counter/clip/time, a few
// key joints, the skeleton matrices handed to the GPU and the root transform.
// Shift+P downloads the last ~1200 frames as JSON. Nothing runs without the flag.
const KEY_JOINTS=['pelvis','spine','chest','neck','head','tail_1','fore.L.upper','hind.R.upper'];
const sum=values=>{let total=0;for(let i=0;i<values.length;i+=7)total+=values[i]*(1+(i%13));return +total.toFixed(5);};
const round=value=>+Number(value).toFixed(4);
export function installPoseTrace({scene,getEncounters,getPlayer,getShield,limit=1200,doc=globalThis.document}){
 const frames=[];let last=performance.now(),frame=0;
 const observer=scene.onAfterRenderObservable.add(()=>{
  const now=performance.now(),row={f:frame++,t:Math.round(now),dt:+(now-last).toFixed(2),foes:[]};last=now;
  for(const foe of getEncounters()??[]){
   if(!foe?.active||!foe.asset)continue;
   const nodes=foe.nodes??{},body=foe.asset.meshes?.find(mesh=>mesh.skeleton&&mesh.getTotalVertices?.()>0);
   const joints={};for(const name of KEY_JOINTS){const q=nodes[name]?.rotationQuaternion;if(q)joints[name]=[round(q.x),round(q.y),round(q.z),round(q.w)];}
   let matrices=null;try{const m=body?.skeleton?.getTransformMatrices(body);if(m)matrices=sum(m);}catch{}
   const p=foe.actor?.position,a=foe.animator;
   foe.__traceFrames=(foe.__traceFrames??0)+1;
   row.foes.push({kind:foe.summonKind??foe.kind,mode:foe.brain?.mode,behavior:foe.brain?.behavior,state:foe.brain?.state,time:round(foe.brain?.time??0),serial:foe.brain?.serial,samples:a?.samples,clip:a?.current,blend:round(a?.blend??1),far:!!foe._far,skipped:!!foe._farSkipped,visible:foe.renderVisible,pos:p?[round(p.x),round(p.y),round(p.z)]:null,yaw:round(foe.actor?.rotation?.y??0),carrier:foe.carrier?[round(foe.carrier.position.x),round(foe.carrier.position.z)]:null,skeletonFrame:body?.skeleton?._currentRenderId??null,matrices,joints});
  }
  const shield=getShield?.();
  if(shield){shield.computeWorldMatrix?.();const m=shield.getWorldMatrix?.().m,player=getPlayer?.();row.shield=m?[round(m[12]),round(m[13]),round(m[14]),round(m[0]),round(m[1]),round(m[2])]:null;row.player=player?[round(player.position.x),round(player.position.z),round(player.rotation?.y??0)]:null;}
  frames.push(row);if(frames.length>limit)frames.shift();
 });
 const download=()=>{const blob=new Blob([JSON.stringify({format:'moonforest-pose-trace',version:1,userAgent:navigator.userAgent,frames})],{type:'application/json'});const url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=`moonforest-pose-trace-${Date.now()}.json`;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);};
 const onKey=event=>{if(event.shiftKey&&event.code==='KeyP'){event.preventDefault();download();}};
 doc.addEventListener('keydown',onKey);
 globalThis.moonforestPoseTrace={frames,download};
 return {dispose(){scene.onAfterRenderObservable.remove(observer);doc.removeEventListener('keydown',onKey);}};
}
