// The warrior dozing in the wagon bed for the 0.3 opening (2026-11-20, user:
// lying down with sword and shield looked odd; sitting, unarmed, suits it).
// The model has no sitting clip, so the limbs are set over whatever clip is
// playing, each bone pointed along a direction in the body's own frame
// (up / front / left): seated on the boards with the back to the tailgate,
// legs out in front, hands in the lap, head nodding forward while asleep.
// apply(weight, doze): weight 1 seated; doze 1 head down, 0 looking up.
// Only rotations of the rig's own nodes change; nothing is allocated per frame.
import {Quaternion,Vector3} from '@babylonjs/core';

// [bone, its child joint, direction awake [up, front, left], direction dozing (optional)].
const CHAINS=Object.freeze([
 // twist: turn the bone about the body's up axis so its joint pair faces across the body
 {twist:'mixamorig:Hips',a:'mixamorig:RightUpLeg',b:'mixamorig:LeftUpLeg'},
 ['mixamorig:Spine','mixamorig:Spine1',[1,-.22,0]],['mixamorig:Spine1','mixamorig:Spine2',[1,-.18,0]],['mixamorig:Spine2','mixamorig:Neck',[1,-.1,0],[1,.25,0]],
 {twist:'mixamorig:Spine2',a:'mixamorig:RightArm',b:'mixamorig:LeftArm'},
 ['mixamorig:Neck','mixamorig:Head',[1,.12,0],[.55,.85,.08]],['mixamorig:Head','mixamorig:HeadTop_End',[1,.05,0],[.3,.95,.12]],
 {twist:'mixamorig:Head',a:'mixamorig:Head',b:'headfront',face:true},
 // arms down the sides, forearms forward into the lap
 ['mixamorig:LeftArm','mixamorig:LeftForeArm',[-1,.3,.18]],['mixamorig:LeftForeArm','mixamorig:LeftHand',[-.35,1,-.25]],
 ['mixamorig:RightArm','mixamorig:RightForeArm',[-1,.3,-.18]],['mixamorig:RightForeArm','mixamorig:RightHand',[-.35,1,.25]],
 // thighs out in front, a little apart; shins on along the boards, knees barely bent
 ['mixamorig:LeftUpLeg','mixamorig:LeftLeg',[.08,1,.1]],['mixamorig:LeftLeg','mixamorig:LeftFoot',[-.12,1,.04]],
 ['mixamorig:RightUpLeg','mixamorig:RightLeg',[.08,1,-.1]],['mixamorig:RightLeg','mixamorig:RightFoot',[-.12,1,-.04]],
]);
const FORWARD=new Vector3(0,0,1),from=new Vector3(),to=new Vector3(),dozed=new Vector3(),side=new Vector3(),up=new Vector3(),front=new Vector3(),turn=new Quaternion(),world=new Quaternion(),parentWorld=new Quaternion(),none=Quaternion.Identity(),scratch=new Vector3();
// v: [up, front, left]. Indexed, not destructured: this runs per bone per frame.
const toFrame=(out,v)=>{out.set(0,0,0);up.scaleToRef(v[0],scratch);out.addInPlace(scratch);front.scaleToRef(v[1],scratch);out.addInPlace(scratch);side.scaleToRef(v[2],scratch);out.addInPlace(scratch);return out.normalize();};

export function createSitPose(root){
 // Node lookup once per player model (the model lives as long as the player).
 const byName=new Map();for(const node of root.getDescendants(false))byName.set(node.name,node);
 const links=CHAINS.map(row=>Array.isArray(row)?{bone:byName.get(row[0]),child:byName.get(row[1]),awake:row[2],doze:row[3]??null}:{bone:byName.get(row.twist),a:byName.get(row.a),child:byName.get(row.b),twist:true,face:row.face===true}).filter(link=>link.bone&&link.child&&link.bone.parent&&(!link.twist||link.a));
 const hips=byName.get('mixamorig:Hips')??null;
 return {
  get ready(){return links.length>0;},
  // Height of the hips joint above the root after the pose (seated: over the boards).
  hipsAbove(){if(!hips)return 0;root.computeWorldMatrix(true);hips.computeWorldMatrix(true);return hips.absolutePosition.y-root.absolutePosition.y;},
  apply(weight,doze=0){
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
     toFrame(to,link.awake);
     if(link.doze&&doze>0){toFrame(dozed,link.doze);Vector3.LerpToRef(to,dozed,Math.min(1,doze),to);to.normalize();}
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
