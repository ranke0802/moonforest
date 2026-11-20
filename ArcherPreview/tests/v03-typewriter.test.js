import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTypewriter,typingMs,typewriterEnabled,setTypewriterEnabled,CHAR_MS,SENTENCE_PAUSE_MS,COMMA_PAUSE_MS} from '../src/v03/typewriter.js';
import {createTextBlip,textBlipEnabled,setTextBlipEnabled,resetTextBlip,voicePitch,TEXT_BLIP_KEY} from '../src/v03/text-blip.js';
import {createDialogue} from '../src/v03/dialogue.js';
import {createOpening} from '../src/v03/opening.js';

// A manual clock: schedule() queues one callback, advance(ms) runs what is due.
function clock(){
 let time=0,queue=[],seq=0;
 return {
  now:()=>time,
  schedule:(fn,ms)=>{const id=++seq;queue.push({id,at:time+ms,fn});return id;},
  cancel:id=>{queue=queue.filter(job=>job.id!==id);},
  get pending(){return queue.length;},
  advance(ms){const end=time+ms;for(;;){queue.sort((a,b)=>a.at-b.at);const job=queue[0];if(!job||job.at>end)break;queue.shift();time=job.at;job.fn();}time=end;},
 };
}
function dom(){const {document,window}=parseHTML('<html><body></body></html>');return {document,window};}
const visible=node=>node.firstChild?.data??'';

test('progressive reveal at about 40 characters a second, spaces free',()=>{
 const {document}=dom(),c=clock(),p=document.createElement('p');document.body.append(p);
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});
 let done=false;tw.start(p,'ab cd').then(()=>{done=true;});
 assert.equal(visible(p),'a');assert.equal(p.textContent,'ab cd','the rest keeps its place');
 c.advance(CHAR_MS);assert.equal(visible(p),'ab ','a space costs nothing');
 c.advance(CHAR_MS);assert.equal(visible(p),'ab c');
 c.advance(CHAR_MS);assert.equal(visible(p),'ab cd');assert.equal(tw.typing,false);assert.equal(c.pending,0,'the clock stops when the line ends');
 assert.equal(typingMs('ab cd'),CHAR_MS*3);
 return Promise.resolve().then(()=>assert.equal(done,true));
});

test('pauses after sentence ends and commas (once per run of marks)',()=>{
 assert.equal(typingMs('a.b'),CHAR_MS*2+SENTENCE_PAUSE_MS);
 assert.equal(typingMs('a,b'),CHAR_MS*2+COMMA_PAUSE_MS);
 assert.equal(typingMs('a...b'),CHAR_MS*4+SENTENCE_PAUSE_MS);
 assert.equal(typingMs('a?! b'),CHAR_MS*3+SENTENCE_PAUSE_MS);
 assert.equal(typingMs('가。나、다'),CHAR_MS*4+SENTENCE_PAUSE_MS+COMMA_PAUSE_MS);
 const {document}=dom(),c=clock(),p=document.createElement('p');
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});tw.start(p,'a. b');
 c.advance(CHAR_MS);assert.equal(visible(p),'a.');
 c.advance(SENTENCE_PAUSE_MS-1);assert.equal(visible(p),'a.');
 c.advance(1);assert.equal(visible(p),'a. ');c.advance(CHAR_MS);assert.equal(visible(p),'a. b');
});

test('multilingual lines count one step per character',()=>{
 for(const text of ['안녕하세요','こんにちは','你好世界啊','Xin chào','Hello'])assert.equal(typingMs(text),CHAR_MS*(Array.from(text).filter(ch=>ch!==' ').length-1),text);
 const {document}=dom(),c=clock(),p=document.createElement('p');
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});tw.start(p,'한글😀字');
 c.advance(CHAR_MS);assert.equal(visible(p),'한글');c.advance(CHAR_MS);assert.equal(visible(p),'한글😀','surrogate pairs stay whole');
});

test('reduced motion and ?typewriter=0 show text at once',()=>{
 setTypewriterEnabled(null);
 assert.equal(typewriterEnabled({location:{search:''},matchMedia:()=>({matches:false})}),true);
 assert.equal(typewriterEnabled({location:{search:''},matchMedia:q=>({matches:q.includes('reduced-motion')})}),false);
 assert.equal(typewriterEnabled({location:{search:'?typewriter=0'}}),false);
 const {document}=dom(),c=clock(),p=document.createElement('p');
 const tw=createTypewriter({doc:document,enabled:()=>typewriterEnabled({matchMedia:()=>({matches:true})}),...c});
 tw.start(p,'모두 한 번에');assert.equal(visible(p),'모두 한 번에');assert.equal(tw.typing,false);assert.equal(c.pending,0);
});

test('dialogue: a tap completes the typing line, the next tap advances',async()=>{
 const {document,window}=dom(),c=clock();
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});
 const d=createDialogue({doc:document,blip:null,typewriter:tw});
 const ended=d.play([{who:'마부',text:'고맙습니다, 정말로.'},{who:'나',text:'괜찮아.'}]);
 const text=document.querySelector('.v03-dialogue-text'),box=document.querySelector('.v03-dialogue-box'),sr=document.querySelector('.v03-dialogue-box .v03-sr-only');
 assert.equal(visible(text),'고');assert.equal(sr.textContent,'고맙습니다, 정말로.','screen readers get the whole line');
 c.advance(CHAR_MS*2);assert.equal(visible(text),'고맙습');
 box.dispatchEvent(new window.Event('click'));assert.equal(visible(text),'고맙습니다, 정말로.','first tap completes');assert.equal(c.pending,0);
 box.dispatchEvent(new window.Event('click'));assert.equal(visible(text),'괜','second tap advances');
 const key=code=>{const e=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'code',{value:code});document.dispatchEvent(e);};
 key('KeyE');assert.equal(visible(text),'괜찮아.');assert.equal(d.open,true);
 key('Enter');assert.equal(d.open,false);assert.equal((await ended).length,2);
 // Closing mid-line stops the clock.
 d.play([{who:'마부',text:'길다란 문장입니다'}]);c.advance(CHAR_MS);d.cancel();assert.equal(c.pending,0);
});

