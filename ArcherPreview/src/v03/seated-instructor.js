import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {loadOwnedModel} from './owned-model.js';
import {INSTRUCTOR_MODEL} from './seated-instructor-asset.js';
import {applyMonsterToon} from '../monster-toon.js';
import {applyNpcLook} from '../npc-look.js';

// His chair and prostheses stay planted. Only the upper body can gesture.
// Skinning has five joints; out of view the scene observer pauses sampling.
export function createSeatedInstructor(scene,load=loadOwnedModel,base=globalThis.document?.baseURI) {
 const root=new TransformNode('v03-seated-instructor',scene);
 let owned=null,disposed=false,observer=null,current=null,talking=false;
 let lastCheck=0,visible=true;
 const groups=new Map();
 function play() {
  const next=groups.get(talking?'Seated_Teach':'Seated_Idle');
  if(!next||current===next)return;
  current?.stop();current=next;
  current.start(true);
  if(!visible)current.pause();
 }
 const settled=load(scene,new URL(INSTRUCTOR_MODEL,base)).then(asset=>{
  if(disposed){asset.dispose();return;}
  owned=asset;
  for(const node of asset.rootNodes)node.parent=root;
  for(const mesh of asset.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  applyMonsterToon(asset);
  applyNpcLook(asset,{outline:false,interior:false,brightness:1.2});
  for(const mesh of asset.meshes)if(mesh.material)asset.own(mesh.material);
  for(const group of asset.animationGroups){group.stop();groups.set(group.name,group);}
  play();
  observer=scene.onBeforeRenderObservable.add(()=>{
   const now=performance.now();
   if(now-lastCheck<180)return;
   lastCheck=now;
   const camera=scene.activeCamera;
   const next=talking||!camera||asset.meshes.some(mesh=>mesh.getTotalVertices()>0&&camera.isInFrustum(mesh));
   if(next!==visible){visible=next;if(visible)current?.play(true);else current?.pause();}
  });
 }).catch(error=>{
  if(!disposed)console.warn('[MoonForest 0.3] seated instructor could not load',error);
 });
 return {
  id:'foster-father',height:1.46,settled,
  place(x,y,z,yaw=0){root.position.set(x,y,z);root.rotation.y=yaw;},
  get position(){return {x:root.position.x,z:root.position.z};},
  talk(on){talking=Boolean(on);if(talking)visible=true;play();},
  dispose(){disposed=true;if(observer)scene.onBeforeRenderObservable.remove(observer);owned?.dispose();groups.clear();root.dispose();}
 };
}
