import {Color4} from '@babylonjs/core/Maths/math.color.js';
import {ObjectRenderer} from '@babylonjs/core/Rendering/objectRenderer.js';

const black=new Color4(0,0,0,1);
export const PORTRAIT_PITCH=Math.PI*.475;

// Draw the selected portrait meshes to the paused game's framebuffer without
// advancing the world, its shadows or scene render observers.
export function createCharacterPortrait(scene){
  const engine=scene.getEngine(),renderer=new ObjectRenderer('equipment-portrait',scene);
  renderer.renderParticles=false;renderer.renderSprites=false;
  const observer=scene.onDisposeObservable.addOnce(dispose);
  let disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;
    scene.onDisposeObservable.remove(observer);renderer.freeRenderingGroups();renderer.dispose();
  }
  function draw({camera,actor,meshes,height,width:breadth=0,canvasRect,frameRect,turn=0,pitch=PORTRAIT_PITCH,zoom=1}){
    if(disposed||scene.isDisposed||!camera||!actor||!frameRect.height||!frameRect.width||!canvasRect.width||!canvasRect.height)return false;
    const target=camera.target,offset=camera.targetScreenOffset,oldX=offset.x,oldY=offset.y;
    const {alpha,beta,radius}=camera;
    const aim=actor.position.clone();aim.y+=height*(.5+.26*(1-1/zoom));
    const halfFov=Math.tan(camera.fov/2);
    // At 1× let a long mount turn broadside inside even a portrait viewport.
    // The near end of the horse can be half its length nearer than its centre.
    const projectedHeight=breadth?height*Math.abs(Math.sin(pitch))+breadth*Math.abs(Math.cos(pitch)):height;
    const fit=Math.max(projectedHeight/frameRect.height,breadth/frameRect.width)*canvasRect.height/(2*halfFov*.88);
    const distance=(fit+breadth/2)/zoom;
    const cx=frameRect.left+frameRect.width/2-canvasRect.left-canvasRect.width/2;
    const cy=canvasRect.top+canvasRect.height/2-frameRect.top-frameRect.height/2;
    const width=engine.getRenderWidth(),pixelHeight=engine.getRenderHeight();
    const scissorX=Math.floor((frameRect.left-canvasRect.left)*width/canvasRect.width);
    const scissorY=Math.floor((canvasRect.top+canvasRect.height-frameRect.top-frameRect.height)*pixelHeight/canvasRect.height);
    const pass=engine.currentRenderPassId,oldOutline=scene.getOutlineRenderer?.()?.enabled;
    let init=false,scissor=false;
    engine.beginFrame();
    try{
      camera.setTarget(aim,false,true,true);
      camera.alpha=Math.PI/2-actor.rotation.y+turn;camera.beta=pitch;
      camera.radius=Math.max(camera.lowerRadiusLimit??.2,distance);
      const metersPerPixel=2*camera.radius*halfFov/canvasRect.height;
      offset.set(cx*metersPerPixel,cy*metersPerPixel);camera.getViewMatrix(true);
      // Use the supplied model's mesh list. A rider, effect or world prop may
      // share its hierarchy but belongs outside this portrait.
      renderer.renderList=(meshes??[]).filter(m=>m.getTotalVertices?.()>0&&m.isEnabled()&&m.isVisible);
      if(!renderer.renderList.length)return false;
      renderer.activeCamera=camera;
      engine.restoreDefaultFramebuffer();
      if(!renderer.isReadyForRendering(width,pixelHeight))return false;
      engine.clear(black,true,true,true);
      renderer.initRender(width,pixelHeight);init=true;
      engine.enableScissor(scissorX,scissorY,Math.ceil(frameRect.width*width/canvasRect.width),Math.ceil(frameRect.height*pixelHeight/canvasRect.height));scissor=true;
      renderer.render();
      return true;
    }finally{
      if(scissor)engine.disableScissor();
      if(init)renderer.finishRender();
      engine.currentRenderPassId=pass;
      if(oldOutline!==undefined)scene.getOutlineRenderer().enabled=oldOutline;
      camera.setTarget(target,false,true,true);camera.alpha=alpha;camera.beta=beta;camera.radius=radius;
      offset.set(oldX,oldY);scene.setTransformMatrix(camera.getViewMatrix(true),camera.getProjectionMatrix());
      scene.resetCachedMaterial();engine.endFrame();
    }
  }
  return {draw,dispose};
}
