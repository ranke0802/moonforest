// The driver's wagon horse (0.3). Since 2026-11-19 evening a rigged model
// (wagon-horse-rig.glb, rigged and animated in Blender after the wolf rig's
// layout, re-fitted to the horse): Horse_Idle, Horse_Gallop (transverse
// gallop footfalls), Horse_Nervous (head tosses, side-steps, pawing) and
// Horse_Rear. It stands between the wagon's shafts in its harness; play()
// cross-fades between the clips.
import {SceneLoader,TransformNode,Vector3} from '@babylonjs/core';
import {attachCharacterOutlines} from '../character-outlines.js';

const MODEL=new URL('./models/wagon-horse-rig.glb',import.meta.url);
// Model units: 87 tall (ear tips), 98 long, feet at y=0, head toward +z.
// The wagon's heading is its root's local +Z; the horse stands 3.55 m out along it.
export const WAGON_HORSE=Object.freeze({height:2.05,ahead:3.55,side:0,turn:0,fade:.25});
export const HORSE_CLIPS=Object.freeze(['Horse_Idle','Horse_Gallop','Horse_Nervous','Horse_Rear']);

export function createWagonHorse({scene,heightAt=()=>0,wagon}){
 let disposed=false,container=null,root=null,observer=null;
 const groups=new Map();let current=null,previous=null,fade=0,wanted='Horse_Idle';
 function start(name,{loop=true}={}){
  const group=groups.get(name);wanted=name;if(!group||group===current)return;
  if(previous&&previous!==current)previous.stop();
  previous=current;current=group;fade=0;
  group.start(loop,1,group.from,group.to,false);group.setWeightForAllAnimatables(previous?0:1);
  if(!previous)fade=1;
 }
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
  for(const group of container.animationGroups){group.stop();groups.set(group.name,group);}
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] horse outline skipped',error);}
  const yaw=wagon.yaw??0,fx=Math.sin(yaw),fz=Math.cos(yaw);
  const x=wagon.x+fx*WAGON_HORSE.ahead,z=wagon.z+fz*WAGON_HORSE.ahead;
  root.position=new Vector3(x,heightAt(x,z),z);root.rotation.y=yaw;
  start(wanted,{loop:wanted!=='Horse_Rear'});
  observer=scene.onBeforeRenderObservable.add(()=>{
   if(!current||fade>=1)return;
   fade=Math.min(1,fade+Math.min(.1,scene.getEngine().getDeltaTime()/1000)/WAGON_HORSE.fade);
   current.setWeightForAllAnimatables(fade);previous?.setWeightForAllAnimatables(1-fade);
   if(fade>=1&&previous){previous.stop();previous=null;}
  });
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] wagon horse unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  get clip(){return wanted;},
  // Cross-fades to a clip (Horse_Rear plays once and holds its last frame).
  play(name){if(name===wanted&&current)return;if(!groups.size){wanted=name;return;}start(name,{loop:name!=='Horse_Rear'});},
  // Moves the horse (story ride); y follows the ground.
  place(x,z,yaw){if(!root)return;root.position.set(x,heightAt(x,z),z);root.rotation.y=yaw;},
  dispose(){
   disposed=true;if(observer){scene.onBeforeRenderObservable.remove(observer);observer=null;}
   for(const group of groups.values())group.stop();groups.clear();
   if(container){for(const mesh of container.meshes)for(const child of mesh.getChildMeshes?.(false)??[])child.dispose(false,false);container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
