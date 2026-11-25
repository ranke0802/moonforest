import {t} from './i18n.js';

// The toolbar can be zoomed and its buttons individually moved in HUD settings.
// Place a single tooltip in viewport coordinates, outside those transforms.
export function setupHudTooltips(root){
 const doc=root?.ownerDocument,win=doc?.defaultView,bar=root?.querySelector('.top-actions');
 if(!bar||!win)return {dispose(){}};
 const tip=doc.createElement('div');
 tip.id='v03-hud-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;root.append(tip);
 const selector='[data-top-action],#help-toggle';
 let active=null,hovered=null,focused=null,keyboard=true,nativeTitle=null;
 const control=node=>node?.closest?.(selector)??null;
 function hide(){
  if(active){
   observer?.disconnect();
   const ids=(active.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==tip.id);
   if(ids.length)active.setAttribute('aria-describedby',ids.join(' '));else active.removeAttribute('aria-describedby');
   if(nativeTitle!==null&&!active.hasAttribute('title'))active.title=nativeTitle;
  }
  nativeTitle=null;active=null;tip.hidden=true;
 }
 function position(){
  const rect=active.getBoundingClientRect(),box=tip.getBoundingClientRect();
  const left=Math.max(8,Math.min(rect.left+(rect.width-box.width)/2,win.innerWidth-box.width-8));
  const top=rect.bottom+box.height+8<=win.innerHeight?rect.bottom:Math.max(8,rect.top-box.height);
  tip.style.left=left+'px';tip.style.top=top+'px';
 }
 function update(){
  if(!active||active.hidden||!active.isConnected||!bar.contains(active)){clear();return;}
  const kind=active.dataset.topAction??'help';
  const key=kind==='fullscreen'&&active.getAttribute('aria-pressed')==='true'?'exitFullscreen':kind;
  const text=kind==='riding'?active.getAttribute('aria-label')+' (H)':t('hud.tip.'+key);
  if(tip.textContent!==text)tip.textContent=text;
  if(active.hasAttribute('title')){nativeTitle=active.title;active.removeAttribute('title');}
  tip.hidden=false;position();
 }
 const observer=win.MutationObserver?new win.MutationObserver(update):null;
 function show(){
  const next=hovered??focused;if(next===active)return;
  hide();if(!next||next.hidden||!bar.contains(next))return;
  active=next;const ids=active.getAttribute('aria-describedby');
  active.setAttribute('aria-describedby',ids?ids+' '+tip.id:tip.id);
  update();
  if(active){
   observer?.observe(active,{attributes:true,attributeFilter:['aria-label','aria-pressed','hidden','title']});
   observer?.observe(bar,{childList:true});
  }
 }
 function clear(){hovered=null;focused=null;hide();}
 function over(e){if(e.pointerType!=='mouse')return;hovered=control(e.target);show();}
 function out(e){if(e.pointerType!=='mouse'||tip.contains(e.relatedTarget))return;hovered=control(e.relatedTarget);show();}
 function focus(e){if(keyboard){hovered=null;focused=control(e.target);show();}}
 function blur(){focused=null;show();}
 function press(){keyboard=false;clear();}
 function key(e){keyboard=true;if(e.key==='Escape')clear();}
 const listeners=[
  [bar,'pointerover',over],[bar,'pointerout',out],[tip,'pointerout',out],
  [bar,'focusin',focus],[bar,'focusout',blur],[doc,'pointerdown',press,true],[doc,'keydown',key,true],
  [bar,'click',clear],[win,'blur',clear],[win,'resize',clear],
 ];
 for(const [node,event,fn,capture] of listeners)node.addEventListener(event,fn,capture);
 return {dispose(){clear();for(const [node,event,fn,capture] of listeners)node.removeEventListener(event,fn,capture);tip.remove();}};
}
