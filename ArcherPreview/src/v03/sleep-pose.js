// The warrior's sleeping pose for the 0.3 opening (2026-11-20). The warrior
// model has no lying or sleeping clip, so his limbs are laid along the body on
// top of whatever clip is playing: arms by the sides, legs straight, spine and
// head in line, the hands turned in. Applied after the animation each frame,
// with a weight (1 asleep, 0 awake) so sitting up blends back to the clip.
// Only rotations of the rig's own nodes change; nothing is allocated per frame.
import {Quaternion,Vector3} from '@babylonjs/core';

// [bone, its child joint, target along the body: 'down' / 'up'; spread toward
// the body's side, + to the model's left (+X: the model faces +Z)].
const CHAINS=Object.freeze([
 // twist: turn the bone about the body's up axis so its joint pair faces across the body
 {twist:'mixamorig:Hips',a:'mixamorig:RightUpLeg',b:'mixamorig:LeftUpLeg'},
 ['mixamorig:Spine','mixamorig:Spine1','up',0],['mixamorig:Spine1','mixamorig:Spine2','up',0],['mixamorig:Spine2','mixamorig:Neck','up',0],
 {twist:'mixamorig:Spine2',a:'mixamorig:RightArm',b:'mixamorig:LeftArm'},
 ['mixamorig:Neck','mixamorig:Head','up',0],['mixamorig:Head','mixamorig:HeadTop_End','up',0],
 {twist:'mixamorig:Head',a:'mixamorig:Head',b:'headfront',face:true},
 ['mixamorig:LeftArm','mixamorig:LeftForeArm','down',.22],['mixamorig:LeftForeArm','mixamorig:LeftHand','down',.12],
 ['mixamorig:RightArm','mixamorig:RightForeArm','down',-.22],['mixamorig:RightForeArm','mixamorig:RightHand','down',-.12],
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg','down',.06],['mixamorig:LeftLeg','mixamorig:LeftFoot','down',.04],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg','down',-.06],['mixamorig:RightLeg','mixamorig:RightFoot','down',-.04],
]);
const FORWARD=new Vector3(0,0,1),from=new Vector3(),to=new Vector3(),side=new Vector3(),up=new Vector3(),front=new Vector3(),turn=new Quaternion(),world=new Quaternion(),parentWorld=new Quaternion(),none=Quaternion.Identity(),scratch=new Vector3();

export function createSleepPose(root){
 // Node lookup once per player model (the model lives as long as the player).
 const byName=new Map();for(const node of root.getDescendants(false))byName.set(node.name,node);
 const links=CHAINS.map(row=>Array.isArray(row)?{bone:byName.get(row[0]),child:byName.get(row[1]),dir:row[2],spread:row[3]}:{bone:byName.get(row.twist),a:byName.get(row.a),child:byName.get(row.b),twist:true,face:row.face===true}).filter(link=>link.bone&&link.child&&link.bone.parent&&(!link.twist||link.a));
 return {
  get ready(){return links.length>0;},
  // weight 0..1; the root's own axes define the body's up and left.
  apply(weight){
   if(!(weight>0)||!links.length)return;
   root.computeWorldMatrix(true);const m=root.getWorldMatrix();
   Vector3.TransformNormalToRef(Vector3.UpReadOnly,m,up);up.normalize();
   Vector3.TransformNormalToRef(Vector3.RightReadOnly,m,side);side.normalize();
   Vector3.TransformNormalToRef(FORWARD,m,front);front.normalize();
   for(const link of links){
    const {bone,child}=link;
    bone.computeWorldMatrix(true);child.computeWorldMatrix(true);
    if(link.twist){
     // Across the body: the joint pair (right -> left) onto the body's left, about up
     // only; the head's front marker onto the body's front.
     link.a.computeWorldMatrix(true);child.absolutePosition.subtractToRef(link.a.absolutePosition,from);
     up.scaleToRef(Vector3.Dot(from,up),scratch);from.subtractInPlace(scratch);if(from.lengthSquared()<1e-10)continue;from.normalize();
     Quaternion.FromUnitVectorsToRef(from,link.face?front:side,turn);
    }else{
     child.absolutePosition.subtractToRef(bone.absolutePosition,from);if(from.lengthSquared()<1e-10)continue;from.normalize();
     // Target: along the body, leaning a little out to the side.
     to.copyFrom(up);if(link.dir==='down')to.scaleInPlace(-1);
     side.scaleToRef(link.spread,scratch);to.addInPlace(scratch).normalize();
     Quaternion.FromUnitVectorsToRef(from,to,turn);
    }
    Quaternion.SlerpToRef(none,turn,weight,turn);
    // world' = turn * world; local' = parentWorld^-1 * world'.
    bone.parent.absoluteRotationQuaternion.conjugateToRef(parentWorld);
    turn.multiplyToRef(bone.absoluteRotationQuaternion,world);
    parentWorld.multiplyToRef(world,bone.rotationQuaternion??=new Quaternion());
    bone.computeWorldMatrix(true);
   }
  },
 };
}
