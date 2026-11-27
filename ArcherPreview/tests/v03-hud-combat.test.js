// 2026-11-27 player review (844×390 UI 7/10): "좌측에 체력·낮은 스태미나·퀘스트·타격 숫자가
// 모이면 전투 중 한 번에 보기 어렵다", "중요한 상호작용이 전투에 막혔을 때 목적 근처에 이유가
// 보이면 훨씬 편하다", "844×390에서 상점 목록은 세로 스크롤이 필요했다".
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createPlayHud,COMBAT_CALM} from '../src/v03/play-hud.js';
import {writeStep} from '../src/v03/quest-pages.js';
import {createDamageKeepOut} from '../src/v03/damage-keep-out.js';
import {createDamageNumbers} from '../src/damage-numbers.js';
import {setPack,t} from '../src/v03/i18n.js';
import ko from '../src/v03/locales/ko.js';

const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function hud(){
 setPack('ko',ko);
 const {document,window}=parseHTML('<html><body><main id="app" data-hud-input="touch"><button id="attack-button"></button></main></body></html>');
 const acted=[];const h=createPlayHud({doc:document,onInteract:()=>acted.push(1)});
 return {document,window,h,acted};
}

test('a fight folds the quest panel at once and opens it after a calm; the attribute is written only on a change',()=>{
 const {document,h}=hud(),html=document.documentElement;
 h.setQuest('마물의 숲','숲의 두 야영지에서 고블린 물리치기 (2/5)');
 assert.equal('v03Combat' in html.dataset,false);
 h.setCombat(true,1/60);assert.equal(html.dataset.v03Combat,'');assert.equal(h.combat,true);
 // A rewrite would reset this marker: frames while engaged write nothing.
 html.dataset.v03Combat='kept';
 for(let i=0;i<120;i++)h.setCombat(true,1/60);
 assert.equal(html.dataset.v03Combat,'kept');
 // A short lull between two foes keeps it folded; a new blow restarts the calm.
 h.setCombat(false,COMBAT_CALM*.6);assert.equal(html.dataset.v03Combat,'kept');
 h.setCombat(true,1/60);h.setCombat(false,COMBAT_CALM*.6);assert.equal(html.dataset.v03Combat,'kept');
 h.setCombat(false,COMBAT_CALM*.5);assert.equal('v03Combat' in html.dataset,false);assert.equal(h.combat,false);
 // Calm frames after it opened write nothing either.
 html.dataset.other='x';for(let i=0;i<60;i++)h.setCombat(false,1/60);assert.equal('v03Combat' in html.dataset,false);
 h.setCombat(true,0);h.dispose();assert.equal('v03Combat' in html.dataset,false,'disposing the HUD lets go of the fold');
});

test('the objective keeps its text; the count sits in its own span so a folded line never cuts it',()=>{
 const {document}=parseHTML('<p></p>'),p=document.querySelector('p');
 writeStep(p,'숲의 두 야영지에서 고블린 물리치기 (2/5)');
 assert.equal(p.textContent,'숲의 두 야영지에서 고블린 물리치기 (2/5)');
 assert.equal(p.querySelector('.v03-step-count').textContent,' (2/5)');
 writeStep(p,'약초사에게서 회복약 한 병 조제하기');assert.equal(p.textContent,'약초사에게서 회복약 한 병 조제하기');assert.equal(p.children.length,0);
 writeStep(p,null);assert.equal(p.textContent,'');
 const css=read('v03/v03.css');
 assert.match(css,/html\[data-v03-combat\] \.v03-quest :is\(\.v03-quest-pager,\.v03-quest-kicker,\.v03-quest-title,\.v03-errand-title\)\{display:none\}/);
 assert.match(css,/html\[data-v03-combat\] \.v03-quest \.v03-step-count\{flex:none;white-space:pre/);
 // The fold's motion is opacity and transform only, and none with reduced motion.
 const frames=css.match(/@keyframes v03-quest-open\{([^@]*?)\}\}/)[1];
 for(const prop of frames.match(/[a-z-]+(?=:)/g))assert.ok(['opacity','transform'].includes(prop),prop);
 assert.match(css,/html\[data-mf-motion="reduce"\] \.v03-quest\{animation:none!important\}/);
});

test('a target held by a fight: the plate reads as shut, a press does nothing, the reason sits under the objective',()=>{
 const {document,window,h,acted}=hud(),prompt=document.querySelector('.v03-prompt'),held=document.querySelector('.v03-quest-held'),attack=document.getElementById('attack-button');
 window.matchMedia=()=>({matches:true});
 h.setQuest('마물의 숲','흔적 살펴보기');
 h.setPrompt({key:null,name:'검',action:t('prompt.clearFoes'),mark:null,label:t('prompt.clearFoes'),blocked:true});
 assert.ok(prompt.classList.contains('is-blocked'));assert.equal(prompt.getAttribute('aria-disabled'),'true');
 assert.equal(held.hidden,false);assert.equal(held.textContent,'주변의 적을 먼저 물리치세요');
 assert.equal(attack.classList.contains('v03-interact'),false,'the attack button stays the attack: fighting is what opens it');
 prompt.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));assert.equal(acted.length,0);
 // The fight is over: the ordinary prompt comes back and works.
 h.setPrompt({key:null,name:'검',action:'살펴보기',mark:null,label:'검 살펴보기',act:'talk'});
 assert.equal(prompt.classList.contains('is-blocked'),false);assert.equal(prompt.hasAttribute('aria-disabled'),false);assert.equal(held.hidden,true);
 assert.equal(attack.classList.contains('v03-interact'),true);
 prompt.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));assert.equal(acted.length,1);
 h.setPrompt({key:null,name:'검',action:t('prompt.clearFoes'),mark:null,blocked:true});h.setPrompt(null);assert.equal(held.hidden,true);
 const css=read('v03/v03.css');
 assert.match(css,/\.v03-prompt\.is-blocked\{cursor:not-allowed\}/);
 assert.match(css,/\.v03-quest-held\[hidden\]\{display:none!important\}/);
 h.dispose();
});

