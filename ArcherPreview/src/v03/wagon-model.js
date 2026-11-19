// The story's own opening wagon (0.3, 2026-11-19): the covered wagon with a
// pair of shafts (covered-wagon-shafts.glb, made in Blender from the source
// FBX: the single centre pole removed, two shafts and a cross bar added). The
// map's placed wagon stays for collision with its meshes hidden.
// Map lifetime: created by the story when the opening map's cast is built and
// disposed with it.
import {SceneLoader,TransformNode,Quaternion} from '@babylonjs/core';
import {attachCharacterOutlines} from '../character-outlines.js';

const MODEL=new URL('./models/covered-wagon-shafts.glb',import.meta.url);
// The wagon's heading is the root's local +Z. The world is right-handed, so the
// glTF loader does not mirror the model: its front (shafts) needs +PI/2 here
// (-PI/2 put the shafts behind, away from the horse; 2026-11-19 user video).
export const WAGON_MODEL=Object.freeze({turn:Math.PI/2});

export function createWagonModel({scene,wagon,heightAt=()=>0}){
 let disposed=false,container=null,root=null;
 const ready=(async()=>{
  const href=MODEL.href,base=href.slice(0,href.lastIndexOf('/')+1),file=href.slice(href.lastIndexOf('/')+1);
  container=await SceneLoader.LoadAssetContainerAsync(base,file,scene);
  if(disposed){container.dispose();container=null;return null;}
  root=new TransformNode('v03-story-wagon',scene);
  const body=new TransformNode('v03-story-wagon-body',scene);body.parent=root;body.rotation.y=WAGON_MODEL.turn;
  for(const node of container.rootNodes)node.parent=body;
  container.addAllToScene();
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  try{attachCharacterOutlines(container,'wolf',{skipBoneProof:true});}catch(error){console.warn('[MoonForest 0.3] wagon outline skipped',error);}
  root.position.set(wagon.x,heightAt(wagon.x,wagon.z),wagon.z);
  root.rotationQuaternion=Quaternion.RotationYawPitchRoll(wagon.yaw??0,0,0);
  return root;
 })().catch(error=>{console.warn('[MoonForest 0.3] story wagon unavailable',error);return null;});
 return {
  ready,
  get root(){return root;},
  dispose(){
   disposed=true;
   if(container){for(const mesh of container.meshes)for(const child of mesh.getChildMeshes?.(false)??[])child.dispose(false,false);container.dispose();container=null;}
   root?.dispose();root=null;
  },
 };
}
