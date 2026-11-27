// The quest panel as pages (2026-11-27, user: "선택의뢰가 다건 수령 가능한데 보이는건
// 마지막에 받은거 하나 밖에 없음"). Page 1 is the main quest, then one page per
// accepted errand in the order it was taken. Over the pages a short count line
// ("선택 의뢰 2", a dot per page, small arrows) shows only while an errand is active.
// Turning: a sideways swipe on the panel (touch), the arrows or [ and ] (PC). The
// mouse wheel is left to the camera zoom.
// Cost: DOM is written only when a page's text, the page list or the page changes;
// the strip moves by transform alone (a drag writes it from its pointer events,
// never from the frame). Layout is read once per drag (the panel's width).
// Reduced motion (accessibility.js sets html[data-mf-motion]) turns pages at once (v03.css).
import {t} from './i18n.js';

export const PAGE_KEYS=Object.freeze({prev:'BracketLeft',next:'BracketRight'});
// A swipe turns the page past this many pixels or this share of the panel's width.
export const SWIPE_PX=36,SWIPE_SHARE=.22;
// Up to this travel a touch is still undecided (sideways turns pages, up/down is ignored).
const SLOP=8;

// "... (2/5)" (quests.js objective()): the count goes in its own span so that the folded
// panel in a fight (v03.css "Combat HUD") cuts the words, never the count. The text the
// node reads stays the same. Called only when the text changed.
const STEP_COUNT=/\s*\(\d+\s*\/\s*\d+\)\s*$/;
export function writeStep(node,text){
 const value=text??'',match=STEP_COUNT.exec(value);
 if(!match){node.textContent=value;return;}
 const doc=node.ownerDocument,words=doc.createElement('span'),count=doc.createElement('span');
 words.className='v03-step-words';count.className='v03-step-count';
 words.textContent=value.slice(0,match.index);count.textContent=value.slice(match.index);node.replaceChildren(words,count);
}

