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
export function createMapTransition({prepare,release,load,finish,frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),onError=()=>{},now=()=>performance.now()}){
  let busy=false,failed=false,phase='idle',started=null,stageStarted=null,ended=null,lastError=null,lastFailure=null;
  const stage=value=>{phase=value;stageStarted=now();};
  return {get busy(){return busy;},get failed(){return failed;},
    inspect(){const at=ended??now();return {phase,busy,failed,lastError,stageElapsedMs:stageStarted===null?null:Math.max(0,at-stageStarted),totalElapsedMs:started===null?null:Math.max(0,at-started),lastFailure:lastFailure?{...lastFailure}:null};},
    // Called only after an explicit complete model/map reload succeeds. Keep a
    // bounded historical failure so diagnostic copy does not erase its cause.
    recover(){if(busy)return false;if(failed){failed=false;lastError=null;phase='idle';started=stageStarted=ended=null;lastFailure={...lastFailure,recovered:true};}return true;},async travel(url){
    if(busy||failed)return false;busy=true;started=now();ended=null;lastError=null;
    try{stage('prepare');prepare();stage('curtain');await frame();await frame();stage('release');await release();stage('load');await load(url);stage('finish');await finish();stage('complete');ended=now();return true;}
    catch(error){const failedPhase=phase;failed=true;lastError=String(error?.message??error).slice(0,240);ended=now();lastFailure={phase:failedPhase,message:lastError,totalElapsedMs:Math.max(0,ended-started),recovered:false};phase='error';stageStarted=ended;onError(error);return false;}
    finally{busy=false;}
  }};
}
