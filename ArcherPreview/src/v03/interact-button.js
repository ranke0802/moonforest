// Touch play: while an interaction is on offer (talk to someone, push the
// wagon), the attack button becomes the interaction button (2026-11-23, user).
// A press there runs the interaction instead of a swing; the prompt plate above
// stays as its label. With a keyboard nothing changes (E talks, J attacks).
//
// The button belongs to main.js. Nothing of it is replaced: a face is laid over
// it (v03.css) and presses are taken in the capture phase on the document, before
// main.js's own listeners on the button see them. Written only when the prompt
// changes (play-hud.js), never per frame.
const ICONS=Object.freeze({
 // Speech bubble with three dots.
 talk:'M6 7h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H15l-6 5v-5H6a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z M10 15h.01 M16 15h.01 M22 15h.01',
 // Open hand pushing up.
 push:'M9 29V16l-3-4a2 2 0 0 1 3-3l3 3V6a2 2 0 0 1 4 0v8V4a2 2 0 0 1 4 0v10V6a2 2 0 0 1 4 0v14c0 5-3 9-8 9Z',
});

export function createInteractButton({doc,onInteract=()=>{},isTouch=null,buttonId='attack-button'}){
 const svgNs='http://www.w3.org/2000/svg';
 let button=null,face=null,path=null,label=null,active=null,pointer=null,savedLabel=null,disposed=false;
 const touch=isTouch??(()=>{
  // The HUD says which controls it laid out; a coarse pointer is the fallback.
  const mode=doc.getElementById('app')?.dataset?.hudInput;
  if(mode)return mode==='touch';
  return doc.defaultView?.matchMedia?.('(pointer: coarse)')?.matches===true;
 });
 const find=()=>{if(!button||!button.isConnected)button=doc.getElementById(buttonId);return button;};
 const inside=event=>{const target=event.target?.nodeType===3?event.target.parentElement:event.target;return !!button&&!!target&&(target===button||button.contains?.(target));};
 const take=event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();};
 const down=event=>{if(!active||!inside(event))return;if(event.button!==undefined&&event.button!==0)return;take(event);pointer=event.pointerId??0;};
 const up=event=>{
  if(pointer===null||(event.pointerId??0)!==pointer)return;
  pointer=null;take(event);
  if(active&&inside(event))onInteract();
 };
 const cancel=event=>{if(pointer!==null&&(event.pointerId??0)===pointer)pointer=null;};
 // The click that follows a press (and a keyboard press, detail 0) must not reach the attack handler.
 const click=event=>{if(!active||!inside(event))return;take(event);if(event.detail===0)onInteract();};
 // A long press on a phone can open a context menu; it is still this press, not a reset of the controls.
 const menu=event=>{if(active&&inside(event)){event.preventDefault();event.stopPropagation();}};
 const options={capture:true,passive:false};
 doc.addEventListener('pointerdown',down,options);doc.addEventListener('pointerup',up,options);
 doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('click',click,true);doc.addEventListener('contextmenu',menu,true);

 function build(target){
  // An <i>, not a <span>: the HUD skins hide every span inside the action buttons.
  face=doc.createElement('i');face.className='v03-interact-face';face.setAttribute('aria-hidden','true');
  const svg=doc.createElementNS(svgNs,'svg');svg.setAttribute('viewBox','0 0 32 32');
  path=doc.createElementNS(svgNs,'path');svg.append(path);
  label=doc.createElement('b');face.append(svg,label);target.append(face);
 }
 function release(){
  const target=button;active=null;pointer=null;if(!target)return;
  target.classList.remove('v03-interact');delete target.dataset.v03Interact;
  if(savedLabel===null)target.removeAttribute('aria-label');else target.setAttribute('aria-label',savedLabel);savedLabel=null;
 }
 return {
  // value: the prompt ({act:'talk'|'push', action, label}) or null. Only an
  // actionable prompt on touch controls turns the button over.
  sync(value){
   if(disposed)return false;
   const want=value?.act&&ICONS[value.act]&&touch()?value:null;
   const target=find();
   if(!want||!target){if(active)release();return false;}
   if(!face||face.parentNode!==target)build(target);
   if(!active){savedLabel=target.getAttribute('aria-label');target.classList.add('v03-interact');}
   active=want;target.dataset.v03Interact=want.act;
   path.setAttribute('d',ICONS[want.act]);label.textContent=want.action??'';
   target.setAttribute('aria-label',want.label??want.action??'');
   return true;
  },
  get active(){return active!==null;},
  dispose(){
   if(disposed)return;disposed=true;release();face?.remove();face=null;
   doc.removeEventListener('pointerdown',down,options);doc.removeEventListener('pointerup',up,options);
   doc.removeEventListener('pointercancel',cancel,true);doc.removeEventListener('click',click,true);doc.removeEventListener('contextmenu',menu,true);
  },
 };
}
