// Dialogue box. One line at a time; click, Enter, Space or E advances.
// Lines type out (typewriter.js); the first input while a line is typing
// shows the whole line, the next one advances.
import {t,speaker} from './i18n.js';
import {createTypewriter} from './typewriter.js';
import {createTextBlip} from './text-blip.js';
import {holding,trustedInput} from './dialogue-hold.js';
// A menu takes no pick for this long after it appears, so the tap or key that closed
// the last line (or opened the talk) cannot also choose its first entry.
export const CHOICE_ARM_MS=250;
// A person's press also waits DIALOGUE_MIN_HOLD (dialogue-hold.js) after a line or the
// choices appear before it moves on or picks (2026-11-28, user). Completing a typing line
// is still allowed inside the hold.
// later(fn): runs fn once before the next paint and returns a cancel function (the window's
// close waits for it, see close()). Default: requestAnimationFrame, else the next macrotask.
function nextFrame(view){
 if(typeof view?.requestAnimationFrame==='function')return fn=>{const id=view.requestAnimationFrame(fn);return ()=>view.cancelAnimationFrame?.(id);};
 // No frames (tests, a DOM without rendering): the next macrotask, after every pending microtask.
 if(typeof globalThis.setImmediate==='function')return fn=>{const id=globalThis.setImmediate(fn);return ()=>globalThis.clearImmediate(id);};
 return fn=>{const id=setTimeout(fn,0);return ()=>clearTimeout(id);};
}
export function createDialogue({doc,mount=doc.body,later=nextFrame(doc.defaultView),portraitFor=()=>null,blip=createTextBlip({view:doc.defaultView??globalThis}),typewriter=createTypewriter({doc,onChar:(ch,count,who)=>blip?.onChar(ch,count,who)}),
 now=()=>doc.defaultView?.performance?.now?.()??Date.now(),trusted=trustedInput,
 // A touch screen (no keyboard in use): the choices show no highlight until a key is used.
 coarse=()=>{try{return !!doc.defaultView?.matchMedia?.('(pointer:coarse)')?.matches;}catch{return false;}}}){
 const layer=doc.createElement('section');layer.className='v03-dialogue';layer.hidden=true;layer.dataset.v03Layer='dialogue';layer.setAttribute('role','dialog');layer.setAttribute('aria-live','polite');
 const box=doc.createElement('div');box.className='v03-dialogue-box';
 const who=doc.createElement('strong');who.className='v03-dialogue-who';
 const text=doc.createElement('p');text.className='v03-dialogue-text';text.setAttribute('aria-hidden','true');
 // Screen readers get the whole line once, not every typed character.
 const said=doc.createElement('span');said.className='v03-sr-only';
 const next=doc.createElement('button');next.type='button';next.className='v03-dialogue-next';
 const actions=doc.createElement('div');actions.className='v03-dialogue-actions';
 // The keys, as small text at the top right on the name's line (2026-11-26, user: instead of
 // the boxed E beside the button). Hidden on touch screens (CSS). Not part of any button's name.
 const hint=doc.createElement('span');hint.className='v03-dialogue-hint';hint.setAttribute('aria-hidden','true');
 const head=doc.createElement('div');head.className='v03-dialogue-head';head.append(who,hint);
 const setHint=value=>{if(hint.textContent!==value)hint.textContent=value;};
 next.setAttribute('aria-keyshortcuts','E Enter Space');
 // A short choice (2026-11-26, user: the smith and the herbalist ask what the visit is for,
 // and the last entry always ends the talk). Second pass the same day (user: the stacked
 // list covered the art): the speaker's greeting stays in the box and the choices are a row
 // of buttons like Next/Close, in its corner (the last, ending the talk, where Close was).
 // Touch: tap a button. Keyboard: W/A/S/D or the arrows move (no wrap), E (Enter, Space)
 // picks, Escape takes the last entry.
 const menu=doc.createElement('div');menu.className='v03-dialogue-choices';menu.setAttribute('role','menu');menu.hidden=true;
 actions.append(next,menu);box.append(head,text,said,actions);
 // Speaker art on the left, behind the box. Swapped only when the speaker changes.
 const portrait=doc.createElement('img');portrait.className='v03-dialogue-portrait';portrait.alt='';portrait.decoding='async';portrait.draggable=false;portrait.hidden=true;
 layer.append(portrait,box);mount.append(layer);
 let shownArt=null;
 let lines=null,index=0,finish=null;
 let choices=null,chosen=0,pick=null,armedAt=0,shownAt=-Infinity;
 // A held press: one from a person inside the minimum hold of the line now up.
 const held=event=>trusted(event)&&holding(shownAt,now());
 const hideArt=()=>{shownArt=null;portrait.hidden=true;portrait.removeAttribute('src');portrait.classList.remove('is-in');};
 function showArt(art){
  if(art===shownArt)return;
  shownArt=art;portrait.hidden=!art;
  if(art){portrait.src=art;portrait.classList.remove('is-in');void portrait.offsetWidth;portrait.classList.add('is-in');}
 }
 function mark(){
  [...menu.children].forEach((node,i)=>{node.classList.toggle('is-selected',i===chosen);if(i===chosen)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
 }
 // Closing waits until just before the next paint (2026-11-26, user: talk → lines → the
 // choices again flickered). A play() or choose() started before then, as a caller does
 // right after a pick or the last line, keeps the window up: no hide, the same picture
 // (not set again), no entrance of the box. Anything else (a shop panel) sees it closed in
 // the same frame. cancel() and dispose() close at once.
 let closing=null;
 const hideNow=()=>{closing?.();closing=null;layer.hidden=true;talking(false);hideArt();};
 function close(){closing?.();closing=later(()=>{closing=null;if(!lines&&!choices)hideNow();});}
 // Returns true when the window was still up (a continuation).
 function reopen(){const kept=!!closing&&!layer.hidden;closing?.();closing=null;layer.hidden=false;talking(true);return kept;}
 function settle(at,{now:immediate=false,event=null}={}){
  if(!choices||(at!=null&&(now()<armedAt||held(event))))return;
  const done=pick,value=at==null?null:choices[at]?.id??null;
  typewriter.stop();choices=null;pick=null;menu.hidden=true;menu.replaceChildren();next.hidden=false;text.hidden=false;box.classList.remove('is-choosing');
  if(immediate)hideNow();else close();done?.(value);
 }
 // While someone speaks the play HUD steps back (CSS reads this flag).
 const talking=on=>{const data=doc.documentElement?.dataset;if(!data)return;if(on)data.v03Talk='';else delete data.v03Talk;};
 function show(enter=true){
  const line=lines[index];shownAt=now();who.textContent=line.who?speaker(line.who):'';who.hidden=!line.who;said.textContent=line.text;typewriter.start(text,line.text,{who:line.who??null});
  text.scrollTop=0;
  box.classList.toggle('is-self',line.who==='나');
  portrait.classList.toggle('is-journal',!!line.illustration);showArt(line.illustration??portraitFor(line.who));
  next.textContent=t(index===lines.length-1?'dialogue.close':'dialogue.next');setHint('E '+next.textContent);
  if(enter){box.classList.remove('is-in');void box.offsetWidth;box.classList.add('is-in');}
 }
 function step(event){
  if(!lines)return;
  if(typewriter.complete())return;
  if(held(event))return;
  if(++index<lines.length){show();return;}
  typewriter.stop();const done=finish,played=lines;lines=null;finish=null;close();done?.(played);
 }
 next.addEventListener('click',event=>step(event));
 // Touching anywhere on the box advances too (thumb-friendly on phones); the
 // button keeps its own click, so one tap never advances twice.
 // While the choices are up a tap there only completes the greeting; only a button picks.
 box.addEventListener('click',event=>{if(choices){if(!menu.contains(event.target))typewriter.complete();return;}if(!next.contains(event.target))step(event);});
 // Anywhere else on the screen as well, the speaker's picture included (user, 2026-11-21).
 layer.addEventListener('click',event=>{if(box.contains(event.target))return;if(choices){typewriter.complete();return;}step(event);});
 const onKey=event=>{
  if(choices){
   const code=event.code,last=choices.length-1;
   // The first key used on a touch screen shows the highlight (pick keys only show it).
   const keyed=menu.classList.contains('is-keyed'),move=/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(code);
   if(!keyed&&(move||code==='Enter'||code==='Space'||code==='KeyE')){menu.classList.add('is-keyed');if(!move){event.preventDefault();event.stopImmediatePropagation();return;}}
   if(code==='KeyA'||code==='ArrowLeft'||code==='KeyW'||code==='ArrowUp'){chosen=Math.max(0,chosen-1);mark();}
   else if(code==='KeyD'||code==='ArrowRight'||code==='KeyS'||code==='ArrowDown'){chosen=Math.min(last,chosen+1);mark();}
   // While the greeting is still typing the first press shows it whole, as on any line.
   else if(code==='Enter'||code==='Space'||code==='KeyE'){if(event.repeat)return;if(!typewriter.complete())settle(chosen,{event});}
   else if(code==='Escape')settle(last,{event});
   else return;
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(!lines||event.repeat)return;
  // Stop every other listener too: the key that closes the last line must not
  // reach the story's own E handler and reopen the conversation.
  if(event.code==='Enter'||event.code==='Space'||event.code==='KeyE'){event.preventDefault();event.stopImmediatePropagation();step(event);}
 };
 doc.addEventListener('keydown',onKey,true);
 return {
  element:layer,
  get open(){return lines!==null||choices!==null;},
  // Resolves with the played lines when the last one is dismissed.
  play(script){
   if(lines||choices||!Array.isArray(script)||!script.length)return Promise.resolve(null);
   lines=script;index=0;blip?.prime?.();const kept=reopen();show(!kept);next.focus?.({preventScroll:true});
   return new Promise(resolve=>{finish=resolve;});
  },
  // options: [{id,label,mark?}]. line: what the speaker says above the choices (typed like
  // any line; none leaves only the name). Resolves with the picked id (null when cancelled).
  choose(options,{who:name=null,line=null}={}){
   if(lines||choices||!Array.isArray(options)||!options.length)return Promise.resolve(null);
   choices=options;chosen=0;armedAt=now()+CHOICE_ARM_MS;shownAt=now();blip?.prime?.();const kept=reopen();
   who.textContent=name?speaker(name):'';who.hidden=!name;next.hidden=true;box.classList.add('is-choosing');
   if(line){text.hidden=false;said.textContent=line;typewriter.start(text,line,{who:name});text.scrollTop=0;}
   else{typewriter.stop();said.textContent='';text.textContent='';text.hidden=true;}
   box.classList.remove('is-self');portrait.classList.remove('is-journal');showArt(portraitFor(name));
   menu.replaceChildren(...options.map((option,i)=>{
    const entry=doc.createElement('button');entry.type='button';entry.className='v03-dialogue-choice';entry.setAttribute('role','menuitem');entry.textContent=option.label;
    if(option.mark)entry.dataset.mark='';
    entry.addEventListener('click',event=>{event.stopPropagation();settle(i,{event});});
    entry.addEventListener('pointerenter',()=>{if(choices&&chosen!==i){chosen=i;mark();}});
    return entry;
   }));
   menu.classList.toggle('is-keyed',!coarse());setHint('WASD '+t('talk.hint.move')+' · E '+t('talk.hint.pick'));
   menu.hidden=false;mark();
   if(!kept){box.classList.remove('is-in');void box.offsetWidth;box.classList.add('is-in');}
   return new Promise(resolve=>{pick=resolve;});
  },
  cancel(){
   if(choices){settle(null,{now:true});return;}
   if(!lines){if(closing)hideNow();return;}
   typewriter.stop();const done=finish;lines=null;finish=null;hideNow();done?.(null);
  },
  dispose(){this.cancel();closing?.();closing=null;doc.removeEventListener('keydown',onKey,true);layer.remove();},
 };
}
