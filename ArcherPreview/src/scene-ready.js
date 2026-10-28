// Failed GPU compilation must reject loading, not leave a permanent curtain.
export async function waitForSceneReady(scene,{timeoutMs=45000,now=()=>performance.now(),wait=()=>new Promise(r=>setTimeout(r,30))}={}){
  const start=now();
  for(;;){
    if(scene.isReady())return;
    for(const effect of Object.values(scene.getEngine()._compiledEffects??{})){
      const error=effect.getCompilationError?.();
      if(error&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');
    }
    if(now()-start>=timeoutMs)throw new Error('화면 준비 시간이 초과되었습니다. 새로고침해 주세요.');
    await wait();
  }
}