export function createQuestPager({doc,host,mainPage,onPage=()=>{}}){
 const make=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const bar=make('div','v03-quest-pager'),prev=make('button','v03-quest-turn is-prev','‹'),next=make('button','v03-quest-turn is-next','›');
 const count=make('span','v03-quest-count'),dots=make('span','v03-quest-dots');
 prev.type=next.type='button';dots.setAttribute('aria-hidden','true');count.setAttribute('aria-live','polite');
 bar.append(prev,count,dots,next);bar.hidden=true;
 const frame=make('div','v03-quest-pages'),track=make('div','v03-quest-track');
 mainPage.classList.add('v03-quest-page');track.append(mainPage);frame.append(track);
 host.prepend(bar);host.append(frame);
 // id -> {id,node,title,step,titleText,stepText}; list: the errand pages in order.
 const pages=new Map();let list=[],index=0,order='',lastTransform='',lastCount='',lastDots=-1,lastTotal=-1;
 function pageFor(id){
  let page=pages.get(id);if(page)return page;
  const node=make('div','v03-quest-page v03-quest-errand'),kicker=make('small','v03-quest-kicker',t('hud.errand')),title=make('strong','v03-errand-title'),step=make('p','v03-errand-step');
  node.dataset.page=id;node.append(kicker,title,step);
  page={id,node,kicker,title,step,titleText:null,stepText:null};pages.set(id,page);return page;
 }
 function place(dx=0){
  const at=index?-index*100:0,value=dx?`translate3d(${at}%,0,0) translateX(${Math.round(dx)}px)`:`translate3d(${at}%,0,0)`;
  if(value===lastTransform)return;lastTransform=value;track.style.transform=value;
 }
 function paintBar(){
  const total=list.length+1,on=list.length>0;
  bar.hidden=!on;host.classList.toggle('has-pages',on);
  if(!on)return;
  const text=t('hud.errandCount',{n:list.length});if(text!==lastCount){lastCount=text;count.textContent=text;}
  if(total!==lastTotal){lastTotal=total;dots.replaceChildren(...Array.from({length:total},()=>make('i','v03-quest-dot')));lastDots=-1;}
  if(lastDots!==index){
   lastDots=index;let i=0;for(const dot of dots.children)dot.classList.toggle('is-on',i++===index);
   mainPage.setAttribute('aria-hidden',String(index!==0));
   for(const [i,page] of list.entries())page.node.setAttribute('aria-hidden',String(i+1!==index));
   prev.disabled=index===0;next.disabled=index===total-1;
   bar.setAttribute('aria-label',t('hud.questPage',{n:index+1,total}));
  }
 }
 // errands: [{id,title,step}] in accepted order; selected: an errand id or null (main).
 function set(errands,selected=null){
  const rows=errands??[],ids=rows.map(row=>row.id).join('|');
  if(ids!==order){
   order=ids;const keep=new Set(rows.map(row=>row.id));
   for(const [id,page] of pages)if(!keep.has(id)){page.node.remove();pages.delete(id);}
   list=rows.map(row=>pageFor(row.id));
   track.replaceChildren(mainPage,...list.map(page=>page.node));lastDots=-1;
  }
  for(const [i,row] of rows.entries()){
   const page=list[i],stepChanged=page.stepText!==null&&page.stepText!==row.step;
   if(page.titleText!==row.title){page.titleText=row.title;page.title.textContent=row.title??'';}
   if(page.stepText!==row.step){page.stepText=row.step;writeStep(page.step,row.step);}
   if(stepChanged){page.node.classList.remove('is-updated');void page.node.offsetWidth;page.node.classList.add('is-updated');}
  }
  const at=selected?list.findIndex(page=>page.id===selected):-1;index=at+1;
  paintBar();place();
  return index===0?null:list[index-1].id;
 }
 // A turn by the player: the owner hears the page's id (null for main) and stores it.
 function go(step){
  const total=list.length+1,to=Math.max(0,Math.min(total-1,index+step));
  if(to===index){place();return false;}
  index=to;paintBar();place();onPage(index===0?null:list[index-1].id);return true;
 }
 // A new errand: the page stays, the count line lights up for a moment.
 function pulse(){if(bar.hidden)return;count.classList.remove('is-new');void count.offsetWidth;count.classList.add('is-new');}
 const onPrev=event=>{event.preventDefault();go(-1);},onNext=event=>{event.preventDefault();go(1);};
 prev.addEventListener('click',onPrev);next.addEventListener('click',onNext);
 count.addEventListener('animationend',()=>count.classList.remove('is-new'));
 // Touch drag: decided after SLOP pixels; sideways moves the strip with the finger.
 let drag=null;
 const down=event=>{
  if(list.length===0||event.pointerType==='mouse'||drag)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,width:frame.clientWidth||host.clientWidth||240,side:null};
  try{frame.setPointerCapture?.(event.pointerId);}catch{/* the drag still works while over the panel */}
 };
 const move=event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(drag.side===null){if(Math.abs(dx)<SLOP&&Math.abs(dy)<SLOP)return;drag.side=Math.abs(dx)>Math.abs(dy)?'x':'y';if(drag.side==='x')track.classList.add('is-dragging');}
  if(drag.side!=='x')return;
  event.preventDefault?.();
  // Past the first or the last page the strip only gives a little.
  const edge=dx>0&&index===0||dx<0&&index===list.length;
  drag.dx=edge?dx*.3:dx;place(drag.dx);
 };
 const up=event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const {dx,width,side}=drag;drag=null;track.classList.remove('is-dragging');
  try{frame.releasePointerCapture?.(event.pointerId);}catch{/* already released */}
  if(side==='x'&&event.type!=='pointercancel'&&(Math.abs(dx)>=SWIPE_PX||Math.abs(dx)>=width*SWIPE_SHARE)&&go(dx<0?1:-1))return;
  place();
 };
 frame.addEventListener('pointerdown',down);frame.addEventListener('pointermove',move);
 frame.addEventListener('pointerup',up);frame.addEventListener('pointercancel',up);
 // [ and ]: not used by any other control (input.js, story.js E, riding H, the menus I/C/U).
 const key=event=>{
  if(event.code!==PAGE_KEYS.prev&&event.code!==PAGE_KEYS.next||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.defaultPrevented)return;
  if(bar.hidden||host.hidden||doc.querySelector('dialog[open]')||'v03Talk' in (doc.documentElement?.dataset??{}))return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName??''))return;
  event.preventDefault();go(event.code===PAGE_KEYS.next?1:-1);
 };
 doc.addEventListener('keydown',key);
 return {
  set,go,pulse,
  get page(){return index===0?null:list[index-1]?.id??null;},
  get count(){return list.length;},
  dispose(){
   doc.removeEventListener('keydown',key);prev.removeEventListener('click',onPrev);next.removeEventListener('click',onNext);
   frame.removeEventListener('pointerdown',down);frame.removeEventListener('pointermove',move);frame.removeEventListener('pointerup',up);frame.removeEventListener('pointercancel',up);
   pages.clear();list=[];drag=null;
  },
 };
}
