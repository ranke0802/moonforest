// Display ownership only: never replace the preview iframe, send scene commands,
// change render settings, or edit the authored cinematic document.
const STORAGE_KEY='moonforest-0.1:studio-display:v1';
const HISTORY_KEY='moonforestStudioPreview';
const panels=new Set(['library','inspector','timeline']);
const modes=new Set(['auto','mobile','desktop']);
const mounted=new WeakMap(),fullscreenOwners=new WeakMap(),orientationOwners=new WeakMap(),historyReturns=new WeakMap();
let serial=0;

// requestFullscreen must run in the original user gesture. Its Promise and
// fullscreenchange are separate lifecycle boundaries. Orientation locking can
// reject even after successful fullscreen, so CSS viewing remains available.
// https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
// https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
// https://fullscreen.spec.whatwg.org/
export function mountCinematicStudioDisplay(root,{window:win=root.ownerDocument.defaultView,storage}={}){
 if(mounted.has(root))return mounted.get(root);
 const doc=root.ownerDocument,off=[];
 let disposed=false,session=null,manualPanel=false,preference='auto',frameEscapeOff=null;
 const heightStyle={previous:root.style.getPropertyValue('--studio-viewport-height'),priority:typeof root.style.getPropertyPriority==='function'?root.style.getPropertyPriority('--studio-viewport-height'):'',owned:null};
 try{storage??=win?.localStorage;}catch{storage=null;}
 try{const saved=storage?.getItem(STORAGE_KEY);if(modes.has(saved))preference=saved;}catch{}
 const listen=(target,type,handler,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler,options);off.push(()=>target.removeEventListener(type,handler,options));};
 const media=query=>{try{return win?.matchMedia?.(query)??null;}catch{return null;}};
 const coarse=media('(any-pointer: coarse)'),narrow=media('(max-width: 760px)');
 const viewport=()=>({width:positive(win?.visualViewport?.width,positive(win?.innerWidth,positive(doc.documentElement?.clientWidth,800))),height:positive(win?.visualViewport?.height,positive(win?.innerHeight,positive(doc.documentElement?.clientHeight,600)))});
 const fullscreenElement=()=>doc.fullscreenElement??doc.webkitFullscreenElement??null;
 const connected=target=>root.isConnected!==false&&target?.isConnected!==false&&root.contains(target);
 const owns=op=>!disposed&&session===op&&!op.closed&&connected(op.target);
 function automaticMode(){
  const nav=win?.navigator??{},width=positive(win?.innerWidth,viewport().width),touchMac=nav.maxTouchPoints>1&&/MacIntel|Macintosh|iPad/i.test((nav.platform??'')+' '+(nav.userAgent??'')),mobile=nav.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod|Mobile|IEMobile/i.test(nav.userAgent??'')||touchMac;
  return mobile||(coarse?.matches===true&&width<=1024)||width<=760||(!win?.innerWidth&&narrow?.matches)?'mobile':'desktop';
 }
 function syncMode(){
  if(disposed)return;const previous=root.dataset.studioMode,resolved=preference==='auto'?automaticMode():preference;
  heightStyle.owned=viewport().height+'px';root.style.setProperty('--studio-viewport-height',heightStyle.owned);
  root.dataset.studioMode=resolved;
  for(const button of root.querySelectorAll('button[data-studio-mode-switch]'))button.setAttribute('aria-pressed',String(button.dataset.studioModeSwitch===resolved));
  const menu=root.querySelector('.studio-file-menu');if(menu){if(resolved==='desktop')menu.open=true;else if(previous!==resolved)menu.open=false;}
 }
 function setMode(mode){
  if(disposed||!modes.has(mode))return false;preference=mode;
  try{storage?.setItem(STORAGE_KEY,mode);}catch{}
  syncMode();return root.dataset.studioMode;
 }
 function selectPanel(panel,{automatic=false}={}){
  if(disposed||!panels.has(panel)||automatic&&manualPanel)return false;
  if(!automatic)manualPanel=true;root.dataset.mobilePanel=panel;
  for(const button of root.querySelectorAll('button[data-mobile-panel]')){const selected=button.dataset.mobilePanel===panel;button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-pressed',String(selected));}
  return true;
 }
 function syncFullscreen(){
  const active=!!session&&!session.closed;
  root.dataset.previewFullscreen=String(active);
  const size=viewport();
  if(active){root.style.setProperty('--preview-fullscreen-width',size.width+'px');root.style.setProperty('--preview-fullscreen-height',size.height+'px');}
  const rotated=active&&size.height>size.width&&!session.orientationLocked;
  root.dataset.previewRotated=String(rotated);
  if(active){if(rotated&&session.stage){session.stage.setAttribute('inert','');session.inertOwned=true;}else restoreInert(session);}
  for(const button of root.querySelectorAll('button[data-preview-fullscreen]')){
   button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'미리보기 전체화면 닫기':'미리보기 가로 전체화면');button.setAttribute('title',active?'전체화면 닫기':'가로 전체화면');
   const label=button.querySelector('[data-fullscreen-label]');if(label)label.textContent=active?'닫기':'전체화면';
  }
 }
 function saveStyle(op,element,property,value){
  if(!element?.style)return;
  op.styles.push({element,property,value,previous:element.style.getPropertyValue(property),priority:typeof element.style.getPropertyPriority==='function'?element.style.getPropertyPriority(property):''});
  element.style.setProperty(property,value);
 }
 function unlock(op){
  const orientation=win?.screen?.orientation;
  if(!op.orientationAttempted||!orientation||orientationOwners.get(orientation)!==op)return;
  orientationOwners.delete(orientation);try{orientation.unlock?.();}catch{}
 }
 function restoreInert(op){
  if(!op.inertOwned||!op.stage)return;op.inertOwned=false;
  if(op.stage.getAttribute('inert')!=='')return;
  if(op.inertBefore===null)op.stage.removeAttribute('inert');else op.stage.setAttribute('inert',op.inertBefore);
 }
 function nativeExit(op){
  if(fullscreenElement()!==op.target)return;
  const owner=fullscreenOwners.get(doc);if(owner&&owner!==op)return;
  const exit=doc.exitFullscreen??doc.webkitExitFullscreen??doc.webkitCancelFullScreen;
  try{Promise.resolve(exit?.call(doc)).catch(()=>{});}catch{}
 }
 function lateNative(op){
  // An older request can settle after Close/Destroy. Do not exit a newer
  // controller's fullscreen or unlock a newer orientation owner.
  if(!owns(op)){if(session===op&&!disposed)close({restoreFocus:false});nativeExit(op);return false;}
  if(fullscreenElement()!==op.target)return true;
  op.nativeEntered=true;
  const orientation=win?.screen?.orientation;
  if(!op.orientationAttempted&&typeof orientation?.lock==='function'){
   op.orientationAttempted=true;orientationOwners.set(orientation,op);
   try{
    Promise.resolve(orientation.lock('landscape')).then(()=>{
     if(session===op&&!connected(op.target))close({restoreFocus:false});
     if(owns(op)&&orientationOwners.get(orientation)===op){op.orientationLocked=true;syncFullscreen();}
     else if(orientationOwners.get(orientation)===op||!orientationOwners.has(orientation)){try{orientation.unlock?.();}catch{}if(orientationOwners.get(orientation)===op)orientationOwners.delete(orientation);}
    },()=>{if(orientationOwners.get(orientation)===op)orientationOwners.delete(orientation);if(owns(op)){op.orientationLocked=false;syncFullscreen();}});
   }catch{if(orientationOwners.get(orientation)===op)orientationOwners.delete(orientation);op.orientationLocked=false;}
  }
  syncFullscreen();return true;
 }
 function pushHistory(op){
  const history=win?.history;if(typeof history?.pushState!=='function')return;
  try{
   op.historyState=history.state;const state=op.historyState&&typeof op.historyState==='object'&&!Array.isArray(op.historyState)?{...op.historyState}:{};
   history.pushState({...state,[HISTORY_KEY]:op.id},'');op.historyOwned=true;
  }catch{}
 }
 function dropHistory(op,traverse){
  if(!op.historyOwned)return;op.historyOwned=false;const history=win?.history;
  if(history?.state?.[HISTORY_KEY]!==op.id)return;
  try{
   if(traverse&&typeof history.back==='function'){historyReturns.set(doc,op.id);history.back();}
   else history.replaceState?.(op.historyState,'');
  }catch{if(historyReturns.get(doc)===op.id)historyReturns.delete(doc);}
 }
 function close({fromHistory=false,traverseHistory=true,restoreFocus=true}={}){
  const op=session;if(!op)return false;session=null;op.closed=true;
  restoreInert(op);unlock(op);nativeExit(op);if(fullscreenOwners.get(doc)===op)fullscreenOwners.delete(doc);
  for(const value of op.styles){if(value.element.style.getPropertyValue(value.property)!==value.value)continue;if(value.previous)value.element.style.setProperty(value.property,value.previous,value.priority);else value.element.style.removeProperty(value.property);}
  root.style.removeProperty('--preview-fullscreen-width');root.style.removeProperty('--preview-fullscreen-height');syncFullscreen();
  if(fromHistory)op.historyOwned=false;else dropHistory(op,traverseHistory);
  if(restoreFocus&&op.focus?.isConnected!==false){try{op.focus?.focus?.({preventScroll:true});}catch{}}
  try{win?.scrollTo?.(op.scrollX,op.scrollY);}catch{}
  return true;
 }
 function enterFullscreen(){
  const returning=historyReturns.get(doc);
  if(returning&&win?.history?.state?.[HISTORY_KEY]!==returning)historyReturns.delete(doc);
  if(disposed||historyReturns.has(doc))return Promise.resolve(false);
  if(session)return Promise.resolve(true);
  const target=root.querySelector('[data-view="preview-workspace"]');
  if(!target||!connected(target)||fullscreenOwners.has(doc)||fullscreenElement())return Promise.resolve(false);
  const stage=target.querySelector('.preview-stage'),op={id:'studio-preview-'+(++serial),target,stage,inertBefore:stage?.getAttribute('inert')??null,inertOwned:false,closed:false,nativeEntered:false,orientationLocked:false,orientationAttempted:false,historyOwned:false,focus:doc.activeElement,scrollX:win?.scrollX??0,scrollY:win?.scrollY??0,styles:[]};
  session=op;fullscreenOwners.set(doc,op);
  saveStyle(op,doc.documentElement,'overflow','hidden');saveStyle(op,doc.body,'overflow','hidden');saveStyle(op,doc.body,'overscroll-behavior','none');
  pushHistory(op);syncFullscreen();
  // Call before any await so pointer/keyboard activation is still live.
  const request=target.requestFullscreen??target.webkitRequestFullscreen??target.webkitRequestFullScreen;
  let requested;
  if(typeof request==='function'){
   try{requested=request===target.requestFullscreen?request.call(target,{navigationUI:'hide'}):request.call(target);}
   catch{requested=null;}
  }
  try{target.querySelector('button[data-preview-fullscreen]')?.focus?.({preventScroll:true});}catch{}
  if(requested&&typeof requested.then==='function')return Promise.resolve(requested).then(()=>lateNative(op),()=>{if(owns(op)){syncFullscreen();return true;}return false;});
  lateNative(op);return Promise.resolve(true);
 }
 const click=event=>{
  const origin=event.target?.closest?event.target:event.target?.parentElement,button=origin?.closest?.('button[data-studio-mode-switch],button[data-mobile-panel],button[data-preview-fullscreen]');
  if(button&&root.contains(button)&&!button.disabled){
   if(button.hasAttribute('data-studio-mode-switch'))setMode(button.dataset.studioModeSwitch);
   else if(button.hasAttribute('data-mobile-panel'))selectPanel(button.dataset.mobilePanel);
   else{event.preventDefault();if(session)close();else void enterFullscreen();}
  }
  if(root.dataset.studioMode==='mobile'&&origin?.closest?.('.studio-file-menu [data-action]')){const menu=root.querySelector('.studio-file-menu');if(menu)menu.open=false;}
 };
 const changedFullscreen=()=>{
  const op=session;if(!op)return;
  const element=fullscreenElement();
  if(element===op.target)lateNative(op);
  else if(element)close({restoreFocus:false});
  else if(op.nativeEntered)close();
 };
 const fullscreenError=()=>{if(session&&!session.nativeEntered)syncFullscreen();};
 const resized=()=>{
  if(disposed)return;if(session&&!connected(session.target)){close({restoreFocus:false});return;}
  const orientation=win?.screen?.orientation;
  if(session&&orientation?.type?.startsWith('portrait'))session.orientationLocked=false;
  syncMode();if(session)syncFullscreen();
 };
 const popstate=()=>{
  const returning=historyReturns.get(doc);if(returning&&win?.history?.state?.[HISTORY_KEY]!==returning)historyReturns.delete(doc);
  if(session?.historyOwned&&win?.history?.state?.[HISTORY_KEY]!==session.id)close({fromHistory:true});
 };
 const keydown=event=>{if(session&&event.key==='Escape'){event.preventDefault();close();}};
 const bindFrameEscape=()=>{
  frameEscapeOff?.();frameEscapeOff=null;
  try{const inner=root.querySelector('[data-view="frame"]')?.contentDocument;if(inner&&inner!==doc){inner.addEventListener('keydown',keydown,true);frameEscapeOff=()=>inner.removeEventListener('keydown',keydown,true);}}catch{}
 };
 const storageChanged=event=>{if(event.key!==STORAGE_KEY)return;preference=modes.has(event.newValue)?event.newValue:'auto';syncMode();};
 listen(root,'click',click);listen(doc,'keydown',keydown);listen(doc,'fullscreenchange',changedFullscreen);listen(doc,'webkitfullscreenchange',changedFullscreen);listen(doc,'fullscreenerror',fullscreenError);listen(doc,'webkitfullscreenerror',fullscreenError);
 listen(root.querySelector('[data-view="frame"]'),'load',bindFrameEscape);bindFrameEscape();off.push(()=>{frameEscapeOff?.();frameEscapeOff=null;});
 listen(win,'resize',resized);listen(win,'orientationchange',resized);listen(win?.visualViewport,'resize',resized);listen(win?.screen?.orientation,'change',resized);listen(win,'popstate',popstate);listen(win,'storage',storageChanged);listen(win,'pagehide',()=>close({traverseHistory:false,restoreFocus:false}));
 for(const query of [coarse,narrow])if(query?.addEventListener)listen(query,'change',resized);else if(query?.addListener){query.addListener(resized);off.push(()=>query.removeListener(resized));}
 syncMode();selectPanel(panels.has(root.dataset.mobilePanel)?root.dataset.mobilePanel:'library',{automatic:true});syncFullscreen();
 const api={setMode,selectPanel,enterFullscreen,exitFullscreen:()=>close(),destroy(){if(disposed)return;close();disposed=true;for(const remove of off.splice(0))remove();if(root.style.getPropertyValue('--studio-viewport-height')===heightStyle.owned){if(heightStyle.previous)root.style.setProperty('--studio-viewport-height',heightStyle.previous,heightStyle.priority);else root.style.removeProperty('--studio-viewport-height');}mounted.delete(root);}};
 mounted.set(root,api);return api;
}
function positive(value,fallback){return Number.isFinite(value)&&value>0?value:fallback;}
