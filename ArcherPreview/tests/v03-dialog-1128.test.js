// 2026-11-28 (user): the prologue's skip button at the top right; after a skip only a
// progress bar (no "preparing the wagon" sentence); every dialogue line (NPC talk, choices,
// prologue captions) stays up at least 0.6 s however fast it is pressed; every speaker's dot
// sound is Jeffrey's; the prologue's first caption gets its dots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createTypewriter} from '../src/v03/typewriter.js';
import {createTextBlip,resetTextBlip,voicePitch,SHARED_VOICE,voiceFor} from '../src/v03/text-blip.js';
import {createDialogue} from '../src/v03/dialogue.js';
import {createOpening,PREP_BACK_AFTER_MS,PREP_TICK_MS} from '../src/v03/opening.js';
import {DIALOGUE_MIN_HOLD,holding} from '../src/v03/dialogue-hold.js';
import {t} from '../src/v03/i18n.js';
import {DIALOGUES} from '../src/v03/data/chapter1.js';

const dom=()=>parseHTML('<html><body></body></html>');
const css=readFileSync(new URL('../src/v03/v03.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const tick=()=>new Promise(r=>setImmediate(r));
// A person's input (the hold ignores synthetic events: tests and scripts drive past it).
const trusted=()=>true;

test('skip button: top right inside the safe area, 44 px tall, not at the bottom',()=>{
 const rules=[...css.matchAll(/(^|})\s*\.v03-opening-skip\{([^}]*)\}/g)].map(m=>m[2]);
 assert.ok(rules.length>=2);
 const last=rules.at(-1),all=rules.join(';');
 assert.match(last,/top:max\(\d+px,env\(safe-area-inset-top\)\)/);
 assert.match(last,/right:max\(\d+px,env\(safe-area-inset-right\)\)/);
 assert.match(last,/bottom:auto/);
 assert.match(all,/min-height:44px/);assert.match(last,/min-width:44px/);
 // It lives in the dream layer, which covers the play HUD (minimap, top-right icons).
 const {document}=dom();createOpening({doc:document,blip:null});
 assert.ok(document.querySelector('.v03-opening .v03-opening-skip'));
 assert.match(css,/\.v03-opening\{z-index:20010;/);
});

function prepStage(){
 const {document,window}=dom();let time=0;const ticks=new Set();
 const every=fn=>{ticks.add(fn);return ()=>ticks.delete(fn);};
 const opening=createOpening({doc:document,blip:null,now:()=>time,every,wait:()=>Promise.resolve()});
 const prep=document.querySelector('.v03-opening-preparation'),bar=prep.querySelector('[role=progressbar]');
 const advance=ms=>{time+=ms;for(const fn of [...ticks])fn();};
 return {document,window,opening,prep,bar,advance,ticks,get time(){return time;}};
}
const shownText=node=>[...node.querySelectorAll('p')].filter(p=>!p.hidden).map(p=>p.textContent).join('');

test('after the dream: a progress bar, no sentence, updated as steps finish',()=>{
 const s=prepStage(),back=s.prep.lastElementChild;
 s.opening.progress(0,3);
 s.opening.preparation({onBack:()=>{}});
 assert.equal(s.prep.hidden,false);assert.equal(s.bar.hidden,false);
 assert.equal(shownText(s.prep),'','no visible sentence');
 assert.ok(!s.prep.textContent.includes(t('opening.castLoading')),'the old sentence is not on screen');
 assert.equal(s.bar.getAttribute('aria-label'),t('opening.castLoading'),'screen readers keep the old sentence as the name');
 assert.equal(s.bar.getAttribute('aria-valuemin'),'0');assert.equal(s.bar.getAttribute('aria-valuemax'),'100');
 assert.equal(s.bar.getAttribute('aria-valuenow'),'0');
 assert.equal(s.document.querySelector('.v03-opening-skip').hidden,true);
 assert.equal(back.hidden,true,'no buttons while it simply loads');
 // Inside a step the bar eases on, never past the next step.
 s.advance(PREP_TICK_MS*4);const eased=Number(s.bar.getAttribute('aria-valuenow'));
 assert.ok(eased>0&&eased<33,'eases inside the first step: '+eased);
 s.opening.progress(1,3);assert.ok(Number(s.bar.getAttribute('aria-valuenow'))>=33);
 s.opening.progress(2,3);const two=Number(s.bar.getAttribute('aria-valuenow'));assert.ok(two>=66&&two<100);
 assert.match(s.bar.firstElementChild.style.transform??s.bar.firstElementChild.getAttribute('style'),/scaleX\(0\.6\d*\)/);
 // Only transform is written, and only when the whole percent changes.
 const fill=s.bar.firstElementChild;let writes=0;const style=fill.style;
 const original=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(style),'transform')??null;
 let value=style.transform;Object.defineProperty(style,'transform',{configurable:true,get:()=>value,set:v=>{writes++;value=v;}});
 s.opening.progress(2,3);s.opening.progress(2,3);assert.equal(writes,0,'same value: no write');
 if(original)delete style.transform;
 // A long wait shows the way back to the title.
 s.advance(PREP_BACK_AFTER_MS);assert.equal(back.hidden,false);
 // The wait ends: the bar stays (no buttons) until release, at 100 %.
 s.opening.preparation({hold:true});assert.equal(s.prep.hidden,false);assert.equal(back.hidden,true);assert.equal(back.onclick,null);
 s.opening.progress(3,3);assert.equal(s.bar.getAttribute('aria-valuenow'),'100');
 s.opening.cancel();assert.equal(s.prep.hidden,true);assert.equal(s.ticks.size,0,'the easing timer stops');
});

