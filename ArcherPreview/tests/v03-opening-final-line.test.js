// 2026-11-28 10:09 user: "마지막 그 아이를 찾아라 이것만은 2초간 유지 어때? 건너뛰기 해도 / 빠르게 출력 안되게하고."
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createOpening,FINAL_HOLD_MS,TYPE_PACE,TYPE_DELAY_MS,DREAM_BEATS} from '../src/v03/opening.js';
import {createTypewriter,typingMs} from '../src/v03/typewriter.js';
import {t} from '../src/v03/i18n.js';

const tick=()=>new Promise(r=>setImmediate(r));
function manualClock(){
 let time=0,queue=[],seq=0;
 return {now:()=>time,schedule:(fn,ms)=>{const id=++seq;queue.push({id,at:time+ms,fn});return id;},cancel:id=>{queue=queue.filter(j=>j.id!==id);},
  advance(ms){const end=time+ms;for(;;){queue.sort((a,b)=>a.at-b.at);const j=queue[0];if(!j||j.at>end)break;queue.shift();time=j.at;j.fn();}time=end;}};
}
function stage(){
 const {document,window}=parseHTML('<html><body></body></html>'),c=manualClock(),pending=[],waited=[];
 const tw=createTypewriter({doc:document,enabled:()=>true,...c});
 const opening=createOpening({doc:document,blip:null,typewriter:tw,typing:()=>true,now:c.now,trusted:()=>true,wait:ms=>new Promise(r=>{waited.push(ms);pending.push(r);})});
 const line=document.querySelector('.v03-opening-line');
 return {document,window,c,pending,waited,tw,opening,line,layer:line.parentNode,skip:document.querySelector('.v03-opening-skip')};
}
const lastKey=DREAM_BEATS[DREAM_BEATS.length-1].key;

test('the last dream line is "그 아이를 찾아라"',()=>{
 assert.equal(lastKey,'opening.4');assert.match(t(lastKey),/그 아이를 찾아라/);assert.equal(FINAL_HOLD_MS,2000);
});

test('a skip still types the last words at the caption pace, taps cannot hurry them, and they stay 2 s',async()=>{
 const s=stage(),played=s.opening.play();
 await tick();s.pending.shift()?.();await tick();
 s.skip.dispatchEvent(new s.window.Event('click'));
 let n=0;while(!s.tw.typing&&n<60){s.pending.shift()?.();n++;await tick();await tick();}
 assert.equal(s.tw.typing,true,'the last words start typing after the skip');assert.equal(s.skip.hidden,true,'the skip button goes once used');
 s.layer.dispatchEvent(new s.window.Event('click'));
 s.document.dispatchEvent(Object.assign(new s.window.Event('keydown'),{code:'Enter'}));
 assert.equal(s.tw.typing,true,'a tap or Enter does not print it at once');
 s.waited.length=0;s.c.advance(TYPE_DELAY_MS+typingMs(t(lastKey),TYPE_PACE)+50);await tick();
 assert.equal(s.tw.typing,false);assert.equal(s.line.textContent,t(lastKey));
 let settled=false;played.then(()=>{settled=true;});
 for(let i=0;i<100&&!settled;i++){s.layer.dispatchEvent(new s.window.Event('click'));s.pending.shift()?.();await tick();await tick();}
 assert.equal(await played,'skipped');
 const held=s.waited.reduce((a,b)=>a+b,0);
 assert.ok(held>=FINAL_HOLD_MS&&held<=FINAL_HOLD_MS+100,'kept '+held+' ms although tapped');
});

test('a skip while the last words are already typing lets them finish and keeps them 2 s in all',async()=>{
 const s=stage(),played=s.opening.play();
 // Run the dream (without skipping) to the last caption.
 let n=0;const atLast=()=>s.tw.typing&&s.layer.dataset.tone===DREAM_BEATS[DREAM_BEATS.length-1].tone;
 while(!atLast()&&n<2000){s.pending.shift()?.();s.c.advance(100);n++;await tick();}
 assert.ok(atLast(),'reached the last caption');
 s.skip.dispatchEvent(new s.window.Event('click'));
 assert.equal(s.tw.typing,true,'the skip does not cut the last words');
 s.waited.length=0;s.c.advance(TYPE_DELAY_MS+typingMs(t(lastKey),TYPE_PACE)+50);await tick();
 assert.equal(s.line.textContent,t(lastKey));
 let settled=false;played.then(()=>{settled=true;});
 for(let i=0;i<100&&!settled;i++){s.pending.shift()?.();await tick();await tick();}
 assert.equal(await played,'skipped');
 const held=s.waited.reduce((a,b)=>a+b,0);
 assert.ok(held>=FINAL_HOLD_MS-100&&held<=FINAL_HOLD_MS+100,'kept '+held+' ms');
});
