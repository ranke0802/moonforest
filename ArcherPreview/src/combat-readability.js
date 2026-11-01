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

export function damageScreenSlot(point,lane,{width,height,safeInsets={}}={},out={}){
  const labelWidth=112,spacing=120,left=12+(safeInsets.left??0),top=142+(safeInsets.top??0),bottom=Number.isFinite(height)?height-32-(safeInsets.bottom??0):Infinity;
  const right=Number.isFinite(width)?width-12-(safeInsets.right??0)-(width>height?178:0):Infinity;
  const columns=Number.isFinite(right)?Math.max(1,Math.min(3,Math.floor((right-left+8)/spacing))):3;
  const base=Number.isFinite(bottom)?Math.max(top,Math.min(bottom,point.y)):point.y,gridTop=Number.isFinite(bottom)?top+(base-top)%22:base;
  const availableRows=Number.isFinite(bottom)?Math.max(1,Math.floor((bottom-gridTop)/22)+1):8,capacity=Math.min(24,columns*availableRows),visible=lane<capacity;
  const preferred=Number.isFinite(bottom)?Math.round((base-gridTop)/22):0,slot=lane%capacity,wantedRow=Math.floor(slot/columns);
  let row=preferred,found=0;
  for(let delta=1;found<wantedRow;delta++){
    if(preferred-delta>=0){row=preferred-delta;if(++found===wantedRow)break;}
    if(preferred+delta<availableRows){row=preferred+delta;found++;}
  }
  const offset=columns===3?(slot%3===0?0:slot%3===1?-spacing:spacing):columns===2?(slot%2-.5)*spacing:0;
  const half=(columns*labelWidth+(columns-1)*8)/2,center=Number.isFinite(right)?Math.max(left+half,Math.min(right-half,point.x)):point.x;
  out.x=center+offset;out.y=gridTop+row*22;out.visible=visible;out.labelWidth=labelWidth;return out;
}
