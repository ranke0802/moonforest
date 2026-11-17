// Dialogue box. One line at a time; click, Enter, Space or E advances.
import {t,speaker} from './i18n.js';
export function createDialogue({doc,mount=doc.body,portraitFor=()=>null}){
 const layer=doc.createElement('section');layer.className='v03-dialogue';layer.hidden=true;layer.dataset.v03Layer='dialogue';layer.setAttribute('role','dialog');layer.setAttribute('aria-live','polite');
 const box=doc.createElement('div');box.className='v03-dialogue-box';
 const who=doc.createElement('strong');who.className='v03-dialogue-who';
 const text=doc.createElement('p');text.className='v03-dialogue-text';
 const next=doc.createElement('button');next.type='button';next.className='v03-dialogue-next';
 box.append(who,text,next);
 // Speaker art on the left, behind the box. Swapped only when the speaker changes.
 const portrait=doc.createElement('img');portrait.className='v03-dialogue-portrait';portrait.alt='';portrait.decoding='async';portrait.draggable=false;portrait.hidden=true;
 layer.append(portrait,box);mount.append(layer);
 let shownArt=null;
 let lines=null,index=0,finish=null;
 function show(){
  const line=lines[index];who.textContent=line.who?speaker(line.who):'';who.hidden=!line.who;text.textContent=line.text;
  box.classList.toggle('is-self',line.who==='나');
  const art=portraitFor(line.who);
  if(art!==shownArt){shownArt=art;portrait.hidden=!art;if(art){portrait.src=art;portrait.classList.remove('is-in');void portrait.offsetWidth;portrait.classList.add('is-in');}}next.textContent=t(index===lines.length-1?'dialogue.close':'dialogue.next');
  box.classList.remove('is-in');void box.offsetWidth;box.classList.add('is-in');
 }
 function step(){
  if(!lines)return;
  if(++index<lines.length){show();return;}
  const done=finish,played=lines;lines=null;finish=null;layer.hidden=true;shownArt=null;done?.(played);
 }
 next.addEventListener('click',step);
 layer.addEventListener('click',event=>{if(event.target===layer)step();});
 const onKey=event=>{
  if(!lines||event.repeat)return;
  // Stop every other listener too: the key that closes the last line must not
  // reach the story's own E handler and reopen the conversation.
  if(event.code==='Enter'||event.code==='Space'||event.code==='KeyE'){event.preventDefault();event.stopImmediatePropagation();step();}
 };
 doc.addEventListener('keydown',onKey,true);
 return {
  element:layer,
  get open(){return lines!==null;},
  // Resolves with the played lines when the last one is dismissed.
  play(script){
   if(lines||!Array.isArray(script)||!script.length)return Promise.resolve(null);
   lines=script;index=0;layer.hidden=false;show();next.focus?.({preventScroll:true});
   return new Promise(resolve=>{finish=resolve;});
  },
  cancel(){if(!lines)return;const done=finish;lines=null;finish=null;layer.hidden=true;done?.(null);},
  dispose(){this.cancel();doc.removeEventListener('keydown',onKey,true);layer.remove();},
 };
}
