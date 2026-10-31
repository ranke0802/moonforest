import {portalHeadingTurn} from './map-route.js';

// Swaps map resources inside the current document. In particular, never call
// location.assign/replace, fullscreen exit, orientation unlock or engine.dispose.
export function carryPortalPose(actor,camera,pan,route){
  // Preserve the three-argument API used by older review/transition callers.
  if(!route){actor.rotation.y+=Math.PI;camera.alpha+=Math.PI;if(pan){pan.x=-pan.x;pan.z=-pan.z;}return;}
  const turn=portalHeadingTurn(route.from,route.to);
  actor.rotation.y+=turn;camera.alpha-=turn;
  if(pan&&turn){
    const {x,z}=pan;
    if(Math.abs(turn)===Math.PI){pan.x=-x;pan.z=-z;}
    else {const sin=Math.sin(turn),cos=Math.cos(turn);pan.x=cos*x+sin*z;pan.z=-sin*x+cos*z;}
  }
}
export function createMapTransition({prepare,release,load,finish,frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),onError=()=>{}}){
  let busy=false,failed=false;
  return {get busy(){return busy;},get failed(){return failed;},async travel(url){
    if(busy)return false;busy=true;
    try{prepare();await frame();await frame();await release();await load(url);await finish();busy=false;return true;}
    catch(error){failed=true;onError(error);return false;}
  }};
}
