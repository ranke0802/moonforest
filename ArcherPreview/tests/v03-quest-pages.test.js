// 2026-11-27, user: "선택의뢰가 다건 수령 가능한데 보이는건 마지막에 받은거 하나 밖에 없음.
// 옆으로 넘기는 터치 시 퀘스트가 옆으로 슬라이드 되며 받은 퀘스트 보여주기. 현재 진행 중인
// 선택의뢰 개수 간결하게 보여주기." The quest panel as pages: main, then each errand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createQuestPager,PAGE_KEYS,SWIPE_PX} from '../src/v03/quest-pages.js';
import {createPlayHud} from '../src/v03/play-hud.js';
import {createStory} from '../src/v03/story.js';
import {QUESTS,NPCS,DIALOGUES,ERRANDS} from '../src/v03/data/chapter1.js';
import {setPack} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';
import en from '../src/v03/locales/en.js';
import ja from '../src/v03/locales/ja.js';
import vi from '../src/v03/locales/vi.js';
import zh from '../src/v03/locales/zh.js';

const css=readFileSync(new URL('../src/v03/v03.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const THREE=[{id:'S01',title:'울타리 밖 발자국',step:'대평원에서 짐승 두 마리 쫓아내기 (0/2)'},{id:'S02',title:'물약 한 병',step:'약초사에게서 회복약 한 병 조제하기'},{id:'S04',title:'무딘 날',step:'대장장이 작업대에서 검을 한 번 단련하기'}];
function pager(){
 setPack('ko',ko);
 const {document,window}=parseHTML('<html><body><section class="v03-quest"></section></body></html>');
 const host=document.querySelector('.v03-quest'),main=document.createElement('div');main.textContent='메인';
 const picked=[],p=createQuestPager({doc:document,host,mainPage:main,onPage:id=>picked.push(id)});
 // Every write of the strip's transform is counted.
 const track=host.querySelector('.v03-quest-track'),writes=[];
 let value='';const style={get transform(){return value;},set transform(v){writes.push(v);value=v;}};
 Object.defineProperty(track,'style',{configurable:true,value:style});
 const key=(code,extra={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'code',{value:code});for(const [k,v] of Object.entries(extra))Object.defineProperty(event,k,{value:v});document.dispatchEvent(event);return event;};
 const pointer=(type,x,y=0,{id=1,kind='touch'}={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});for(const [k,v] of Object.entries({clientX:x,clientY:y,pointerId:id,pointerType:kind}))Object.defineProperty(event,k,{value:v});host.querySelector('.v03-quest-pages').dispatchEvent(event);return event;};
 const $=selector=>host.querySelector(selector);
 return {document,window,host,main,p,picked,writes,track,key,pointer,$,dots:()=>[...host.querySelectorAll('.v03-quest-dot')].map(dot=>dot.classList.contains('is-on')?'●':'○').join('')};
}

test('no errand: only the main page, no count line; errands: a page each in the given order and a short count',()=>{
 const f=pager();
 assert.equal(f.p.set([],null),null);
 assert.equal(f.$('.v03-quest-pager').hidden,true);assert.equal(f.host.classList.contains('has-pages'),false);
 assert.deepEqual([...f.track.children],[f.main]);
 assert.equal(f.p.set(THREE,null),null);
 assert.equal(f.$('.v03-quest-pager').hidden,false);assert.ok(f.host.classList.contains('has-pages'));
 assert.equal(f.$('.v03-quest-count').textContent,'선택 의뢰 3');assert.equal(f.dots(),'●○○○');
 assert.deepEqual([...f.track.children].map(node=>node.dataset.page??'main'),['main','S01','S02','S04']);
 assert.deepEqual([...f.host.querySelectorAll('.v03-errand-title')].map(node=>node.textContent),THREE.map(row=>row.title));
 assert.equal(f.$('.v03-quest-turn.is-prev').disabled,true);assert.equal(f.$('.v03-quest-turn.is-next').disabled,false);
 assert.equal(f.$('.v03-quest-pager').getAttribute('aria-label'),'의뢰 1/4쪽');
 assert.equal(f.main.getAttribute('aria-hidden'),'false');assert.equal(f.host.querySelector('[data-page=S01]').getAttribute('aria-hidden'),'true');
 // One errand: count 1, two dots.
 f.p.set(THREE.slice(0,1),null);assert.equal(f.$('.v03-quest-count').textContent,'선택 의뢰 1');assert.equal(f.dots(),'●○');
 f.p.dispose();
});

test('arrows and [ ] turn pages without wrapping and tell the owner the page id; the strip moves by transform only',()=>{
 const f=pager();f.p.set(THREE,null);
 assert.equal(f.writes.at(-1),'translate3d(0%,0,0)');
 f.$('.v03-quest-turn.is-next').click();assert.deepEqual(f.picked,['S01']);assert.equal(f.writes.at(-1),'translate3d(-100%,0,0)');assert.equal(f.dots(),'○●○○');
 assert.equal(f.key(PAGE_KEYS.next).defaultPrevented,true);assert.deepEqual(f.picked,['S01','S02']);assert.equal(f.p.page,'S02');
 f.key(PAGE_KEYS.next);f.key(PAGE_KEYS.next);assert.deepEqual(f.picked,['S01','S02','S04'],'stays on the last page');
 assert.equal(f.$('.v03-quest-turn.is-next').disabled,true);
 f.key(PAGE_KEYS.prev);f.key(PAGE_KEYS.prev);f.key(PAGE_KEYS.prev);f.key(PAGE_KEYS.prev);
 assert.deepEqual(f.picked,['S01','S02','S04','S02','S01',null]);assert.equal(f.p.page,null);
 assert.deepEqual([PAGE_KEYS.prev,PAGE_KEYS.next],['BracketLeft','BracketRight']);
 // Not while talking, with a dialog open, with modifiers or repeats, or without errands.
 const before=f.picked.length;
 f.document.documentElement.dataset.v03Talk='';f.key(PAGE_KEYS.next);delete f.document.documentElement.dataset.v03Talk;
 f.key(PAGE_KEYS.next,{ctrlKey:true});f.key(PAGE_KEYS.next,{repeat:true});
 const dialog=f.document.createElement('dialog');dialog.setAttribute('open','');f.document.body.append(dialog);f.key(PAGE_KEYS.next);dialog.remove();
 assert.equal(f.picked.length,before);
 f.p.set([],null);f.key(PAGE_KEYS.next);assert.equal(f.picked.length,before);
 f.p.dispose();
});

test('the same values write nothing; text is written only when it changes; a changed step pulses its page',()=>{
 const f=pager();f.p.set(THREE,'S02');
 const writes=f.writes.length,title=f.host.querySelector('[data-page=S02] .v03-errand-title');
 let titleWrites=0;const proto=Object.getPrototypeOf(title),text=Object.getOwnPropertyDescriptor(proto,'textContent')??Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto),'textContent');
 Object.defineProperty(title,'textContent',{configurable:true,get(){return text.get.call(this);},set(v){titleWrites++;text.set.call(this,v);}});
 for(let i=0;i<5;i++)assert.equal(f.p.set(THREE.map(row=>({...row})),'S02'),'S02');
 assert.equal(f.writes.length,writes,'no transform write');assert.equal(titleWrites,0,'no text write');
 const next=THREE.map(row=>row.id==='S01'?{...row,step:'대평원에서 짐승 두 마리 쫓아내기 (1/2)'}:row);
 f.p.set(next,'S02');assert.ok(f.host.querySelector('[data-page=S01]').classList.contains('is-updated'));assert.equal(titleWrites,0);
 assert.equal(f.host.querySelector('[data-page=S01] .v03-errand-step').textContent,'대평원에서 짐승 두 마리 쫓아내기 (1/2)');
 // A selected id that is gone shows main; a removed page leaves the strip.
 assert.equal(f.p.set(THREE.filter(row=>row.id!=='S02'),'S02'),null);assert.equal(f.host.querySelector('[data-page=S02]'),null);assert.equal(f.writes.at(-1),'translate3d(0%,0,0)');
 f.p.dispose();
});

