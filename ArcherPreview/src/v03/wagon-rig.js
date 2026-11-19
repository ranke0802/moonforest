// The opening wagon as a story prop (0.3, 2026-11-19): rolls along the road
// for the ride, tips onto its side in the ambush and is set back upright with
// the driver. It moves the map's own placed instance (authored placement
// record): unfrozen while it moves, frozen again on every resting pose, and
// handed back to the placement runtime's own transform when upright.
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';

export const WAGON_TIP=Object.freeze({angle:1.42,halfWidth:.95});
const AXIS_Z=new Vector3(0,0,1),local=new Vector3(),moved=new Vector3(),offset=new Vector3(),roll=new Quaternion(),turn=new Matrix(),inverse=new Matrix();

let tipSign=0;
function topSign(){if(!tipSign){const probe=Vector3.TransformCoordinates(new Vector3(0,1,0),Matrix.RotationZ(.3));tipSign=probe.x>0?1:-1;}return tipSign;}
export function createWagonRig({runtime,id,heightAt=()=>0}){
 const record=()=>{const value=runtime()?.records?.get?.(id);return value?.root&&!value.root.isDisposed?.()?value:null;};
 let base=null,baseQ=null,yaw=0,halfWidth=WAGON_TIP.halfWidth,moving=false,current={along:0,tip:0,side:1};
 function capture(row){
  if(base&&base.row===row)return true;
  const root=row.root;root.computeWorldMatrix(true);
  base={row,position:root.position.clone()};baseQ=(root.rotationQuaternion??Quaternion.FromEulerAngles(root.rotation.x,root.rotation.y,root.rotation.z)).clone();
  const e=baseQ.toEulerAngles();yaw=e.y;
  // Half the wagon's width in its own frame, from the meshes' world corners.
  try{
   root.getWorldMatrix().invertToRef(inverse);let widest=0;
   for(const mesh of row.meshes??[]){mesh.computeWorldMatrix(true);for(const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld){Vector3.TransformCoordinatesToRef(corner,inverse,local);widest=Math.max(widest,Math.abs(local.x));}}
   const scale=Math.abs(root.scaling?.x??1)||1;if(widest>.3&&widest<3)halfWidth=widest*scale;
  }catch{/* constant width */}
  return true;
 }
 function thaw(row){if(moving)return;moving=true;row.root.unfreezeWorldMatrix();for(const node of row.root.getDescendants())node.unfreezeWorldMatrix?.();}
 function settle(row){
  moving=false;row.root.computeWorldMatrix(true);
  for(const node of row.root.getDescendants()){node.computeWorldMatrix?.(true);node.freezeWorldMatrix?.();}
  row.root.freezeWorldMatrix();
 }
 // along: metres back along the road from the placed spot (the ride).
 // tip: 0 upright .. 1 on its side; side: +1 / -1 which side it falls to.
 function pose({along=current.along,tip=current.tip,side=current.side}={},{rest=false}={}){
  const row=record();if(!row)return false;capture(row);thaw(row);current={along,tip,side};
  const root=row.root,fx=Math.sin(yaw),fz=Math.cos(yaw),x=base.position.x-fx*along,z=base.position.z-fz*along;
  const ground=along?heightAt(x,z)-heightAt(base.position.x,base.position.z):0;
  // The sign that tips the top toward `side` (checked once, handedness-proof).
  const angle=side*topSign()*WAGON_TIP.angle*tip;
  Quaternion.RotationAxisToRef(AXIS_Z,angle,roll);
  root.rotationQuaternion??=baseQ.clone();baseQ.multiplyToRef(roll,root.rotationQuaternion);
  // Pivot on the bottom edge of the falling side, in the wagon's frame.
  local.set(side*halfWidth,0,0);roll.toRotationMatrix(turn);Vector3.TransformCoordinatesToRef(local,turn,moved);
  offset.set(local.x-moved.x,local.y-moved.y,0);baseQ.toRotationMatrix(turn);Vector3.TransformCoordinatesToRef(offset,turn,moved);
  root.position.set(x+moved.x,base.position.y+ground+moved.y,z+moved.z);
  if(rest)settle(row);
  return true;
 }
 return {
  get ready(){return !!record();},
  get yaw(){const row=record();if(row)capture(row);return yaw;},
  get spot(){const row=record();if(!row)return null;capture(row);return {x:base.position.x,z:base.position.z};},
  pose,
  // Back to the placement runtime's own upright transform (frozen as authored).
  upright(){
   const row=record(),rt=runtime();moving=false;current={along:0,tip:0,side:current.side};
   if(!row)return false;
   if(typeof rt?._setTransform==='function'&&row.instance){rt._setTransform(row,row.instance);return true;}
   return pose({along:0,tip:0},{rest:true});
  },
  dispose(){base=null;baseQ=null;},
 };
}