test('a failure still explains itself with retry and back; hold does not show a hidden bar',()=>{
 const s=prepStage();
 s.opening.preparation({hold:true});assert.equal(s.prep.hidden,true,'never shown: stays hidden');
 s.opening.preparation({failed:true,onRetry:()=>{},onBack:()=>{}});
 assert.equal(s.bar.hidden,true);assert.equal(shownText(s.prep),t('opening.castFailed'));
 assert.equal(s.prep.querySelector('button').hidden,false);assert.equal(s.prep.lastElementChild.hidden,false);
 assert.equal(s.ticks.size,0);
 s.opening.preparation();assert.equal(s.prep.hidden,true);
});

test('the hold is one constant, 0.6 s',()=>{
 assert.equal(DIALOGUE_MIN_HOLD,.6);
 assert.equal(holding(0,590),true);assert.equal(holding(0,610),false);
});

function talkStage({typing=false}={}){
 const {document,window}=dom();let time=0,pending=false;
 const typewriter={start(node,text){if(typing){node.textContent=text.slice(0,1);pending=text;}else node.textContent=text;return Promise.resolve();},
  complete(){if(!pending)return false;document.querySelector('.v03-dialogue-text').textContent=pending;pending=false;return true;},stop(){pending=false;},get typing(){return !!pending;}};
 const dialogue=createDialogue({doc:document,blip:null,typewriter,now:()=>time,trusted,later:fn=>{fn();return ()=>{};}});
 const press=code=>{const e=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'code',{value:code});Object.defineProperty(e,'repeat',{value:false});document.dispatchEvent(e);};
 const text=()=>document.querySelector('.v03-dialogue-text').textContent;
 return {document,window,dialogue,press,text,at(ms){time=ms;},get time(){return time;}};
}
const LINES=[{who:'마부',text:'첫 줄'},{who:'제프리',text:'둘째 줄'},{who:'나',text:'셋째 줄'}];

test('NPC talk: a press before 0.6 s never moves on; after it, it does (click, box, keys)',async()=>{
 const s=talkStage();const done=s.dialogue.play(LINES);
 const next=s.document.querySelector('.v03-dialogue-next'),box=s.document.querySelector('.v03-dialogue-box');
 s.at(100);next.click();s.press('KeyE');s.press('Space');s.press('Enter');box.dispatchEvent(new s.window.Event('click'));
 s.at(590);next.click();s.press('KeyE');
 assert.equal(s.text(),'첫 줄','mashed inside 0.59 s: still the first line');
 s.at(610);s.press('KeyE');assert.equal(s.text(),'둘째 줄');
 // The hold restarts with each line.
 s.at(1200);next.click();assert.equal(s.text(),'둘째 줄');
 s.at(1211);s.press('Enter');assert.equal(s.text(),'셋째 줄');
 // The last line closes only after its hold too.
 s.at(1500);next.click();assert.equal(s.dialogue.open,true);
 s.at(1811);next.click();assert.equal(s.dialogue.open,false);
 assert.equal((await done).length,3);
});

