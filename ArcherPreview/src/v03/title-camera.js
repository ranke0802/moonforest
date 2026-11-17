// Title camera and tree crowns. The title camera circles the showcase fight
// on a fixed arm; where that circle passes through a tree crown the arm
// shortens until the camera is clear, then eases back. Pure geometry: a few
// box tests per frame against the trees near the fight, no allocation.
export const CROWN=Object.freeze({
 range:30,     // trees farther than this from the fight are ignored (m)
 inset:.12,    // crowns are round: shrink each side of the box by this share
 trunk:.4,     // the lowest share of the tree's height is trunk, not leaves
 margin:.7,    // keep this far outside a crown, sideways (m)
 lift:.3,      // and this far below its leaves (m)
 flat:1.43,    // pitch used under a crown: nearly level, below the leaves
 steps:Object.freeze([1,.8,.62,.46,.34]),
});
const TREE=/tree|oak|pine/;
// records: [{placement:{asset},min:{x,y,z},max:{x,y,z}}] → crown boxes near centre.
export function crownBoxes(records,centre,options=CROWN){
 const boxes=[];
 for(const record of records??[]){
  const min=record?.min,max=record?.max;
  if(!min||!max||!TREE.test(record.placement?.asset??''))continue;
  const cx=(min.x+max.x)/2,cz=(min.z+max.z)/2;
  if(Math.hypot(cx-centre.x,cz-centre.z)>options.range)continue;
  const ix=(max.x-min.x)*options.inset,iz=(max.z-min.z)*options.inset,m=options.margin;
  boxes.push({minX:min.x+ix-m,maxX:max.x-ix+m,minY:min.y+(max.y-min.y)*options.trunk-options.lift,maxY:max.y+m,minZ:min.z+iz-m,maxZ:max.z-iz+m});
 }
 return boxes;
}
export function insideCrown(boxes,x,y,z){
 for(const box of boxes)if(x>box.minX&&x<box.maxX&&y>box.minY&&y<box.maxY&&z>box.minZ&&z<box.maxZ)return true;
 return false;
}
// Longest arm, from `wanted` downward, whose camera position is outside every
// crown. target: {x,y,z}; alpha/beta: the arc camera's angles.
export function clearRadius(boxes,target,alpha,beta,wanted,lower=1,options=CROWN){
 if(!boxes.length)return wanted;
 const sx=Math.cos(alpha)*Math.sin(beta),sy=Math.cos(beta),sz=Math.sin(alpha)*Math.sin(beta);
 let radius=wanted;
 for(const step of options.steps){
  radius=Math.max(lower,wanted*step);
  if(!insideCrown(boxes,target.x+sx*radius,target.y+sy*radius,target.z+sz*radius))return radius;
 }
 return radius;
}
// The same search with a second chance: when the fight is under a crown no arm
// length clears it at the usual pitch, so the camera drops to a level view
// below the leaves. Returns the arm and pitch to ease toward.
export function clearView(boxes,target,alpha,beta,wanted,lower=1,options=CROWN){
 const out={radius:wanted,beta};
 if(!boxes.length)return out;
 for(const pitch of [beta,Math.max(beta,options.flat)]){
  const sx=Math.cos(alpha)*Math.sin(pitch),sy=Math.cos(pitch),sz=Math.sin(alpha)*Math.sin(pitch);
  for(const step of options.steps){
   const radius=Math.max(lower,wanted*step);
   if(!insideCrown(boxes,target.x+sx*radius,target.y+sy*radius,target.z+sz*radius)){out.radius=radius;out.beta=pitch;return out;}
  }
 }
 out.radius=Math.max(lower,wanted*options.steps[options.steps.length-1]);out.beta=Math.max(beta,options.flat);
 return out;
}
