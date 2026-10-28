const major=new Set(['building','tree','tower','landmark']);
export function selectVillageShadowCasters(records,player,touch,previous=new Set()){
  const range=touch?28:36,limit=touch?28:44;
  return records.filter(r=>!r.root.isDisposed?.()&&(r.root.isEnabled()||r.cellActive===false)&&!['shrub','garden','ground-detail'].includes(r.placement.kind))
    .map(r=>{
      const dx=Math.max(r.min.x-player.x,0,player.x-r.max.x),dz=Math.max(r.min.z-player.z,0,player.z-r.max.z);
      const distance=Math.hypot(dx,dz),important=major.has(r.placement.kind);
      const retained=previous.has(r);
      return {r,distance,important,retained,rank:distance-(retained?2:0)};
    }).filter(v=>v.distance<range+(v.retained?3:0)&&(v.important||v.distance<14+(v.retained?2:0)))
    .sort((a,b)=>Number(b.important)-Number(a.important)||a.rank-b.rank).slice(0,limit).map(v=>v.r);
}
