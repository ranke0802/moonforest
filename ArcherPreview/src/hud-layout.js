import authoredDefault from './hud-layout-default.json' with {type:'json'};
// User offsets are relative to the viewport, never to a map or camera.
export const HUD_LAYOUT_KEY='moonforest-game-hud-layout-v1';
export const HUD_GROUPS=Object.freeze([
  ['health','#player-hud','체력 · 스태미나',false,.85,1.4],
  ['gold','#gold-balance','골드',false,.85,1.4],
  ['quest','.chapter-stack, .uit-track','의뢰 · 이야기',false,.85,1.4],
  ['tools','.top-actions','상단 도구',false,1,1.25],
  ['map','#dot-minimap','미니맵',false,.85,1.4],
  ['diagnostics','#frame-diagnostics','성능 진단',false,1,1.4],
  ['shield','#guard-button','방패 밀치기',false,.85,1.25],
  ['potion','#potion-button','물약',false,.85,1.25],
  ['dodge','#dodge-button','회피',false,.85,1.25],
  ['attack','#attack-button','검 공격',false,.85,1.25],
  ['boss','#boss-hud','보스 체력',false,.6,2],
  ['joystick','#joystick','이동 조이스틱',false,.6,2],
  ['travel','#map-travel','이동 안내',false,.6,2],
  ['story','.chapter-story','이야기 버튼',false,.6,2],
  ['interact','.chapter-context','상호작용 버튼',false,.6,2],
  ['fps','.top-actions [data-top-action="fps"]','FPS 표시',false,.6,2],
  ['bag','.top-actions [data-top-action="bag"]','가방',false,.6,2],
  ['journal','.top-actions [data-top-action="journal"]','수첩',false,.6,2],
  ['summon','.top-actions [data-top-action="summon"]','소환',false,.6,2],
  ['fullscreen','.top-actions [data-top-action="fullscreen"]','전체화면',false,.6,2],
  ['settings','.top-actions [data-top-action="settings"]','설정',false,.6,2],
  ['chapterDialog','#chapter-dialog','소지품 · 의뢰 창',false,.6,1.4],
  ['summonDialog','#summon-dialog','소환 창',false,.6,1.4],
  ['settingsDialog','#motion-speed-dialog','설정 창',false,.6,1.4],
  ['mapDialog','#minimap-travel-dialog','지역 이동 창',false,.6,1.4],
  ['helpDialog','#help-dialog','도움말 창',false,.6,1.4],
  ['diagnosticsDialog','#diagnostic-detail-dialog','성능 진단 창',false,.6,1.4],
  ['bossSettingsDialog','#boss-pattern-dialog','보스 설정 창',false,.6,1.4],
  ['characterSettingsDialog','#character-style-dialog','캐릭터 설정 창',false,.6,1.4],
  ['brand','.topbar .brand','게임 이름',false,.6,2],
  ['characterInfo','.character-info','캐릭터 정보',false,.6,2],
  ['cameraTools','.camera-tools','카메라 도구',false,.6,2],
  ['keyboardHint','.keyboard-hint','키보드 안내',false,.6,2],
  ['cameraHint','.camera-hint','카메라 안내',false,.6,2],
  ['joystickHint','#joystick-hint','이동 안내',false,.6,2],
  ['run','#run-button','달리기',false,.6,2],
  ['hit','#hit-button','피격 버튼',false,.6,2],
  ['death','#death-button','사망 버튼',false,.6,2],
  ['toast','#toast','게임 안내 메시지',false,.6,2],
  ['chapterToast','.chapter-toast','의뢰 안내 메시지',false,.6,2],
  ['deathDialog','#death-dialog','사망 안내 창',false,.6,1.4],
  ['authoredInteraction','.authored-interaction-button','상호작용',false,.6,2],
  ['authoredDialog','.authored-interaction-dialog','상호작용 창',false,.6,1.4],
  ['streamLoading','#stream-loading','추가 로딩 표시',false,.6,2],
].map(([id,selector,label,locked,min])=>Object.freeze({id,selector,label,locked,min,max:5})));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const combatControls=new Set(['shield','potion','dodge','attack']);
// Nested elements inherit their parent's responsive scale. The saved scale is
// still an independent multiplier so an edited HUD follows later resizes.
const responsiveGroups=new Set(['health','gold','quest','tools','map','diagnostics','shield','potion','dodge','attack','boss','brand']);
export function responsiveHudScale(viewport){
  if(!viewport?.width||!viewport?.height)return 1;
  return clamp(Math.min(viewport.width/1280,viewport.height/720),.8,1.2);
}
const componentKey=/^component:([A-Za-z][A-Za-z0-9]*):([A-Za-z0-9_-]+):([0-9]+(?:\.[0-9]+)*):([a-z0-9-]+):([A-Za-z0-9_-]*):([A-Za-z0-9_-]*)(?::([A-Za-z0-9_-]*))?$/;
function componentParts(key){const m=componentKey.exec(key);if(!m)return null;const path=m[3].split('.').map(Number);return path.length<=24&&path.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=512)?{group:m[1],screen:m[2],path,tag:m[4],action:m[5],id:m[6],elementId:m[7]}:null;}
function componentNode(base,parts){if(!base||!parts||(base.dataset.screen||'default')!==parts.screen)return null;let node=base;for(const index of parts.path){node=node.children?.[index];if(!node)return null;}if(node.tagName?.toLowerCase()!==parts.tag||(node.dataset.chapter??'')!==parts.action||(node.dataset.id??'')!==parts.id||parts.elementId!==undefined&&(node.id??'')!==parts.elementId)return null;return node;}
function componentId(group,base,node){const path=[];let current=node;while(current&&current!==base){const parent=current.parentElement;if(!parent)return null;path.unshift([...parent.children].indexOf(current));current=parent;}if(current!==base||!path.length)return null;const key=`component:${group.id}:${base.dataset.screen||'default'}:${path.join('.')}:${node.tagName.toLowerCase()}:${node.dataset.chapter??''}:${node.dataset.id??''}:${node.id??''}`;return componentParts(key)?key:null;}
export const defaultHudLayout=()=>parseHudLayout(authoredDefault);
export function parseHudLayout(raw){
  const value=typeof raw==='string'?JSON.parse(raw):raw;
  if(value?.version!==1||!value.items||Array.isArray(value.items)||Object.keys(value.items).length>256||Object.keys(value.items).some(id=>!HUD_GROUPS.some(g=>g.id===id)&&(!componentParts(id)||!HUD_GROUPS.some(g=>g.id===componentParts(id).group))))throw Error('올바른 HUD 배치 파일이 아닙니다.');
  const result={};
  for(const [index,g] of HUD_GROUPS.entries()){
    const v=value.items[g.id]??(index>=10?{x:0,y:0,scale:1}:null);
    if(!v||Object.keys(v).length!==3||!['x','y','scale'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||Math.abs(v.x)>1||Math.abs(v.y)>1||v.scale<g.min||v.scale>g.max)throw Error('HUD 위치 또는 크기 범위를 확인해 주세요.');
    result[g.id]={x:g.locked?0:v.x,y:g.locked?0:v.y,scale:v.scale};
  }
  for(const [id,v] of Object.entries(value.items))if(componentParts(id)){if(!v||Object.keys(v).length!==3||!['x','y','scale'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||Math.abs(v.x)>1||Math.abs(v.y)>1||v.scale<.6||v.scale>5)throw Error('UI 위치 또는 크기 범위를 확인해 주세요.');result[id]={x:v.x,y:v.y,scale:v.scale};}
  return result;
}
export function resolveHudBox(group,value,box,viewport,responsiveScale=1){
  if(!box?.width||!box?.height)return {x:0,y:0,scale:1};
  if(value.x===0&&value.y===0&&value.scale===1&&responsiveScale===1)return {...value};
  const edge=8,halfW=viewport.width/2,halfH=viewport.height/2;
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const cap=group.locked?Math.min((cx-edge)*2/box.width,(viewport.width-edge-cx)*2/box.width,(cy-edge)*2/box.height,(viewport.height-edge-cy)*2/box.height):Infinity;
  const minimum=combatControls.has(group.id)?44/Math.min(box.width,box.height):0;
  const scale=Math.max(.1,Math.min(cap,Math.max(minimum,clamp(value.scale,group.min,group.max)*responsiveScale)));
  // Oversized elements are centered on that axis instead of silently shrinking
  // below the chosen size. Reset and the editor controls remain available.
  const axis=(offset,center,size,extent)=>size>extent-2*edge?(extent/2-center)/extent:clamp(offset,(edge+size/2-center)/extent,(extent-edge-size/2-center)/extent);
  return {x:group.locked?0:axis(value.x,cx,box.width*scale,halfW*2),y:group.locked?0:axis(value.y,cy,box.height*scale,halfH*2),scale};
}

export function setupHudLayout({root,storage,getReady=()=>true,resetInput=()=>{},onPauseChange=()=>{},onClose=()=>{}}){
  const doc=root.ownerDocument,win=doc.defaultView,groups=HUD_GROUPS.map(g=>({...g,node:root.querySelector(g.selector)})).filter(g=>g.node);
  const original=new Map(groups.map(g=>[g.id,{translate:g.node.style.translate||'',scale:g.node.style.scale||'',origin:g.node.style.transformOrigin||''}]));
  const dialog=doc.createElement('dialog');dialog.id='hud-layout-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-label','HUD 위치와 크기 편집');
  dialog.innerHTML=`<section class="hud-layout-panel"><header><strong>UI 편집</strong><span id="hud-layout-current"></span><button type="button" data-hud-command="reset-all">초기화</button><button type="button" data-hud-command="cancel">취소</button><button type="button" data-hud-command="save">저장</button></header><p>화면의 UI를 선택해 드래그하세요. PC는 가장자리, 모바일은 두 손가락으로 크기를 조절합니다.</p><details class="hud-layout-options"><summary>다른 항목 · 세부 설정</summary><label>편집할 항목<select id="hud-layout-selection">${groups.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select></label><p id="hud-layout-note"></p><div class="hud-layout-fields">${[['x','가로 위치'],['y','세로 위치'],['scale','크기']].map(([key,label])=>`<label>${label}<input type="range" data-hud-field="${key}" aria-label="${label}" step="1"><output data-hud-output="${key}"></output></label>`).join('')}</div><div class="hud-layout-actions"><button type="button" data-hud-command="reset">선택 초기화</button></div><details><summary>배치 내보내기 · 가져오기</summary><textarea id="hud-layout-json" aria-label="HUD 배치 데이터" spellcheck="false"></textarea><div class="hud-layout-actions"><button type="button" data-hud-command="export">내보내기</button><button type="button" data-hud-command="import">가져오기</button></div></details></details><p id="hud-layout-status" role="status" aria-live="polite"></p></section>`;
  root.append(dialog);
  const preview=doc.createElement('div');preview.id='hud-layout-preview';preview.setAttribute('aria-hidden','true');dialog.prepend(preview);
  const find=s=>dialog.querySelector(s),select=find('#hud-layout-selection'),status=find('#hud-layout-status');
  const componentChoice=doc.createElement('label');componentChoice.innerHTML='<input type="checkbox" data-hud-components> 창 미리보기에서 내부 요소 선택';find('#hud-layout-note').after(componentChoice);
  const fileActions=doc.createElement('div'),fileInput=doc.createElement('input');fileActions.className='hud-layout-actions';fileActions.innerHTML='<button type="button" data-hud-command="download">JSON 다운로드</button><button type="button" data-hud-command="open-file">JSON 파일 열기</button>';fileInput.type='file';fileInput.accept='.json,application/json';fileInput.hidden=true;find('#hud-layout-json').after(fileActions,fileInput);
  let committed=defaultHudLayout(),draft=null,editing=false,selected=groups[0]?.id,selectedComponent=null,drag=null,scheduled=null,disposed=false,boxes={},view={width:0,height:0,left:0,top:0},storageError=false,previewNode=null;
  const componentOriginal=new Map();
  const pointers=new Map();
  try{const raw=storage?.getItem(HUD_LAYOUT_KEY);if(raw)committed=parseHudLayout(raw);}catch{storageError=true;}
  const listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);cleanups.push(()=>node.removeEventListener(type,fn,options));};
  const cleanups=[];
  const group=()=>groups.find(g=>g.id===selected);
  const displayNode=g=>editing&&g.id===selected&&previewNode?previewNode:g.node;
  function updatePreview(){
    preview.replaceChildren();previewNode=null;dialog.removeAttribute('data-preview');
    const g=group();if(!editing||!g)return;
    const rect=g.node.getBoundingClientRect();if(rect.width&&rect.height&&!componentChoice.querySelector('input').checked)return;
    const clone=g.node.cloneNode(true);clone.removeAttribute('hidden');clone.setAttribute('inert','');
    if(clone.tagName==='DIALOG')clone.setAttribute('open','');
    clone.style.pointerEvents='none';clone.style.visibility='visible';clone.style.display='block';clone.style.translate='';clone.style.scale='';
    preview.append(clone);previewNode=clone;dialog.setAttribute('data-preview','');
  }
  function restore(g){const o=original.get(g.id);g.node.style.translate=o.translate;g.node.style.scale=o.scale;g.node.style.transformOrigin=o.origin;}
  function restoreComponents(){for(const [node,style] of componentOriginal){node.style.translate=style.translate;node.style.scale=style.scale;node.style.transformOrigin=style.origin;}componentOriginal.clear();}
  function applyComponent(node,value){if(!node)return;if(!componentOriginal.has(node))componentOriginal.set(node,{translate:node.style.translate||'',scale:node.style.scale||'',origin:node.style.transformOrigin||''});node.style.translate=`${value.x*view.width}px ${value.y*view.height}px`;node.style.scale=String(value.scale);node.style.transformOrigin='50% 50%';}
  function draw(){
    if(disposed)return;
    const viewport=root.getBoundingClientRect();if(!viewport.width||!viewport.height)return;
    view={width:viewport.width,height:viewport.height,left:viewport.left,top:viewport.top};
    // Restore all authored transforms before measuring. No per-frame work.
    restoreComponents();for(const g of groups)restore(g);
    boxes={};
    if(previewNode){previewNode.style.translate='';previewNode.style.scale='';}
    for(const g of groups){const r=displayNode(g).getBoundingClientRect();boxes[g.id]={x:r.left-view.left,y:r.top-view.top,width:r.width,height:r.height};}
    const items=draft??committed;
    const baseScale=responsiveHudScale(view);
    for(const g of groups){const value=resolveHudBox(g,items[g.id],boxes[g.id],view,responsiveGroups.has(g.id)?baseScale:1);for(const node of new Set([g.node,displayNode(g)])){if(value.x||value.y||value.scale!==1){node.style.translate=`${value.x*view.width}px ${value.y*view.height}px`;node.style.scale=String(value.scale);node.style.transformOrigin='50% 50%';}node.toggleAttribute('data-hud-selected',editing&&g.id===selected);}}
    previewNode?.querySelectorAll('[data-hud-component-selected]').forEach(node=>node.removeAttribute('data-hud-component-selected'));
    for(const [key,value] of Object.entries(items)){const parts=componentParts(key);if(!parts)continue;const owner=groups.find(g=>g.id===parts.group);if(!owner)continue;applyComponent(componentNode(owner.node,parts),value);if(previewNode&&owner.id===selected){const node=componentNode(previewNode,parts);applyComponent(node,value);if(editing&&key===selectedComponent)node?.setAttribute('data-hud-component-selected','');}}
    if(editing)controls();
  }
  function schedule(){if(disposed||scheduled!==null)return;scheduled=win.requestAnimationFrame(()=>{scheduled=null;draw();});}
  function controls(){
    const g=group();if(!g)return;
    select.value=selected;find('#hud-layout-current').textContent=g.label;find('#hud-layout-note').textContent=selectedComponent?'선택한 창 내부 요소를 조절합니다.':'위치는 화면 비율로 저장됩니다. 겹치지 않게 배치해 주세요.';
    for(const input of dialog.querySelectorAll('[data-hud-field]')){const key=input.dataset.hudField,v=draft[selectedComponent??g.id];input.disabled=g.locked&&key!=='scale';input.min=String(key==='scale'?(selectedComponent ? .6 : g.min)*100:-90);input.max=String(key==='scale'?(selectedComponent?5:g.max)*100:90);input.value=String(Math.round(v[key]*100));find(`[data-hud-output="${key}"]`).textContent=Math.round(v[key]*100)+'%';}
    const chosen=boxes[g.id];if(!chosen?.width||!chosen?.height)status.textContent='현재 숨겨진 항목입니다. 표시될 때 저장한 배치가 적용됩니다.';
  }
  function clearDrag(){drag=null;const ids=[...pointers.keys()];pointers.clear();for(const id of ids){try{dialog.releasePointerCapture(id);}catch{}}}
  function finish(save){
    if(!editing)return;
    clearDrag();if(save){committed=parseHudLayout({version:1,items:draft});try{if(!storage)throw Error();storage.setItem(HUD_LAYOUT_KEY,JSON.stringify({version:1,items:committed}));storageError=false;}catch{storageError=true;}}
    editing=false;draft=null;selectedComponent=null;preview.replaceChildren();previewNode=null;dialog.removeAttribute('data-preview');root.removeAttribute('data-hud-editing');dialog.close();resetInput();draw();onPauseChange();
    (root.querySelector('#motion-speed-toggle')??root.querySelector('#viewport'))?.focus({preventScroll:true});
    onClose(save&&storageError?'배치를 적용했습니다. 저장 공간을 사용할 수 없어 이번 접속에서만 유지됩니다.':save?'HUD 배치를 저장했습니다.':'HUD 편집을 취소했습니다.');
  }
  function open(){
    if(editing||disposed||!getReady())return false;
    resetInput();editing=true;draft=JSON.parse(JSON.stringify(committed));root.setAttribute('data-hud-editing','');
    root.querySelector('#motion-speed-dialog')?.close();dialog.showModal();status.textContent=storageError?'저장 배치를 읽지 못했거나 저장 공간을 사용할 수 없습니다.':'';updatePreview();draw();onPauseChange();dialog.querySelector('[data-hud-command="save"]').focus();return true;
  }
  listen(select,'change',()=>{selected=select.value;selectedComponent=null;status.textContent='';updatePreview();draw();});
  listen(dialog,'input',event=>{const key=event.target.dataset.hudField,g=group();if(!key||!g||g.locked&&key!=='scale')return;draft[selectedComponent??g.id][key]=clamp(Number(event.target.value)/100,key==='scale'?(selectedComponent ? .6 : g.min):-.9,key==='scale'?(selectedComponent?5:g.max):.9);status.textContent='저장 전 미리보기';draw();});
  listen(componentChoice.querySelector('input'),'change',()=>{selectedComponent=null;updatePreview();draw();});
  listen(dialog,'click',event=>{const command=event.target.closest('[data-hud-command]')?.dataset.hudCommand;if(command==='reset'&&selectedComponent){draft[selectedComponent]={x:0,y:0,scale:1};event.stopImmediatePropagation();draw();}else if(command==='reset-all'||command==='import')selectedComponent=null;});
  listen(dialog,'click',event=>{const command=event.target.closest('[data-hud-command]')?.dataset.hudCommand;if(!command)return;if(command==='cancel'||command==='save'){finish(command==='save');return;}if(command==='reset')draft[selected]=defaultHudLayout()[selected];if(command==='reset-all'){draft=defaultHudLayout();status.textContent='기본 배치로 초기화했습니다. 저장하면 적용됩니다.';}if(command==='export'){find('#hud-layout-json').value=JSON.stringify({version:1,items:draft},null,2);find('#hud-layout-json').focus();find('#hud-layout-json').select();status.textContent='배치 데이터를 복사해 보관하세요.';}if(command==='download'){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,items:draft},null,2)+'\n'],{type:'application/json'})),link=doc.createElement('a');link.href=url;link.download='moonforest-hud-layout.json';link.hidden=true;doc.body.append(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}status.textContent='배치 파일 다운로드를 요청했습니다.';}if(command==='open-file')fileInput.click();if(command==='import'){try{draft=parseHudLayout(find('#hud-layout-json').value);status.textContent='배치를 불러왔습니다. 저장하면 적용됩니다.';}catch(error){status.textContent=error.message;}}draw();});
  listen(fileInput,'change',async()=>{const file=fileInput.files?.[0];if(!file)return;try{if(file.size>65536)throw Error('배치 파일이 너무 큽니다.');const value=parseHudLayout(await file.text());if(!editing||disposed)return;selectedComponent=null;draft=value;status.textContent='배치를 불러왔습니다. 저장하면 적용됩니다.';draw();}catch(error){if(editing&&!disposed)status.textContent=error.message;}finally{fileInput.value='';}});
  listen(dialog,'cancel',event=>{event.preventDefault();finish(false);});
  listen(dialog,'close',()=>{if(editing)finish(false);});
  listen(dialog,'pointerdown',event=>{
    if(event.target.closest('.hud-layout-panel')||event.button!==undefined&&event.button!==0||pointers.size>=2)return;
    const point={x:event.clientX,y:event.clientY};
    if(pointers.size===1&&event.pointerType==='touch'){
      event.preventDefault();pointers.set(event.pointerId,point);const [a,b]=[...pointers.values()];drag={mode:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),start:{...draft[selectedComponent??selected]}};dialog.setPointerCapture?.(event.pointerId);return;
    }
    if(pointers.size)return;
    const contains=node=>{const r=node.getBoundingClientRect(),margin=event.pointerType==='touch'?0:10;return r.width&&r.height&&point.x>=r.left-margin&&point.x<=r.right+margin&&point.y>=r.top-margin&&point.y<=r.bottom+margin;};
    const hit=previewNode&&contains(previewNode)?group():[...groups].reverse().find(g=>contains(displayNode(g)));
    if(!hit)return;event.preventDefault();if(selected!==hit.id){selected=hit.id;selectedComponent=null;updatePreview();}
    let target=displayNode(hit);selectedComponent=null;if(previewNode&&target===previewNode&&componentChoice.querySelector('input').checked){const nodes=[...previewNode.querySelectorAll('*')].filter(node=>!['svg','path','option','script','style'].includes(node.tagName.toLowerCase()));const child=nodes.reverse().find(contains);if(child){const id=componentId(hit,previewNode,child);if(id){selectedComponent=id;draft[id]??={x:0,y:0,scale:1};target=child;}}}
    draw();const rect=target.getBoundingClientRect(),nearX=Math.min(Math.abs(point.x-rect.left),Math.abs(point.x-rect.right))<=12,nearY=Math.min(Math.abs(point.y-rect.top),Math.abs(point.y-rect.bottom))<=12;
    pointers.set(event.pointerId,point);const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;drag={mode:event.pointerType!=='touch'&&(nearX||nearY)?'resize':'move',id:event.pointerId,x:point.x,y:point.y,cx,cy,distance:Math.max(1,Math.hypot(point.x-cx,point.y-cy)),start:{...draft[selectedComponent??hit.id]}};dialog.setPointerCapture?.(event.pointerId);
  });
  listen(dialog,'pointermove',event=>{
    if(!drag||!pointers.has(event.pointerId)){
      if(event.pointerType==='mouse'&&!event.target.closest('.hud-layout-panel')){const item=[...groups].reverse().find(g=>{const r=displayNode(g).getBoundingClientRect();return r.width&&r.height&&event.clientX>=r.left-10&&event.clientX<=r.right+10&&event.clientY>=r.top-10&&event.clientY<=r.bottom+10;});if(!item){dialog.style.cursor='';return;}let hover=displayNode(item);if(hover===previewNode&&componentChoice.querySelector('input').checked){const children=[...previewNode.querySelectorAll('*')].filter(node=>!['svg','path','option','script','style'].includes(node.tagName.toLowerCase()));hover=children.reverse().find(node=>{const b=node.getBoundingClientRect();return b.width&&b.height&&event.clientX>=b.left-10&&event.clientX<=b.right+10&&event.clientY>=b.top-10&&event.clientY<=b.bottom+10;})??hover;}const r=hover.getBoundingClientRect(),x=Math.abs(event.clientX-r.left)<=12?-1:Math.abs(event.clientX-r.right)<=12?1:0,y=Math.abs(event.clientY-r.top)<=12?-1:Math.abs(event.clientY-r.bottom)<=12?1:0;dialog.style.cursor=x&&y?(x===y?'nwse-resize':'nesw-resize'):x?'ew-resize':y?'ns-resize':'move';}return;
    }event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const g=group();
    const target=draft[selectedComponent??g.id],min=selectedComponent ? .6 : g.min,max=selectedComponent?5:g.max;
    if(drag.mode==='pinch'&&pointers.size===2){const [a,b]=[...pointers.values()];target.scale=clamp(drag.start.scale*Math.hypot(a.x-b.x,a.y-b.y)/drag.distance,min,max);}
    else if(drag.mode==='resize')target.scale=clamp(drag.start.scale*Math.hypot(event.clientX-drag.cx,event.clientY-drag.cy)/drag.distance,min,max);
    else if(drag.mode==='move'){target.x=clamp(drag.start.x+(event.clientX-drag.x)/view.width,-.9,.9);target.y=clamp(drag.start.y+(event.clientY-drag.y)/view.height,-.9,.9);}
    draw();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(dialog,name,event=>{if(pointers.has(event.pointerId))clearDrag();});
  listen(win,'blur',clearDrag);listen(doc,'visibilitychange',()=>{if(doc.hidden)clearDrag();});
  listen(dialog,'keydown',event=>{if(event.target.closest('input,textarea,select,button,summary'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const g=group();if(g.locked)return;const step=event.shiftKey?10:1,v=draft[selectedComponent??g.id];if(event.key.includes('Left')||event.key.includes('Right'))v.x=clamp(v.x+(event.key==='ArrowLeft'?-step:step)/view.width,-.9,.9);else v.y=clamp(v.y+(event.key==='ArrowUp'?-step:step)/view.height,-.9,.9);draw();}});
  const entry=doc.createElement('button');entry.type='button';entry.id='open-hud-layout';entry.textContent='HUD 위치 · 크기';entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls',dialog.id);entry.className='motion-speed-toggle';
  const host=root.querySelector('#camera-follow-options')?.parentElement??root.querySelector('.settings-sections');host?.append(entry);listen(entry,'click',open);
  const observer=win.ResizeObserver?new win.ResizeObserver(schedule):null;observer?.observe(root);for(const g of groups)observer?.observe(g.node);const mutations=win.MutationObserver?new win.MutationObserver(schedule):null;for(const g of groups)if(g.node.tagName==='DIALOG')mutations?.observe(g.node,{childList:true,subtree:true});listen(win,'resize',schedule);draw();
  return {open,isOpen:()=>editing,close:()=>finish(false),refresh:schedule,inspect:()=>({version:1,items:JSON.parse(JSON.stringify(committed)),editing,storageAvailable:!storageError}),dispose(){if(disposed)return;finish(false);disposed=true;if(scheduled!==null)win.cancelAnimationFrame(scheduled);observer?.disconnect();mutations?.disconnect();for(const stop of cleanups)stop();restoreComponents();for(const g of groups){restore(g);g.node.removeAttribute('data-hud-selected');}dialog.remove();entry.remove();}};
}
