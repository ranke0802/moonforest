const major=new Set(['building','tree','tower','landmark']);
export function selectVillageShadowCasters(records,player,touch){
  const range=touch?28:36,limit=touch?28:44;
  return records.filter(r=>r.root.isEnabled()&&!['shrub','garden','ground-detail'].includes(r.placement.kind))
    .map(r=>{
      const dx=Math.max(r.min.x-player.x,0,player.x-r.max.x),dz=Math.max(r.min.z-player.z,0,player.z-r.max.z);
      const distance=Math.hypot(dx,dz),important=major.has(r.placement.kind);
      return {r,distance,important};
    }).filter(v=>v.distance<range&&(v.important||v.distance<14))
    .sort((a,b)=>Number(b.important)-Number(a.important)||a.distance-b.distance).slice(0,limit).map(v=>v.r);
}
