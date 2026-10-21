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
  element.style.left=`${p.x}px`;element.style.top=`${p.y}px`;
}
