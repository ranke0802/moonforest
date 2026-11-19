// Typewriter text (2026-11-19): a line appears one character at a time.
// ~40 characters per second, a short pause after sentence ends and commas,
// spaces are free. Characters are counted by code point (Array.from), so a
// Korean syllable, a kana or a hanzi is one step in every language.
// Rendering: the paragraph holds two text nodes, the typed part and the rest
// (kept invisible so the layout and line wraps never move while typing). Only
// those two nodes' data is written, and only when the visible length changes.
// One timer per active line; it stops when the line ends or is stopped.
export const CHAR_MS=25;
export const SENTENCE_PAUSE_MS=120;
export const COMMA_PAUSE_MS=60;
const SENTENCE=new Set(['.','!','?','…','。','！','？','‥','\n']);
const COMMA=new Set([',','、','，',';','；',':','：']);
// Closing marks that ride with the sentence mark before them (…" or 。」).
const CLOSERS=new Set(['"','\'','”','’','」','』','）',')','】','》','〉']);
export const isSpace=ch=>ch===' '||ch==='\t'||ch==='　'||ch===' ';
export const isQuiet=ch=>isSpace(ch)||ch==='\n'||SENTENCE.has(ch)||COMMA.has(ch)||CLOSERS.has(ch)||ch==='“'||ch==='‘'||ch==='「'||ch==='『'||ch==='('||ch==='（'||ch==='-'||ch==='—'||ch==='~'||ch==='～';
// Extra wait after showing ch (the next character is looked at so a run of
// "..." or "?!" pauses once, at its end).
export function pauseAfter(ch,next){
 if(next!==undefined&&(SENTENCE.has(next)||CLOSERS.has(next)||COMMA.has(next)))return 0;
 if(SENTENCE.has(ch))return SENTENCE_PAUSE_MS;
 if(COMMA.has(ch))return COMMA_PAUSE_MS;
 return 0;
}
// Cost in ms to reveal chars[i] (spaces are free).
const stepCost=(chars,i)=>(isSpace(chars[i])?0:CHAR_MS)+(i>0?pauseAfter(chars[i-1],chars[i]):0);
// The first character shows at once; this is the time to the last one.
export function typingMs(text){const chars=Array.from(String(text??''));let ms=0;for(let i=1;i<chars.length;i++)ms+=stepCost(chars,i);return ms;}

// Global switch: null follows the page (?typewriter=0, reduced motion).
let forced=null;
export function setTypewriterEnabled(on){forced=on==null?null:!!on;}
export function typewriterEnabled(view=globalThis){
 if(forced!==null)return forced;
 try{if(new URLSearchParams(view?.location?.search??'').get('typewriter')==='0')return false;}catch{}
 try{if(view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return false;}catch{}
 return true;
}

// doc: owner document. schedule/cancel/now: the clock (injectable for tests).
// enabled(): read at each start. onChar(ch,count): every newly visible
// non-quiet character (the blip voice listens here).
export function createTypewriter({doc,enabled,schedule,cancel,now,onChar=null}={}){
 const view=doc?.defaultView??globalThis;
 enabled??=()=>typewriterEnabled(view);
 schedule??=(fn,ms)=>(view.setTimeout??globalThis.setTimeout).call(view.setTimeout?view:globalThis,fn,ms);
 cancel??=handle=>(view.clearTimeout??globalThis.clearTimeout).call(view.clearTimeout?view:globalThis,handle);
 now??=()=>(view.performance??globalThis.performance)?.now?.()??Date.now();
 let chars=null,full='',shown=0,offset=0,due=0,timer=null,shownNode=null,restNode=null,resolveDone=null,voiceKey=null,visible=0;
 const write=()=>{shownNode.data=full.slice(0,offset);restNode.data=full.slice(offset);};
 const finish=()=>{
  if(timer!==null){cancel(timer);timer=null;}
  const done=resolveDone;resolveDone=null;chars=null;done?.();
 };
 const tick=()=>{
  timer=null;if(!chars)return;
  const at=now(),from=shown;let quietOnly=true,lastVisible=null;
  // Catch up after a late timer (tab in background): reveal everything due,
  // but blip at most once per tick.
  while(shown<chars.length&&due<=at){
   const ch=chars[shown];offset+=ch.length;shown++;
   if(!isQuiet(ch)){visible++;quietOnly=false;lastVisible=ch;}
   if(shown<chars.length)due+=stepCost(chars,shown);
  }
  if(shown!==from)write();
  if(!quietOnly&&onChar)try{onChar(lastVisible,visible,voiceKey);}catch{}
  if(shown>=chars.length){finish();return;}
  timer=schedule(tick,Math.max(0,due-at));
 };
 return {
  get typing(){return chars!==null;},
  // Types text into node (its children are replaced). Resolves when the line
  // is fully shown or stopped. who: voice key for the blip.
  start(node,text,{who=null}={}){
   this.stop();
   full=String(text??'');
   node.textContent='';
   shownNode=doc.createTextNode('');
   const rest=doc.createElement('span');rest.className='v03-type-rest';rest.setAttribute('aria-hidden','true');
   restNode=doc.createTextNode(full);rest.append(restNode);node.append(shownNode,rest);
   voiceKey=who;visible=0;shown=0;offset=0;
   const promise=new Promise(resolve=>{resolveDone=resolve;});
   if(!full||!enabled()){chars=[];offset=full.length;write();finish();return promise;}
   chars=Array.from(full);due=now();
   tick();
   return promise;
  },
  // Shows the rest of the line at once.
  complete(){if(!chars)return false;shown=chars.length;offset=full.length;write();finish();return true;},
  // Stops the clock where it is (the dialogue closed).
  stop(){if(chars)finish();},
 };
}