test('opening: the caption hold starts after typing, a click completes it',async()=>{
 const {document,window}=dom(),c=clock(),waits=[];
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});
 const opening=createOpening({doc:document,blip:null,typewriter:tw,typing:()=>true,wait:ms=>{waits.push({ms,typing:tw.typing});return Promise.resolve();}});
 const line=document.querySelector('.v03-opening-line');
 const played=opening.play();
 // Let the async play reach the first caption, which then waits for typing.
 for(let i=0;i<200&&!tw.typing;i++)await new Promise(r=>setImmediate(r));
 assert.equal(tw.typing,true);const before=waits.length;
 await new Promise(r=>setImmediate(r));assert.equal(waits.length,before,'no hold runs while the caption types');
 c.advance(250);assert.ok(Array.from(visible(line)).length>=3,JSON.stringify(visible(line)));
 line.parentNode.dispatchEvent(new window.Event('click'));assert.equal(tw.typing,false);assert.equal(visible(line),line.textContent,'a click shows the caption at once');
 // Finish every remaining caption as soon as it starts.
 const pump=setInterval(()=>tw.complete(),1);
 assert.equal(await played,'done');clearInterval(pump);
 assert.ok(waits.slice(before).every(w=>!w.typing),'holds only ran with no caption typing');
});

test('blip: on by default, ?blip=0 or a stored 0 turns it off',()=>{
 resetTextBlip();assert.equal(textBlipEnabled({location:{search:''},localStorage:{getItem:()=>null}}),true);
 resetTextBlip();assert.equal(textBlipEnabled({location:{search:'?blip=0'},localStorage:{getItem:()=>null}}),false);
 resetTextBlip();assert.equal(textBlipEnabled({location:{search:''},localStorage:{getItem:k=>k===TEXT_BLIP_KEY?'0':null}}),false);
 resetTextBlip();assert.equal(textBlipEnabled({location:{search:'?blip=1'}}),true);
 resetTextBlip();assert.equal(textBlipEnabled({location:{search:''},localStorage:{getItem:k=>k===TEXT_BLIP_KEY?'1':null}}),true);
 resetTextBlip();const stored={};setTextBlipEnabled(true,{view:{localStorage:{setItem:(k,v)=>{stored[k]=v;}}}});assert.equal(stored[TEXT_BLIP_KEY],'1');assert.equal(textBlipEnabled(),true);
 resetTextBlip();
 assert.equal(voicePitch('마부'),voicePitch('마부'),'stable per speaker');assert.notEqual(voicePitch('마부'),voicePitch('나'));
});

function fakeAudio(){
 const made={osc:0,contexts:0};
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},gain:param()});
 const factory=()=>{made.contexts++;const ctx={state:'running',currentTime:0,destination:{},createGain:node,createOscillator(){made.osc++;return {...node(),type:'',frequency:param(),detune:param(),start(){},stop(){if(made.endOnStop!==false)this.onended?.();},onended:null};},resume:()=>Promise.resolve()};made.ctx=ctx;return ctx;};
 return {made,factory};
}

test('blip cadence: one per 2-3 visible characters, none on spaces or marks, none when off',()=>{
 for(const on of [true,false]){
  resetTextBlip();
  const {made,factory}=fakeAudio(),calls=[];
  const blip=createTextBlip({view:{},contextFactory:factory,random:()=>.9,isEnabled:()=>on});
  const {document}=dom(),c=clock(),p=document.createElement('p');
  const tw=createTypewriter({doc:document,enabled:()=>true,...c,onChar:(ch,count,who)=>{calls.push(ch);made.ctx&&(made.ctx.currentTime+=.05);blip.onChar(ch,count,who);}});
  const text='가나다 라마, 바사아자차!';tw.start(p,text,{who:'마부'});c.advance(typingMs(text));
  assert.equal(calls.length,10,'no hook on spaces and marks');
  if(on){assert.equal(made.contexts,1,'one shared context');assert.equal(made.osc,4,'1st, 4th, 7th, 10th visible characters (random=.9 → every 3)');}
  else{assert.equal(made.osc,0);assert.equal(made.contexts,0);}
 }
 resetTextBlip();
 // random<.5 → every 2nd character; voices are capped and spaced.
 const {made,factory}=fakeAudio();const blip=createTextBlip({view:{},contextFactory:factory,random:()=>.1,isEnabled:()=>true});
 for(let i=1;i<=6;i++){made.ctx&&(made.ctx.currentTime+=.05);blip.onChar('가',i,'나');}
 assert.equal(made.osc,3);
 for(let i=1;i<=9;i++)blip.play('나');assert.equal(made.osc,4,'same instant: only one gets past the min gap');
 made.endOnStop=false;for(let i=1;i<=9;i++){made.ctx.currentTime+=.05;blip.play('나');}assert.equal(made.osc,7,'at most 3 blips sound at once');
 resetTextBlip();
});
