// Limb poses set over whatever clip is playing (0.3). The story needs a few
// poses the models have no clip for (seated in the wagon, lying thrown on the
// ground, pushing the wagon). Each bone of a chain is turned so it points
// along a direction given in the body's own frame (up / front / left).
// Only rotations of the rig's own nodes change: no bone is scaled or moved, so
// nothing can stretch; a pose can only bend joints. Nothing is allocated per
// frame.
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';

const FORWARD=new Vector3(0,0,1),from=new Vector3(),to=new Vector3(),other=new Vector3(),side=new Vector3(),up=new Vector3(),front=new Vector3(),turn=new Quaternion(),world=new Quaternion(),parentWorld=new Quaternion(),none=Quaternion.Identity(),scratch=new Vector3();
// v: [up, front, left]. Indexed, not destructured: this runs per bone per frame.
const toFrame=(out,v)=>{out.set(0,0,0);up.scaleToRef(v[0],scratch);out.addInPlace(scratch);front.scaleToRef(v[1],scratch);out.addInPlace(scratch);side.scaleToRef(v[2],scratch);out.addInPlace(scratch);return out.normalize();};

// chains: rows of
//   [bone, its child joint, direction [up, front, left], second direction (optional)]
//   {twist: bone, a, b, face?}: turn the bone about the body's up axis so the
//     joint pair a -> b faces across the body (or, with face, to its front).
// nodes: the rig's transform nodes when they are not all under root by name
// (the NPC runtime prefixes some); names match exactly or by their last part.
export function createBonePose(root,chains,{nodes=null}={}){
 const list=nodes??root.getDescendants(false),byName=new Map();
 for(const node of list){byName.set(node.name,node);const cut=Math.max(node.name.lastIndexOf(' '),node.name.lastIndexOf('.'));if(cut>=0){const tail=node.name.slice(cut+1);if(!byName.has(tail))byName.set(tail,node);}}
 const links=chains.map(row=>Array.isArray(row)?{bone:byName.get(row[0]),child:byName.get(row[1]),first:row[2],second:row[3]??null}:{bone:byName.get(row.twist),a:byName.get(row.a),child:byName.get(row.b),twist:true,face:row.face===true}).filter(link=>link.bone&&link.child&&link.bone.parent&&(!link.twist||link.a));
 const hips=byName.get('mixamorig:Hips')??null,leftFoot=byName.get('mixamorig:LeftFoot')??null,rightFoot=byName.get('mixamorig:RightFoot')??null;
 return {
  get ready(){return links.length>0;},
  get hips(){return hips;},
  // Height of the hips joint above the root after the pose.
  hipsAbove(){if(!hips)return 0;root.computeWorldMatrix(true);hips.computeWorldMatrix(true);return hips.absolutePosition.y-root.absolutePosition.y;},
  // Height of the lower ankle above the root after the pose.
  feetAbove(){if(!leftFoot||!rightFoot)return 0;root.computeWorldMatrix(true);leftFoot.computeWorldMatrix(true);rightFoot.computeWorldMatrix(true);return Math.min(leftFoot.absolutePosition.y,rightFoot.absolutePosition.y)-root.absolutePosition.y;},
  // weight 0..1 over the playing clip; blend 0..1 from each row's first
  // direction to its second (rows without one keep the first).
  apply(weight,blend=0){
   if(!(weight>0)||!links.length)return;
   root.computeWorldMatrix(true);const m=root.getWorldMatrix();
   Vector3.TransformNormalToRef(Vector3.UpReadOnly,m,up);up.normalize();
   Vector3.TransformNormalToRef(Vector3.RightReadOnly,m,side);side.normalize();
   Vector3.TransformNormalToRef(FORWARD,m,front);front.normalize();
   for(const link of links){
    const {bone,child}=link;
    bone.computeWorldMatrix(true);child.computeWorldMatrix(true);
    if(link.twist){
     link.a.computeWorldMatrix(true);child.absolutePosition.subtractToRef(link.a.absolutePosition,from);
     up.scaleToRef(Vector3.Dot(from,up),scratch);from.subtractInPlace(scratch);if(from.lengthSquared()<1e-10)continue;from.normalize();
     Quaternion.FromUnitVectorsToRef(from,link.face?front:side,turn);
    }else{
     child.absolutePosition.subtractToRef(bone.absolutePosition,from);if(from.lengthSquared()<1e-10)continue;from.normalize();
     toFrame(to,link.first);
     if(link.second&&blend>0){toFrame(other,link.second);Vector3.LerpToRef(to,other,Math.min(1,blend),to);to.normalize();}
     Quaternion.FromUnitVectorsToRef(from,to,turn);
    }
    Quaternion.SlerpToRef(none,turn,Math.min(1,weight),turn);
    // world' = turn * world; local' = parentWorld^-1 * world'.
    bone.parent.absoluteRotationQuaternion.conjugateToRef(parentWorld);
    turn.multiplyToRef(bone.absoluteRotationQuaternion,world);
    parentWorld.multiplyToRef(world,bone.rotationQuaternion??=new Quaternion());
    bone.computeWorldMatrix(true);
   }
  },
 };
}

let raise=0;
const probe=new Vector3(),probeTurn=new Matrix();
// A body laid on its back: the head points along headYaw on the ground and
// the chest faces the sky. Written into out (a Quaternion).
export function layOnBack(out,headYaw){
 // Which sign of pitch lifts the local +Z (checked once, handedness-proof).
 if(!raise){Matrix.RotationYawPitchRollToRef(0,.3,0,probeTurn);Vector3.TransformCoordinatesToRef(FORWARD,probeTurn,probe);raise=probe.y>0?1:-1;}
 return Quaternion.RotationYawPitchRollToRef(headYaw+Math.PI,raise*Math.PI/2,0,out);
}
