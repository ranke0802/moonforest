// User offsets are relative to the viewport, never to a map or camera.
export const HUD_LAYOUT_KEY='moonforest-game-hud-layout-v1';
export const HUD_GROUPS=Object.freeze([
  ['health','#player-hud','체력 · 스태미나',false,.85,1.4],
  ['gold','#gold-balance','골드',false,.85,1.4],
  ['quest','.chapter-stack, .uit-track','의뢰 · 이야기',false,.85,1.4],
  ['tools','.top-actions','상단 도구',false,1,1.25],
  ['map','#dot-minimap','미니맵',false,.85,1.4],
  ['diagnostics','#frame-diagnostics','성능 진단',false,1,1.4],
  ['shield','#guard-button','방패 밀치기',true,.85,1.25],
  ['potion','#potion-button','물약',true,.85,1.25],
  ['dodge','#dodge-button','회피',true,.85,1.25],
  ['attack','#attack-button','검 공격',true,.85,1.25],
].map(([id,selector,label,locked,min,max])=>Object.freeze({id,selector,label,locked,min,max})));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const defaultHudLayout=()=>Object.fromEntries(HUD_GROUPS.map(({id})=>[id,{x:0,y:0,scale:1}]));
export function parseHudLayout(raw){
  const value=typeof raw==='string'?JSON.parse(raw):raw;
  if(value?.version!==1||!value.items||Array.isArray(value.items)||Object.keys(value.items).length!==HUD_GROUPS.length)throw Error('올바른 HUD 배치 파일이 아닙니다.');
  const result={};
  for(const g of HUD_GROUPS){
    const v=value.items[g.id];
    if(!Object.hasOwn(value.items,g.id)||!v||Object.keys(v).length!==3||!['x','y','scale'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||Math.abs(v.x)>1||Math.abs(v.y)>1||v.scale<g.min||v.scale>g.max)throw Error('HUD 위치 또는 크기 범위를 확인해 주세요.');
    result[g.id]={x:g.locked?0:v.x,y:g.locked?0:v.y,scale:v.scale};
  }
  return result;
}
export function resolveHudBox(group,value,box,viewport){
  if(!box?.width||!box?.height)return {x:0,y:0,scale:1};
  if(value.x===0&&value.y===0&&value.scale===1)return {...value};
  const edge=8,halfW=viewport.width/2,halfH=viewport.height/2;
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const cap=group.locked?Math.min((cx-edge)*2/box.width,(viewport.width-edge-cx)*2/box.width,(cy-edge)*2/box.height,(viewport.height-edge-cy)*2/box.height):Math.min((viewport.width-2*edge)/box.width,(viewport.height-2*edge)/box.height);
  const minimum=group.locked?Math.max(group.min,44/Math.min(box.width,box.height)):group.min;
  const scale=Math.max(.1,Math.min(cap,clamp(value.scale,minimum,group.max)));
  return {x:group.locked?0:clamp(value.x,(edge+box.width*scale/2-cx)/(halfW*2),(viewport.width-edge-box.width*scale/2-cx)/(halfW*2)),y:group.locked?0:clamp(value.y,(edge+box.height*scale/2-cy)/(halfH*2),(viewport.height-edge-box.height*scale/2-cy)/(halfH*2)),scale};
}

export function setupHudLayout({root,storage,getReady=()=>true,resetInput=()=>{},onPauseChange=()=>{},onClose=()=>{}}){
  const doc=root.ownerDocument,win=doc.defaultView,groups=HUD_GROUPS.map(g=>({...g,node:root.querySelector(g.selector)})).filter(g=>g.node);
  const original=new Map(groups.map(g=>[g.id,{translate:g.node.style.translate||'',scale:g.node.style.scale||'',origin:g.node.style.transformOrigin||''}]));
  const dialog=doc.createElement('dialog');dialog.id='hud-layout-dialog';dialog.dataset.ui='';dialog.setAttribute('aria-label','HUD 위치와 크기 편집');
  dialog.innerHTML=`<section class="hud-layout-panel"><header><div><small>화면 배치</small><h2>나만의 HUD</h2></div><button type="button" data-hud-command="cancel" aria-label="편집 취소">닫기 ×</button></header><p>게임은 일시정지됩니다. 항목을 고른 뒤 드래그하거나 값을 조절하세요.</p><label>편집할 항목<select id="hud-layout-selection">${groups.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select></label><p id="hud-layout-note"></p><div class="hud-layout-fields">${[['x','가로 위치'],['y','세로 위치'],['scale','크기']].map(([key,label])=>`<label>${label}<input type="range" data-hud-field="${key}" aria-label="${label}" step="1"><output data-hud-output="${key}"></output></label>`).join('')}</div><div class="hud-layout-actions"><button type="button" data-hud-command="reset">선택 초기화</button><button type="button" data-hud-command="reset-all">전체 초기화</button></div><details><summary>배치 내보내기 · 가져오기</summary><textarea id="hud-layout-json" aria-label="HUD 배치 데이터" spellcheck="false"></textarea><div class="hud-layout-actions"><button type="button" data-hud-command="export">내보내기</button><button type="button" data-hud-command="import">가져오기</button></div></details><p id="hud-layout-status" role="status" aria-live="polite"></p><footer><button type="button" data-hud-command="cancel">취소</button><button type="button" data-hud-command="save">저장하고 닫기</button></footer></section>`;
  root.append(dialog);
  const find=s=>dialog.querySelector(s),select=find('#hud-layout-selection'),status=find('#hud-layout-status');
  let committed=defaultHudLayout(),draft=null,editing=false,selected=groups[0]?.id,drag=null,scheduled=null,disposed=false,boxes={},view={width:0,height:0,left:0,top:0},storageError=false;
  try{const raw=storage?.getItem(HUD_LAYOUT_KEY);if(raw)committed=parseHudLayout(raw);}catch{storageError=true;}
  const listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);cleanups.push(()=>node.removeEventListener(type,fn,options));};
  const cleanups=[];
  const group=()=>groups.find(g=>g.id===selected);
  function restore(g){const o=original.get(g.id);g.node.style.translate=o.translate;g.node.style.scale=o.scale;g.node.style.transformOrigin=o.origin;}
  function draw(){
    if(disposed)return;
    const viewport=root.getBoundingClientRect();if(!viewport.width||!viewport.height)return;
    view={width:viewport.width,height:viewport.height,left:viewport.left,top:viewport.top};
    // Restore all authored transforms before measuring. No per-frame work.
    for(const g of groups)restore(g);
    boxes={};
    for(const g of groups){const r=g.node.getBoundingClientRect();boxes[g.id]={x:r.left-view.left,y:r.top-view.top,width:r.width,height:r.height};}
    const items=draft??committed;
    for(const g of groups){const value=resolveHudBox(g,items[g.id],boxes[g.id],view);if(value.x||value.y||value.scale!==1){g.node.style.translate=`${value.x*view.width}px ${value.y*view.height}px`;g.node.style.scale=String(value.scale);g.node.style.transformOrigin='50% 50%';}g.node.toggleAttribute('data-hud-selected',editing&&g.id===selected);}
    if(editing)controls();
  }
  function schedule(){if(disposed||scheduled!==null)return;scheduled=win.requestAnimationFrame(()=>{scheduled=null;draw();});}
  function controls(){
    const g=group();if(!g)return;
    select.value=selected;find('#hud-layout-note').textContent=g.locked?'전투 버튼의 중심 위치는 고정됩니다. 크기만 조절합니다.':'위치는 화면 비율로 저장됩니다. 겹치지 않게 배치해 주세요.';
    for(const input of dialog.querySelectorAll('[data-hud-field]')){const key=input.dataset.hudField;input.disabled=g.locked&&key!=='scale';input.min=String(key==='scale'?g.min*100:-90);input.max=String(key==='scale'?g.max*100:90);input.value=String(Math.round(draft[g.id][key]*100));find(`[data-hud-output="${key}"]`).textContent=Math.round(draft[g.id][key]*100)+'%';}
    const chosen=boxes[g.id];if(!chosen?.width||!chosen?.height)status.textContent='현재 숨겨진 항목입니다. 표시될 때 저장한 배치가 적용됩니다.';
  }
  function clearDrag(){const previous=drag;drag=null;if(previous){try{dialog.releasePointerCapture(previous.id);}catch{}}}
  function finish(save){
    if(!editing)return;
    clearDrag();if(save){committed=parseHudLayout({version:1,items:draft});try{if(!storage)throw Error();storage.setItem(HUD_LAYOUT_KEY,JSON.stringify({version:1,items:committed}));storageError=false;}catch{storageError=true;}}
    editing=false;draft=null;root.removeAttribute('data-hud-editing');dialog.close();resetInput();draw();onPauseChange();
    (root.querySelector('#motion-speed-toggle')??root.querySelector('#viewport'))?.focus({preventScroll:true});
    onClose(save&&storageError?'배치를 적용했습니다. 저장 공간을 사용할 수 없어 이번 접속에서만 유지됩니다.':save?'HUD 배치를 저장했습니다.':'HUD 편집을 취소했습니다.');
  }
  function open(){
    if(editing||disposed||!getReady())return false;
    resetInput();editing=true;draft=JSON.parse(JSON.stringify(committed));root.setAttribute('data-hud-editing','');
    root.querySelector('#motion-speed-dialog')?.close();dialog.showModal();status.textContent=storageError?'저장 배치를 읽지 못했거나 저장 공간을 사용할 수 없습니다.':'';draw();onPauseChange();select.focus();return true;
  }
  listen(select,'change',()=>{selected=select.value;status.textContent='';draw();});
  listen(dialog,'input',event=>{const key=event.target.dataset.hudField,g=group();if(!key||!g||g.locked&&key!=='scale')return;draft[g.id][key]=clamp(Number(event.target.value)/100,key==='scale'?g.min:-.9,key==='scale'?g.max:.9);status.textContent='저장 전 미리보기';draw();});
  listen(dialog,'click',event=>{const command=event.target.closest('[data-hud-command]')?.dataset.hudCommand;if(!command)return;if(command==='cancel'||command==='save'){finish(command==='save');return;}if(command==='reset')draft[selected]={x:0,y:0,scale:1};if(command==='reset-all')draft=defaultHudLayout();if(command==='export'){find('#hud-layout-json').value=JSON.stringify({version:1,items:draft},null,2);find('#hud-layout-json').focus();find('#hud-layout-json').select();status.textContent='배치 데이터를 복사해 보관하세요.';}if(command==='import'){try{draft=parseHudLayout(find('#hud-layout-json').value);status.textContent='배치를 불러왔습니다. 저장하면 적용됩니다.';}catch(error){status.textContent=error.message;}}draw();});
  listen(dialog,'cancel',event=>{event.preventDefault();finish(false);});
  listen(dialog,'close',()=>{if(editing)finish(false);});
  listen(dialog,'pointerdown',event=>{
    if(drag||event.target.closest('.hud-layout-panel')||event.button!==undefined&&event.button!==0)return;
    event.preventDefault();const x=event.clientX-view.left,y=event.clientY-view.top;
    // Top layer receives the gesture; the original attack listeners never do.
    const hit=[...groups].reverse().find(g=>{const r=g.node.getBoundingClientRect();return r.width&&r.height&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});
    if(!hit)return;selected=hit.id;draw();if(hit.locked)return;
    drag={id:event.pointerId,x,y,start:{...draft[hit.id]}};dialog.setPointerCapture?.(event.pointerId);
  });
  listen(dialog,'pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();const g=group();draft[g.id].x=clamp(drag.start.x+(event.clientX-view.left-drag.x)/view.width,-.9,.9);draft[g.id].y=clamp(drag.start.y+(event.clientY-view.top-drag.y)/view.height,-.9,.9);draw();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(dialog,name,event=>{if(event.pointerId===drag?.id)clearDrag();});
  listen(win,'blur',clearDrag);listen(doc,'visibilitychange',()=>{if(doc.hidden)clearDrag();});
  listen(dialog,'keydown',event=>{if(event.target.closest('input,textarea,select,button,summary'))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const g=group();if(g.locked)return;const step=event.shiftKey?10:1;if(event.key.includes('Left')||event.key.includes('Right'))draft[g.id].x=clamp(draft[g.id].x+(event.key==='ArrowLeft'?-step:step)/view.width,-.9,.9);else draft[g.id].y=clamp(draft[g.id].y+(event.key==='ArrowUp'?-step:step)/view.height,-.9,.9);draw();}});
  const entry=doc.createElement('button');entry.type='button';entry.id='open-hud-layout';entry.textContent='HUD 위치 · 크기';entry.setAttribute('aria-haspopup','dialog');entry.setAttribute('aria-controls',dialog.id);entry.className='motion-speed-toggle';
  const host=root.querySelector('#camera-follow-options')?.parentElement??root.querySelector('.settings-sections');host?.append(entry);listen(entry,'click',open);
  const observer=win.ResizeObserver?new win.ResizeObserver(schedule):null;observer?.observe(root);for(const g of groups)observer?.observe(g.node);listen(win,'resize',schedule);draw();
  return {open,isOpen:()=>editing,close:()=>finish(false),refresh:schedule,inspect:()=>({version:1,items:JSON.parse(JSON.stringify(committed)),editing,storageAvailable:!storageError}),dispose(){if(disposed)return;finish(false);disposed=true;if(scheduled!==null)win.cancelAnimationFrame(scheduled);observer?.disconnect();for(const stop of cleanups)stop();for(const g of groups){restore(g);g.node.removeAttribute('data-hud-selected');}dialog.remove();entry.remove();}};
}