test('touch: a sideways swipe slides to the next page, a short or upright one does not, the mouse never drags',()=>{
 const f=pager();f.p.set(THREE,null);
 // Following the finger (the transform is written from pointer events, not frames).
 f.pointer('pointerdown',200,50);f.pointer('pointermove',190,51);
 assert.equal(f.track.classList.contains('is-dragging'),true);assert.equal(f.writes.at(-1),'translate3d(0%,0,0) translateX(-10px)');
 f.pointer('pointermove',150,52);f.pointer('pointerup',150,52);
 assert.deepEqual(f.picked,['S01']);assert.equal(f.writes.at(-1),'translate3d(-100%,0,0)');assert.equal(f.track.classList.contains('is-dragging'),false);
 // Back with a swipe to the right.
 f.pointer('pointerdown',100,50);f.pointer('pointermove',100+SWIPE_PX+4,50);f.pointer('pointerup',100+SWIPE_PX+4,50);assert.deepEqual(f.picked,['S01',null]);
 // Too short: springs back.
 f.pointer('pointerdown',200,50);f.pointer('pointermove',180,50);f.pointer('pointerup',180,50);assert.deepEqual(f.picked,['S01',null]);assert.equal(f.writes.at(-1),'translate3d(0%,0,0)');
 // Mostly up or down: not a page turn.
 f.pointer('pointerdown',200,50);f.pointer('pointermove',195,10);f.pointer('pointermove',120,0);f.pointer('pointerup',120,0);assert.deepEqual(f.picked,['S01',null]);
 // A cancelled touch, and the mouse.
 f.pointer('pointerdown',200,50);f.pointer('pointermove',100,50);f.pointer('pointercancel',100,50);assert.deepEqual(f.picked,['S01',null]);
 f.pointer('pointerdown',200,50,{kind:'mouse'});f.pointer('pointermove',100,50,{kind:'mouse'});f.pointer('pointerup',100,50,{kind:'mouse'});assert.deepEqual(f.picked,['S01',null]);
 // Past the first page the strip gives only a little.
 f.pointer('pointerdown',100,50);f.pointer('pointermove',200,50);assert.equal(f.writes.at(-1),'translate3d(0%,0,0) translateX(30px)');f.pointer('pointerup',200,50);assert.deepEqual(f.picked,['S01',null]);
 f.p.dispose();
});

