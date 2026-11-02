// Battle HUD priority is independent of animated head positions. No picking,
// scene traversal, extra render pass or GPU resource is needed.
export function primaryHealthBoss(encounters,position,previousId){
  let closest=null,distance=Infinity,previous=null,previousDistance=Infinity;
  for(const boss of encounters){
    if(!boss.active||boss.corpseGone||boss.kind==='goblin'||boss.fogVisible===false||boss.renderVisible===false)continue;
    const p=boss.actor?.position;if(!p)continue;
    const d=Math.hypot(p.x-(position?.x??0),p.z-(position?.z??0));
    if(d<distance){closest=boss;distance=d;}
    if(boss.id===previousId){previous=boss;previousDistance=d;}
  }
  return previous&&previousDistance<=distance*1.2+1?previous:closest;
}

export function markerScreenAngle(foot,forward){
  const dx=forward.x-foot.x,dy=forward.y-foot.y;
  return Number.isFinite(dx)&&Number.isFinite(dy)&&dx*dx+dy*dy>.01?Math.atan2(dy,dx)+Math.PI/2:null;
}
