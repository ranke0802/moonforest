const major=new Set(['building','tree','tower','landmark']);
export function selectVillageShadowCasters(records,player,touch,previous=new Set()){
  const range=touch?28:36,limit=touch?28:44;
  const candidates=records.filter(r=>!r.root.isDisposed?.()&&(r.root.isEnabled()||r.cellActive===false)&&r.placement.kind!=='ground-detail')
    .map(r=>{
      const dx=Math.max(r.min.x-player.x,0,player.x-r.max.x),dz=Math.max(r.min.z-player.z,0,player.z-r.max.z);
      const distance=Math.hypot(dx,dz),important=major.has(r.placement.kind);
      const retained=previous.has(r);
      return {r,distance,important,retained,rank:distance-(retained?2:0)};
    }).filter(v=>v.distance<range+(v.retained?3:0)&&(v.important||v.distance<14+(v.retained?2:0)))
    .sort((a,b)=>a.rank-b.rank);
  // Reserve part of the existing budget for nearby gates, fences, gardens and
  // shrubs. Previously enough trees could starve every small caster forever.
  const selected=candidates.filter(v=>v.important).slice(0,Math.floor(limit*.6));
  const chosen=new Set(selected.map(v=>v.r));
  for(const v of candidates){if(selected.length===limit)break;if(!chosen.has(v.r)){selected.push(v);chosen.add(v.r);}}
  return selected.map(v=>v.r);
}