function keepOutDoc(boxes){
 let reads=0,queries=0;
 const nodes=Object.fromEntries(Object.entries(boxes).map(([selector,[left,top,right,bottom]])=>[selector,{isConnected:true,hidden:false,id:selector.startsWith('#')?selector.slice(1):'',dataset:{hud:'fixed'},getBoundingClientRect(){reads++;return {left,top,right,bottom,width:right-left,height:bottom-top};}}]));
 const win={innerWidth:844,innerHeight:390,addEventListener(){},removeEventListener(){}};
 const doc={defaultView:win,querySelector(selector){queries++;return nodes[selector]??null;}};
 return {doc,nodes,get reads(){return reads;},get queries(){return queries;}};
}

test('hit numbers keep out of the HUD corners; boxes are measured on change, never in the frame',()=>{
 let clock=0;
 const page=keepOutDoc({'#player-hud':[47,21,223,42],'#gold-balance':[46,47,92,60],'.v03-quest':[18,74,266,101],'#boss-hud':[344,87,552,107],'#dot-minimap':[724,49,816,163]});
 const keep=createDamageKeepOut({doc:page.doc,now:()=>clock});
 const measured=page.reads,queried=page.queries;assert.equal(measured,5);
 const spot={x:0,y:0},at=(x,y)=>{spot.x=x;spot.y=y;keep.place(spot);return [spot.x,spot.y];};
 for(let i=0;i<600;i++){clock+=16;at(120,60);}
 assert.equal(page.reads,measured,'no layout read while placing');
 // A missing piece (.top-actions) is looked up again at most every 2 s.
 assert.ok(page.queries-queried<=5,'lookups '+(page.queries-queried));
 // Over the health and the quest (left): out to the right of the column.
 const [x1,y1]=at(150,60);assert.ok(x1>223+20,'right of the health bar: '+x1);assert.equal(y1,60);
 const [x2]=at(200,90);assert.ok(x2>266+20,'right of the quest: '+x2);
 // On the boss bar (top middle): below it.
 const [x3,y3]=at(450,95);assert.equal(x3,450);assert.ok(y3>107+25,'below the boss bar: '+y3);
 // On the minimap (right): to its left.
 const [x4]=at(760,120);assert.ok(x4<724-20,'left of the minimap: '+x4);
 // Clear of every box: left alone. Above the top edge: brought down to stay readable.
 assert.deepEqual(at(420,260),[420,260]);assert.ok(at(420,5)[1]>=30);
 // A world-following boss bar is not a corner.
 page.nodes['#boss-hud'].dataset.hud='';keep.refresh();assert.deepEqual(at(450,95),[450,95]);
 keep.dispose();
});

test('0.2 hit numbers are where they were; 0.3 numbers go through the keep-out',()=>{
 const {document}=parseHTML('<html><body><div id="host"></div></body></html>');
 const saved=globalThis.document;globalThis.document=document;
 try{
  const host=document.getElementById('host'),projection={project:()=>({x:100,y:50,visible:true})};
  const plain=createDamageNumbers(null,host);plain.show({clone(){return {x:0,y:0,z:0};}},23);plain.update(1/60,projection);
  assert.match(host.lastChild.style.transform,/translate3d\(100px,50px,0\)/);plain.dispose();
  const placed=[];const kept=createDamageNumbers(null,host,{keepOut:{place(spot){placed.push(spot.x);spot.x+=200;return spot;}}});
  kept.show({clone(){return {x:0,y:0,z:0};}},23);kept.update(1/60,projection);
  assert.deepEqual(placed,[100]);assert.match(host.lastChild.style.transform,/translate3d\(300px,50px,0\)/);kept.dispose();
 }finally{globalThis.document=saved;}
 assert.match(read('main.js'),/keepOut:versionRoute\.edition\?damageKeepOut\(document\):null/);
});

test('the shop on short landscape phones: one header row, two columns of 44 px controls, 13 px words on touch',()=>{
 const css=read('v03/town-shop.css');
 const block=css.slice(css.indexOf('@media (max-height:500px) and (orientation:landscape){\n .mf-town-shop[data-mode=shop]'));
 assert.match(block,/\.mf-town-shop\[data-mode=shop\]>header\{display:contents\}/);
 assert.match(block,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 const row=Number(block.match(/\.mf-shop-row\{[^}]*min-height:([\d.]+)rem/)[1]);assert.ok(row*16>=46,'row '+row*16+'px');
 // The 44 px touch rule still holds for every shop button.
 assert.match(css,/@media \(pointer:coarse\)\{\.mf-town-shop button,\.mf-treasure-prompt\{min-height:2\.75rem\}\}/);
 assert.match(css,/and \(pointer:coarse\)\{\.mf-shop-row strong,\.mf-shop-row small,[^{]*\{font-size:13px\}/);
 // The temper bench keeps its own layout.
 assert.doesNotMatch(block,/is-bench|is-forging/);
 // Where a list still scrolls, its edges shade (no script).
 assert.match(css,/\.mf-shop-scroll\{background:[^}]*local[^}]*scroll\}/);
});
