export const AUTHORING_MAPS=Object.freeze([
 {mapId:'village',character:'warrior-v3',label:'마을'},
 {mapId:'great-plains',character:'warrior-plains',label:'대평원'},
 {mapId:'monster-forest',character:'warrior-v4',label:'마물의 숲'},
 {mapId:'witch-cave',character:'warrior-v5',label:'마녀의 동굴'},
]);
const flags=['developer','actorLab','cinematic','cinematicPreview'];
export function authoringCharacter(mapId){const row=AUTHORING_MAPS.find(row=>row.mapId===mapId||row.character===mapId);if(!row)throw new Error('이 지역은 열 수 없습니다.');return row.character;}
export function authoringUrl(href,{mode='game',mapId,sceneId}={}){
 const url=new URL(href);url.searchParams.set('release','moonforest-0.1');for(const flag of flags)url.searchParams.delete(flag);url.searchParams.delete('scene');
 if(mapId)url.searchParams.set('character',authoringCharacter(mapId));else if(url.searchParams.get('character')==='moonforest-0.1')url.searchParams.set('character','warrior-v3');
 if(mode==='studio'||mode==='help'){const studio=new URL(mode==='studio'?'./cinematic-studio.html':'./moonforest-help.html',url);const rev=url.searchParams.get('rev');if(rev)studio.searchParams.set('rev',rev);return studio.href;}
 if(mode==='map')url.searchParams.set('developer','1');else if(mode==='cinematic')url.searchParams.set('cinematic','1');
 if(sceneId)url.searchParams.set('scene',sceneId);return url.href;
}
export function setupAuthoringNavigation({root,host=root,href,mapId,getState=()=>({}),onMapChange=()=>{}}){
 const doc=root.ownerDocument,panel=doc.createElement('details'),style=doc.createElement('style'),mode=new URL(href).searchParams.has('developer')?'map':new URL(href).searchParams.has('cinematic')?'cinematic':'game';
 panel.className='moonforest-create-menu';panel.dataset.toolUi='';panel.dataset.ui='';
 style.textContent='.moonforest-create-menu{position:fixed;z-index:900;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));font:14px/1.5 system-ui;color:#f1eadb;max-width:calc(100vw - 24px)}.moonforest-create-menu summary{background:#183127f5;border:1px solid #adba8b;border-radius:8px;cursor:pointer;padding:10px 16px;min-height:44px}.moonforest-create-menu>div{margin-top:6px;width:min(300px,calc(100vw - 24px));padding:12px;border:1px solid #6f8674;background:#14271ff5;border-radius:10px;box-shadow:0 8px 30px #0008}.moonforest-create-menu a{display:block;color:inherit;text-decoration:none;padding:10px 12px;margin:4px 0;border:1px solid #486650;border-radius:6px;min-height:44px}.moonforest-create-menu a[aria-current=page]{background:#405b3b}.moonforest-create-menu select{font:inherit;padding:8px;width:100%;min-height:44px;background:#223c2b;color:inherit}.moonforest-create-menu p{font-size:12px;margin:10px 0;color:#c4cdbb}.moonforest-create-menu output{display:block;font-size:12px;color:#efca9a}';
 const title=mode==='map'?'맵 꾸미기':mode==='cinematic'?'저장한 컷씬':'게임 / 만들기';
  panel.innerHTML=`<summary>${title}</summary><div><strong>MoonForest 0.1</strong><nav>${[['game','게임하기'],['map','맵 꾸미기'],['studio','컷씬 만들기'],['cinematic','저장한 컷씬 보기'],['help','짧은 사용 안내']].map(([key,label])=>`<a data-create-mode="${key}" href="${authoringUrl(href,{mode:key,mapId})}"${mode===key?' aria-current="page"':''}>${label}</a>`).join('')}</nav><label>다른 지역 열기<select data-create-map>${AUTHORING_MAPS.map(row=>`<option value="${row.mapId}">${row.label}</option>`).join('')}</select></label><p>${mode==='map'?'소품을 골라 놓고, 옮긴 뒤 게임에 적용하세요.':mode==='cinematic'?'저장한 컷씬을 골라 재생하세요.':'맵을 꾸미거나 배우와 카메라로 컷씬을 만들 수 있습니다.'}</p><output aria-live="polite"></output></div>`;
 if(host!==root){panel.dataset.settingsTool='';panel.style.cssText='position:static;inset:auto;max-width:100%;font:inherit';style.textContent+=' .moonforest-create-menu[data-settings-tool]>div{width:auto;box-sizing:border-box}.moonforest-create-menu[data-settings-tool] summary{min-height:0}';}
 host.append(style,panel);const select=panel.querySelector('select'),output=panel.querySelector('output');let disposed=false,busy=false;
 async function change(){if(busy||disposed)return;busy=true;select.disabled=true;output.textContent='지역을 여는 중…';try{await onMapChange(select.value);output.textContent='';panel.open=false;}catch(error){output.textContent=error.message;}finally{busy=false;notifyReady();}}
 function choose(value){for(const option of select.children)option.selected=option.value===value;}
 function notifyReady(){if(disposed)return;const state=getState();select.disabled=busy||!state.ready;if(AUTHORING_MAPS.some(row=>row.mapId===state.mapId)){choose(state.mapId);for(const link of panel.querySelectorAll('[data-create-mode]'))link.href=authoringUrl(href,{mode:link.dataset.createMode,mapId:state.mapId});}}
 const keyboard=event=>{event.stopPropagation();if(event.key==='Escape'){panel.open=false;panel.querySelector('summary').focus?.();}};
 choose(mapId);select.addEventListener('change',change);panel.addEventListener('keydown',keyboard);notifyReady();
 return {notifyReady,dispose(){if(disposed)return;disposed=true;select.removeEventListener('change',change);panel.removeEventListener('keydown',keyboard);panel.remove();style.remove();}};
}
