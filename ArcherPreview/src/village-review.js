import { SceneInstrumentation } from '@babylonjs/core';

function workerStats(){
  const controller=navigator.serviceWorker?.controller;
  if(!controller)return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timeout);channel.port1.close();channel.port2.close();resolve(value);};
    const timeout=setTimeout(()=>finish(null),1200);
    channel.port1.onmessage=event=>finish(event.data);
    try{controller.postMessage({type:'RESOURCE_CACHE_STATS'},[channel.port2]);}catch{finish(null);}
  });
}

// Instantiated only by the DEV + villageReview URL branch. No production HUD,
// polling, cache mutation or guessed GPU-memory measurement is introduced.
export function createVillageReview(world,{forcedMobile=false}={}){
  const panel=document.createElement('pre');panel.id='village-review';panel.setAttribute('aria-label','마을 개발 성능 검수');
  Object.assign(panel.style,{position:'fixed',zIndex:1000,right:'12px',top:'80px',maxWidth:'calc(100vw - 24px)',padding:'10px 12px',margin:0,border:'1px solid #8c9867',borderRadius:'8px',background:'rgba(12,20,18,.88)',color:'#e3eaca',font:'11px/1.6 monospace',whiteSpace:'pre-wrap',pointerEvents:'none'});
  document.body.append(panel);
  performance.setResourceTimingBufferSize(5000);
  const instrumentation=new SceneInstrumentation(world.scene),engine=world.scene.getEngine();
  let baseline=null,latest=null,last=-Infinity,pending=false,loadStarted=performance.now();
  const update=()=>{
    if(performance.now()-last<1000)return;last=performance.now();
    const env=world.environment??{},vis=env.visibility??{},lod=env.loadedLods??{},entries=performance.getEntriesByType('resource').filter(e=>e.startTime>=loadStarted&&e.name.includes('/assets/content/'));
    const transfer=entries.reduce((sum,e)=>sum+e.transferSize,0),unique=new Set(entries.map(e=>e.name)).size;
    const delta=latest&&baseline?(latest.hits<baseline.hits||latest.downloads<baseline.downloads?'worker 재시작 · 비교 불가':`hits ${latest.hits-baseline.hits} / downloads ${latest.downloads-baseline.downloads}`):'조회 중 또는 미지원';
    panel.textContent=[
      `DEV 마을 검수 · ${forcedMobile?'모바일 정책 강제':world.touchDevice?'모바일 정책':'데스크톱 정책'}`,
      `실제 에셋 ${env.sourceAssets??0}/25 · 배치 ${env.instances??0} · 활성 root ${vis.activeInstances??0}`,
      `활성 셀 ${vis.activeCells??0}/${vis.cells??0} · 그림자 ${vis.shadowCasters??0} · 가림 ${vis.occludedProps??0} / GPU조회 ${vis.occlusionQueries??0}`,
      `마을 텍스처 ${env.textureTier??'로딩 중'} · 최대 ${env.largestTexture??0}px`,
      `로드된 LOD 0:${lod[0]??0} / 1:${lod[1]??0} / 2:${lod[2]??0}`,
      `실측 ${Math.round(engine.getFps())} FPS · draw calls ${instrumentation.drawCallsCounter.current} · active meshes ${world.scene.getActiveMeshes().length}`,
      `content 응답 ${entries.length}건 / 고유 ${unique} · transferSize ${(transfer/1024).toFixed(1)} KiB`,
      `SW 이번 로드 Δ ${delta}`,
      'SW Δ는 worker 범위(다른 탭 포함). transferSize 0만으로 캐시 적중을 판정하지 않음.',
    ].join('\n');
    if(!pending){pending=true;workerStats().then(value=>{latest=value;}).finally(()=>{pending=false;});}
  };
  const observer=world.scene.onAfterRenderObservable.add(update);
  world.scene.onDisposeObservable.addOnce(()=>{world.scene.onAfterRenderObservable.remove(observer);instrumentation.dispose();panel.remove();});
  return {async startLoad(){loadStarted=performance.now();baseline=await workerStats();latest=baseline;last=-Infinity;}};
}
