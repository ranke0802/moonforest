// Swaps map resources inside the current document. In particular, never call
// location.assign/replace, fullscreen exit, orientation unlock or engine.dispose.
export function carryPortalPose(actor,camera,pan){
  // Both exits point out toward +Z; arrival leads inward toward -Z. Rotate the
  // actor AND orbit together, preserving the same rear view and zoom on screen.
  actor.rotation.y+=Math.PI;camera.alpha+=Math.PI;
  if(pan){pan.x=-pan.x;pan.z=-pan.z;}
}
export function createMapTransition({prepare,release,load,finish,frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),onError=()=>{}}){
  let busy=false,failed=false;
  return {get busy(){return busy;},get failed(){return failed;},async travel(url){
    if(busy)return false;busy=true;
    try{prepare();await frame();await frame();await release();await load(url);await finish();busy=false;return true;}
    catch(error){failed=true;onError(error);return false;}
  }};
}