test('a new errand only lights the count; CSS: transform transition, reduced motion at once, 44 px arrows, 12/13 px text',()=>{
 const f=pager();f.p.set(THREE,null);f.p.pulse();assert.ok(f.$('.v03-quest-count').classList.contains('is-new'));assert.equal(f.p.page,null);f.p.dispose();
 assert.match(css,/\.v03-quest-track\{[^}]*transition:transform [^}]*\}/);
 assert.match(css,/html\[data-mf-motion="reduce"\] \.v03-quest-track\{transition:none\}/);
 assert.match(css,/\.v03-quest-turn\{[^}]*width:24px;height:24px/);assert.match(css,/\.v03-quest-turn::before\{content:'';position:absolute;inset:-10px\}/,'24 + 2×10 = 44 px to press');
 assert.match(css,/\.v03-quest-pager\{[^}]*font-size:12px/);assert.match(css,/@media \(pointer:coarse\)\{\.v03-quest-pager\{font-size:13px\}\}/);
 assert.match(css,/\.v03-quest-pager\[hidden\]\{display:none\}/);
 // The strip's own rules animate only transform/opacity.
 for(const [,body] of css.matchAll(/@keyframes v03-count-new[^{]*\{((?:[^{}]*\{[^}]*\})*)\}/g))assert.doesNotMatch(body,/(?:^|[;{])\s*(?!transform|opacity)[a-z-]+\s*:/,'count pulse: transform/opacity only');
});

test('every language has the count and the page label',()=>{
 for(const pack of [ko,en,ja,vi,zh]){assert.ok(pack.ui['hud.errandCount'].includes('{n}'));assert.ok(pack.ui['hud.questPage'].includes('{n}')&&pack.ui['hud.questPage'].includes('{total}'));}
});

