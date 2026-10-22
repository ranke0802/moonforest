import { Matrix, Vector3 } from '@babylonjs/core';

// CSS coordinates, independent of render resolution / device pixel ratio.
export function projectBossHealth(scene,position,width,height){
  const engine=scene.getEngine(),renderWidth=engine.getRenderWidth(),renderHeight=engine.getRenderHeight();
  const p=Vector3.Project(position,Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera.viewport.toGlobal(renderWidth,renderHeight));
  return {x:p.x*width/renderWidth,y:p.y*height/renderHeight,visible:p.z>=0&&p.z<=1&&p.x>=0&&p.x<=renderWidth&&p.y>=0&&p.y<=renderHeight};
}

export function updateBossHealthPosition(scene,encounter,element){
  if(!encounter?.active){element.hidden=true;return;}
  const canvas=scene.getEngine().getRenderingCanvas();
  const p=projectBossHealth(scene,encounter.actor.position,canvas.clientWidth,canvas.clientHeight);
  element.hidden=!p.visible;
  element.style.left='0';element.style.top='0';
  const transform=`translate3d(${p.x}px,${p.y+8}px,0) translateX(-50%)`;
  if(element.style.transform!==transform)element.style.transform=transform;
}
