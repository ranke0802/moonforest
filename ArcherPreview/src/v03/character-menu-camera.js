// Render the already-loaded warrior through the play camera, then restore its
// live coordinates synchronously. Saving or going into the background while the
// sheet is open therefore still sees the gameplay camera.
export function drawCharacterPose({camera,scene,actor,height,canvasRect,frameRect,turn=0,zoom=1}){
  if(!camera||!actor||scene?.isDisposed||!frameRect.height||!canvasRect.width||!canvasRect.height)return;
  const target=camera.target,offset=camera.targetScreenOffset,oldX=offset.x,oldY=offset.y;
  const {alpha,beta,radius}=camera;
  const aim=actor.position.clone();
  aim.y+=height*(.5+.26*(1-1/zoom));
  const halfFov=Math.tan(camera.fov/2);
  const distance=height/(2*halfFov*.88*(frameRect.height/canvasRect.height)*zoom);
  const cx=frameRect.left+frameRect.width/2-canvasRect.left-canvasRect.width/2;
  const cy=canvasRect.top+canvasRect.height/2-frameRect.top-frameRect.height/2;
  try{
    camera.setTarget(aim,false,true,true);
    camera.alpha=Math.PI/2-actor.rotation.y+turn;
    camera.beta=Math.PI*.475;
    camera.radius=Math.max(camera.lowerRadiusLimit??.2,distance);
    const metersPerPixel=2*camera.radius*halfFov/canvasRect.height;
    offset.set(cx*metersPerPixel,cy*metersPerPixel);
    camera.getViewMatrix(true);
    scene.render(false,true);
  }finally{
    camera.setTarget(target,false,true,true);
    camera.alpha=alpha;camera.beta=beta;camera.radius=radius;
    offset.set(oldX,oldY);
    camera.getViewMatrix(true);
  }
}
