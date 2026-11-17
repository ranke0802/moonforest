// Temporary block actors for cast members whose models do not exist yet.
// Every story actor is created through ACTOR_VISUALS: when a real model is
// ready, add `model` to its entry and extend createActorVisual; no caller
// changes. Blocks are static: shared frozen materials, frozen world matrices,
// no skeleton, no shadow pass, not pickable.
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';

export const ACTOR_VISUALS=Object.freeze({
 driver:{label:'마부',color:'#8a6a45',height:1.7},
 innkeeper:{label:'여관 주인',color:'#c98a3a',height:1.72},
 elder:{label:'노년 여성',color:'#9bb37a',height:1.5},
 herbalist:{label:'약초사',color:'#5fa07a',height:1.62},
 youth:{label:'청년',color:'#7fa3c4',height:1.75},
 chief:{label:'촌장',color:'#8d8d93',height:1.68},
 'chief-son':{label:'촌장의 아들',color:'#8a3b3b',height:1.8},
 joachim:{label:'요아힘',color:'#3f6fb5',height:1.82},
 vivian:{label:'비비앙',color:'#7a4fb0',height:1.7},
 hobgoblin:{label:'홉고블린',color:'#4f7d3a',height:2.6,width:1.2},
 ghoul:{label:'구울 전사',color:'#6f8073',height:1.9},
});
const caches=new WeakMap();
function materialFor(scene,hex,lift){
 let cache=caches.get(scene);if(!cache){cache=new Map();caches.set(scene,cache);scene.onDisposeObservable?.addOnce(()=>caches.delete(scene));}
 const key=hex+':'+lift;let material=cache.get(key);
 if(!material){
  const color=Color3.FromHexString(hex);if(lift)color.set(Math.min(1,color.r+lift),Math.min(1,color.g+lift),Math.min(1,color.b+lift));
  material=new StandardMaterial('v03-block-'+key,scene);material.disableLighting=true;material.emissiveColor=color;material.diffuseColor=Color3.Black();material.specularColor=Color3.Black();
  material.freeze();cache.set(key,material);
 }
 return material;
}
export function createActorVisual(scene,key,{id=key}={}){
 const spec=ACTOR_VISUALS[key]??{label:key,color:'#999999',height:1.7};
 const height=spec.height??1.7,width=spec.width??.56,head=Math.min(.34,height*.2),body=height-head;
 const root=new TransformNode('v03-actor-'+id,scene);
 const torso=MeshBuilder.CreateBox('v03-actor-'+id+'-body',{width,height:body,depth:width*.62},scene);
 const top=MeshBuilder.CreateBox('v03-actor-'+id+'-head',{width:head,height:head,depth:head},scene);
 // A small "nose" shows which way the block faces.
 const nose=MeshBuilder.CreateBox('v03-actor-'+id+'-face',{width:head*.3,height:head*.22,depth:head*.3},scene);
 torso.position.y=body/2;top.position.y=body+head/2;nose.position.set(0,body+head/2,head*.62);
 torso.material=materialFor(scene,spec.color,0);top.material=materialFor(scene,spec.color,.22);nose.material=materialFor(scene,spec.color,-.2);
 for(const mesh of [torso,top,nose]){mesh.parent=root;mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.metadata={moonforestPlaceholder:true};}
 const meshes=[torso,top,nose];
 return {
  id,key,label:spec.label,placeholder:true,root,meshes,height,
  place(x,y,z,yaw=0){
   for(const mesh of meshes)mesh.unfreezeWorldMatrix();
   root.position.set(x,y,z);root.rotation.y=yaw;root.computeWorldMatrix(true);
   for(const mesh of meshes){mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();}
  },
  dispose(){for(const mesh of meshes)mesh.dispose(false,false);root.dispose();},
 };
}
