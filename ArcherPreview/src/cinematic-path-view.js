import {Vector3,Quaternion,Matrix} from '@babylonjs/core/Maths/math.vector.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {CreateLineSystem} from '@babylonjs/core/Meshes/Builders/linesBuilder.js';

// One editor-only line mesh, with no clock, observer, picking or collision.
// The visible route is the same piecewise path used by the shared sampler;
// smooth segments ease time along each straight span rather than inventing a
// different curve. Point crosses match the numbered/time rows in the Studio.
export function createCinematicPathView(scene){
 let document=null,selectedActorId=null,enabled=true,editing=true,mesh=null,signature='',points=[],disposed=false;
 const release=()=>{mesh?.dispose(false,true);mesh=null;};
 function refresh(){
  if(disposed)return;const actor=document?.actors.find(row=>row.actorId===selectedActorId),keys=document?.tracks.transforms.find(row=>row.actorId===selectedActorId)?.keys??[];
  if(!actor||!keys.length){release();signature='';points=[];return;}
  const rotation=Matrix.Identity();Quaternion.FromArray(document.anchor.rotation).toRotationMatrix(rotation);const origin=Vector3.FromArray(document.anchor.position);
  const next=keys.map(key=>({time:key.time,position:Vector3.TransformCoordinates(Vector3.FromArray(key.position),rotation).add(origin).asArray(),interpolation:key.interpolation})),nextSignature=JSON.stringify([selectedActorId,next]);
  if(nextSignature!==signature){
   release();signature=nextSignature;points=next;const vectors=next.map(row=>Vector3.FromArray(row.position).add(new Vector3(0,.04,0))),lines=[];
   for(let i=0;i<vectors.length-1;i++)lines.push([vectors[i],vectors[i+1]]);
   for(const point of vectors){const size=.16;lines.push([point.add(new Vector3(-size,0,0)),point.add(new Vector3(size,0,0))],[point.add(new Vector3(0,0,-size)),point.add(new Vector3(0,0,size))],[point,point.add(new Vector3(0,.22,0))]);}
   mesh=CreateLineSystem('cinematic-editor-path',{lines},scene);mesh.color=new Color3(.35,1,.8);mesh.isPickable=false;mesh.metadata={cinematicEditorPath:true,actorId:selectedActorId};
  }
  if(mesh)mesh.setEnabled(enabled&&editing);
 }
 return {
  setDocument(value){document=value;refresh();},select(actorId){selectedActorId=actorId;refresh();},
  setVisible(value){enabled=!!value;refresh();},
  setPlaybackState(state){editing=['ready','paused','completed'].includes(state);if(mesh)mesh.setEnabled(enabled&&editing);},
  clear(){selectedActorId=null;document=null;signature='';points=[];release();},
  inspect(){return {selectedActorId,points:structuredClone(points),segmentCount:Math.max(0,points.length-1),visible:!!mesh?.isEnabled(),meshesOwned:mesh?1:0};},
  dispose(){if(disposed)return;disposed=true;release();document=null;points=[];},
 };
}
