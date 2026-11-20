// The opening wagon as a story prop (0.3, 2026-11-19): rolls along the road
// for the ride, tips onto its side in the ambush and is set back upright with
// the driver. Since the shafted wagon model (covered-wagon-shafts.glb) the rig
// moves the story's own wagon node (wagon-model.js), not the map's placed
// instance: that one stays only for collision, hidden.
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';

// Where the wagon comes to rest on its side. Measured on the model's cross
// section (2026-11-20, user: the fallen wagon floated): at a quarter turn only
// the wheel hubs touched and the canopy hung 0.5 m in the air; it rests on the
// wheel rim (1.14, 1.28) and the canopy shoulder (0.76, 2.37), 19 degrees
// further over. The wheels stand 1.14 m out from the centre line.
export const WAGON_TIP=Object.freeze({angle:1.9,halfWidth:1.14,settleBy:.12});
const AXIS_Z=new Vector3(0,0,1),local=new Vector3(),moved=new Vector3(),offset=new Vector3(),roll=new Quaternion(),turn=new Matrix();
let tipSign=0;
function topSign(){if(!tipSign){const probe=Vector3.TransformCoordinates(new Vector3(0,1,0),Matrix.RotationZ(.3));tipSign=probe.x>0?1:-1;}return tipSign;}

// getRoot(): the wagon's root TransformNode (rotationQuaternion = its yaw) or null.
// getContact(): the model's outline points in the root's frame (Float32Array
// xyz, wagon-model.js) or null. With them the tipped wagon is set down on the
// ground at every angle: its lowest point touches, wherever the ground is.
export function createWagonRig({getRoot,heightAt=()=>0,getContact=null,halfWidth=WAGON_TIP.halfWidth}){
 let base=null,baseQ=null,yaw=0,current={along:0,tip:0,side:1},posed=null;
 const node=()=>{const root=getRoot?.();return root&&!root.isDisposed?.()?root:null;};
 function capture(root){
  if(base?.root===root)return;
  root.rotationQuaternion??=Quaternion.FromEulerAngles(root.rotation.x,root.rotation.y,root.rotation.z);
  base={root,position:root.position.clone()};baseQ=root.rotationQuaternion.clone();yaw=baseQ.toEulerAngles().y;
 }
 // along: metres back along the road from the placed spot (the ride).
 // tip: 0 upright .. 1 on its side; side: +1 / -1 which side it falls to.
 function pose({along=current.along,tip=current.tip,side=current.side}={}){
  const root=node();if(!root)return false;capture(root);current={along,tip,side};
  const fx=Math.sin(yaw),fz=Math.cos(yaw),x=base.position.x-fx*along,z=base.position.z-fz*along;
  const ground=along?heightAt(x,z)-heightAt(base.position.x,base.position.z):0;
  // The sign that tips the top toward `side` (checked once, handedness-proof).
  const angle=side*topSign()*WAGON_TIP.angle*tip;
  Quaternion.RotationAxisToRef(AXIS_Z,angle,roll);baseQ.multiplyToRef(roll,root.rotationQuaternion);
  // Pivot on the bottom edge of the falling side, in the wagon's frame.
  local.set(side*halfWidth,0,0);roll.toRotationMatrix(turn);Vector3.TransformCoordinatesToRef(local,turn,moved);
  offset.set(local.x-moved.x,local.y-moved.y,0);baseQ.toRotationMatrix(turn);Vector3.TransformCoordinatesToRef(offset,turn,moved);
  root.position.set(x+moved.x,base.position.y+ground+moved.y,z+moved.z);
  const contact=tip>0?getContact?.():null;
  if(contact?.length){
   root.rotationQuaternion.toRotationMatrix(turn);const m=turn.m,px=root.position.x,py=root.position.y,pz=root.position.z;let gap=Infinity;
   for(let i=0;i<contact.length;i+=3){
    const lx=contact[i],ly=contact[i+1],lz=contact[i+2],clear=py+lx*m[1]+ly*m[5]+lz*m[9]-heightAt(px+lx*m[0]+ly*m[4]+lz*m[8],pz+lx*m[2]+ly*m[6]+lz*m[10]);
    if(clear<gap)gap=clear;
   }
   // Eased in over the first few degrees so leaving upright does not step.
   if(gap<Infinity)root.position.y-=gap*Math.min(1,tip/WAGON_TIP.settleBy);
  }
  posed={root,tip};
  return true;
 }
 return {
  get ready(){return !!node();},
  get yaw(){const root=node();if(root)capture(root);return yaw;},
  pose,
  // True while the wagon still shows the last pose at this tip.
  holds(tip){const root=node();return !!root&&posed?.root===root&&posed.tip===tip;},
  upright(){return pose({along:0,tip:0});},
  dispose(){base=null;baseQ=null;posed=null;},
 };
}