// ----- the story keeps the page per record -----
function village({active={},page,finished=[]}={}){
 setPack('ko',ko);
 const {document}=parseHTML('<html><body><main id="app"></main></body></html>');
 const values=new Map(),journey={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 journey.setItem('v03-story-v1',JSON.stringify({v:2,id:'M07',quest:QUESTS.findIndex(quest=>quest.id==='M07'),step:0,count:0,done:[]}));
 journey.setItem('v03-errands-v1',JSON.stringify({active,finished}));
 if(page!==undefined)journey.setItem('v03-quest-page-v1',page);
 const player={position:{x:0,z:0}};
 const world={scene:{isDisposed:false},mapId:'village',terrain:{heightAt:()=>0},navigation:{free:()=>true,path:()=>null}};
 const api={world,battle:{encounters:[],combatCount:0},input:{setSuspended(){}},getPlayer:()=>player,getController:()=>null,creditGold:(_s,n)=>n,addPotions:n=>n,toast(){},itemCount:()=>0};
 const story=createStory({api,doc:document,save:{journey,touch:()=>true},content:{QUESTS,NPCS,DIALOGUES,ERRANDS},createVisual:()=>({place(x,y,z){this.position={x,y,z};},dispose(){}})});
 story.start();
 return {document,story,values,player,$:selector=>document.querySelector(selector),pages:()=>[...document.querySelectorAll('.v03-quest-page')].map(node=>node.dataset.page??'main')};
}

test('story: pages in the order taken, the stored page comes back, a finished or unknown id is main',()=>{
 const v=village({active:{S04:{step:0,count:0},S01:{step:0,count:1},S02:{step:1,count:0}},page:'S01'});
 try{
  assert.deepEqual(v.pages(),['main','S04','S01','S02'],'accepted order, not definition order');
  assert.equal(v.story.questPage,'S01');assert.equal(v.$('.v03-quest-count').textContent,'선택 의뢰 3');
  assert.equal(v.$('.v03-quest-track').style.transform,'translate3d(-200%,0,0)');
  assert.equal(v.$('[data-page=S01] .v03-errand-step').textContent,'대평원에서 짐승 두 마리 쫓아내기 (1/2)');
  // Turning stores the id (never translated text).
  v.$('.v03-quest-turn.is-next').click();assert.equal(v.story.questPage,'S02');assert.equal(v.values.get('v03-quest-page-v1'),'S02');
  v.$('.v03-quest-turn.is-prev').click();v.$('.v03-quest-turn.is-prev').click();v.$('.v03-quest-turn.is-prev').click();
  assert.equal(v.story.questPage,null);assert.equal(v.values.has('v03-quest-page-v1'),false,'main is the default: nothing stored');
 }finally{v.story.dispose();}
 for(const page of ['S03','S05','nope','']){
  const w=village({active:{S01:{step:0,count:0}},page,finished:['S05']});
  try{assert.equal(w.story.questPage,null,page);assert.equal(w.$('.v03-quest-track').style.transform,'translate3d(0%,0,0)');}finally{w.story.dispose();}
 }
});

const tick=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(resolve=>setTimeout(resolve,0));};
async function talkTo(v,id){
 const frame=()=>v.story.update(1/60,{ready:true,mapId:'village',character:'warrior-v3'});
 frame();const at=v.story.castVisual(id).position;v.player.position.x=at.x;v.player.position.z=at.z;frame();
 v.$('.v03-prompt').click();await tick();
 for(let i=0;i<40&&v.story.dialogueOpen;i++){v.$('.v03-dialogue-next').click();await tick(1);}
 await tick();frame();
}
test('story: taking a new errand keeps the page and lights the count; finishing the shown one returns to main',async()=>{
 const v=village({active:{S01:{step:0,count:1}},page:'S01'});
 try{
  // The herbalist offers hers (no shop in this harness: she talks at once).
  await talkTo(v,'herbalist');
  assert.deepEqual(v.pages(),['main','S01','S02']);assert.equal(v.story.questPage,'S01','the page does not jump to the new errand');
  assert.ok(v.$('.v03-quest-count').classList.contains('is-new'));assert.equal(v.$('.v03-quest-count').textContent,'선택 의뢰 2');
  // The last beast on the plains, then the report to Jeffrey (the youth).
  v.story.update(1/60,{ready:true,mapId:'great-plains',character:'warrior-plains'});v.story.defeat({kind:'wolf'});
  assert.equal(v.$('[data-page=S01] .v03-errand-step').textContent,'제프리에게 알리기');assert.equal(v.story.questPage,'S01');
  await talkTo(v,'youth');
  assert.equal(v.story.questPage,null,'back on the main page');assert.deepEqual(v.pages(),['main','S02']);
  assert.equal(v.values.has('v03-quest-page-v1'),false);
 }finally{v.story.dispose();}
});
