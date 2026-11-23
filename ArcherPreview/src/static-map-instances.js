import {Mesh,TransformNode} from '@babylonjs/core';

// Only empty static glTF roots avoid the SDK's expensive full deep copy.
// Geometry retains native instances, the original buffers, materials and LOD.
const plans=new WeakMap();
function plan(container){
 if(plans.has(container))return plans.get(container);
 let nodes=[],valid=!(container.skeletons?.length||container.animationGroups?.length||container.morphTargetManagers?.length);
 const roots=container.rootNodes?.length?container.rootNodes:[...container.transformNodes,...container.meshes].filter(n=>!n.parent);
 const seen=new Set();
 const visit=node=>{
  if(seen.has(node))return;seen.add(node);nodes.push(node);
  const type=node.getClassName();
  if(!['Mesh','TransformNode'].includes(type)||node.skeleton||node.morphTargetManager||node.animations?.length||node.billboardMode||node.infiniteDistance||node.hasThinInstances||node.material?.subMaterials||!node.getPivotMatrix().isIdentity()||node.metadata?.customInstanceClone)valid=false;
  if(type==='Mesh'&&!node.getTotalVertices()&&(node.material||node.subMeshes?.length))valid=false;
  for(const child of node.getChildren())visit(child);
 };
 for(const root of roots)visit(root);
 const result=valid&&nodes.length?nodes:null;plans.set(container,result);return result;
}
export function instantiateStaticMap(container,name,{transformGltfRoot=false}={}){
 const nodes=plan(container);
 if(!nodes)return container.instantiateModelsToScene(name,false,{doNotInstantiate:false});
 const scene=container.scene,created=new Map(),rootNodes=[];
 for(const source of nodes){
  const geometry=source.getTotalVertices?.()>0;
  const isMesh=source.getClassName()==='Mesh';
  // The loader's empty glTF wrapper only carries the coordinate transform.
  // A TransformNode keeps it out of Babylon's mesh list throughout the visit.
  const wrapper=transformGltfRoot&&!geometry&&isMesh&&source.name==='__root__'&&!source.parent&&
   Object.getPrototypeOf(source)===Mesh.prototype&&!source.geometry&&!source.actionManager&&source.visibility===1;
  const nodeName=name(source.name);
  let node;
  if(geometry)node=source.createInstance(nodeName);
  else if(isMesh&&!wrapper)node=new Mesh(nodeName,scene);
  else node=new TransformNode(nodeName,scene);
  // Static props: the bounding-sphere test alone decides visibility (the
  // extra box test per instance per frame is measurable on phones).
  if(geometry)node.cullingStrategy=1;
  created.set(source,node);
  node.position.copyFrom(source.position);node.scaling.copyFrom(source.scaling);
  if(source.rotationQuaternion)node.rotationQuaternion=source.rotationQuaternion.clone();else node.rotation.copyFrom(source.rotation);
  node.parent=created.get(source.parent)??null;
  if(!geometry){
   node.metadata=source.metadata?{...source.metadata}:null;
   node.isVisible=source.isVisible;
   if(isMesh&&!wrapper)node.visibility=source.visibility;
   node.setEnabled(source.isEnabled(false));
  }
  if(source.material&&!scene.materials.includes(source.material))scene.addMaterial(source.material);
  if(!node.parent)rootNodes.push(node);
 }
 return {rootNodes,skeletons:[],animationGroups:[]};
}
