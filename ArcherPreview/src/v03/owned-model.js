// A glb the story owns outright (0.3): loaded straight into the scene, no
// AssetContainer. Babylon 9.31's AssetContainer leaves its scene-disposal
// closure registered after dispose(), so every container ever loaded stays
// reachable for the scene's life (map-container.js releases that hook for
// maps; the story wagon and horse did not, and each plains visit kept a
// disposed wagon and horse alive: measured in the game, 2026-11-20).
// The returned asset has the fields the toon and outline helpers use
// (meshes, skeletons, animationGroups) and disposes everything it loaded.
import {SceneLoader} from '@babylonjs/core';

export async function loadOwnedModel(scene,url,{signal}={}){
 const href=url.href,base=href.slice(0,href.lastIndexOf('/')+1),file=href.slice(href.lastIndexOf('/')+1);
 let source=file,extension;
 if(signal){
  const response=await fetch(url,{signal});if(!response.ok)throw Error('Model fetch failed: '+response.status);
  source=new Uint8Array(await response.arrayBuffer());
  if(signal.aborted)throw new DOMException('Model load cancelled','AbortError');
  extension='.glb';
 }
 const result=await SceneLoader.ImportMeshAsync(null,base,source,scene,null,extension);
 const meshes=result.meshes.slice(),transformNodes=result.transformNodes.slice(),skeletons=result.skeletons.slice(),animationGroups=result.animationGroups.slice();
 const nodes=new Set([...meshes,...transformNodes]),rootNodes=[...nodes].filter(node=>!node.parent||!nodes.has(node.parent));
 const materials=new Set(),textures=new Set();
 // Registers a material (and its textures) as this model's own: disposed with it.
 const own=material=>{
  if(!material||materials.has(material))return;materials.add(material);
  for(const sub of material.subMaterials??[])own(sub);
  for(const texture of material.getActiveTextures?.()??[])textures.add(texture);
 };
 for(const mesh of meshes)own(mesh.material);
 let disposed=false;
 return {
  meshes,transformNodes,skeletons,animationGroups,rootNodes,own,
  dispose(){
   if(disposed)return;disposed=true;
   const attempt=work=>{try{work();}catch(error){console.warn('[MoonForest 0.3] model release',error);}};
   for(const group of animationGroups)attempt(()=>{group.stop();group.dispose();});
   // Meshes added later (outline shells are pushed into `meshes`) go with the rest.
   for(const mesh of meshes.slice())attempt(()=>{if(!mesh.isDisposed())mesh.dispose(false,false);});
   for(const skeleton of skeletons)attempt(()=>skeleton.dispose());
   for(const node of transformNodes)attempt(()=>{if(!node.isDisposed())node.dispose();});
   for(const material of materials)attempt(()=>material.dispose(false,false));
   for(const texture of textures)attempt(()=>texture.dispose());
   meshes.length=transformNodes.length=skeletons.length=animationGroups.length=rootNodes.length=0;materials.clear();textures.clear();
  },
 };
}
