import {townItemIcon} from './town-item-art.js';
import {itemName} from './town-items.js';
import {t} from './i18n.js';

// Touch uses on release. Opening the picker disarms that release before the
// modal takes focus, including on devices that subsequently synthesize a click.
export function createPotionHud({root,button,read,canDrink,use,canOpen,select,onPause,onLayout}){
 const doc=root.ownerDocument,win=doc.defaultView;
 const make=(tag,cls)=>{const el=doc.createElement(tag);if(cls)el.className=cls;return el;};
 const bar=make('div','mf-potion-bar'),picker=make('dialog','mf-potion-picker'),choices=make('div'),title=make('h2'),close=make('button');
 const mobileArt=make('i','mf-potion-current'),count=button.querySelector('#potion-count');
 bar.setAttribute('role','group');picker.append(title,choices,close);root.append(picker);
 button.after(bar);button.append(mobileArt);
 let active=false,lastState=null,lastMask=-1,lastUnlocked=null,press=null,timer=null,ignoreClickUntil=0;
 const listeners=[];
 function listen(node,event,handler,capture=false){node.addEventListener(event,handler,capture);listeners.push(()=>node.removeEventListener(event,handler,capture));}
 function cancelPress(){win.clearTimeout(timer);timer=null;press=null;}
 function clear(){cancelPress();if(picker.open)picker.close();}
 const slotLabel=(slot,id)=>t('potion.slot',{n:slot+1})+' · '+(id?itemName(id):t('potion.empty'));
 function renderSlot(slot,id,amount){
  const number=make('kbd');number.textContent=String(slot+1);
  if(!id)return [number];
  const qty=make('small');qty.textContent=String(amount);
  return [number,townItemIcon(doc,id),qty];
 }
 const slotButtons=read().quickSlots.map((_,i)=>{
  const el=make('button');el.type='button';el.addEventListener('click',()=>{if(active&&canOpen())use(i);});bar.append(el);return el;
 });
 function update(playing,unlocked){
  if(active!==playing){active=playing;root.toggleAttribute('data-potion-slots',playing);lastState=null;if(!playing)clear();onLayout?.();}
  if(!playing)return;
  const state=read();let mask=0;
  if(unlocked)for(let i=0;i<slotButtons.length;i++)if(canDrink(i))mask|=1<<i;
  if(state===lastState&&mask===lastMask&&unlocked===lastUnlocked)return;
  if(!unlocked)clear();
  lastState=state;lastMask=mask;lastUnlocked=unlocked;
  bar.setAttribute('aria-label',t('potion.slots'));
  for(const [i,el] of slotButtons.entries()){
   const id=state.quickSlots[i],amount=state.bag[id]??0,label=slotLabel(i,id)+(id?' · '+t('shop.inBag',{n:amount}):'');
   el.replaceChildren(...renderSlot(i,id,amount));el.title=label;el.setAttribute('aria-label',label);el.disabled=!(mask&(1<<i));
  }
  const selected=state.selectedQuickSlot,id=state.quickSlots[selected],amount=state.bag[id]??0;
  mobileArt.replaceChildren(...(id&&id!=='potion'?[townItemIcon(doc,id)]:[]));mobileArt.hidden=!id||id==='potion';
  if(count)count.textContent=String(amount);
  button.disabled=!unlocked||!id;
  button.title=slotLabel(selected,id)+' · '+t('shop.inBag',{n:amount})+' · '+t('potion.gesture');
  button.setAttribute('aria-label',button.title);button.setAttribute('aria-haspopup','dialog');
 }
 function showPicker(){
  if(!press)return;
  cancelPress();
  if(!active||button.disabled||!canOpen())return;
  const state=read();choices.replaceChildren();
  title.textContent=t('potion.choose');picker.setAttribute('aria-label',title.textContent);
  close.type='button';close.textContent=t('dialogue.close');
  state.quickSlots.forEach((id,slot)=>{
   if(!id)return;
   const row=make('button');row.type='button';
   row.setAttribute('aria-pressed',String(slot===state.selectedQuickSlot));row.dataset.potionChoice=String(slot);
   row.append(townItemIcon(doc,id),doc.createTextNode(slotLabel(slot,id)+' ×'+(state.bag[id]??0)));
   row.addEventListener('click',()=>{if(select(slot)){picker.close();lastState=null;update(active,lastUnlocked);}});
   choices.append(row);
  });
  if(!choices.childElementCount)return;
  picker.showModal();onPause();choices.querySelector('[aria-pressed="true"]')?.focus();
 }
 listen(close,'click',()=>picker.close());
 listen(picker,'close',onPause);
 listen(button,'pointerdown',e=>{
  if(!active||button.disabled||press||e.button!==0||!canOpen())return;
  e.preventDefault();ignoreClickUntil=Date.now()+700;press={id:e.pointerId,x:e.clientX,y:e.clientY};
  try{button.setPointerCapture(e.pointerId);}catch{}
  timer=win.setTimeout(showPicker,450);
 });
 listen(button,'pointermove',e=>{if(press?.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>14)cancelPress();});
 listen(button,'pointerup',e=>{
  ignoreClickUntil=Date.now()+700;
  if(!press||e.pointerId!==press.id)return;
  e.preventDefault();cancelPress();if(active&&!button.disabled&&canOpen())use();
 });
 for(const event of ['lostpointercapture','pointercancel'])listen(button,event,e=>{if(press?.id===e.pointerId)cancelPress();});
 listen(button,'keydown',e=>{if(e.key==='Enter'||e.key===' ')ignoreClickUntil=0;});
 listen(button,'click',e=>{if(active&&e.detail===0&&!e.pointerType&&Date.now()>=ignoreClickUntil&&!button.disabled&&canOpen())use();});
 listen(button,'contextmenu',e=>e.preventDefault());
 listen(win,'blur',clear);listen(win,'pagehide',clear);
 listen(doc,'visibilitychange',()=>{if(doc.hidden)clear();});
 return {get open(){return picker.open;},update,clear,dispose(){
  clear();for(const stop of listeners)stop();bar.remove();mobileArt.remove();picker.remove();root.removeAttribute('data-potion-slots');button.removeAttribute('aria-haspopup');
 }};
}
