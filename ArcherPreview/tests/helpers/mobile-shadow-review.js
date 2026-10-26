// Isolated shadow renderer, with no game input, fullscreen or audio.
import { Engine, MeshBuilder, StandardMaterial, Color3, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from '../../src/animation.js';
import { createWorld } from '../../src/world.js';
const canvas=document.querySelector('canvas');
const engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const world=createWorld(engine),{scene,camera,lighting,shadows}=world;
world.mountains.setEnabled(false);world.sky.mesh.setEnabled(false);
for(const mesh of [...scene.meshes])if(mesh.name.startsWith('mote-')||mesh.name.startsWith('stage-ring-'))mesh.setEnabled(false);
world.floorMaterial.diffuseTexture.dispose();world.floorMaterial.diffuseTexture=null;
world.floorMaterial.diffuseColor=new Color3(.75,.75,.75);
const caster=MeshBuilder.CreateBox('moving-caster',{width:1.2,height:2,depth:1.2},scene);
caster.position.y=1;caster.material=new StandardMaterial('caster',scene);caster.material.diffuseColor=new Color3(.3,.18,.4);
shadows.addShadowCaster(caster);lighting.registerMeshes([caster]);lighting.setQuality('high');
let actor=caster,animator;
if(new URLSearchParams(location.search).has('warrior')){
  shadows.removeShadowCaster(caster);caster.dispose();
  const config=await (await fetch('/assets/warrior-v2.json')).json();
  const url=new URL(config.model,new URL('/assets/warrior-v2.json',location.href));
  const asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',url).href,url.pathname.split('/').pop(),scene,null,'.gltf');
  asset.addAllToScene();actor=new TransformNode('actor',scene);
  for(const group of asset.animationGroups)group.stop();
  for(const node of new Set([...asset.meshes,...asset.transformNodes]))if(!node.parent)node.parent=actor;
  for(const mesh of asset.meshes){if(!mesh.getTotalVertices())continue;if(mesh.skeleton){mesh.skeleton.useTextureToStoreBoneMatrices=true;mesh.alwaysSelectAsActiveMesh=true;}shadows.addShadowCaster(mesh,false);}
  lighting.registerMeshes(asset.meshes);animator=new CharacterAnimator(asset.animationGroups,config.animations);
}
camera.alpha=1.2;camera.beta=.55;camera.radius=7;camera.target.set(0,.5,0);
const render=async(frame,moving=false)=>{
  actor.position.x=moving?frame*.08:0;actor.rotation.y=moving?frame*.1:0;
  if(animator){animator.transition('run',{clipTime:frame/30,loop:true});animator.update(1/30);}
  lighting.follow(actor.position);camera.target.x=actor.position.x;
  engine.beginFrame();scene.render();engine.endFrame();
  return canvas.toDataURL('image/png');
};
for(let i=0;i<4;i++){await render(i);await new Promise(r=>setTimeout(r,60));}
await scene.whenReadyAsync();
let shadowPasses=0,lastShadowMatrix=null;
shadows.getShadowMap().onBeforeRenderObservable.add(()=>{
  shadowPasses++;lastShadowMatrix=Array.from(shadows.getTransformMatrix().m);
});
const originalFollow=lighting.follow.bind(lighting);
const configuredRate=shadows.getShadowMap().refreshRate;
window.shadowReview={world,render,ready:true,
  mode(legacy){
    shadows.getShadowMap().refreshRate=legacy?2:configuredRate;
    lighting.follow=legacy?position=>{
      const x=Math.round(position.x/2)*2,z=Math.round(position.z/2)*2;
      if(lighting.focus.x===x&&lighting.focus.z===z)return;
      lighting.focus.set(x,0,z);lighting.key.position.copyFrom(lighting.key.direction.scale(-25).add(lighting.focus));
    }:originalFollow;
    shadowPasses=0;lastShadowMatrix=null;
  },
  inspect(){const matrix=shadows.getTransformMatrix().m;return {shadowPasses,matrixMatches:lastShadowMatrix?.every((n,i)=>Math.abs(n-matrix[i])<1e-7),mapSize:shadows.getShadowMap().getSize().width};},
};
