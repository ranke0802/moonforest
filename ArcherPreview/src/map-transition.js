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
  let busy=false,failed=false,phase='idle',started=null,stageStarted=null,ended=null,lastError=null,lastFailure=null,retryUrl=null,retryContext=null,retryCount=0;
  const stage=value=>{phase=value;stageStarted=now();};
  return {get busy(){return busy;},get failed(){return failed;},
    inspect(){const at=ended??now();return {phase,busy,failed,lastError,retryAvailable:failed&&!busy&&retryUrl!==null,retryCount,stageElapsedMs:stageStarted===null?null:Math.max(0,at-stageStarted),totalElapsedMs:started===null?null:Math.max(0,at-started),lastFailure:lastFailure?{...lastFailure}:null};},
    // Called only after an explicit complete model/map reload succeeds. Keep a
    // bounded historical failure so diagnostic copy does not erase its cause.
    recover(){if(busy)return false;if(failed){failed=false;lastError=null;retryUrl=null;retryContext=null;phase='idle';started=stageStarted=ended=null;lastFailure={...lastFailure,recovered:true};}return true;},
    async retry(){if(!failed||busy||retryUrl===null)return false;failed=false;retryCount++;return this.travel(retryUrl,retryContext);},
    async travel(url,context){
    if(busy||failed)return false;busy=true;retryUrl=url;retryContext=context;started=now();ended=null;lastError=null;let notifyError;
    try{stage('prepare');prepare(url,context);stage('curtain');await frame();await frame();stage('release');await release();stage('load');await load(url,context);stage('finish');await finish();stage('complete');ended=now();if(lastFailure)lastFailure={...lastFailure,recovered:true};return true;}
    catch(error){const failedPhase=phase;failed=true;lastError=String(error?.message??error).slice(0,240);ended=now();lastFailure={phase:failedPhase,message:lastError,...(error?.code?{code:String(error.code).slice(0,80)}:{}),...(Number.isFinite(error?.timeoutMs)?{timeoutMs:error.timeoutMs}:{}),...(error?.stage?{operation:String(error.stage).slice(0,80)}:{}),...(error?.assetId?{assetId:String(error.assetId).slice(0,120)}:{}),...(Number.isFinite(error?.level)?{level:error.level}:{}),totalElapsedMs:Math.max(0,ended-started),recovered:false};phase='error';stageStarted=ended;notifyError=error;return false;}
    // The error curtain captures diagnostics synchronously. Publish the settled
    // retry state first, without clearing it after a callback starts a retry.
    finally{busy=false;if(notifyError)onError(notifyError);}
  }};
}
