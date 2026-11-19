// The driver's wagon horse (0.3): a static Tripo model (no rig), stood in the
// shafts in front of the covered wagon. It breathes (a slow chest/back swell)
// and shifts its weight now and then so it never reads as a statue; a rigged
// walk/idle can replace this later without moving the placement.
import {Matrix,SceneLoader,TransformNode,Vector3} from '@babylonjs/core';
import {attachCharacterOutlines} from '../character-outlines.js';

const MODEL=new URL('./models/wagon-horse.glb',import.meta.url);
// Model units: 87 tall (ear tips), 98 long, feet at y=0, head toward +z.
// The wagon's tongue is its local -x end; WAGON.yaw already points that way,
// so the horse stands 3.55 m out along it with the tongue between its flanks.
export const WAGON_HORSE=Object.freeze({height:2.05,ahead:3.55,side:0,turn:0,breath:.012,breathRate:1.35});

export function createWagonHorse({scene,heightAt=()=>0,wagon}){
 let disposed=false,container=null,root=null,observer=null,time=Math.random()*10;
 // Story control (wagon ride, ambush): gallop 0..1 bobs and rocks the body,
 // rear 0..1 lifts the forehand about the hind hooves.
 const pose={gallop:0,rear:0};let rearSign=0;const pivot=new Vector3(),turned=new Vector3(),rotation=new Matrix();
 const ready=(async()=>{
  const href=MODEL.href,base=href.slice(0,href.lastIndexOf('/')+1),file=href.slice(href.lastIndexOf('/')+1);
  container=await SceneLoader.LoadAssetContainerAsync(base,file,scene);
  if(disposed){container.dispose();container=null;return null;}
  root=new TransformNode('v03-wagon-horse',scene);
  const s=WAGON_HORSE.height/87;
  const body=new TransformNode('v03-wagon-horse-body',scene);body.parent=root;
  for(const node of container.rootNodes)node.parent=body;
  body.scaling.setAll(s);body.rotation.y=WAGON_HORSE.turn;
  container.addAllToScene();
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] horse outline skipped',error);}
  // In front of the wagon along its heading, facing the same way.
  const yaw=wagon.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  const x=wagon.x+fx*WAGON_HORSE.ahead+rx*WAGON_HORSE.side,z=wagon.z+fz*WAGON_HORSE.ahead+rz*WAGON_HORSE.side;
  root.position=new Vector3(x,heightAt(x,z),z);root.rotation.y=yaw;
  observer=scene.onBeforeRenderObservable.add(()=>{
   const dt=Math.min(.1,scene.getEngine().getDeltaTime()/1000);time+=dt;
   const breath=Math.sin(time*WAGON_HORSE.breathRate*Math.PI*2/2.6);
   body.scaling.y=s*(1+WAGON_HORSE.breath*.5*(breath+1));
   body.scaling.x=s*(1+WAGON_HORSE.breath*.35*(breath+1));
   // A slow weight shift every few seconds.
   body.rotation.z=Math.sin(time*.37)*.012;
   // Gallop: a quick bob and fore/aft rock. Rear: pitch about the hind hooves.
   const stride=time*Math.PI*2*2.1,g=pose.gallop,half=98*s*.42;
   if(!rearSign){Vector3.TransformCoordinatesFromFloatsToRef(0,0,1,Matrix.RotationX(.3),turned);rearSign=turned.y>0?1:-1;}
   const pitch=rearSign*(pose.rear*.62+g*Math.sin(stride)*.05);
   pivot.set(0,0,-half);Matrix.RotationXToRef(pitch,rotation);Vector3.TransformCoordinatesToRef(pivot,rotation,turned);
   body.rotation.x=pitch;body.position.set(0,Math.abs(Math.sin(stride))*.07*g+(pivot.y-turned.y),pivot.z-turned.z);
  });
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] wagon horse unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  pose,
  // Moves the horse (story ride); y follows the ground.
  place(x,z,yaw){if(!root)return;root.position.set(x,heightAt(x,z),z);root.rotation.y=yaw;},
  dispose(){
   disposed=true;if(observer){scene.onBeforeRenderObservable.remove(observer);observer=null;}
   if(container){for(const mesh of container.meshes)for(const child of mesh.getChildMeshes?.(false)??[])child.dispose(false,false);container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
