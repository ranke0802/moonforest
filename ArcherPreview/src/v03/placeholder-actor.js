// Temporary block actors for cast members whose models do not exist yet.
// Every story actor is created through ACTOR_VISUALS: when a real model is
// ready, add `model` to its entry and extend createActorVisual; no caller
// changes. Blocks are static: shared frozen materials, frozen world matrices,
// no skeleton, no shadow pass, not pickable.
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {CreateBoxVertexData} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {CreateCylinderVertexData} from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import '@babylonjs/core/Meshes/mesh.vertexData.js';

export const ACTOR_VISUALS=Object.freeze({
 smith:{label:'대장장이',color:'#8c5743',height:1.75},
 driver:{label:'마부',color:'#8a6a45',height:1.7},
 innkeeper:{label:'여관 주인',color:'#c98a3a',height:1.72},
 elder:{label:'노년 여성',color:'#9bb37a',height:1.5},
 herbalist:{label:'약초사',color:'#5fa07a',height:1.62},
 youth:{label:'제프리',color:'#7fa3c4',height:1.75},
 chief:{label:'촌장',color:'#8d8d93',height:1.68},
 'chief-son':{label:'할리안',color:'#8a3b3b',height:1.8},
 joachim:{label:'요아힘',color:'#3f6fb5',height:1.82},
 vivian:{label:'비비앙',color:'#7a4fb0',height:1.7},
 hobgoblin:{label:'홉고블린',color:'#4f7d3a',height:2.6,width:1.2},
 ghoul:{label:'구울 전사',color:'#6f8073',height:1.9},
 // Forest clues (chapter1 NPCS clue, 2026-11-27): one flat box each, box = [width,height,depth].
 // Replace with the item models listed in Docs/0.3/ASSETS.md when they exist.
 'clue-poison':{label:'고블린의 약병',color:'#6b4f8a',box:[.22,.32,.22]},
 'clue-sword':{label:'할리안의 검',color:'#c9c2b0',box:[1.05,.07,.16]},
 'clue-armor':{label:'할리안의 갑옷',color:'#7a5232',box:[.62,.22,.46]},
 'clue-cave':{label:'동굴로 이어진 흔적',color:'#3b2b4a',box:[1.1,.03,.6]},
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
function createItemVisual(scene,key,id,spec){
 const [width,height,depth]=spec.box,root=new TransformNode('v03-actor-'+id,scene);
 const mesh=MeshBuilder.CreateBox('v03-actor-'+id+'-item',{width,height,depth},scene);
 mesh.position.y=height/2;mesh.material=materialFor(scene,spec.color,0);mesh.parent=root;mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.metadata={moonforestPlaceholder:true};
 return {
  id,key,label:spec.label,placeholder:true,root,meshes:[mesh],height,
  place(x,y,z,yaw=0){mesh.unfreezeWorldMatrix();root.position.set(x,y,z);root.rotation.y=yaw;root.computeWorldMatrix(true);mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();},
  dispose(){mesh.dispose(false,false);root.dispose();},
 };
}
export function createActorVisual(scene,key,{id=key}={}){
 const spec=ACTOR_VISUALS[key]??{label:key,color:'#999999',height:1.7};
 if(spec.box)return createItemVisual(scene,key,id,spec);
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

// Temporary props (2026-11-27, forge bench). Each entry is one merged mesh of
// shaded blocks in one shared vertex-colour material: one draw call per prop.
// When a real model exists, add `model:'<asset url>'` to its entry; the forge
// bench then loads that file through its model loader instead of the blocks.
// Units are metres; the axes are the prop's own (see forge-bench.js).
const box=(w,h,d,x,y,z,color,rot)=>({box:[w,h,d],at:[x,y,z],color,rot});
const cyl=(height,top,bottom,x,y,z,color,rot,tess=10)=>({cyl:[height,top,bottom,tess],at:[x,y,z],color,rot});
const GLOVE='#6b4a2f',GLOVE_DARK='#4b3220',SLEEVE='#2f3d55',IRON='#585d66',IRON_TOP='#7d838c',WOOD='#7a5131';
const HALF_TURN=Math.PI/2;
export const PROP_VISUALS=Object.freeze({
 // Anvil on a stump; the face top is y=0, the horn points to +x.
 'forge-anvil':{label:'모루',parts:[
  box(.56,.075,.21,0,-.0375,0,IRON_TOP),box(.07,.055,.15,-.31,-.035,0,IRON),
  cyl(.2,.012,.15,.38,-.045,0,IRON,[0,0,-HALF_TURN]),
  box(.26,.13,.13,0,-.14,0,'#41454c'),box(.42,.06,.24,0,-.235,0,'#4a4e55'),
  cyl(.36,.5,.54,0,-.445,0,'#5b3d26',null,12),
 ]},
 // Left glove gripping along x (the hilt); the forearm runs to -z (towards the eye).
 'forge-hand-left':{label:'왼손(장갑)',parts:[
  box(.1,.075,.1,0,.02,0,GLOVE),box(.1,.035,.03,0,-.005,.055,GLOVE_DARK),
  box(.03,.03,.07,.06,.01,-.02,GLOVE,[0,.5,0]),
  box(.11,.1,.1,-.01,.01,-.1,GLOVE_DARK),box(.1,.095,.36,-.02,.01,-.32,SLEEVE),
 ]},
 // Right glove on a hammer. Origin = elbow, the arm along -x: fist at x=-.4, head at x=-.76.
 'forge-hammer':{label:'망치와 오른손(장갑)',parts:[
  box(.32,.095,.1,-.16,0,0,SLEEVE),box(.08,.11,.11,-.33,0,0,GLOVE_DARK),
  box(.09,.095,.1,-.41,0,0,GLOVE),box(.03,.03,.06,-.43,.04,-.04,GLOVE),
  cyl(.34,.028,.032,-.6,0,0,WOOD,[0,0,HALF_TURN]),
  box(.06,.15,.065,-.765,-.02,0,IRON),box(.064,.02,.069,-.765,-.1,0,IRON_TOP),
 ]},
 // Stand-ins for a piece that is not worn (its live model is not loaded).
 'forge-blade':{label:'임시 검',parts:[
  box(.5,.012,.055,.12,0,0,'#c9ccd2'),box(.02,.03,.16,-.14,0,0,'#8f7a45'),
  box(.12,.03,.03,-.21,0,0,'#5b3a24'),box(.03,.04,.04,-.28,0,0,'#8f7a45'),
 ]},
 'forge-shield':{label:'임시 방패',parts:[cyl(.035,.42,.42,0,0,0,'#7b5a37',null,16),cyl(.045,.1,.1,0,0,0,'#a3a7ad',null,10)]},
 'forge-armor':{label:'임시 갑옷',parts:[box(.38,.05,.3,0,0,0,'#6d5a44'),box(.12,.05,.14,-.24,0,.04,'#5d4c39'),box(.12,.05,.14,.24,0,.04,'#5d4c39')]},
});
const LIGHT=[-.35,.85,-.4],LIGHT_LENGTH=Math.hypot(...LIGHT);
function propMaterial(scene){
 let cache=caches.get(scene);if(!cache){cache=new Map();caches.set(scene,cache);scene.onDisposeObservable?.addOnce(()=>caches.delete(scene));}
 let material=cache.get('prop');
 if(!material){
  material=new StandardMaterial('v03-prop-shaded',scene);material.disableLighting=true;material.emissiveColor=Color3.White();
  material.diffuseColor=Color3.Black();material.specularColor=Color3.Black();material.freeze();cache.set('prop',material);
 }
 return material;
}
// One mesh for a PROP_VISUALS entry: blocks baked into one buffer, shaded by a fixed
// light in their vertex colours (no lights, no shadow pass).
export function createPropVisual(scene,key,{name='v03-prop-'+key}={}){
 const spec=PROP_VISUALS[key];if(!spec)throw new Error('Unknown prop: '+key);
 let merged=null;const matrix=new Matrix(),rotation=new Quaternion(),one=Vector3.One(),at=new Vector3(),colors=[];
 for(const part of spec.parts){
  const data=part.box?CreateBoxVertexData({width:part.box[0],height:part.box[1],depth:part.box[2]})
   :CreateCylinderVertexData({height:part.cyl[0],diameterTop:part.cyl[1],diameterBottom:part.cyl[2],tessellation:part.cyl[3]});
  Quaternion.FromEulerAnglesToRef(...(part.rot??[0,0,0]),rotation);at.set(...part.at);
  Matrix.ComposeToRef(one,rotation,at,matrix);data.transform(matrix);
  const base=Color3.FromHexString(part.color),normals=data.normals;
  for(let i=0;i<normals.length;i+=3){
   const light=(normals[i]*LIGHT[0]+normals[i+1]*LIGHT[1]+normals[i+2]*LIGHT[2])/LIGHT_LENGTH,shade=.42+.58*Math.max(0,light);
   colors.push(base.r*shade,base.g*shade,base.b*shade,1);
  }
  if(merged)merged.merge(data);else merged=data;
 }
 merged.colors=colors;
 const mesh=new Mesh(name,scene);merged.applyToMesh(mesh,false);
 mesh.material=propMaterial(scene);mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.metadata={moonforestPlaceholder:true,prop:key};
 return {key,label:spec.label,placeholder:!spec.model,model:spec.model??null,mesh,dispose(){mesh.dispose(false,false);}};
}
