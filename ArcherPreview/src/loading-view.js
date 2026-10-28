import {downloadText} from './resource-downloads.js';

export function createLoadingView(doc=document){
  const get=id=>doc.getElementById(id),overlay=get('loading'),track=overlay.querySelector('[role="progressbar"]');
  return {
    begin(){doc.documentElement.dataset.loading='true';overlay.hidden=false;overlay.classList.remove('error');get('retry-load').hidden=true;get('loading-title').textContent='불러오는 중';get('loading-text').textContent='필요한 리소스를 확인합니다.';get('loading-bytes').textContent='0.0 / 0.0 MB';get('loading-progress').style.width='0%';track.setAttribute('aria-valuenow','0');},
    download(state){
      get('loading-text').textContent=state.unavailable?'리소스를 불러옵니다.':state.complete||state.total===0?'화면을 준비합니다.':'리소스 다운로드';
      get('loading-bytes').textContent=state.unavailable?'용량 확인 중':downloadText(state);
      const percent=Math.max(0,Math.min(100,state.ratio*100));get('loading-progress').style.width=percent+'%';track.setAttribute('aria-valuenow',String(Math.round(percent)));
    },
    preparing(){get('loading-text').textContent='화면을 준비합니다.';},
    reveal(){overlay.hidden=true;delete doc.documentElement.dataset.loading;},
    stream(state){
      get('stream-loading').hidden=state.complete||state.total===0||state.unavailable;
      get('stream-bytes').textContent='불러오는 중 '+downloadText(state);get('stream-progress').style.width=Math.min(100,state.ratio*100)+'%';
    },
  };
}
