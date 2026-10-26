// Isolated render fixture: no game entry point, input, fullscreen, or audio.
import { Engine } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { createWorld } from '../../src/world.js';
import { loadTrainingGround } from '../../src/environment.js';

const canvas=document.querySelector('canvas');
const engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const world=createWorld(engine);
await loadTrainingGround(world,{targets:[{}],applyModel(){}});
await world.sky.load(new URL('/assets/sky.json',location.href));
world.lighting.setQuality('high');
const baseline=new URLSearchParams(location.search).has('baseline');
if(baseline){world.scene.fogStart=18;world.scene.fogEnd=30;world.camera.maxZ=32;}
const render=async(x=0,z=0,alpha=1.2,beta=1.15,radius=14)=>{
  world.camera.target.set(x,1.5,z);world.camera.alpha=alpha;world.camera.beta=beta;world.camera.radius=radius;
  world.lighting.follow(world.camera.target);
  // Shader compilation needs active instances to have been submitted once.
  const frame=()=>{engine.beginFrame();world.scene.render();engine.endFrame();};
  for(let i=0;i<4;i++){frame();await new Promise(resolve=>setTimeout(resolve,80));}
  await world.scene.whenReadyAsync();frame();
  return {triangles:world.scene.getActiveIndices()/3,meshes:world.scene.getActiveMeshes().length,
    lods:world.scene.meshes.filter(m=>m.material?.metadata?.distantTree).length,
    fogStart:world.scene.fogStart,fogEnd:world.scene.fogEnd,far:world.camera.maxZ};
};
window.forestReview={world,render};
window.forestReview.ready=true;
