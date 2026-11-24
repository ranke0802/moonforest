import {Vector3} from '@babylonjs/core/Maths/math.vector.js';

// Two mirrored vertices on the underside of the actual armoured breeches.
// The shipped PC, mobile and iOS profiles all use this same geometry. Resolve
// their complete skin weights once, so runtime contact follows the visible
// surface even when the walk clip rotates the pelvis or the legs spread.
export const RIDER_SEAT_VERTICES=Object.freeze([16262,16108]);
export function createRiderContact(actor){
  const body=actor.getChildMeshes(false).find(m=>m.name==='Warrior_Body_primitive0');
  if(!body?.skeleton || body.getTotalVertices()!==17089)return null;
  const vertices=body.getVerticesData('position'), bones=body.getVerticesData('matricesIndices'),
    weights=body.getVerticesData('matricesWeights');
  if(!vertices||!weights||!bones)return null;
  const links=new Map(), at=new Vector3(), local=new Vector3();
  const supports=[new Vector3(),new Vector3()];
  for(const [side,id] of RIDER_SEAT_VERTICES.entries()){
    Vector3.FromArrayToRef(vertices,id*3,at);
    for(let k=0;k<4;k++){
      const w=weights[id*4+k];
      if(w<=0)continue;
      const bone=body.skeleton.bones.find(b=>b.getIndex()===bones[id*4+k]);
      const node=bone?.getTransformNode();
      if(!node)return null;
      let link=links.get(node);
      if(!link){link={node,points:[new Vector3(),new Vector3()],weights:[0,0]};links.set(node,link);}
      Vector3.TransformCoordinatesToRef(at,bone.getAbsoluteInverseBindMatrix(),local);
      local.scaleAndAddToRef(w,link.points[side]);link.weights[side]+=w;
    }
  }
  const entries=Array.from(links.values());
  const left=entries.find(e=>e.node.name==='mixamorig:LeftUpLeg')?.node;
  const right=entries.find(e=>e.node.name==='mixamorig:RightUpLeg')?.node;
  if(!left||!right)return null;
  for(const link of entries)for(let i=0;i<2;i++){
    if(link.weights[i]>0)link.points[i].scaleInPlace(1/link.weights[i]);
  }
  return out=>{
    for(const p of supports)p.set(0,0,0);
    for(const {node,points,weights} of entries){
      const matrix=node.computeWorldMatrix(true);
      for(let i=0;i<2;i++){
        Vector3.TransformCoordinatesToRef(points[i],matrix,local);
        local.scaleAndAddToRef(weights[i],supports[i]);
      }
    }
    out.y=(supports[0].y+supports[1].y)*.5;
    // The centre panel of the breeches shifts side-to-side as the upper legs
    // twist. Centre the pelvis between the two hip sockets for symmetric boots.
    out.x=(left.absolutePosition.x+right.absolutePosition.x)*.5;
    out.z=(left.absolutePosition.z+right.absolutePosition.z)*.5;
    return -Math.atan2(supports[1].y-supports[0].y,
      Math.hypot(supports[1].x-supports[0].x,supports[1].z-supports[0].z));
  };
}