test('NPC talk: inside the hold a press still completes a typing line',()=>{
 const s=talkStage({typing:true});s.dialogue.play(LINES);
 s.at(50);s.press('KeyE');assert.equal(s.text(),'첫 줄','completed');
 s.at(300);s.press('KeyE');assert.equal(s.text(),'첫 줄','not moved on');
 s.at(600);s.press('KeyE');assert.equal(s.text(),'둘','next line typing');
});

test('choices: no pick inside 0.6 s (click, keys, Escape), a pick after it',async()=>{
 const s=talkStage();
 const picked=s.dialogue.choose([{id:'talk',label:'대화하기'},{id:'leave',label:'대화 종료'}],{who:'대장장이',line:'왔구나.'});
 const entries=()=>[...s.document.querySelectorAll('.v03-dialogue-choice')];
 s.at(300);entries()[0].click();s.press('KeyE');s.press('Escape');
 s.at(590);entries()[1].click();
 assert.equal(s.dialogue.open,true);assert.equal(entries().length,2);
 s.at(610);entries()[1].click();
 assert.equal(await picked,'leave');
});

test('synthetic input (scripts, older tests) is not held back',()=>{
 const {document}=dom();let time=0;
 const typewriter={start(node,text){node.textContent=text;return Promise.resolve();},complete:()=>false,stop(){},typing:false};
 const dialogue=createDialogue({doc:document,blip:null,typewriter,now:()=>time,later:fn=>{fn();return ()=>{};}});
 dialogue.play(LINES);document.querySelector('.v03-dialogue-next').click();
 assert.equal(document.querySelector('.v03-dialogue-text').textContent,'둘째 줄');
});

function manualClock(){
 let time=0,queue=[],seq=0;
 return {now:()=>time,schedule:(fn,ms)=>{const id=++seq;queue.push({id,at:time+ms,fn});return id;},cancel:id=>{queue=queue.filter(j=>j.id!==id);},
  advance(ms){const end=time+ms;for(;;){queue.sort((a,b)=>a.at-b.at);const j=queue[0];if(!j||j.at>end)break;queue.shift();time=j.at;j.fn();}time=end;},set(ms){time=ms;}};
}

test('prologue captions: once whole, a tap before 0.6 s keeps the caption; after it, moves on',async()=>{
 const {document,window}=dom(),c=manualClock(),pending=[];
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});
 const opening=createOpening({doc:document,blip:null,typewriter:tw,typing:()=>true,now:c.now,trusted,wait:()=>new Promise(r=>pending.push(r))});
 const line=document.querySelector('.v03-opening-line'),layer=line.parentNode;
 const untilTyping=async limit=>{let n=0;await tick();while(!tw.typing&&n<limit){pending.shift()?.();n++;await tick();await tick();}return n;};
 const played=opening.play();
 await untilTyping(100);assert.equal(tw.typing,true);const shownAt=c.now();const first=line.textContent;
 const tap=()=>layer.dispatchEvent(new window.Event('click'));
 tap();assert.equal(tw.typing,false,'a tap inside the hold still completes the caption');
 c.set(shownAt+590);tap();
 const held=await untilTyping(5);assert.equal(tw.typing,false,'0.59 s: no next caption ('+held+' steps)');assert.equal(line.textContent,first);
 c.set(shownAt+610);tap();
 const steps=await untilTyping(100);assert.ok(steps<=2,'0.61 s: the next caption at once, took '+steps);assert.notEqual(line.textContent,first);
 document.querySelector('.v03-opening-skip').dispatchEvent(new window.Event('click'));
 const drain=setInterval(()=>{while(pending.length)pending.shift()();tw.complete();},1);
 assert.equal(await played,'skipped');clearInterval(drain);
});

