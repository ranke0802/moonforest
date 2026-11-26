// Dialogue box. One line at a time; click, Enter, Space or E advances.
// Lines type out (typewriter.js); the first input while a line is typing
// shows the whole line, the next one advances.
import {t,speaker} from './i18n.js';
import {createTypewriter} from './typewriter.js';
import {createTextBlip} from './text-blip.js';
// A menu takes no pick for this long after it appears, so the tap or key that closed
// the last line (or opened the talk) cannot also choose its first entry.
export const CHOICE_ARM_MS=250;
export function createDialogue({doc,mount=doc.body,portraitFor=()=>null,blip=createTextBlip({view:doc.defaultView??globalThis}),typewriter=createTypewriter({doc,onChar:(ch,count,who)=>blip?.onChar(ch,count,who)}),
 now=()=>doc.defaultView?.performance?.now?.()??Date.now()}){
 const layer=doc.createElement('section');layer.className='v03-dialogue';layer.hidden=true;layer.dataset.v03Layer='dialogue';layer.setAttribute('role','dialog');layer.setAttribute('aria-live','polite');
 const box=doc.createElement('div');box.className='v03-dialogue-box';
 const who=doc.createElement('strong');who.className='v03-dialogue-who';
 const text=doc.createElement('p');text.className='v03-dialogue-text';text.setAttribute('aria-hidden','true');
 // Screen readers get the whole line once, not every typed character.
 const said=doc.createElement('span');said.className='v03-sr-only';
 const next=doc.createElement('button');next.type='button';next.className='v03-dialogue-next';
 const actions=doc.createElement('div');actions.className='v03-dialogue-actions';
 const key=doc.createElement('kbd');key.className='v03-dialogue-key';key.textContent='E';key.setAttribute('aria-hidden','true');
 next.setAttribute('aria-keyshortcuts','E Enter Space');
 // A short list to pick from (2026-11-26, user: the smith and the herbalist ask what the
 // visit is for, and the last entry always ends the talk). Touch: tap an entry. Keyboard:
 // W/S or the arrows move, Enter, Space or E picks, Escape takes the last entry.
 const menu=doc.createElement('div');menu.className='v03-dialogue-menu';menu.setAttribute('role','menu');menu.hidden=true;
 actions.append(key,next);box.append(who,text,said,menu,actions);
 // Speaker art on the left, behind the box. Swapped only when the speaker changes.
 const portrait=doc.createElement('img');portrait.className='v03-dialogue-portrait';portrait.alt='';portrait.decoding='async';portrait.draggable=false;portrait.hidden=true;
 layer.append(portrait,box);mount.append(layer);
 let shownArt=null;
 let lines=null,index=0,finish=null;
 let choices=null,chosen=0,pick=null,armedAt=0;
 const hideArt=()=>{shownArt=null;portrait.hidden=true;portrait.removeAttribute('src');portrait.classList.remove('is-in');};
 function showArt(art){
  if(art===shownArt)return;
  shownArt=art;portrait.hidden=!art;
  if(art){portrait.src=art;portrait.classList.remove('is-in');void portrait.offsetWidth;portrait.classList.add('is-in');}
 }
 function mark(){
  [...menu.children].forEach((node,i)=>{node.classList.toggle('is-selected',i===chosen);if(i===chosen)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
 }
 function settle(at){
  if(!choices||(at!=null&&now()<armedAt))return;
  const done=pick,value=at==null?null:choices[at]?.id??null;
  choices=null;pick=null;menu.hidden=true;menu.replaceChildren();actions.hidden=false;text.hidden=false;layer.hidden=true;talking(false);hideArt();done?.(value);
 }
 // While someone speaks the play HUD steps back (CSS reads this flag).
 const talking=on=>{const data=doc.documentElement?.dataset;if(!data)return;if(on)data.v03Talk='';else delete data.v03Talk;};
 function show(){
  const line=lines[index];who.textContent=line.who?speaker(line.who):'';who.hidden=!line.who;said.textContent=line.text;typewriter.start(text,line.text,{who:line.who??null});
  text.scrollTop=0;
  box.classList.toggle('is-self',line.who==='나');
  portrait.classList.toggle('is-journal',!!line.illustration);showArt(line.illustration??portraitFor(line.who));
  next.textContent=t(index===lines.length-1?'dialogue.close':'dialogue.next');
  box.classList.remove('is-in');void box.offsetWidth;box.classList.add('is-in');
 }
 function step(){
  if(!lines)return;
  if(typewriter.complete())return;
  if(++index<lines.length){show();return;}
  typewriter.stop();const done=finish,played=lines;lines=null;finish=null;layer.hidden=true;talking(false);hideArt();done?.(played);
 }
 next.addEventListener('click',step);
 // Touching anywhere on the box advances too (thumb-friendly on phones); the
 // button keeps its own click, so one tap never advances twice.
 box.addEventListener('click',event=>{if(!next.contains(event.target))step();});
 // Anywhere else on the screen as well, the speaker's picture included (user, 2026-11-21).
 layer.addEventListener('click',event=>{if(!box.contains(event.target))step();});
 const onKey=event=>{
  if(choices){
   const code=event.code,last=choices.length-1;
   if(code==='KeyW'||code==='ArrowUp'){if(!event.repeat||chosen>0)chosen=Math.max(0,chosen-1);mark();}
   else if(code==='KeyS'||code==='ArrowDown'){if(!event.repeat||chosen<last)chosen=Math.min(last,chosen+1);mark();}
   else if(code==='Enter'||code==='Space'||code==='KeyE'){if(event.repeat)return;settle(chosen);}
   else if(code==='Escape')settle(last);
   else return;
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(!lines||event.repeat)return;
  // Stop every other listener too: the key that closes the last line must not
  // reach the story's own E handler and reopen the conversation.
  if(event.code==='Enter'||event.code==='Space'||event.code==='KeyE'){event.preventDefault();event.stopImmediatePropagation();step();}
 };
 doc.addEventListener('keydown',onKey,true);
 return {
  element:layer,
  get open(){return lines!==null||choices!==null;},
  // Resolves with the played lines when the last one is dismissed.
  play(script){
   if(lines||choices||!Array.isArray(script)||!script.length)return Promise.resolve(null);
   lines=script;index=0;layer.hidden=false;talking(true);show();next.focus?.({preventScroll:true});
   return new Promise(resolve=>{finish=resolve;});
  },
  // options: [{id,label,mark?}]. Resolves with the picked id (null when cancelled).
  choose(options,{who:name=null}={}){
   if(lines||choices||!Array.isArray(options)||!options.length)return Promise.resolve(null);
   choices=options;chosen=0;armedAt=now()+CHOICE_ARM_MS;
   who.textContent=name?speaker(name):'';who.hidden=!name;said.textContent='';text.textContent='';text.hidden=true;actions.hidden=true;
   box.classList.remove('is-self');portrait.classList.remove('is-journal');showArt(portraitFor(name));
   menu.replaceChildren(...options.map((option,i)=>{
    const entry=doc.createElement('button');entry.type='button';entry.className='v03-dialogue-choice';entry.setAttribute('role','menuitem');entry.textContent=option.label;
    if(option.mark)entry.dataset.mark='';
    entry.addEventListener('click',event=>{event.stopPropagation();settle(i);});
    entry.addEventListener('pointerenter',()=>{if(choices&&chosen!==i){chosen=i;mark();}});
    return entry;
   }));
   menu.hidden=false;layer.hidden=false;talking(true);mark();
   box.classList.remove('is-in');void box.offsetWidth;box.classList.add('is-in');
   return new Promise(resolve=>{pick=resolve;});
  },
  cancel(){
   if(choices){settle(null);return;}
   if(!lines)return;typewriter.stop();const done=finish;lines=null;finish=null;layer.hidden=true;talking(false);hideArt();done?.(null);
  },
  dispose(){this.cancel();doc.removeEventListener('keydown',onKey,true);layer.remove();},
 };
}