function fakeAudio({start='running'}={}){
 const made={osc:0,contexts:0,pitches:[],resumes:0,allow:true};
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},gain:param()});
 const factory=()=>{made.contexts++;const ctx={state:start,currentTime:0,destination:{},createGain:node,
  createOscillator(){made.osc++;const osc={...node(),type:'',frequency:param(),detune:param(),start(){made.pitches.push(osc.frequency.value);},stop(){this.onended?.();},onended:null};return osc;},
  resume(){made.resumes++;if(made.allow)ctx.state='running';return Promise.resolve();}};made.ctx=ctx;return ctx;};
 return {made,factory};
}

test('dot sound: every speaker (and the prologue captions) speaks with Jeffrey\'s voice',()=>{
 assert.equal(SHARED_VOICE,'제프리');
 resetTextBlip();const {made,factory}=fakeAudio();
 const blip=createTextBlip({view:{},contextFactory:factory,random:()=>.5,isEnabled:()=>true});
 const speakers=[...new Set(Object.values(DIALOGUES).flat().map(line=>line?.who).filter(Boolean))];
 assert.ok(speakers.length>=5,'chapter one has several speakers');
 for(const who of [...speakers,null,'']){made.ctx&&(made.ctx.currentTime+=.1);assert.equal(blip.play(who),true);}
 assert.equal(new Set(made.pitches).size,1,'one pitch for all');assert.equal(made.pitches[0],voicePitch('제프리'));
 // The per-speaker map is still there (one line to bring it back).
 assert.notEqual(voicePitch('마부'),voicePitch('나'));assert.equal(voiceFor('마부'),'제프리');
 resetTextBlip();
});

test('first prologue caption: the blip audio is started with the dream, so its first character sounds',async()=>{
 resetTextBlip();const {made,factory}=fakeAudio({start:'suspended'});
 const {document}=dom(),c=manualClock(),pending=[];
 const blip=createTextBlip({view:{},contextFactory:factory,random:()=>.9,isEnabled:()=>true});
 const sounded=[];
 const tw=createTypewriter({doc:document,enabled:()=>true,...c,onChar:(ch,count,who)=>{made.ctx&&(made.ctx.currentTime+=.1);sounded.push(blip.onChar(ch,count,who));}});
 const opening=createOpening({doc:document,blip,typewriter:tw,typing:()=>true,now:c.now,wait:()=>new Promise(r=>pending.push(r))});
 const played=opening.play();
 assert.equal(made.contexts,1,'context made when the dream starts');assert.ok(made.resumes>=1,'and resumed then');
 await tick();assert.equal(made.ctx.state,'running');
 let n=0;while(!tw.typing&&n++<100){pending.shift()?.();await tick();await tick();}
 c.advance(2000);
 assert.equal(sounded[0],true,'the first visible character of the first caption sounds');
 tw.complete();document.querySelector('.v03-opening-skip').dispatchEvent(new document.defaultView.Event('click'));
 const drain=setInterval(()=>{while(pending.length)pending.shift()();},1);await played;clearInterval(drain);
 resetTextBlip();
});

test('first gesture: a non-activating touch pointerdown no longer drops the listeners; the touchend starts the sound',async()=>{
 resetTextBlip();const {made,factory}=fakeAudio({start:'suspended'});
 const listeners=new Map();
 const view={addEventListener(kind,fn){listeners.set(kind,fn);},removeEventListener(kind){listeners.delete(kind);},location:{search:''},localStorage:{getItem:()=>null}};
 createTextBlip({view,contextFactory:factory,isEnabled:()=>true});
 for(const kind of ['pointerdown','pointerup','touchend','click','keydown'])assert.ok(listeners.has(kind),kind);
 // pointerdown on a touch screen: not a user activation, resume() does not start it.
 made.allow=false;listeners.get('pointerdown')();await tick();
 assert.equal(made.contexts,1);assert.equal(made.ctx.state,'suspended');assert.ok(listeners.size>0,'still listening');
 made.allow=true;listeners.get('touchend')();await tick();
 assert.equal(made.ctx.state,'running');assert.equal(listeners.size,0,'gone once it runs');
 delete view.__v03BlipArmed;resetTextBlip();
});
